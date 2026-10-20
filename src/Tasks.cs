using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Win32;

namespace Bramble
{
    static class Tasks
    {
        static readonly HashSet<string> Locked = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "Idle", "System", "Registry", "Memory Compression", "smss", "csrss", "wininit", "winlogon", "services", "lsass",
            "svchost", "dwm", "fontdrvhost", "explorer", "sihost", "ctfmon", "taskhostw", "audiodg", "spoolsv",
            "MsMpEng", "NisSrv", "SecurityHealthService", "Bramble", "msedgewebview2",
        };

        static readonly string WindowsFolder = Environment.GetFolderPath(Environment.SpecialFolder.Windows) + "\\";

        static Dictionary<int, TimeSpan> previous = new Dictionary<int, TimeSpan>();
        static DateTime previousTime = DateTime.UtcNow;
        static bool running;
        static readonly Dictionary<string, bool> consoles = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
        static readonly Dictionary<string, object> info = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        static readonly HashSet<string> delivered = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        class Group { public string Id, Name, Path; public int Count; public long Memory; public double Cpu; public bool Locked, Window; }

        static object Read()
        {
            var now = DateTime.UtcNow;
            double elapsed = Math.Max(0.1, (now - previousTime).TotalSeconds);
            var times = new Dictionary<int, TimeSpan>();
            var groups = new Dictionary<string, Group>(StringComparer.OrdinalIgnoreCase);
            int session = Process.GetCurrentProcess().SessionId;
            var windowed = Windowed();

            foreach (var p in Process.GetProcesses())
            {
                using (p)
                {
                    if (p.Id == 0) continue;
                    string path = PathOf(p.Id), id = Identify(p.ProcessName, path);
                    Group g;
                    if (!groups.TryGetValue(id, out g))
                        groups[id] = g = new Group { Id = id, Name = p.ProcessName, Path = path, Locked = Locked.Contains(p.ProcessName) };
                    g.Count++;
                    if (windowed.Contains(p.Id)) g.Window = true;
                    try
                    {
                        g.Memory += p.WorkingSet64;
                        if (p.SessionId != session) g.Locked = true;
                        TimeSpan total = p.TotalProcessorTime, before;
                        times[p.Id] = total;
                        if (previous.TryGetValue(p.Id, out before)) g.Cpu += (total - before).TotalSeconds / elapsed / Environment.ProcessorCount * 100;
                    }
                    catch { g.Locked = true; }
                }
            }
            previous = times;
            previousTime = now;

            var all = groups.Values.OrderByDescending(g => g.Memory).ToArray();
            foreach (var g in all) if (!info.ContainsKey(g.Id)) info[g.Id] = Describe(g.Path);

            return new
            {
                type = "tasks.list",
                items = all.Select(g => new
                {
                    id = g.Id, name = g.Name, count = g.Count, memory = g.Memory, cpu = Math.Round(Math.Min(100, g.Cpu), 1), locked = g.Locked,
                    window = g.Window, kind = Kind(g),
                    info = delivered.Add(g.Id) ? info[g.Id] : null,
                }).ToArray(),
            };
        }

        static string Kind(Group g)
        {
            if (g.Locked && g.Name != "Bramble" && g.Name != "msedgewebview2") return "system";
            if (g.Path != null && g.Path.IndexOf("\\Windows Defender\\", StringComparison.OrdinalIgnoreCase) >= 0) return "system";
            if (IsConsole(g.Path)) return "console";
            if (g.Window) return "app";
            bool windows = g.Path != null && g.Path.StartsWith(WindowsFolder, StringComparison.OrdinalIgnoreCase);
            return windows ? "system" : "background";
        }

        static string Identify(string name, string path)
        {
            return path == null ? "name:" + name : path.ToLowerInvariant();
        }

        static bool IsConsole(string path)
        {
            if (path == null) return false;
            bool known;
            if (consoles.TryGetValue(path, out known)) return known;
            try
            {
                using (var f = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                using (var r = new BinaryReader(f))
                {
                    f.Position = 0x3C;
                    int header = r.ReadInt32();
                    f.Position = header + 24 + 68;
                    known = r.ReadUInt16() == 3;
                }
            }
            catch { known = false; }
            consoles[path] = known;
            return known;
        }

        static HashSet<int> Windowed()
        {
            var ids = new HashSet<int>();
            EnumWindows((h, l) =>
            {
                if (!IsWindowVisible(h) || GetWindow(h, 4) != IntPtr.Zero || GetWindowTextLength(h) == 0) return true;
                if ((GetWindowLong(h, -20) & 0x80) != 0) return true;
                int cloaked;
                if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
                uint id;
                GetWindowThreadProcessId(h, out id);
                ids.Add((int)id);
                return true;
            }, IntPtr.Zero);
            return ids;
        }

        static string PathOf(int id)
        {
            IntPtr h = OpenProcess(0x1000, false, id);
            if (h == IntPtr.Zero) return null;
            try
            {
                var b = new StringBuilder(1024);
                int n = b.Capacity;
                return QueryFullProcessImageName(h, 0, b, ref n) ? b.ToString() : null;
            }
            finally { CloseHandle(h); }
        }

        static object Describe(string path)
        {
            if (path == null || !File.Exists(path)) return new { icon = (string)null, description = (string)null, company = (string)null, path };
            string description = null, company = null;
            try
            {
                var v = FileVersionInfo.GetVersionInfo(path);
                description = string.IsNullOrWhiteSpace(v.FileDescription) ? null : v.FileDescription.Trim();
                company = string.IsNullOrWhiteSpace(v.CompanyName) ? null : v.CompanyName.Trim();
            }
            catch { }
            return new { icon = IconOf(path), description, company, path };
        }

        static string IconOf(string path)
        {
            try
            {
                using (Icon icon = Icon.ExtractAssociatedIcon(path))
                using (var small = new Bitmap(32, 32, PixelFormat.Format32bppArgb))
                {
                    using (var g = Graphics.FromImage(small))
                    {
                        g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                        g.DrawImage(icon.ToBitmap(), 0, 0, 32, 32);
                    }
                    using (var stream = new MemoryStream())
                    {
                        small.Save(stream, ImageFormat.Png);
                        return "data:image/png;base64," + Convert.ToBase64String(stream.ToArray());
                    }
                }
            }
            catch { return null; }
        }

        static void End(string id)
        {
            if (string.IsNullOrEmpty(id)) return;
            int session = Process.GetCurrentProcess().SessionId, refused = 0, closed = 0, asked = 0;
            string name = id;
            foreach (var p in Process.GetProcesses())
            {
                using (p)
                {
                    try
                    {
                        if (Identify(p.ProcessName, PathOf(p.Id)) != id || Locked.Contains(p.ProcessName)) continue;
                        name = p.ProcessName;
                        if (p.SessionId != session) { refused++; continue; }
                        if (p.MainWindowHandle != IntPtr.Zero && p.CloseMainWindow()) { asked++; continue; }
                        p.Kill();
                        closed++;
                    }
                    catch { refused++; }
                }
            }
            if (closed > 0) Program.Announce("{0} closed", name);
            else if (asked > 0) Program.Announce("{0} was asked to close", name);
            else if (refused > 0) Program.Announce("{0} could not be closed", name);
        }

        static object Details(string id)
        {
            var pids = new HashSet<int>();
            string path = null, name = id;
            DateTime started = DateTime.MaxValue;
            foreach (var p in Process.GetProcesses())
                using (p)
                {
                    string where = PathOf(p.Id);
                    if (Identify(p.ProcessName, where) != id) continue;
                    pids.Add(p.Id);
                    name = p.ProcessName;
                    if (path == null) path = where;
                    try { if (p.StartTime < started) started = p.StartTime; } catch { }
                }
            string description = null, company = null, version = null;
            long size = 0;
            if (path != null && File.Exists(path))
            {
                try
                {
                    var v = FileVersionInfo.GetVersionInfo(path);
                    description = string.IsNullOrWhiteSpace(v.FileDescription) ? null : v.FileDescription.Trim();
                    company = string.IsNullOrWhiteSpace(v.CompanyName) ? null : v.CompanyName.Trim();
                    version = string.IsNullOrWhiteSpace(v.ProductVersion) ? (string.IsNullOrWhiteSpace(v.FileVersion) ? null : v.FileVersion.Trim()) : v.ProductVersion.Trim();
                    size = new FileInfo(path).Length;
                }
                catch { }
            }
            var tcp = Connections(pids);
            return new
            {
                type = "tasks.details", id = id, name = name, path = path, description = description, company = company, version = version, size = size,
                started = started == DateTime.MaxValue ? null : started.ToString("o"), processes = pids.Count, startup = Startup(path),
                established = tcp.Count(c => c[0] == "5"), listening = tcp.Count(c => c[0] == "2"),
                remotes = tcp.Where(c => c[0] == "5").Select(c => c[1]).Distinct().Take(5).ToArray(),
            };
        }

        static readonly string[][] RunKeys =
        {
            new[] { "user", @"Software\Microsoft\Windows\CurrentVersion\Run" },
            new[] { "machine", @"Software\Microsoft\Windows\CurrentVersion\Run" },
            new[] { "machine", @"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run" },
        };

        static string Startup(string path)
        {
            if (path == null) return null;
            string file = Path.GetFileName(path);
            try
            {
                foreach (var k in RunKeys)
                {
                    var root = k[0] == "user" ? Registry.CurrentUser : Registry.LocalMachine;
                    using (var key = root.OpenSubKey(k[1]))
                    {
                        if (key == null) continue;
                        foreach (string value in key.GetValueNames())
                        {
                            string command = Environment.ExpandEnvironmentVariables(key.GetValue(value) as string ?? "");
                            if (command.IndexOf(path, StringComparison.OrdinalIgnoreCase) < 0) continue;
                            return Disabled(root, value) ? "off" : "registry";
                        }
                    }
                }
                foreach (string folder in new[] { Environment.GetFolderPath(Environment.SpecialFolder.Startup), Environment.GetFolderPath(Environment.SpecialFolder.CommonStartup) })
                {
                    if (!Directory.Exists(folder)) continue;
                    foreach (string lnk in Directory.GetFiles(folder, "*.lnk"))
                        if (string.Equals(Target(lnk), path, StringComparison.OrdinalIgnoreCase)) return "folder";
                }
            }
            catch (Exception ex) { Program.Log(ex); }
            return "no";
        }

        static bool Disabled(RegistryKey root, string value)
        {
            using (var key = root.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"))
            {
                var data = key == null ? null : key.GetValue(value) as byte[];
                return data != null && data.Length > 0 && (data[0] & 1) == 1;
            }
        }

        static string Target(string lnk)
        {
            object shell = null, link = null;
            try
            {
                Type type = Type.GetTypeFromProgID("WScript.Shell");
                shell = Activator.CreateInstance(type);
                link = type.InvokeMember("CreateShortcut", System.Reflection.BindingFlags.InvokeMethod, null, shell, new object[] { lnk });
                return link.GetType().InvokeMember("TargetPath", System.Reflection.BindingFlags.GetProperty, null, link, null) as string;
            }
            catch { return null; }
            finally
            {
                if (link != null) Marshal.FinalReleaseComObject(link);
                if (shell != null) Marshal.FinalReleaseComObject(shell);
            }
        }

        static List<string[]> Connections(HashSet<int> pids)
        {
            var list = new List<string[]>();
            foreach (int family in new[] { 2, 23 })
            {
                int size = 0;
                GetExtendedTcpTable(IntPtr.Zero, ref size, false, family, 5, 0);
                if (size <= 0) continue;
                IntPtr buffer = Marshal.AllocHGlobal(size);
                try
                {
                    if (GetExtendedTcpTable(buffer, ref size, false, family, 5, 0) != 0) continue;
                    int count = Marshal.ReadInt32(buffer), row = family == 2 ? 24 : 56;
                    for (int i = 0; i < count; i++)
                    {
                        IntPtr r = buffer + 4 + i * row;
                        int state = family == 2 ? Marshal.ReadInt32(r) : Marshal.ReadInt32(r + 48), pid = Marshal.ReadInt32(r + (family == 2 ? 20 : 52));
                        if (!pids.Contains(pid)) continue;
                        string remote;
                        if (family == 2)
                        {
                            var ip = new System.Net.IPAddress(BitConverter.GetBytes(Marshal.ReadInt32(r + 12)));
                            remote = ip + ":" + Port(Marshal.ReadInt32(r + 16));
                        }
                        else
                        {
                            var bytes = new byte[16];
                            Marshal.Copy(r + 24, bytes, 0, 16);
                            remote = "[" + new System.Net.IPAddress(bytes) + "]:" + Port(Marshal.ReadInt32(r + 44));
                        }
                        list.Add(new[] { state.ToString(), remote });
                    }
                }
                finally { Marshal.FreeHGlobal(buffer); }
            }
            return list;
        }

        static int Port(int raw) { return ((raw & 0xFF) << 8) | ((raw >> 8) & 0xFF); }

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            switch (action)
            {
                case "details":
                {
                    object value;
                    string program = m.TryGetValue("id", out value) && value != null ? value.ToString() : null;
                    if (program == null) return false;
                    Task.Run(() => Details(program)).ContinueWith(t => Program.OnInterface(() =>
                    {
                        if (t.IsFaulted) { Program.Log(t.Exception); return; }
                        Program.Send(t.Result);
                    }));
                    return false;
                }
                case "show":
                {
                    object value;
                    string path = m.TryGetValue("path", out value) && value != null ? value.ToString() : null;
                    if (path != null && File.Exists(path)) Process.Start("explorer.exe", "/select,\"" + path + "\"");
                    return false;
                }
                case "list":
                    if (running) return false;
                    object fresh;
                    if (m.TryGetValue("fresh", out fresh) && fresh is bool && (bool)fresh) delivered.Clear();
                    running = true;
                    Task.Run(() => Read()).ContinueWith(t => Program.OnInterface(() =>
                    {
                        running = false;
                        if (t.IsFaulted) { Program.Log(t.Exception); return; }
                        Program.Send(t.Result);
                    }));
                    return false;
                case "end":
                    object id;
                    End(m.TryGetValue("id", out id) && id != null ? id.ToString() : null);
                    return true;
            }
            return false;
        }

        delegate bool EnumProc(IntPtr window, IntPtr parameter);
        [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr parameter);
        [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
        [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr window, uint command);
        [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr window);
        [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] static extern int GetWindowLong(IntPtr window, int index);
        [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint id);
        [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out int value, int size);
        [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, int id);
        [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr process, int flags, StringBuilder name, ref int size);
        [DllImport("iphlpapi.dll")] static extern uint GetExtendedTcpTable(IntPtr table, ref int size, bool order, int family, int kind, uint reserved);
    }
}
