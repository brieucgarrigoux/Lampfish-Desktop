using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.VisualBasic.FileIO;

namespace Bramble
{
    class DiskUsageSettings
    {
        public string Source;
    }

    static class DiskUsage
    {
        class Node
        {
            public string Name;
            public long Size;
            public int NbFiles;
            public bool Folder;
            public long Small;
            public int NbSmall;
            public List<Node> Children;
        }

        const long FileThreshold = 1 << 20;
        const int Levels = 7;
        const double PartMin = 0.0025;

        static readonly string[] Types = { "videos", "images", "audio", "documents", "code", "archives", "apps", "system", "others" };
        static readonly Dictionary<string, int> Extensions = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        static Node root;
        static string rootPath;
        static readonly string[][] LanguageFamilies =
        {
            new[] { "JavaScript", "js", "mjs", "cjs", "jsx" }, new[] { "TypeScript", "ts", "tsx", "mts", "cts" }, new[] { "Python", "py", "pyw" },
            new[] { "C#", "cs" }, new[] { "Java", "java" }, new[] { "Kotlin", "kt", "kts" }, new[] { "Swift", "swift" }, new[] { "C", "c", "h" },
            new[] { "C++", "cpp", "cc", "cxx", "hpp", "hh" }, new[] { "Go", "go" }, new[] { "Rust", "rs" }, new[] { "Ruby", "rb" }, new[] { "PHP", "php" },
            new[] { "Lua", "lua" }, new[] { "Dart", "dart" }, new[] { "HTML", "html", "htm" }, new[] { "CSS", "css", "scss", "sass", "less" },
            new[] { "Astro", "astro" }, new[] { "Vue", "vue" }, new[] { "Svelte", "svelte" }, new[] { "Shell", "sh", "bash", "zsh" },
            new[] { "PowerShell", "ps1", "psm1" }, new[] { "Batchfile", "bat", "cmd" }, new[] { "SQL", "sql" }, new[] { "Jupyter Notebook", "ipynb" },
            new[] { "R", "r" }, new[] { "Scala", "scala" }, new[] { "Perl", "pl", "pm" }, new[] { "Haskell", "hs" }, new[] { "Elixir", "ex", "exs" },
            new[] { "GDScript", "gd" }, new[] { "GLSL", "glsl", "vert", "frag" },
        };
        // Like on GitHub, what other people wrote is left out: dependencies, caches, app data and the folders of Windows.
        static readonly HashSet<string> Vendored = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "node_modules", ".git", ".svn", ".hg", "site-packages", "venv", ".venv", "__pycache__", "bower_components", "AppData", ".cache", ".npm",
            ".nuget", ".cargo", ".rustup", ".gradle", ".m2", ".vscode", ".cursor", ".pyenv", ".conda", "anaconda3", "miniconda3",
        };
        static readonly HashSet<string> SystemRoots = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "Windows", "Program Files", "Program Files (x86)", "ProgramData", "$Recycle.Bin", "System Volume Information",
        };
        static readonly Dictionary<string, int> LanguageOf = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        static readonly long[] languageBytes = new long[LanguageFamilies.Length];
        static readonly long[] languageFiles = new long[LanguageFamilies.Length];
        static readonly long[] typesBytes = new long[9];
        static readonly long[] typesNumber = new long[9];
        static long fileCount, byteCount;
        static volatile string currentFolder;
        static CancellationTokenSource cancellation;
        static DateTime analysisDate;
        static double analysisDuration;
        static bool running;
        static System.Windows.Forms.Timer progress, forget, comparing;
        static System.Collections.Concurrent.ConcurrentBag<KeyValuePair<string, long>> found = new System.Collections.Concurrent.ConcurrentBag<KeyValuePair<string, long>>();
        static Dictionary<string, long> bigFiles = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
        static readonly HashSet<string> pending = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        static List<List<string>> duplicates;
        static string duplicatesState = "idle";
        static int compared, toCompare;
        static CancellationTokenSource duplicatesCancel;

        static DiskUsageSettings R { get { return Program.R.DiskUsage; } }

        public static void Start()
        {
            if (Program.R.DiskUsage == null) Program.R.DiskUsage = new DiskUsageSettings();
            string[][] families =
            {
                new[] { "mp4", "mkv", "mov", "avi", "webm", "m4v", "wmv", "flv", "mpg", "mpeg", "mts", "m2ts", "3gp" },
                new[] { "jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "heic", "heif", "avif", "raw", "cr2", "cr3", "nef", "arw", "dng", "svg", "psd", "ai", "ico", "xcf", "kra" },
                new[] { "mp3", "wav", "flac", "aac", "m4a", "ogg", "oga", "opus", "wma", "aif", "aiff", "mid", "midi", "als", "flp" },
                new[] { "pdf", "doc", "docx", "xls", "xlsx", "xlsm", "ppt", "pptx", "odt", "ods", "odp", "txt", "md", "rtf", "csv", "epub", "one", "pages", "key", "numbers", "tex" },
                new[] { "js", "mjs", "ts", "jsx", "tsx", "py", "pyc", "cs", "java", "class", "c", "cpp", "h", "hpp", "go", "rs", "rb", "php", "html", "htm", "css", "scss", "json", "xml", "yml", "yaml", "toml", "sql", "sh", "ps1", "bat", "cmd", "ipynb", "lua", "kt", "swift", "view", "astro", "map", "node" },
                new[] { "zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "zst", "iso", "cab", "img", "vhd", "vhdx", "vmdk", "dmg", "nupkg", "whl" },
                new[] { "exe", "msi", "dll", "appx", "msix", "msixbundle", "apk", "jar", "lnk", "url", "ocx", "efi" },
                new[] { "sys", "dat", "log", "etl", "tmp", "bin", "db", "sqlite", "ldb", "ini", "cfg", "pak", "cache", "lock", "pdb", "mui", "cat", "manifest", "mum", "evtx", "regtrans-ms", "blf", "edb", "jrs", "chk", "ttf", "otf", "ttc", "woff", "woff2" },
            };
            for (int i = 0; i < families.Length; i++)
                foreach (string e in families[i]) Extensions["." + e] = i;
            for (int i = 0; i < LanguageFamilies.Length; i++)
                foreach (string e in LanguageFamilies[i].Skip(1)) LanguageOf["." + e] = i;

            progress = new System.Windows.Forms.Timer { Interval = 200 };
            progress.Tick += (s, e) => Program.Send(Progress());
            forget = new System.Windows.Forms.Timer { Interval = 5 * 60 * 1000 };
            forget.Tick += (s, e) =>
            {
                forget.Stop();
                if (running || pending.Count > 0) return;
                root = null;
                rootPath = null;
                bigFiles = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
                StopDuplicates();
                GC.Collect();
            };
            comparing = new System.Windows.Forms.Timer { Interval = 400 };
            comparing.Tick += (s, e) => Program.Send(Examine());
        }

        static string DefaultSource()
        {
            return Path.GetPathRoot(Environment.SystemDirectory);
        }

        static string Source()
        {
            string s = R.Source;
            return !string.IsNullOrEmpty(s) && Directory.Exists(s) ? s : DefaultSource();
        }

        static bool IsDisk(string path)
        {
            return path.Length <= 3 && path.EndsWith(":\\");
        }

        static string NameOf(string path)
        {
            return IsDisk(path) ? path.Substring(0, 2) : Path.GetFileName(path.TrimEnd('\\'));
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct WIN32_FIND_DATA
        {
            public uint Attributes;
            public uint CreationLow, CreationHigh, AccessLow, AccessHigh, WriteLow, WriteHigh;
            public uint SizeHigh, SizeLow, Reserved0, Reserved1;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string Name;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 14)] public string ShortName;
        }
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern IntPtr FindFirstFileExW(string path, int level, out WIN32_FIND_DATA data, int search, IntPtr filter, int options);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool FindNextFileW(IntPtr h, out WIN32_FIND_DATA data);
        [DllImport("kernel32.dll")] static extern bool FindClose(IntPtr h);
        const int FindExInfoBasic = 1, FIND_FIRST_EX_LARGE_FETCH = 2;
        const uint ATTR_FOLDER = 0x10, ATTR_REPARSE = 0x400, ATTR_OFFLINE = 0x1000, ATTR_RECALL_ON_DATA_ACCESS = 0x400000;

        static void Analyze(string source)
        {
            if (cancellation != null) cancellation.Cancel();
            var token = new CancellationTokenSource();
            cancellation = token;
            running = true;
            root = null;
            rootPath = source;
            Array.Clear(typesBytes, 0, 9);
            Array.Clear(typesNumber, 0, 9);
            Array.Clear(languageBytes, 0, languageBytes.Length);
            Array.Clear(languageFiles, 0, languageFiles.Length);
            fileCount = byteCount = 0;
            currentFolder = source;
            found = new System.Collections.Concurrent.ConcurrentBag<KeyValuePair<string, long>>();
            bigFiles = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
            StopDuplicates();
            progress.Start();
            var chrono = Stopwatch.StartNew();
            Task.Run(() =>
            {
                var n = new Node { Name = NameOf(source), Folder = true };
                Browse(source.TrimEnd('\\'), n, token.Token, false);
                return n;
            }).ContinueWith(t => Program.OnInterface(() =>
            {
                if (token != cancellation) return;
                progress.Stop();
                running = false;
                if (t.IsFaulted) { Program.Log(t.Exception); Program.Announce("Analysis interrupted"); }
                else if (token.IsCancellationRequested) { rootPath = null; Program.Announce("Analysis stopped"); }
                else
                {
                    root = t.Result;
                    analysisDate = DateTime.Now;
                    analysisDuration = chrono.Elapsed.TotalSeconds;
                    foreach (var p in found) bigFiles[p.Key] = p.Value;
                    found = new System.Collections.Concurrent.ConcurrentBag<KeyValuePair<string, long>>();
                    Program.Send(Tree(rootPath, null));
                    Program.Send(Examine());
                }
                Program.SendState();
            }));
        }

        static void Browse(string folder, Node n, CancellationToken token, bool left)
        {
            if (token.IsCancellationRequested) return;
            currentFolder = folder;
            WIN32_FIND_DATA d;
            IntPtr h = FindFirstFileExW(@"\\?\" + folder + @"\*", FindExInfoBasic, out d, 0, IntPtr.Zero, FIND_FIRST_EX_LARGE_FETCH);
            if (h == new IntPtr(-1)) return;
            var under = new List<Node>();
            var paths = new List<string>();
            var leftOut = new List<bool>();
            bool atRoot = folder.Length == 2 && folder[1] == ':';
            long bytes = 0;
            int number = 0;
            try
            {
                do
                {
                    if (d.Name == "." || d.Name == "..") continue;
                    if ((d.Attributes & ATTR_FOLDER) != 0)
                    {
                        if ((d.Attributes & ATTR_REPARSE) != 0) continue;
                        under.Add(new Node { Name = d.Name, Folder = true });
                        paths.Add(folder + "\\" + d.Name);
                        leftOut.Add(left || Vendored.Contains(d.Name) || (atRoot && SystemRoots.Contains(d.Name)));
                        continue;
                    }
                    if ((d.Attributes & (ATTR_RECALL_ON_DATA_ACCESS | ATTR_OFFLINE)) != 0) continue;
                    long size = ((long)d.SizeHigh << 32) | d.SizeLow;
                    int type, point = d.Name.LastIndexOf('.');
                    if (point < 0 || !Extensions.TryGetValue(d.Name.Substring(point), out type)) type = 8;
                    int language;
                    if (!left && point >= 0 && LanguageOf.TryGetValue(d.Name.Substring(point), out language) && !d.Name.EndsWith(".min.js", StringComparison.OrdinalIgnoreCase) && !d.Name.EndsWith(".min.css", StringComparison.OrdinalIgnoreCase))
                    {
                        Interlocked.Add(ref languageBytes[language], size);
                        Interlocked.Increment(ref languageFiles[language]);
                    }
                    Interlocked.Add(ref typesBytes[type], size);
                    Interlocked.Increment(ref typesNumber[type]);
                    bytes += size;
                    number++;
                    if (size >= FileThreshold)
                    {
                        if (n.Children == null) n.Children = new List<Node>();
                        n.Children.Add(new Node { Name = d.Name, Size = size, NbFiles = 1 });
                        if (!left) found.Add(new KeyValuePair<string, long>(folder + "\\" + d.Name, size));
                    }
                    else { n.Small += size; n.NbSmall++; }
                }
                while (FindNextFileW(h, out d));
            }
            finally { FindClose(h); }
            Interlocked.Add(ref fileCount, number);
            Interlocked.Add(ref byteCount, bytes);

            Parallel.For(0, under.Count, i => Browse(paths[i], under[i], token, leftOut[i]));
            if (under.Count > 0)
            {
                if (n.Children == null) n.Children = new List<Node>();
                n.Children.AddRange(under.Where(s => s.Size > 0 || s.NbFiles > 0));
            }
            n.Size = bytes + under.Sum(s => s.Size);
            n.NbFiles = number + under.Sum(s => s.NbFiles);
            if (n.Children != null) n.Children.Sort((a, b) => b.Size.CompareTo(a.Size));
        }

        static object Progress()
        {
            return new
            {
                type = "files.progress",
                files = Interlocked.Read(ref fileCount),
                bytes = Interlocked.Read(ref byteCount),
                folder = currentFolder,
            };
        }

        static Node Find(string path)
        {
            if (root == null || path == null) return null;
            string base_ = rootPath.TrimEnd('\\'), c = path.TrimEnd('\\');
            if (string.Equals(c, base_, StringComparison.OrdinalIgnoreCase)) return root;
            if (!c.StartsWith(base_ + "\\", StringComparison.OrdinalIgnoreCase)) return null;
            Node n = root;
            foreach (string name in c.Substring(base_.Length + 1).Split('\\'))
            {
                if (n.Children == null) return null;
                n = n.Children.FirstOrDefault(e => e.Folder && string.Equals(e.Name, name, StringComparison.OrdinalIgnoreCase));
                if (n == null) return null;
            }
            return n;
        }

        static Dictionary<string, object> Prune(Node n, int level, long threshold)
        {
            var o = new Dictionary<string, object> { { "n", n.Name }, { "t", n.Size }, { "f", n.NbFiles } };
            if (!n.Folder) return o;
            o["d"] = 1;
            if (level >= Levels) return o;
            var children = new List<object>();
            long others = 0;
            int nbOthers = 0;
            if (n.Children != null)
                foreach (var e in n.Children)
                {
                    if (e.Size >= threshold) children.Add(Prune(e, level + 1, threshold));
                    else { others += e.Size; nbOthers += e.Folder ? 1 : e.NbFiles; }
                }
            if (n.Small >= threshold)
                children.Add(new Dictionary<string, object> { { "n", "Small files" }, { "t", n.Small }, { "f", n.NbSmall }, { "s", "small" } });
            else if (n.Small > 0) { others += n.Small; nbOthers += n.NbSmall; }
            if (others > 0 && others >= threshold / 4)
                children.Add(new Dictionary<string, object> { { "n", "Other items" }, { "t", others }, { "f", nbOthers }, { "s", "others" } });
            if (children.Count > 0) o["e"] = children;
            return o;
        }

        static object Tree(string path, string from)
        {
            Node n = Find(path);
            if (n == null) { n = root; path = rootPath; }
            if (n == null) return null;
            var tree = Prune(n, 0, Math.Max(1, (long)(n.Size * PartMin)));
            long size = n.Size;

            if (n == root && IsDisk(rootPath))
            {
                try
                {
                    var disk = new DriveInfo(rootPath);
                    long unreadable = disk.TotalSize - disk.TotalFreeSpace - n.Size;
                    if (unreadable > n.Size * 0.005)
                    {
                        var children = tree.ContainsKey("e") ? (List<object>)tree["e"] : new List<object>();
                        children.Add(new Dictionary<string, object> { { "n", "System and protected items" }, { "t", unreadable }, { "f", 0 }, { "s", "system" } });
                        tree["e"] = children;
                        size += unreadable;
                        tree["t"] = size;
                    }
                }
                catch (Exception ex) { Program.Log(ex); }
            }

            var crumbs = new List<object>();
            string c = rootPath.TrimEnd('\\');
            crumbs.Add(new { name = NameOf(rootPath), path = rootPath });
            string end = path.TrimEnd('\\');
            if (end.Length > c.Length)
                foreach (string name in end.Substring(c.Length + 1).Split('\\'))
                {
                    c += "\\" + name;
                    crumbs.Add(new { name = name, path = c });
                }
            return new { type = "files.tree", path = path, crumbs = crumbs, tree = tree, from = from };
        }

        static object ListTypes()
        {
            return Types.Select((t, i) => new { type = t, bytes = typesBytes[i], number = typesNumber[i] })
                .Where(t => t.bytes > 0).OrderByDescending(t => t.bytes).ToArray();
        }

        static object ListLanguages()
        {
            return LanguageFamilies.Select((l, i) => new { name = l[0], bytes = languageBytes[i], files = languageFiles[i] })
                .Where(l => l.bytes > 0).OrderByDescending(l => l.bytes).ToArray();
        }

        static void Choose()
        {
            string path = Icons.AskFolder(Language.T("Folder to analyze"));
            if (path == null) return;
            R.Source = path;
            Analyze(Source());
        }

        static void Show(string path)
        {
            if (string.IsNullOrEmpty(path)) return;
            if (File.Exists(path) || (Directory.Exists(path) && !IsDisk(path)))
                Process.Start("explorer.exe", "/select,\"" + path + "\"");
            else if (Directory.Exists(path))
                Process.Start("explorer.exe", "\"" + path + "\"");
        }

        static object Describe(string path)
        {
            long size;
            bigFiles.TryGetValue(path, out size);
            return new { path, name = Path.GetFileName(path), folder = Path.GetDirectoryName(path), size };
        }

        static object Examine()
        {
            var groups = duplicates == null ? null : duplicates
                .Select(g => g.Where(p => !pending.Contains(p) && bigFiles.ContainsKey(p)).ToList())
                .Where(g => g.Count > 1)
                .Select(g => new { size = bigFiles[g[0]], files = g.Select(Describe).ToArray() }).ToArray();
            return new
            {
                type = "files.examine",
                ready = root != null,
                largest = bigFiles.Where(p => !pending.Contains(p.Key)).OrderByDescending(p => p.Value).Take(50).Select(p => Describe(p.Key)).ToArray(),
                duplicates = new { state = duplicatesState, done = compared, total = toCompare, groups },
            };
        }

        static void StopDuplicates()
        {
            if (duplicatesCancel != null) duplicatesCancel.Cancel();
            duplicatesCancel = null;
            duplicates = null;
            duplicatesState = "idle";
            compared = toCompare = 0;
            if (comparing != null) comparing.Stop();
        }

        static string Hash(string path, int head)
        {
            try
            {
                using (var sha = SHA256.Create())
                using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete, 1 << 16))
                {
                    if (head < 0) return Convert.ToBase64String(sha.ComputeHash(stream));
                    var buffer = new byte[head];
                    int read = 0, n;
                    while (read < head && (n = stream.Read(buffer, read, head - read)) > 0) read += n;
                    return Convert.ToBase64String(sha.ComputeHash(buffer, 0, read));
                }
            }
            catch { return null; }
        }

        // Same size first, then the same first 64 KB, and only then the whole file: most candidates drop out before a full read.
        static void FindDuplicates()
        {
            if (root == null || duplicatesState == "running") return;
            StopDuplicates();
            var token = new CancellationTokenSource();
            duplicatesCancel = token;
            var candidates = bigFiles.Where(p => !pending.Contains(p.Key)).GroupBy(p => p.Value).Where(g => g.Count() > 1).Select(g => g.Select(p => p.Key).ToList()).ToList();
            toCompare = candidates.Sum(g => g.Count);
            duplicatesState = "running";
            comparing.Start();
            Program.Send(Examine());
            Task.Run(() =>
            {
                var result = new List<List<string>>();
                foreach (var group in candidates)
                {
                    if (token.IsCancellationRequested) return null;
                    foreach (var same in group.GroupBy(p => Hash(p, 65536)).Where(h => h.Key != null && h.Count() > 1))
                        foreach (var copies in same.GroupBy(p => Hash(p, -1)).Where(h => h.Key != null && h.Count() > 1))
                            result.Add(copies.ToList());
                    Interlocked.Add(ref compared, group.Count);
                }
                return result;
            }).ContinueWith(t => Program.OnInterface(() =>
            {
                if (token != duplicatesCancel) return;
                comparing.Stop();
                if (t.IsFaulted) { Program.Log(t.Exception); duplicatesState = "failed"; }
                else if (t.Result == null) duplicatesState = "idle";
                else
                {
                    duplicates = t.Result.OrderByDescending(g => bigFiles[g[0]] * (g.Count - 1)).Take(40).ToList();
                    duplicatesState = "done";
                }
                Program.Send(Examine());
            }));
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

        // Only a file Bramble listed can go, and only to the Recycle Bin, once the 8 s of Undo are over.
        static void Recycle(string path)
        {
            if (path == null || !bigFiles.ContainsKey(path) || pending.Contains(path) || !File.Exists(path) || Protected(path)) return;
            pending.Add(path);
            long size = bigFiles[path];
            Program.UndoableRemoval(Path.GetFileName(path), () => { pending.Remove(path); Program.Send(Examine()); }, () =>
            {
                pending.Remove(path);
                bigFiles.Remove(path);
                Task.Run(() => FileSystem.DeleteFile(path, UIOption.OnlyErrorDialogs, RecycleOption.SendToRecycleBin)).ContinueWith(t => Program.OnInterface(() =>
                {
                    if (t.IsFaulted)
                    {
                        Program.Log(t.Exception);
                        if (File.Exists(path)) bigFiles[path] = size;
                        Program.Announce("The file could not go to the Recycle Bin");
                    }
                    Program.Send(Examine());
                }));
            });
            Program.Send(Examine());
        }

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            switch (action)
            {
                case "examine": Program.Send(Examine()); return false;
                case "duplicates": FindDuplicates(); return false;
                case "recycle": Recycle(Text(m, "path")); return true;
                case "visible":
                    if (Convert.ToBoolean(m["value"]))
                    {
                        forget.Stop();

                        if (root == null && !running) { Analyze(Source()); return true; }
                        if (root != null) { Program.Send(Tree(Text(m, "path") ?? rootPath, null)); Program.Send(Examine()); }
                    }
                    else forget.Start();
                    return false;
                case "source":
                {
                    string s = Text(m, "value");
                    if (s == "custom") s = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                    if (s == null || !Directory.Exists(s)) return false;
                    R.Source = s;
                    Analyze(Source());
                    return true;
                }
                case "browse": Choose(); return true;
                case "restart": Analyze(Source()); return true;
                case "stop": if (cancellation != null) cancellation.Cancel(); return false;
                case "open": if (root != null) Program.Send(Tree(Text(m, "path"), Text(m, "from"))); return false;
                case "show": Show(Text(m, "path")); return false;
            }
            return false;
        }

        public static object State()
        {
            string source = Source();
            var disks = new List<object>();
            foreach (var d in DriveInfo.GetDrives())
            {
                try
                {
                    if (d.DriveType != DriveType.Fixed && d.DriveType != DriveType.Removable) continue;
                    if (!d.IsReady) continue;
                    disks.Add(new { path = d.Name, name = Language.T("Drive {0}", d.Name.Substring(0, 2)), label = d.VolumeLabel, size = d.TotalSize, free = d.TotalFreeSpace });
                }
                catch { }
            }
            string custom = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            return new
            {
                source = source,
                sourceName = NameOf(source),
                disks = disks,
                custom = custom,
                running = running,
                analyzed = root != null,
                files = root != null ? root.NbFiles : 0,
                bytes = root != null ? root.Size : 0,
                duration = analysisDuration,
                date = root != null ? analysisDate.ToString("s") : null,
                types = root != null ? ListTypes() : null,
                languages = root != null ? ListLanguages() : null,
            };
        }

        static string Text(Dictionary<string, object> m, string key)
        {
            object v;
            return m.TryGetValue(key, out v) && v != null ? v.ToString() : null;
        }
    }
}
