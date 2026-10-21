using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;

namespace Bramble
{
    class DuplicatesSettings
    {
        public string Source;
        public long Freed;
    }

    // The search runs on its own, whatever page is open, and says when it is done: on a whole drive it takes minutes.
    static class Duplicates
    {
        const long Threshold = 1 << 20;
        static DuplicatesSettings R { get { return Program.R.Duplicates; } }
        static string phase = "idle", searched;
        static Dictionary<string, long> files = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
        static List<List<string>> groups;
        static readonly HashSet<string> pending = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        static int listed, compared, toCompare;
        static long listedBytes, bytesCompared, bytesToCompare;
        static CancellationTokenSource cancel;
        static System.Windows.Forms.Timer ticker;
        static DateTime finished;

        public static void Start()
        {
            ticker = new System.Windows.Forms.Timer { Interval = 500 };
            ticker.Tick += (s, e) => Program.Send(Report());
        }

        static string Source()
        {
            return !string.IsNullOrEmpty(R.Source) && Directory.Exists(R.Source) ? R.Source : Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        }

        static string NameOf(string path)
        {
            string name = Path.GetFileName(path.TrimEnd('\\'));
            return string.IsNullOrEmpty(name) ? Language.T("Drive {0}", path.Substring(0, 2)) : name;
        }

        static void Stop()
        {
            if (cancel != null) cancel.Cancel();
            cancel = null;
            if (ticker != null) ticker.Stop();
        }

        static void Run()
        {
            Stop();
            var token = new CancellationTokenSource();
            cancel = token;
            string source = Source();
            searched = source;
            groups = null;
            files = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
            listed = compared = toCompare = 0;
            listedBytes = bytesCompared = bytesToCompare = 0;
            phase = "listing";
            ticker.Start();
            Program.Send(Report());
            Task.Run(() =>
            {
                var bag = new ConcurrentBag<KeyValuePair<string, long>>();
                Walk(source.TrimEnd('\\'), bag, token.Token);
                if (token.IsCancellationRequested) return null;
                var found = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
                foreach (var p in bag) found[p.Key] = p.Value;
                var candidates = found.GroupBy(p => p.Value).Where(g => g.Count() > 1).OrderBy(g => g.Key).Select(g => g.Select(p => p.Key).ToList()).ToList();
                toCompare = candidates.Sum(g => g.Count);
                bytesToCompare = candidates.Sum(g => found[g[0]] * g.Count);
                phase = "comparing";
                var result = new ConcurrentBag<List<string>>();
                try
                {
                    Parallel.ForEach(candidates, new ParallelOptions { MaxDegreeOfParallelism = 3, CancellationToken = token.Token }, group =>
                    {
                        var priority = Thread.CurrentThread.Priority;
                        Thread.CurrentThread.Priority = ThreadPriority.BelowNormal;
                        try
                        {
                            long size = found[group[0]];
                            var stage = Split(new[] { group }, f => Sample(f, 0, 65536));
                            if (size > 131072) stage = Split(stage, f => Sample(f, size - 65536, 65536));
                            foreach (var copies in Split(stage, Whole)) result.Add(copies);
                        }
                        finally
                        {
                            Thread.CurrentThread.Priority = priority;
                            Interlocked.Add(ref compared, group.Count);
                            Interlocked.Add(ref bytesCompared, found[group[0]] * group.Count);
                        }
                    });
                }
                catch (OperationCanceledException) { return null; }
                return Tuple.Create(found, result.ToList());
            }).ContinueWith(t => Program.OnInterface(() =>
            {
                if (token != cancel) return;
                ticker.Stop();
                if (t.IsFaulted) { Program.Log(t.Exception); phase = "failed"; }
                else if (t.Result == null) phase = "idle";
                else
                {
                    files = t.Result.Item1;
                    groups = t.Result.Item2.OrderByDescending(g => files[g[0]] * (g.Count - 1)).Take(60).ToList();
                    phase = "done";
                    finished = DateTime.Now;
                    var live = Live();
                    Program.Send(new { type = "duplicates.done", copies = live.Sum(g => g.Count - 1), extra = live.Sum(g => files[g[0]] * (g.Count - 1)) });
                }
                Program.Send(Report());
                Program.SendState();
            }));
        }

        static void Walk(string folder, ConcurrentBag<KeyValuePair<string, long>> bag, CancellationToken token)
        {
            if (token.IsCancellationRequested) return;
            bool atRoot = folder.Length == 2 && folder[1] == ':';
            var under = new List<string>();
            try
            {
                foreach (var e in new DirectoryInfo(atRoot ? folder + "\\" : folder).EnumerateFileSystemInfos())
                {
                    var a = e.Attributes;
                    if ((a & FileAttributes.Directory) != 0)
                    {
                        if ((a & FileAttributes.ReparsePoint) != 0 || DiskUsage.Vendored.Contains(e.Name) || (atRoot && DiskUsage.SystemRoots.Contains(e.Name))) continue;
                        if (string.Equals(e.FullName.TrimEnd('\\'), Program.Root.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase)) continue;
                        under.Add(e.FullName);
                        continue;
                    }
                    // Files that live in the cloud would be downloaded just to be read.
                    if (((int)a & (0x400000 | 0x1000)) != 0 || (a & FileAttributes.System) != 0) continue;
                    long size = ((FileInfo)e).Length;
                    Interlocked.Increment(ref listed);
                    Interlocked.Add(ref listedBytes, size);
                    if (size >= Threshold) bag.Add(new KeyValuePair<string, long>(e.FullName, size));
                }
            }
            catch (UnauthorizedAccessException) { }
            catch (IOException) { }
            catch (System.Security.SecurityException) { }
            Parallel.ForEach(under, d => Walk(d, bag, token));
        }

        static string Sample(string path, long offset, int length)
        {
            try
            {
                using (var sha = SHA256.Create())
                using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete, 1 << 16))
                {
                    stream.Position = Math.Max(0, Math.Min(offset, stream.Length));
                    var buffer = new byte[length];
                    int read = 0, n;
                    while (read < length && (n = stream.Read(buffer, read, length - read)) > 0) read += n;
                    return Convert.ToBase64String(sha.ComputeHash(buffer, 0, read));
                }
            }
            catch { return null; }
        }

        static string Whole(string path)
        {
            try
            {
                using (var sha = SHA256.Create())
                using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete, 1 << 20, FileOptions.SequentialScan))
                    return Convert.ToBase64String(sha.ComputeHash(stream));
            }
            catch { return null; }
        }

        static List<List<string>> Split(IEnumerable<List<string>> list, Func<string, string> key)
        {
            return list.SelectMany(g => g.GroupBy(key).Where(h => h.Key != null && h.Count() > 1).Select(h => h.ToList())).ToList();
        }

        static DateTime Created(string path)
        {
            try { return File.GetCreationTimeUtc(path); }
            catch { return DateTime.MaxValue; }
        }

        // The oldest copy comes first: a copy gets a new creation date, so the oldest is most likely the original, and it is the one kept.
        static List<List<string>> Live()
        {
            if (groups == null) return new List<List<string>>();
            return groups.Select(g => g.Where(p => !pending.Contains(p) && files.ContainsKey(p)).OrderBy(Created).ToList()).Where(g => g.Count > 1).ToList();
        }

        static object Describe(string path)
        {
            return new { path, name = Path.GetFileName(path), folder = Path.GetDirectoryName(path), size = files[path] };
        }

        static object Report()
        {
            var live = phase == "done" ? Live() : null;
            return new
            {
                type = "duplicates.report",
                phase,
                source = searched ?? Source(),
                sourceName = NameOf(searched ?? Source()),
                listed,
                listedBytes = Interlocked.Read(ref listedBytes),
                compared,
                toCompare,
                bytesDone = Interlocked.Read(ref bytesCompared),
                bytesTotal = bytesToCompare,
                copies = live == null ? 0 : live.Sum(g => g.Count - 1),
                extra = live == null ? 0 : live.Sum(g => files[g[0]] * (g.Count - 1)),
                freed = R.Freed,
                when = phase == "done" ? finished.ToString("t") : null,
                groups = live == null ? null : live.Select(g => new { size = files[g[0]], files = g.Select(Describe).ToArray() }).ToArray(),
            };
        }

        public static object State()
        {
            var places = new List<object>();
            foreach (var d in DriveInfo.GetDrives())
            {
                try
                {
                    if (d.DriveType != DriveType.Fixed || !d.IsReady) continue;
                    places.Add(new { path = d.Name, name = Language.T("Drive {0}", d.Name.Substring(0, 2)), detail = Language.T("Whole drive, Windows left out") });
                }
                catch { }
            }
            string home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            places.Add(new { path = home, name = Language.T("Personal folder"), detail = home });
            return new { source = Source(), places, running = phase == "listing" || phase == "comparing" };
        }

        static bool Protected(string path)
        {
            var places = new[]
            {
                Environment.GetFolderPath(Environment.SpecialFolder.Windows), Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), Program.Root,
            };
            if (places.Any(p => !string.IsNullOrEmpty(p) && path.StartsWith(p.TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase))) return true;
            return (File.GetAttributes(path) & FileAttributes.System) != 0;
        }

        // Only files Bramble found can go, only to the Recycle Bin, once the 8 s of Undo are over, and never the last copy of a group.
        static void Recycle(List<string> paths)
        {
            var live = Live();
            paths = paths.Where(p => p != null && files.ContainsKey(p) && !pending.Contains(p) && File.Exists(p) && !Protected(p)
                && live.Any(g => g.Contains(p, StringComparer.OrdinalIgnoreCase) && g.Count(x => !paths.Contains(x, StringComparer.OrdinalIgnoreCase)) >= 1))
                .Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            if (paths.Count == 0) return;
            foreach (var p in paths) pending.Add(p);
            string title = paths.Count == 1 ? Path.GetFileName(paths[0]) : Language.T("{0} files", paths.Count);
            Program.UndoableRemoval(title, () => { foreach (var p in paths) pending.Remove(p); Program.Send(Report()); }, () =>
            {
                foreach (var p in paths) pending.Remove(p);
                var sizes = paths.ToDictionary(p => p, p => files[p], StringComparer.OrdinalIgnoreCase);
                foreach (var p in paths) files.Remove(p);
                ToRecycleBin(paths).ContinueWith(t => Program.OnInterface(() =>
                {
                    if (t.IsFaulted) Program.Log(t.Exception);
                    int left = 0;
                    foreach (var p in paths)
                        if (File.Exists(p)) { files[p] = sizes[p]; left++; }
                        else R.Freed += sizes[p];
                    if (left == 1 && paths.Count == 1) Program.Announce("The file could not go to the Recycle Bin");
                    else if (left > 0) Program.Announce("{0} files could not go to the Recycle Bin", left);
                    Program.Save();
                    Program.Send(Report());
                }));
            });
            Program.Send(Report());
        }

        // FOF_ALLOWUNDO sends to the Recycle Bin. FOF_WANTNUKEWARNING makes Windows ask before deleting for good a file too large for the bin,
        // which FOF_NOCONFIRMATION alone would do without a word. The shell wants a thread of its own for its dialogs.
        static Task ToRecycleBin(List<string> paths)
        {
            var done = new TaskCompletionSource<bool>();
            var thread = new Thread(() =>
            {
                try
                {
                    var op = new SHFILEOPSTRUCT { wFunc = 3, pFrom = string.Join("\0", paths) + "\0", fFlags = 0x4 | 0x10 | 0x40 | 0x4000 };
                    SHFileOperation(ref op);
                    done.SetResult(true);
                }
                catch (Exception ex) { done.SetException(ex); }
            });
            thread.SetApartmentState(ApartmentState.STA);
            thread.IsBackground = true;
            thread.Start();
            return done.Task;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct SHFILEOPSTRUCT
        {
            public IntPtr hwnd;
            public uint wFunc;
            public string pFrom, pTo;
            public ushort fFlags;
            public bool fAnyOperationsAborted;
            public IntPtr hNameMappings;
            public string lpszProgressTitle;
        }

        [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern int SHFileOperation(ref SHFILEOPSTRUCT op);

        static string Text(Dictionary<string, object> m, string key)
        {
            object v;
            return m.TryGetValue(key, out v) && v != null ? v.ToString() : null;
        }

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            switch (action)
            {
                case "report": Program.Send(Report()); return false;
                case "run": Run(); return true;
                case "stop": Stop(); phase = groups != null ? "done" : "idle"; Program.Send(Report()); return true;
                case "recycle": Recycle(new List<string> { Text(m, "path") }); return true;
                case "keepOne": Recycle(Live().SelectMany(g => g.Skip(1)).ToList()); return true;
                case "source":
                {
                    string s = Text(m, "value");
                    if (s == null || !Directory.Exists(s)) return false;
                    R.Source = s;
                    return true;
                }
                case "browse":
                {
                    string path = Icons.AskFolder(Language.T("Folder to search"));
                    if (path == null) return false;
                    R.Source = path;
                    return true;
                }
                case "show":
                {
                    string path = Text(m, "path");
                    if (!string.IsNullOrEmpty(path) && File.Exists(path)) Process.Start("explorer.exe", "/select,\"" + path + "\"");
                    return false;
                }
            }
            return false;
        }
    }
}
