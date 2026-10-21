using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using Microsoft.Win32;

namespace Bramble
{
    class IconsSettings
    {
        public string Chosen;
        public List<string> Favorites = new List<string>();
        public List<string> Customized = new List<string>();
        public bool Subfolders;
        public string Size = "medium";
        public Dictionary<string, string> Originals = new Dictionary<string, string>();
    }

    static class Icons
    {
        static readonly string CustomFolder = Path.Combine(Program.Root, "icons");
        static readonly string Cache = Path.Combine(Program.Root, "app", "icon-cache");
        static readonly string IndexFile = Path.Combine(Cache, "index.json");
        static readonly string SystemDir = Environment.GetFolderPath(Environment.SpecialFolder.System);
        const string MenuKey = @"Software\Classes\Directory\shell\Bramble.Icon";

        static readonly string[] Sources =
        {
            "shell32.dll", "imageres.dll", "moricons.dll", "pifmgr.dll", "ddores.dll",
            "netshell.dll", "wmploc.dll", "mmres.dll", "setupapi.dll", "compstui.dll",
        };
        static readonly string[] FormatsImage = { ".png", ".jpg", ".jpeg", ".bmp", ".gif" };

        static readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
        static readonly object gate = new object();
        static Dictionary<string, bool> retro = new Dictionary<string, bool>();
        static List<object> library;
        static int progress, total;

        static IconsSettings R { get { return Program.R.Icons; } }

        public static void Start()
        {
            if (Program.R.Icons == null) Program.R.Icons = new IconsSettings();

            var old = Program.R.Folders;
            if (old != null && R.Chosen == null && R.Favorites.Count == 0 && R.Customized.Count == 0) Program.R.Icons = old;
            Program.R.Folders = null;
            Directory.CreateDirectory(CustomFolder);
            Directory.CreateDirectory(Cache);
            new Thread(Prepare) { IsBackground = true, Priority = ThreadPriority.BelowNormal }.Start();
        }

        class Index { public string Signature; public Dictionary<string, bool> Retro; }

        static string Signature()
        {
            return Environment.OSVersion.VersionString + "|" + string.Join("|", Sources.Select(s =>
            {
                var f = new FileInfo(Path.Combine(SystemDir, s));
                return f.Exists ? s + ":" + f.Length + ":" + f.LastWriteTimeUtc.Ticks : s;
            }));
        }

        static void Prepare()
        {
            try
            {
                string signature = Signature();
                Index index = null;
                try { if (File.Exists(IndexFile)) index = json.Deserialize<Index>(File.ReadAllText(IndexFile)); }
                catch (Exception ex) { Program.Log(ex); }
                bool upToDate = index != null && index.Signature == signature && index.Retro != null;
                if (upToDate) lock (gate) retro = index.Retro;

                var numbers = Sources.Select(s => File.Exists(Path.Combine(SystemDir, s)) ? (int)ExtractIconEx(Path.Combine(SystemDir, s), -1, null, null, 0) : 0).ToArray();
                total = numbers.Sum();
                var list = new List<object>();
                for (int k = 0; k < Sources.Length; k++)
                    for (int i = 0; i < numbers[k]; i++, progress++)
                    {
                        string path = Path.Combine(SystemDir, Sources[k]);
                        string key = Key(path, i);
                        bool r;
                        if (!(upToDate && FindRetro(key, out r)) && !Extract(path, i, key, out r)) continue;
                        if (!upToDate && progress % 40 == 0) Announce();
                        list.Add(new { id = Sources[k] + "," + i, key = key, source = Sources[k], retro = r });
                    }
                if (!upToDate) Save(signature);
                Program.OnInterface(() =>
                {
                    library = list;
                    Program.Send(Library());
                    Program.SendState();
                });
            }
            catch (Exception ex) { Program.Log(ex); }
        }

        static void Announce()
        {
            int done = progress;
            Program.OnInterface(() => Program.Send(new { type = "icons.progress", done = done, total = total }));
        }

        static void Save(string signature)
        {
            try
            {
                lock (gate) File.WriteAllText(IndexFile, json.Serialize(new Index { Signature = signature, Retro = retro }));
            }
            catch (Exception ex) { Program.Log(ex); }
        }

        static bool FindRetro(string key, out bool r)
        {
            lock (gate) return retro.TryGetValue(key, out r) && File.Exists(Path.Combine(Cache, key + "-32.png"));
        }

        static object Library()
        {
            return new { type = "icons.library", icons = library };
        }

        static string Key(string file, int index)
        {
            string name = Path.GetFileName(file).ToLowerInvariant();
            if (string.Equals(Path.GetDirectoryName(file), SystemDir, StringComparison.OrdinalIgnoreCase))
                return name + "-" + index;
            DateTime date = File.Exists(file) ? File.GetLastWriteTimeUtc(file) : DateTime.MinValue;
            using (var sha = SHA1.Create())
            {
                byte[] h = sha.ComputeHash(Encoding.UTF8.GetBytes(file.ToLowerInvariant() + "|" + index + "|" + date.Ticks));
                return "f-" + BitConverter.ToString(h, 0, 8).Replace("-", "").ToLowerInvariant();
            }
        }

        static bool Extract(string file, int index, string key, out bool isRetro)
        {
            isRetro = false;
            using (Bitmap b32 = Image(file, index, 32))
            {
                if (b32 == null) return false;
                int semi = 0, full = 0;
                for (int y = 0; y < b32.Height; y++)
                    for (int x = 0; x < b32.Width; x++)
                    {
                        int a = b32.GetPixel(x, y).A;
                        if (a == 255) full++; else if (a > 0) semi++;
                    }
                if (full + semi == 0) return false;
                isRetro = semi == 0;
                b32.Save(Path.Combine(Cache, key + "-32.png"), ImageFormat.Png);
            }
            using (Bitmap b64 = Image(file, index, 64))
                if (b64 != null) b64.Save(Path.Combine(Cache, key + "-64.png"), ImageFormat.Png);
            lock (gate) retro[key] = isRetro;
            return true;
        }

        static Bitmap Image(string file, int index, int size)
        {
            var h = new IntPtr[1];
            var id = new int[1];
            if (PrivateExtractIcons(file, index, size, size, h, id, 1, 0) < 1 || h[0] == IntPtr.Zero) return null;
            try
            {
                using (var icon = Icon.FromHandle(h[0]))
                    return icon.ToBitmap();
            }
            finally { Native.DestroyIcon(h[0]); }
        }

        static object Preview(string file, int index)
        {
            try
            {
                string key = Key(file, index);
                bool r;
                if (!FindRetro(key, out r))
                {
                    if (!File.Exists(file) || !Extract(file, index, key, out r)) return null;
                    Save(Signature());
                }
                return new { key = key, retro = r };
            }
            catch (Exception ex) { Program.Log(ex); return null; }
        }

        static object[] ListCustom()
        {
            Directory.CreateDirectory(CustomFolder);
            return Directory.GetFiles(CustomFolder, "*.ico")
                .OrderBy(f => Path.GetFileName(f), StringComparer.CurrentCultureIgnoreCase)
                .Select(f => new { id = "custom/" + Path.GetFileName(f), name = Path.GetFileNameWithoutExtension(f), preview = Preview(f, 0) })
                .Where(x => x.preview != null)
                .ToArray();
        }

        static int Add(IEnumerable<string> files)
        {
            int added = 0;
            foreach (string source in files)
            {
                string ext = Path.GetExtension(source).ToLowerInvariant();
                if (ext != ".ico" && !FormatsImage.Contains(ext)) continue;
                try
                {
                    string name = Path.GetFileNameWithoutExtension(source);
                    string target = Path.Combine(CustomFolder, name + ".ico");
                    for (int i = 2; File.Exists(target); i++) target = Path.Combine(CustomFolder, name + " (" + i + ").ico");
                    if (ext == ".ico") File.Copy(source, target);
                    else WriteIco(source, target);
                    added++;
                }
                catch (Exception ex) { Program.Log(ex); }
            }
            return added;
        }

        static void WriteIco(string image, string target)
        {
            using (var origin = new Bitmap(image))
            {
                int side = Math.Max(origin.Width, origin.Height);
                bool pixel = side <= 64;
                var images = new List<byte[]>();
                var sizes = new[] { 16, 24, 32, 48, 64, 128, 256 };
                foreach (int t in sizes)
                    using (var b = new Bitmap(t, t, PixelFormat.Format32bppArgb))
                    using (var g = Graphics.FromImage(b))
                    using (var stream = new MemoryStream())
                    {
                        g.InterpolationMode = pixel ? InterpolationMode.NearestNeighbor : InterpolationMode.HighQualityBicubic;
                        g.PixelOffsetMode = pixel ? PixelOffsetMode.Half : PixelOffsetMode.HighQuality;
                        float k = (float)t / side;
                        float w = origin.Width * k, h = origin.Height * k;
                        g.DrawImage(origin, (t - w) / 2, (t - h) / 2, w, h);
                        b.Save(stream, ImageFormat.Png);
                        images.Add(stream.ToArray());
                    }

                using (var f = new BinaryWriter(File.Create(target)))
                {
                    f.Write((short)0); f.Write((short)1); f.Write((short)sizes.Length);
                    int offset = 6 + 16 * sizes.Length;
                    for (int i = 0; i < sizes.Length; i++)
                    {
                        f.Write((byte)(sizes[i] >= 256 ? 0 : sizes[i])); f.Write((byte)(sizes[i] >= 256 ? 0 : sizes[i]));
                        f.Write((byte)0); f.Write((byte)0); f.Write((short)1); f.Write((short)32);
                        f.Write(images[i].Length); f.Write(offset);
                        offset += images[i].Length;
                    }
                    foreach (byte[] img in images) f.Write(img);
                }
            }
        }

        static void Remove(string id)
        {
            string path = IconPath(id);
            if (path == null || !id.StartsWith("custom/")) return;
            bool favorite = R.Favorites.Remove(id);
            Program.SetAside(path, Path.GetFileNameWithoutExtension(path), () => { if (favorite) R.Favorites.Add(id); });
        }

        static string IconPath(string id)
        {
            if (string.IsNullOrEmpty(id)) return null;
            if (id.StartsWith("custom/"))
            {
                string path = Path.GetFullPath(Path.Combine(CustomFolder, id.Substring("custom/".Length)));
                return path.StartsWith(CustomFolder + "\\", StringComparison.OrdinalIgnoreCase) && File.Exists(path) ? path : null;
            }
            int comma = id.LastIndexOf(',');
            if (comma < 0 || !Sources.Contains(id.Substring(0, comma), StringComparer.OrdinalIgnoreCase)) return null;
            return Path.Combine(SystemDir, id.Substring(0, comma));
        }

        static int IconIndex(string id)
        {
            int comma = id.LastIndexOf(',');
            int i;
            return !id.StartsWith("custom/") && comma >= 0 && int.TryParse(id.Substring(comma + 1), out i) ? i : 0;
        }

        static bool Choose(string folder)
        {
            if (string.IsNullOrEmpty(folder) || !Directory.Exists(folder)) return false;
            R.Chosen = folder.TrimEnd('\\');
            if (R.Chosen.Length == 2) R.Chosen += "\\";
            return true;
        }

        public static void Ask(string folder)
        {
            if (Choose(folder)) Program.Save();
        }

        static string Current(string folder)
        {
            var icon = ReadIcon(folder);
            return icon == null ? "" : icon.Item1 + "," + icon.Item2;
        }

        static string OriginalOf(string folder)
        {
            string v;
            return R.Originals != null && folder != null && R.Originals.TryGetValue(folder.ToLowerInvariant(), out v) ? v : null;
        }

        static void Remember(string folder)
        {
            if (R.Originals == null) R.Originals = new Dictionary<string, string>();
            string key = folder.ToLowerInvariant();
            if (R.Originals.ContainsKey(key) || R.Customized.Contains(folder, StringComparer.OrdinalIgnoreCase)) return;
            R.Originals[key] = Current(folder);
        }

        static void Write(string folder, string icon)
        {
            int comma = string.IsNullOrEmpty(icon) ? -1 : icon.LastIndexOf(',');
            int index;
            if (comma < 0 || !int.TryParse(icon.Substring(comma + 1), out index)) { ResetToDefault(folder); return; }
            WriteIcon(folder, icon.Substring(0, comma), index);
        }

        static void Restore(string folder)
        {
            if (folder == null || !Directory.Exists(folder)) return;
            Write(folder, OriginalOf(folder));
            R.Customized.RemoveAll(d => string.Equals(d, folder, StringComparison.OrdinalIgnoreCase));
        }

        class Before { public string Folder, Icon; public bool Customized; }

        static Before Snapshot(string folder)
        {
            var b = new Before { Folder = folder, Icon = Current(folder), Customized = R.Customized.Contains(folder, StringComparer.OrdinalIgnoreCase) };
            Remember(folder);
            return b;
        }

        static void Rewind(List<Before> list)
        {
            foreach (var b in list)
            {
                if (!Directory.Exists(b.Folder)) continue;
                Write(b.Folder, b.Icon);
                R.Customized.RemoveAll(d => string.Equals(d, b.Folder, StringComparison.OrdinalIgnoreCase));
                if (b.Customized) R.Customized.Add(b.Folder);
            }
        }

        static void Apply(string id)
        {
            string folder = R.Chosen, file = IconPath(id);
            if (file == null) return;
            if (folder == null || !Directory.Exists(folder)) { Program.Announce("No folder chosen"); return; }
            var before = new List<Before> { Snapshot(folder) };
            int hr = WriteIcon(folder, file, IconIndex(id));
            if (hr != 0) { Program.Announce("Protected folder, icon unchanged"); Program.Log(new Exception("SHGetSetFolderCustomSettings 0x" + hr.ToString("X8") + " : " + folder)); return; }
            if (!R.Customized.Contains(folder, StringComparer.OrdinalIgnoreCase)) R.Customized.Add(folder);

            if (R.Subfolders)
            {
                int n = 0;
                try
                {
                    foreach (string under in Directory.GetDirectories(folder))
                    {
                        if ((File.GetAttributes(under) & (FileAttributes.System | FileAttributes.Hidden | FileAttributes.ReparsePoint)) != 0) continue;
                        var snapshot = Snapshot(under);
                        if (WriteIcon(under, file, IconIndex(id)) != 0) continue;
                        before.Add(snapshot);
                        if (!R.Customized.Contains(under, StringComparer.OrdinalIgnoreCase)) R.Customized.Add(under);
                        n++;
                    }
                }
                catch (Exception ex) { Program.Log(ex); }
                if (n > 0) Program.Undoable(Language.T(n > 1 ? "Icon also applied to {0} subfolders" : "Icon also applied to 1 subfolder", n), () => Rewind(before));
            }
        }

        static void RefreshWindows()
        {
            SHChangeNotify(0x08000000 , 0, IntPtr.Zero, IntPtr.Zero);
            try
            {
                var p = new System.Diagnostics.ProcessStartInfo("ie4uinit.exe", "-show") { UseShellExecute = false, CreateNoWindow = true };
                using (System.Diagnostics.Process.Start(p)) { }
            }
            catch (Exception ex) { Program.Log(ex); }
            foreach (string d in R.Customized.ToList()) if (Directory.Exists(d)) Refresh(d);
            Program.Announce("Windows icons refreshed");
        }

        static bool Inside(string path)
        {
            if (string.IsNullOrEmpty(path)) return false;
            path = Environment.ExpandEnvironmentVariables(path.Split(',')[0].Trim());
            return path.StartsWith(Program.Root + "\\", StringComparison.OrdinalIgnoreCase);
        }

        public static void Uninstall()
        {
            foreach (string folder in R.Customized.ToList())
            {
                if (!Directory.Exists(folder)) continue;
                var icon = ReadIcon(folder);
                if (icon == null || !Inside(icon.Item1)) continue;
                string original = OriginalOf(folder);
                Write(folder, Inside(original) ? null : original);
                R.Customized.RemoveAll(d => string.Equals(d, folder, StringComparison.OrdinalIgnoreCase));
            }
            using (var command = Registry.CurrentUser.OpenSubKey(MenuKey + @"\command"))
            {
                string v = command == null ? null : command.GetValue("") as string;
                if (v == null || v.IndexOf(System.Windows.Forms.Application.ExecutablePath, StringComparison.OrdinalIgnoreCase) < 0) return;
            }
            Registry.CurrentUser.DeleteSubKeyTree(MenuKey, false);
        }

        static void ResetAll()
        {
            var list = R.Customized.ToList();
            var before = list.Select(d => new Before { Folder = d, Icon = Current(d), Customized = true }).ToList();
            foreach (string d in list) Restore(d);
            Program.Undoable(Language.T(list.Count > 1 ? "{0} folders reset" : "1 folder reset", list.Count), () => Rewind(before));
        }

        static void ResetToDefault(string folder)
        {
            if (folder == null || !Directory.Exists(folder)) return;
            WriteIcon(folder, null, 0);

            string ini = Path.Combine(folder, "desktop.ini");
            try
            {
                if (File.Exists(ini) && ReadIcon(folder) != null)
                {
                    var attributes = File.GetAttributes(ini);
                    File.SetAttributes(ini, FileAttributes.Normal);
                    var rows = File.ReadAllLines(ini).Where(l =>
                    {
                        string t = l.TrimStart().ToLowerInvariant();
                        return !(t.StartsWith("iconresource=") || t.StartsWith("iconfile=") || t.StartsWith("iconindex="));
                    });
                    File.WriteAllLines(ini, rows, Encoding.Unicode);
                    File.SetAttributes(ini, attributes);
                }
            }
            catch (Exception ex) { Program.Log(ex); }
            Refresh(folder);
            R.Customized.RemoveAll(d => string.Equals(d, folder, StringComparison.OrdinalIgnoreCase));
        }

        static int WriteIcon(string folder, string file, int index)
        {
            var s = new SHFOLDERCUSTOMSETTINGS { dwMask = FCSM_ICONFILE, iIconIndex = index };
            s.dwSize = (uint)Marshal.SizeOf(s);
            s.pszIconFile = file == null ? IntPtr.Zero : Marshal.StringToCoTaskMemUni(file);
            try
            {
                int hr = SHGetSetFolderCustomSettings(ref s, folder, FCS_FORCEWRITE);
                if (hr == 0) Refresh(folder);
                return hr;
            }
            finally { if (s.pszIconFile != IntPtr.Zero) Marshal.FreeCoTaskMem(s.pszIconFile); }
        }

        static void Refresh(string folder)
        {
            IntPtr p = Marshal.StringToHGlobalUni(folder);
            try
            {
                SHChangeNotify(SHCNE_UPDATEITEM, SHCNF_PATHW, p, IntPtr.Zero);
                SHChangeNotify(SHCNE_UPDATEDIR, SHCNF_PATHW, p, IntPtr.Zero);
            }
            finally { Marshal.FreeHGlobal(p); }
        }

        static Tuple<string, int> ReadIcon(string folder)
        {
            var s = new SHFOLDERCUSTOMSETTINGS { dwMask = FCSM_ICONFILE, cchIconFile = 520 };
            s.dwSize = (uint)Marshal.SizeOf(s);
            s.pszIconFile = Marshal.AllocCoTaskMem(520 * 2);
            try
            {
                Marshal.WriteInt16(s.pszIconFile, 0);
                if (SHGetSetFolderCustomSettings(ref s, folder, FCS_READ) != 0) return null;
                string f = Marshal.PtrToStringUni(s.pszIconFile);
                if (string.IsNullOrWhiteSpace(f)) return null;
                f = Environment.ExpandEnvironmentVariables(f);
                if (!Path.IsPathRooted(f)) f = Path.Combine(folder, f);
                return Tuple.Create(f, s.iIconIndex);
            }
            catch { return null; }
            finally { Marshal.FreeCoTaskMem(s.pszIconFile); }
        }

        static Tuple<string, int> DisplayedIcon(string folder)
        {
            var clean = ReadIcon(folder);
            if (clean != null) return clean;
            var info = new SHSTOCKICONINFO();
            info.cbSize = (uint)Marshal.SizeOf(info);
            return SHGetStockIconInfo(3 , 0, ref info) == 0 ? Tuple.Create(info.szPath, info.iIcon) : null;
        }

        static string IdOf(Tuple<string, int> icon)
        {
            if (icon == null) return null;
            string f = icon.Item1;
            if (string.Equals(Path.GetDirectoryName(f), CustomFolder, StringComparison.OrdinalIgnoreCase)) return "custom/" + Path.GetFileName(f);
            string name = Path.GetFileName(f);
            string source = Sources.FirstOrDefault(s => string.Equals(s, name, StringComparison.OrdinalIgnoreCase));
            return source != null && icon.Item2 >= 0 ? source + "," + icon.Item2 : null;
        }

        static object Describe(string folder)
        {
            var icon = DisplayedIcon(folder);
            string name = Path.GetFileName(folder.TrimEnd('\\'));
            return new
            {
                path = folder,
                name = string.IsNullOrEmpty(name) ? folder : name,
                id = IdOf(icon),
                custom = ReadIcon(folder) != null,
                original = !string.IsNullOrEmpty(OriginalOf(folder)) && OriginalOf(folder) != Current(folder),
                preview = icon == null ? null : Preview(icon.Item1, icon.Item2),
            };
        }

        static object[] DesktopFolders()
        {
            try
            {
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                return new DirectoryInfo(desktop).GetDirectories()
                    .Where(d => (d.Attributes & FileAttributes.Hidden) == 0)
                    .OrderBy(d => d.Name, StringComparer.CurrentCultureIgnoreCase)
                    .Select(d => Describe(d.FullName)).ToArray();
            }
            catch (Exception ex) { Program.Log(ex); return new object[0]; }
        }

        static void Browse()
        {
            string path = AskFolder(Language.T("Choose a folder"));
            if (path != null) Choose(path);
        }

        public static string AskFolder(string title)
        {
            var dialog = (IFileOpenDialog)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")));
            try
            {
                uint options;
                dialog.GetOptions(out options);
                dialog.SetOptions(options | 0x20  | 0x40 );
                dialog.SetTitle(title);
                if (dialog.Show(Program.SettingsWindow == null ? IntPtr.Zero : Program.SettingsWindow.Handle) != 0) return null;
                IShellItem element;
                dialog.GetResult(out element);
                string path;
                element.GetDisplayName(0x80058000 , out path);
                return path;
            }
            finally { Marshal.ReleaseComObject(dialog); }
        }

        static bool MenuEnabled()
        {
            using (var key = Registry.CurrentUser.OpenSubKey(MenuKey)) return key != null;
        }

        static void ToggleMenu(bool active)
        {
            if (!active) { Registry.CurrentUser.DeleteSubKeyTree(MenuKey, false); return; }
            string exe = System.Windows.Forms.Application.ExecutablePath;
            using (var key = Registry.CurrentUser.CreateSubKey(MenuKey))
            {
                key.SetValue("MUIVerb", Language.T("Change icon with Bramble"));
                key.SetValue("Icon", "\"" + exe + "\",0");
                using (var command = key.CreateSubKey("command"))
                    command.SetValue("", "\"" + exe + "\" --folder \"%1\"");
            }
        }

        public static bool Receive(string action, Dictionary<string, object> m, List<string> files)
        {
            switch (action)
            {
                case "library":
                    if (library != null) Program.Send(Library());
                    else Program.Send(new { type = "icons.progress", done = progress, total = total });
                    return false;
                case "apply": Apply(Text(m, "id")); return true;
                case "initial": ResetToDefault(R.Chosen); return true;
                case "original": Restore(R.Chosen); return true;
                case "choose": return Choose(Text(m, "path"));
                case "browse": Browse(); return true;
                case "open":
                    if (R.Chosen != null && Directory.Exists(R.Chosen)) System.Diagnostics.Process.Start("explorer.exe", "\"" + R.Chosen + "\"");
                    return false;
                case "favorite":
                {
                    string id = Text(m, "id");
                    if (IconPath(id) == null) return false;
                    if (!R.Favorites.Remove(id)) R.Favorites.Add(id);
                    return true;
                }
                case "add":
                {
                    using (var dialog = new System.Windows.Forms.OpenFileDialog())
                    {
                        dialog.Title = Language.T("Add icons");
                        dialog.Multiselect = true;
                        dialog.Filter = Language.T("Icons and images") + "|*.ico;" + string.Join(";", FormatsImage.Select(e => "*" + e));
                        if (dialog.ShowDialog(Program.SettingsWindow) != System.Windows.Forms.DialogResult.OK) return false;
                        Add(dialog.FileNames);
                    }
                    return true;
                }
                case "remove": Remove(Text(m, "id")); return true;
                case "drop":
                {
                    string folder = files.FirstOrDefault(Directory.Exists);
                    if (folder != null) Choose(folder);
                    var others = files.Where(f => !Directory.Exists(f)).ToList();
                    int added = Add(others);
                    if (others.Count > added) Program.Announce("Unsupported format");
                    return true;
                }
                case "menu": ToggleMenu(Convert.ToBoolean(m["value"])); return true;
                case "subfolders": R.Subfolders = Convert.ToBoolean(m["value"]); return true;
                case "size": R.Size = Text(m, "value") == "small" || Text(m, "value") == "large" ? Text(m, "value") : "medium"; return true;
                case "refresh": RefreshWindows(); return true;
                case "resetAll": ResetAll(); return true;
                case "folderIcons": System.Diagnostics.Process.Start("explorer.exe", "\"" + CustomFolder + "\""); return false;
            }
            return false;
        }

        public static object State()
        {
            if (R.Chosen != null && !Directory.Exists(R.Chosen)) R.Chosen = null;
            R.Customized.RemoveAll(d => !Directory.Exists(d));
            return new
            {
                chosen = R.Chosen == null ? null : Describe(R.Chosen),
                favorites = R.Favorites.ToArray(),
                custom = ListCustom(),
                customized = R.Customized.OrderBy(d => Path.GetFileName(d), StringComparer.CurrentCultureIgnoreCase).Select(Describe).ToArray(),
                desktop = DesktopFolders(),
                menu = MenuEnabled(),
                subfolders = R.Subfolders,
                size = R.Size ?? "medium",
                ready = library != null,
            };
        }

        static string Text(Dictionary<string, object> m, string key)
        {
            object v;
            return m.TryGetValue(key, out v) && v != null ? v.ToString() : null;
        }

        const uint FCSM_ICONFILE = 0x10, FCS_READ = 0x1, FCS_FORCEWRITE = 0x2;
        const int SHCNE_UPDATEDIR = 0x1000, SHCNE_UPDATEITEM = 0x2000;
        const uint SHCNF_PATHW = 0x5;

        [StructLayout(LayoutKind.Sequential)]
        struct SHFOLDERCUSTOMSETTINGS
        {
            public uint dwSize, dwMask;
            public IntPtr pvid, pszWebViewTemplate;
            public uint cchWebViewTemplate;
            public IntPtr pszWebViewTemplateVersion, pszInfoTip;
            public uint cchInfoTip;
            public IntPtr pclsid;
            public uint dwFlags;
            public IntPtr pszIconFile;
            public uint cchIconFile;
            public int iIconIndex;
            public IntPtr pszLogo;
            public uint cchLogo;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct SHSTOCKICONINFO
        {
            public uint cbSize;
            public IntPtr hIcon;
            public int iSysImageIndex, iIcon;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szPath;
        }

        [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern int SHGetSetFolderCustomSettings(ref SHFOLDERCUSTOMSETTINGS settings, string folder, uint playbackWrite);
        [DllImport("shell32.dll")] static extern void SHChangeNotify(int eventId, uint options, IntPtr a, IntPtr b);
        [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern int SHGetStockIconInfo(int siid, uint options, ref SHSTOCKICONINFO info);
        [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern uint ExtractIconEx(string file, int index, IntPtr[] large, IntPtr[] small, uint number);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int PrivateExtractIcons(string file, int index, int cx, int cy, IntPtr[] icons, int[] ids, int number, int options);

        [ComImport, Guid("d57c7288-d4ad-4768-be02-9d969532d960"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IFileOpenDialog
        {
            [PreserveSig] int Show(IntPtr parent);
            void SetFileTypes();
            void SetFileTypeIndex();
            void GetFileTypeIndex();
            void Advise();
            void Unadvise();
            void SetOptions(uint options);
            void GetOptions(out uint options);
            void SetDefaultFolder();
            void SetFolder();
            void GetFolder();
            void GetCurrentSelection();
            void SetFileName();
            void GetFileName();
            void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
            void SetOkButtonLabel();
            void SetFileNameLabel();
            void GetResult(out IShellItem element);
        }

        [ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IShellItem
        {
            void BindToHandler();
            void GetParent();
            void GetDisplayName(uint sigdn, [MarshalAs(UnmanagedType.LPWStr)] out string name);
        }
    }
}
