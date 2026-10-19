using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32;

namespace Bramble
{
    static class Mouse
    {
        static readonly string CustomFolder = Path.Combine(Program.Root, "cursors");
        static readonly string Cache = Path.Combine(Program.Root, "app", "cursor-cache");
        static readonly string FolderThemes = Path.Combine(Program.Root, "app", "cursor-themes");
        static readonly string FolderWindows = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "Cursors");
        const string Key = @"Control Panel\Cursors";
        const string SchemesKey = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Control Panel\Cursors\Schemes";
        const string SchemaBramble = "Bramble";

        static readonly string[][] Roles =
        {
            new[] { "Arrow", "Normal" }, new[] { "Help", "Help" }, new[] { "AppStarting", "Working in background" },
            new[] { "Wait", "Busy" }, new[] { "Crosshair", "Precision" }, new[] { "IBeam", "Text" },
            new[] { "NWPen", "Handwriting" }, new[] { "No", "Unavailable" }, new[] { "SizeNS", "Vertical resize" },
            new[] { "SizeWE", "Horizontal resize" }, new[] { "SizeNWSE", "Diagonal resize 1" }, new[] { "SizeNESW", "Diagonal resize 2" },
            new[] { "SizeAll", "Move" }, new[] { "UpArrow", "Alternate select" }, new[] { "Hand", "Link" },
            new[] { "Pin", "Location" }, new[] { "Person", "Person" },
        };

        static readonly int[] Showcase = { 0, 14, 5, 3, 12 };
        static readonly string[] Formats = { ".cur", ".ani" };

        public static void Start()
        {
            Directory.CreateDirectory(CustomFolder);
            Directory.CreateDirectory(Cache);
        }

        class Theme { public string Name, Source; public string[] Paths; }

        static List<Theme> Themes()
        {
            var list = new List<Theme>();

            if (Directory.Exists(FolderThemes))
                foreach (string folder in Directory.GetDirectories(FolderThemes).OrderBy(d => d))
                {
                    var paths = Roles.Select(r =>
                    {
                        string ani = Path.Combine(folder, r[0] + ".ani");
                        return File.Exists(ani) ? ani : Path.Combine(folder, r[0] + ".cur");
                    }).ToArray();
                    if (File.Exists(paths[0])) list.Add(new Theme { Name = Path.GetFileName(folder), Source = "bramble", Paths = paths });
                }
            Read(Registry.LocalMachine, SchemesKey, "system", list);
            Read(Registry.CurrentUser, Key + @"\Schemes", "user", list);
            return list;
        }

        static void Read(RegistryKey root, string path, string source, List<Theme> list)
        {
            using (var key = root.OpenSubKey(path))
            {
                if (key == null) return;
                foreach (string name in key.GetValueNames())
                {
                    string value = key.GetValue(name) as string;
                    if (string.IsNullOrEmpty(name) || value == null || list.Any(t => t.Name == name)) continue;
                    var paths = value.Split(',').Select(c => Environment.ExpandEnvironmentVariables(c.Trim())).ToArray();
                    if (paths.Length >= 13) list.Add(new Theme { Name = name, Source = source, Paths = paths });
                }
            }
        }

        static string NameTheme(string name)
        {
            string n = name.Replace(")", "").Replace("(", "").Trim();
            string size = n.EndsWith(" extra large") || n.EndsWith(" XL") ? Language.T(", extra large") : n.EndsWith(" large") || n.EndsWith(" L") ? Language.T(", large") : "";
            if (n.StartsWith("Windows Aero")) return "Windows" + (size == "" ? Language.T(" (default)") : size);
            if (n.StartsWith("Windows Black")) return Language.T("Black") + size;
            if (n.StartsWith("Windows Inverted")) return Language.T("Inverted") + size;
            if (n.StartsWith("Windows Standard")) return "Standard" + size;
            if (n == "Magnified") return Language.T("Magnified");
            return name;
        }

        static void ApplyTheme(string name)
        {
            var theme = Themes().FirstOrDefault(t => t.Name == name);
            if (theme == null) return;
            using (var key = Registry.CurrentUser.CreateSubKey(Key))
            {
                for (int i = 0; i < Roles.Length; i++)
                    key.SetValue(Roles[i][0], i < theme.Paths.Length ? theme.Paths[i] : "", RegistryValueKind.ExpandString);
                key.SetValue("", name);
                key.SetValue("Scheme Source", theme.Source == "system" ? 2 : 1, RegistryValueKind.DWord);
            }

            if (theme.Source == "bramble")
                using (var schemas = Registry.CurrentUser.CreateSubKey(Key + @"\Schemes"))
                    schemas.SetValue(name, string.Join(",", theme.Paths), RegistryValueKind.ExpandString);
            Reload();
        }

        static void Assign(string role, string file)
        {
            if (!Roles.Any(r => r[0] == role) || !File.Exists(file)) return;
            using (var key = Registry.CurrentUser.CreateSubKey(Key))
            {
                key.SetValue(role, file, RegistryValueKind.ExpandString);
                string row = string.Join(",", Roles.Select(r => (key.GetValue(r[0]) as string) ?? ""));
                using (var schemas = Registry.CurrentUser.CreateSubKey(Key + @"\Schemes"))
                    schemas.SetValue(SchemaBramble, row, RegistryValueKind.ExpandString);
                key.SetValue("", SchemaBramble);
                key.SetValue("Scheme Source", 1, RegistryValueKind.DWord);
            }
            Reload();
        }

        static void Reload()
        {
            if (!SystemParametersInfo(SPI_SETCURSORS, 0, IntPtr.Zero, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE))
                SystemParametersInfo(SPI_SETCURSORS, 0, IntPtr.Zero, 0);
        }

        static string[] Current()
        {
            using (var key = Registry.CurrentUser.OpenSubKey(Key))
                return Roles.Select(r =>
                {
                    string v = key == null ? null : key.GetValue(r[0]) as string;
                    return string.IsNullOrEmpty(v) ? null : Environment.ExpandEnvironmentVariables(v);
                }).ToArray();
        }

        public static string ThemeName { get { return CurrentTheme(); } }

        public static void SetTheme(string name) { ApplyTheme(name); }

        static string CurrentTheme()
        {
            using (var key = Registry.CurrentUser.OpenSubKey(Key)) return key == null ? null : key.GetValue("") as string;
        }

        static object Preview(string file)
        {
            if (string.IsNullOrEmpty(file) || !File.Exists(file)) return null;
            try
            {
                string key = KeyOf(file);
                string png32 = Path.Combine(Cache, key + "-32.png"), png64 = Path.Combine(Cache, key + "-64.png");
                bool retro;
                if (File.Exists(png32) && File.Exists(png64)) retro = File.Exists(Path.Combine(Cache, key + ".retro"));
                else
                {
                    using (var b32 = Render(file, 32))
                    using (var b64 = Render(file, 64))
                    {
                        if (b32 == null || b64 == null) return null;
                        b32.Save(png32, ImageFormat.Png);
                        b64.Save(png64, ImageFormat.Png);
                        retro = NoHalftone(b32);
                    }
                    if (retro) File.WriteAllText(Path.Combine(Cache, key + ".retro"), "");
                }
                return new { key = key, retro = retro };
            }
            catch (Exception ex) { Program.Log(ex); return null; }
        }

        static string KeyOf(string file)
        {
            using (var sha = SHA1.Create())
            {
                byte[] h = sha.ComputeHash(Encoding.UTF8.GetBytes("v2|" + file.ToLowerInvariant() + "|" + File.GetLastWriteTimeUtc(file).Ticks));
                return Path.GetFileNameWithoutExtension(file).ToLowerInvariant().Replace(' ', '-') + "-" + BitConverter.ToString(h, 0, 4).Replace("-", "").ToLowerInvariant();
            }
        }

        static Bitmap Render(string file, int size)
        {
            IntPtr cursor = LoadImage(IntPtr.Zero, file, IMAGE_CURSOR, size, size, LR_LOADFROMFILE);
            if (cursor == IntPtr.Zero) return null;
            try
            {
                {
                    int[] n = Paint(cursor, size, 0), w = Paint(cursor, size, 0xFFFFFF), output = new int[n.Length];
                    for (int i = 0; i < n.Length; i++)
                    {
                        int vert = ((w[i] >> 8) & 255) - ((n[i] >> 8) & 255);
                        int a = 255 - Math.Max(0, Math.Min(255, vert));
                        if (a <= 0) continue;

                        int r = Math.Min(255, ((n[i] >> 16) & 255) * 255 / a), g = Math.Min(255, ((n[i] >> 8) & 255) * 255 / a), b = Math.Min(255, (n[i] & 255) * 255 / a);
                        output[i] = (a << 24) | (r << 16) | (g << 8) | b;
                    }
                    var image = new Bitmap(size, size, PixelFormat.Format32bppArgb);
                    var data = image.LockBits(new Rectangle(0, 0, size, size), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
                    Marshal.Copy(output, 0, data.Scan0, output.Length);
                    image.UnlockBits(data);
                    return image;
                }
            }
            finally { DestroyCursor(cursor); }
        }

        static int[] Pixels(Bitmap b)
        {
            var data = b.LockBits(new Rectangle(0, 0, b.Width, b.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            var pixels = new int[b.Width * b.Height];
            Marshal.Copy(data.Scan0, pixels, 0, pixels.Length);
            b.UnlockBits(data);
            return pixels;
        }

        static int[] Paint(IntPtr cursor, int size, int wallpaper)
        {
            var info = new BITMAPINFOHEADER { biSize = 40, biWidth = size, biHeight = -size, biPlanes = 1, biBitCount = 32 };
            IntPtr dc = CreateCompatibleDC(IntPtr.Zero), bits;
            IntPtr image = CreateDIBSection(dc, ref info, 0, out bits, IntPtr.Zero, 0);
            IntPtr before = SelectObject(dc, image);
            try
            {
                var pixels = Enumerable.Repeat(wallpaper, size * size).ToArray();
                Marshal.Copy(pixels, 0, bits, pixels.Length);
                DrawIconEx(dc, 0, 0, cursor, size, size, 0, IntPtr.Zero, DI_NORMAL);
                GdiFlush();
                Marshal.Copy(bits, pixels, 0, pixels.Length);
                return pixels;
            }
            finally
            {
                SelectObject(dc, before);
                DeleteObject(image);
                DeleteDC(dc);
            }
        }

        static bool NoHalftone(Bitmap b)
        {
            foreach (int p in Pixels(b))
            {
                int a = (p >> 24) & 255;
                if (a > 0 && a < 255) return false;
            }
            return true;
        }

        static object[] List(string folder, bool custom)
        {
            if (!Directory.Exists(folder)) return new object[0];
            return Directory.GetFiles(folder)
                .Where(f => Formats.Contains(Path.GetExtension(f).ToLowerInvariant()))
                .OrderBy(f => Path.GetFileName(f), StringComparer.CurrentCultureIgnoreCase)
                .Select(f => new { path = f, name = Path.GetFileNameWithoutExtension(f), animated = f.EndsWith(".ani", StringComparison.OrdinalIgnoreCase), custom = custom, preview = Preview(f) })
                .Where(x => x.preview != null).ToArray();
        }

        static int Add(IEnumerable<string> files)
        {
            int n = 0;
            foreach (string f in files.Where(f => Formats.Contains(Path.GetExtension(f).ToLowerInvariant())))
                try
                {
                    string name = Path.GetFileNameWithoutExtension(f), ext = Path.GetExtension(f).ToLowerInvariant();
                    string target = Path.Combine(CustomFolder, name + ext);
                    for (int i = 2; File.Exists(target); i++) target = Path.Combine(CustomFolder, name + " (" + i + ")" + ext);
                    File.Copy(f, target);
                    n++;
                }
                catch (Exception ex) { Program.Log(ex); }
            return n;
        }

        static void Remove(string path)
        {
            if (path == null || !string.Equals(Path.GetDirectoryName(path), CustomFolder, StringComparison.OrdinalIgnoreCase) || !File.Exists(path)) return;

            var current = Current();
            var roles = Roles.Where((r, i) => string.Equals(current[i], path, StringComparison.OrdinalIgnoreCase)).Select(r => r[0]).ToList();
            if (roles.Count > 0)
                using (var key = Registry.CurrentUser.CreateSubKey(Key))
                    foreach (string r in roles) key.SetValue(r, "", RegistryValueKind.ExpandString);
            if (roles.Count > 0) Reload();
            Program.SetAside(path, Path.GetFileNameWithoutExtension(path), () =>
            {
                using (var key = Registry.CurrentUser.CreateSubKey(Key))
                    foreach (string r in roles) key.SetValue(r, path, RegistryValueKind.ExpandString);
                if (roles.Count > 0) Reload();
            });
        }

        static int Read(uint action)
        {
            int v = 0;
            SystemParametersInfo(action, 0, ref v, 0);
            return v;
        }

        static int PointerSize()
        {
            using (var key = Registry.CurrentUser.OpenSubKey(Key))
            {
                object v = key == null ? null : key.GetValue("CursorBaseSize");
                int base_ = v is int ? (int)v : 32;
                return base_ < 32 ? 0 : Math.Max(1, Math.Min(15, (base_ - 32) / 16 + 1));
            }
        }

        static void AdjustSize(int n)
        {
            n = Math.Max(0, Math.Min(15, n));
            int pixels = n == 0 ? 16 : 32 + (n - 1) * 16;
            using (var key = Registry.CurrentUser.CreateSubKey(Key)) key.SetValue("CursorBaseSize", pixels, RegistryValueKind.DWord);
            using (var key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Accessibility")) key.SetValue("CursorSize", Math.Max(1, n), RegistryValueKind.DWord);

            SystemParametersInfo(SPI_SETCURSORBASESIZE, 0, new IntPtr(pixels), SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);
            Reload();
        }

        static object Settings()
        {
            var acceleration = new int[3];
            SystemParametersInfo(SPI_GETMOUSE, 0, acceleration, 0);
            int rows = Read(SPI_GETWHEELSCROLLLINES);
            return new
            {
                size = PointerSize(),
                speed = Read(SPI_GETMOUSESPEED),
                precision = acceleration[2] != 0,
                doubleClick = (int)GetDoubleClickTime(),
                knob = rows < 0 || rows > 100 ? 0 : rows,
                invert = GetSystemMetrics(23 ) != 0,
                shadow = Read(SPI_GETCURSORSHADOW) != 0,
                trails = Read(SPI_GETMOUSETRAILS) > 1,
                sonar = Read(SPI_GETMOUSESONAR) != 0,
                hide = Read(SPI_GETMOUSEVANISH) != 0,
                buttonInitial = Read(SPI_GETSNAPTODEFBUTTON) != 0,
            };
        }

        static void Adjust(string what, object value)
        {
            const uint write = SPIF_UPDATEINIFILE | SPIF_SENDCHANGE;
            int n = Convert.ToInt32(value is bool ? ((bool)value ? 1 : 0) : value);
            switch (what)
            {
                case "size": AdjustSize(n); break;
                case "speed": SystemParametersInfo(SPI_SETMOUSESPEED, 0, new IntPtr(Math.Max(1, Math.Min(20, n))), write); break;
                case "precision": SystemParametersInfo(SPI_SETMOUSE, 0, n != 0 ? new[] { 6, 10, 1 } : new[] { 0, 0, 0 }, write); break;
                case "doubleClick": SystemParametersInfo(SPI_SETDOUBLECLICKTIME, (uint)Math.Max(200, Math.Min(900, n)), IntPtr.Zero, write); break;
                case "knob": SystemParametersInfo(SPI_SETWHEELSCROLLLINES, n <= 0 ? 0xFFFFFFFF : (uint)Math.Min(20, n), IntPtr.Zero, write); break;
                case "invert": SystemParametersInfo(SPI_SETMOUSEBUTTONSWAP, (uint)n, IntPtr.Zero, write); break;
                case "shadow": SystemParametersInfo(SPI_SETCURSORSHADOW, 0, new IntPtr(n), write); break;
                case "trails": SystemParametersInfo(SPI_SETMOUSETRAILS, n != 0 ? 7u : 0u, IntPtr.Zero, write); break;
                case "sonar": SystemParametersInfo(SPI_SETMOUSESONAR, 0, new IntPtr(n), write); break;
                case "hide": SystemParametersInfo(SPI_SETMOUSEVANISH, 0, new IntPtr(n), write); break;
                case "buttonInitial": SystemParametersInfo(SPI_SETSNAPTODEFBUTTON, (uint)n, IntPtr.Zero, write); break;
            }
        }

        static object Library()
        {
            return new
            {
                type = "mouse.library",
                themes = Themes().Select(t => new
                {
                    name = t.Name,
                    title = NameTheme(t.Name),
                    custom = t.Source == "user",
                    bramble = t.Source == "bramble",
                    showcase = Showcase.Where(i => i < t.Paths.Length).Select(i => Preview(t.Paths[i])).Where(a => a != null).ToArray(),
                }).OrderBy(t => t.bramble ? 0 : t.custom ? 2 : 1).ToArray(),
                windows = List(FolderWindows, false),
                custom = List(CustomFolder, true),
            };
        }

        public static bool Receive(string action, Dictionary<string, object> m, List<string> files)
        {
            switch (action)
            {
                case "library": Program.Send(Library()); return false;
                case "theme": ApplyTheme(Text(m, "name")); return true;
                case "assign": Assign(Text(m, "role"), Text(m, "path")); return true;
                case "initial": ApplyTheme(Themes().Select(t => t.Name).FirstOrDefault(n => n == "Windows Aero") ?? "Windows Aero"); return true;
                case "adjust": Adjust(Text(m, "what"), m["value"]); return !(m.ContainsKey("live") && Convert.ToBoolean(m["live"]));
                case "add":
                {
                    using (var dialog = new System.Windows.Forms.OpenFileDialog())
                    {
                        dialog.Title = Language.T("Add cursors");
                        dialog.Multiselect = true;
                        dialog.Filter = Language.T("Cursors") + "|*.cur;*.ani";
                        if (dialog.ShowDialog(Program.SettingsWindow) != System.Windows.Forms.DialogResult.OK) return false;
                        Add(dialog.FileNames);
                    }
                    Program.Send(Library());
                    return false;
                }
                case "drop":
                {
                    int n = Add(files);
                    if (n < files.Count) Program.Announce("Only .cur and .ani files are supported");
                    Program.Send(Library());
                    return true;
                }
                case "remove": Remove(Text(m, "path")); Program.Send(Library()); return true;
                case "folder": System.Diagnostics.Process.Start("explorer.exe", "\"" + CustomFolder + "\""); return false;
            }
            return false;
        }

        public static object State()
        {
            var current = Current();
            string theme = CurrentTheme();
            return new
            {
                theme = theme,
                themeTitle = string.IsNullOrEmpty(theme) ? Language.T("Custom") : NameTheme(theme),
                roles = Roles.Select((r, i) => new { id = r[0], name = r[1], path = current[i], preview = Preview(current[i]) }).ToArray(),
                settings = Settings(),
            };
        }

        static string Text(Dictionary<string, object> m, string key)
        {
            object v;
            return m.TryGetValue(key, out v) && v != null ? v.ToString() : null;
        }

        const uint SPI_GETMOUSE = 0x3, SPI_SETMOUSE = 0x4, SPI_SETDOUBLECLICKTIME = 0x20, SPI_SETMOUSEBUTTONSWAP = 0x21;
        const uint SPI_SETCURSORS = 0x57, SPI_SETMOUSETRAILS = 0x5D, SPI_GETMOUSETRAILS = 0x5E, SPI_GETSNAPTODEFBUTTON = 0x5F, SPI_SETSNAPTODEFBUTTON = 0x60;
        const uint SPI_GETWHEELSCROLLLINES = 0x68, SPI_SETWHEELSCROLLLINES = 0x69, SPI_GETMOUSESPEED = 0x70, SPI_SETMOUSESPEED = 0x71;
        const uint SPI_GETCURSORSHADOW = 0x101A, SPI_SETCURSORSHADOW = 0x101B, SPI_GETMOUSESONAR = 0x101C, SPI_SETMOUSESONAR = 0x101D;
        const uint SPI_GETMOUSEVANISH = 0x1020, SPI_SETMOUSEVANISH = 0x1021, SPI_SETCURSORBASESIZE = 0x2029;
        const uint SPIF_UPDATEINIFILE = 0x1, SPIF_SENDCHANGE = 0x2;
        const uint IMAGE_CURSOR = 2, LR_LOADFROMFILE = 0x10, DI_NORMAL = 0x3;

        [DllImport("user32.dll", SetLastError = true)] static extern bool SystemParametersInfo(uint action, uint u, IntPtr p, uint ini);
        [DllImport("user32.dll", SetLastError = true)] static extern bool SystemParametersInfo(uint action, uint u, ref int p, uint ini);
        [DllImport("user32.dll", SetLastError = true)] static extern bool SystemParametersInfo(uint action, uint u, int[] p, uint ini);
        [DllImport("user32.dll")] static extern uint GetDoubleClickTime();
        [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr LoadImage(IntPtr module, string name, uint type, int cx, int cy, uint options);
        [DllImport("user32.dll")] static extern bool DrawIconEx(IntPtr hdc, int x, int y, IntPtr icon, int cx, int cy, uint image, IntPtr wallpaper, uint options);
        [DllImport("user32.dll")] static extern bool DestroyCursor(IntPtr cursor);

        [StructLayout(LayoutKind.Sequential)]
        struct BITMAPINFOHEADER
        {
            public int biSize, biWidth, biHeight;
            public short biPlanes, biBitCount;
            public int biCompression, biSizeImage, biXPelsPerMeter, biYPelsPerMeter, biClrUsed, biClrImportant;
        }
        [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr dc);
        [DllImport("gdi32.dll")] static extern IntPtr CreateDIBSection(IntPtr dc, ref BITMAPINFOHEADER info, uint usage, out IntPtr bits, IntPtr section, uint offset);
        [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc, IntPtr obj);
        [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);
        [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);
        [DllImport("gdi32.dll")] static extern bool GdiFlush();
    }
}
