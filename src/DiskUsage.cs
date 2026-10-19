using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;

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
        static readonly long[] typesBytes = new long[9];
        static readonly long[] typesNumber = new long[9];
        static long fileCount, byteCount;
        static volatile string currentFolder;
        static CancellationTokenSource cancellation;
        static DateTime analysisDate;
        static double analysisDuration;
        static bool running;
        static System.Windows.Forms.Timer progress, forget;

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

            progress = new System.Windows.Forms.Timer { Interval = 200 };
            progress.Tick += (s, e) => Program.Send(Progress());
            forget = new System.Windows.Forms.Timer { Interval = 5 * 60 * 1000 };
            forget.Tick += (s, e) => { forget.Stop(); if (!running) { root = null; rootPath = null; GC.Collect(); } };
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
            fileCount = byteCount = 0;
            currentFolder = source;
            progress.Start();
            var chrono = Stopwatch.StartNew();
            Task.Run(() =>
            {
                var n = new Node { Name = NameOf(source), Folder = true };
                Browse(source.TrimEnd('\\'), n, token.Token);
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
                    Program.Send(Tree(rootPath, null));
                }
                Program.SendState();
            }));
        }

        static void Browse(string folder, Node n, CancellationToken token)
        {
            if (token.IsCancellationRequested) return;
            currentFolder = folder;
            WIN32_FIND_DATA d;
            IntPtr h = FindFirstFileExW(@"\\?\" + folder + @"\*", FindExInfoBasic, out d, 0, IntPtr.Zero, FIND_FIRST_EX_LARGE_FETCH);
            if (h == new IntPtr(-1)) return;
            var under = new List<Node>();
            var paths = new List<string>();
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
                        continue;
                    }
                    if ((d.Attributes & (ATTR_RECALL_ON_DATA_ACCESS | ATTR_OFFLINE)) != 0) continue;
                    long size = ((long)d.SizeHigh << 32) | d.SizeLow;
                    int type, point = d.Name.LastIndexOf('.');
                    if (point < 0 || !Extensions.TryGetValue(d.Name.Substring(point), out type)) type = 8;
                    Interlocked.Add(ref typesBytes[type], size);
                    Interlocked.Increment(ref typesNumber[type]);
                    bytes += size;
                    number++;
                    if (size >= FileThreshold)
                    {
                        if (n.Children == null) n.Children = new List<Node>();
                        n.Children.Add(new Node { Name = d.Name, Size = size, NbFiles = 1 });
                    }
                    else { n.Small += size; n.NbSmall++; }
                }
                while (FindNextFileW(h, out d));
            }
            finally { FindClose(h); }
            Interlocked.Add(ref fileCount, number);
            Interlocked.Add(ref byteCount, bytes);

            Parallel.For(0, under.Count, i => Browse(paths[i], under[i], token));
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

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            switch (action)
            {
                case "visible":
                    if (Convert.ToBoolean(m["value"]))
                    {
                        forget.Stop();

                        if (root == null && !running) { Analyze(Source()); return true; }
                        if (root != null) Program.Send(Tree(Text(m, "path") ?? rootPath, null));
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
            };
        }

        static string Text(Dictionary<string, object> m, string key)
        {
            object v;
            return m.TryGetValue(key, out v) && v != null ? v.ToString() : null;
        }
    }
}
