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

namespace Lampfish
{
    static class Mouse
    {
        static readonly string CustomFolder = Path.Combine(Program.Root, "cursors");
        static readonly string Cache = Path.Combine(Program.Root, "app", "cursor-cache");
        static readonly string FolderThemes = Path.Combine(Program.Root, "app", "cursor-themes");
        // Themes drawn by the page (cursor-engine.js) and written here the first time they are applied.
        static readonly string Made = Path.Combine(Program.Root, "app", "cursor-made");
        static readonly string FolderWindows = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "Cursors");
        const string Key = @"Control Panel\Cursors";
        const string SchemesKey = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Control Panel\Cursors\Schemes";
        const string LegacyScheme = Migration.OldCursorScheme;
        const string Flagship = "Bramble Glass";

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
            // A first state that already held a cursor of lampfish is not the state of Windows: only its cursors are dropped,
            // the speed, wheel and clicks it kept are still the user's own.
            var original = Program.R.CursorsOriginal;
            if (original != null && original.Roles != null && original.Roles.Values.Any(Ours)) original.Roles = null;
            try { Migrate(); } catch (Exception ex) { Program.Log(ex); }
            try { Migration.CursorThemes(); } catch (Exception ex) { Program.Log(ex); }
            try
            {
                // 16 px was offered by older versions, below the 32 px where Windows starts.
                using (var key = Registry.CurrentUser.OpenSubKey(Key))
                    if (key != null && key.GetValue("CursorBaseSize") is int && (int)key.GetValue("CursorBaseSize") < 32) { SetSize(1); Reload(); }
                // Older versions left every theme of lampfish ever tried in the mouse panel of Windows.
                ShowInWindows(CurrentTheme());
            }
            catch (Exception ex) { Program.Log(ex); }
            var later = new System.Windows.Forms.Timer { Interval = 30000 };
            later.Tick += (s, e) => { later.Dispose(); var moods = Program.R.Moods.Concat(new[] { Program.R.MoodBefore }).Where(x => x != null).Select(x => x.Theme).ToList(); System.Threading.ThreadPool.QueueUserWorkItem(_ => Purge(moods)); };
            later.Start();
        }

        // Previews are keyed by file and date, so every rewrite left old ones behind (12.8 MB seen); made themes pile up
        // too (85 MB). Kept: what any cursor still on this PC needs, and every made theme in use, in a scheme or a theme of
        // lampfish, or touched in the last 30 days. The engine makes a theme again in seconds if it is ever wanted.
        static void Purge(List<string> moods)
        {
            try
            {
                var themes = LoadThemes();
                var files = themes.SelectMany(t => t.Paths)
                    .Concat(Directory.Exists(FolderWindows) ? Directory.GetFiles(FolderWindows) : new string[0])
                    .Concat(Directory.Exists(CustomFolder) ? Directory.GetFiles(CustomFolder) : new string[0])
                    .Where(f => !string.IsNullOrEmpty(f) && File.Exists(f)).Distinct(StringComparer.OrdinalIgnoreCase);
                var keys = new HashSet<string>(files.Select(KeyOf));
                var pattern = new System.Text.RegularExpressions.Regex(@"^(.*-[0-9a-f]{8})(-32\.png|-64\.png|\.retro|-s\d+\.png)$");
                if (Directory.Exists(Cache))
                    foreach (string f in Directory.GetFiles(Cache))
                    {
                        var match = pattern.Match(Path.GetFileName(f));
                        if (match.Success && !keys.Contains(match.Groups[1].Value)) try { File.Delete(f); } catch { }
                    }

                if (!Directory.Exists(Made)) return;
                var used = new HashSet<string>(moods.Where(x => !string.IsNullOrEmpty(x)), StringComparer.OrdinalIgnoreCase) { CurrentTheme() ?? "" };
                var pointed = themes.Where(t => t.Source != "lampfish").SelectMany(t => t.Paths).Concat(Current()).Concat((Program.R.CursorsOriginal != null && Program.R.CursorsOriginal.Roles != null) ? (IEnumerable<string>)Program.R.CursorsOriginal.Roles.Values : new string[0])
                    .Where(p => !string.IsNullOrEmpty(p)).Select(p => Environment.ExpandEnvironmentVariables(p)).ToList();
                foreach (string folder in Directory.GetDirectories(Made))
                {
                    string name = Path.GetFileName(folder);
                    if (used.Contains(name) || pointed.Any(p => p.StartsWith(folder + "\\", StringComparison.OrdinalIgnoreCase))) continue;
                    if ((DateTime.UtcNow - Directory.GetLastWriteTimeUtc(folder)).TotalDays < 30) continue;
                    try { Directory.Delete(folder, true); } catch { }
                }
            }
            catch (Exception ex) { Program.Log(ex); }
        }

        // Older versions saved every hand-picked cursor into a scheme of their own, which read like a built-in theme.
        static void Migrate()
        {
            using (var schemes = Registry.CurrentUser.OpenSubKey(Key + @"\Schemes", true))
            {
                object value = schemes == null ? null : schemes.GetValue(LegacyScheme, null, RegistryValueOptions.DoNotExpandEnvironmentNames);
                if (value == null) return;
                schemes.DeleteValue(LegacyScheme, false);
                string name = NextName();
                schemes.SetValue(name, value, RegistryValueKind.ExpandString);
                using (var key = Registry.CurrentUser.CreateSubKey(Key))
                    if ((key.GetValue("") as string) == LegacyScheme) key.SetValue("", name);
            }
        }

        static HashSet<string> Names(string except = null)
        {
            var names = new HashSet<string>(Themes().Select(t => t.Name), StringComparer.OrdinalIgnoreCase) { LegacyScheme };
            if (except != null) names.Remove(except);
            return names;
        }

        static string NextName()
        {
            var names = Names();
            for (int i = 1; ; i++)
            {
                string name = Language.T("My theme {0}", i);
                if (!names.Contains(name)) return name;
            }
        }

        static string FreeName(string wanted, string except = null)
        {
            wanted = (wanted ?? "").Trim();
            if (wanted.Length > 40) wanted = wanted.Substring(0, 40).Trim();
            if (wanted.Length == 0) return NextName();
            var names = Names(except);
            string name = wanted;
            for (int i = 2; names.Contains(name); i++) name = wanted + " (" + i + ")";
            return name;
        }

        static Theme Find(string name) { return string.IsNullOrEmpty(name) ? null : Themes().FirstOrDefault(t => t.Name == name); }

        static bool Differs(Theme t, string[] current)
        {
            for (int i = 0; i < Roles.Length; i++)
                if (!string.Equals(i < t.Paths.Length ? t.Paths[i] : "", current[i] ?? "", StringComparison.OrdinalIgnoreCase)) return true;
            return false;
        }

        static void WriteScheme(string name, string row)
        {
            using (var schemes = Registry.CurrentUser.CreateSubKey(Key + @"\Schemes")) schemes.SetValue(name, row, RegistryValueKind.ExpandString);
            Changed();
        }

        static string ReadScheme(string name)
        {
            using (var schemes = Registry.CurrentUser.OpenSubKey(Key + @"\Schemes"))
                return schemes == null ? null : schemes.GetValue(name, null, RegistryValueOptions.DoNotExpandEnvironmentNames) as string;
        }

        static void DeleteScheme(string name)
        {
            using (var schemes = Registry.CurrentUser.OpenSubKey(Key + @"\Schemes", true)) if (schemes != null) schemes.DeleteValue(name, false);
            Changed();
        }

        static void Name(string name)
        {
            using (var key = Registry.CurrentUser.CreateSubKey(Key))
            {
                key.SetValue("", name);
                key.SetValue("Scheme Source", 1, RegistryValueKind.DWord);
            }
        }

        // The registry values as written (%SystemRoot% kept), so a scheme stays valid on another PC or drive letter.
        static string[] RawRow()
        {
            var s = Capture();
            return Roles.Select(r => { string v; return s.Roles.TryGetValue(r[0], out v) && v != null ? v : ""; }).ToArray();
        }

        // A theme made by the engine is rewritten whenever the engine changes: a theme of the user that uses its files
        // gets its own copy, or it would point at files that no longer exist.
        static string[] Keep(string name, string[] paths)
        {
            string safe = new string(name.Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '_' : c).ToArray()).Trim();
            string folder = Path.Combine(CustomFolder, "themes", safe.Length == 0 ? "theme" : safe);
            return paths.Select(p =>
            {
                string full = Environment.ExpandEnvironmentVariables(p ?? "");
                if (!full.StartsWith(Made + "\\", StringComparison.OrdinalIgnoreCase) || !File.Exists(full)) return p ?? "";
                Directory.CreateDirectory(folder);
                string target = Path.Combine(folder, Path.GetFileName(full));
                File.Copy(full, target, true);
                return target;
            }).ToArray();
        }

        // Saves what is on screen under a name; the pointer then uses the kept copies, so the theme does not read as modified.
        static void SaveAs(string name)
        {
            var raw = RawRow();
            var kept = Keep(name, raw);
            WriteScheme(name, string.Join(",", kept));
            if (!kept.SequenceEqual(raw))
                using (var key = Registry.CurrentUser.CreateSubKey(Key))
                    for (int i = 0; i < Roles.Length; i++) key.SetValue(Roles[i][0], kept[i], RegistryValueKind.ExpandString);
            Name(name);
            Reload();
        }

        class Theme { public string Name, Source, Version; public string[] Paths; public bool Made; }

        public class Snapshot
        {
            public Dictionary<string, string> Roles = new Dictionary<string, string>();
            public string Scheme;
            public int Source;
            public int Size = 32;
            public Dictionary<string, int> Pointer;
        }

        // Each state sent to the page asked for the list several times: 17 file checks per theme, two registry reads.
        // It is kept for a few seconds, and dropped by every change lampfish makes; Windows' own panel is seen within 3 s.
        static List<Theme> themes;
        static DateTime themesAt;

        static List<Theme> Themes()
        {
            if (themes == null || (DateTime.UtcNow - themesAt).TotalSeconds > 3) { themes = LoadThemes(); themesAt = DateTime.UtcNow; }
            return themes;
        }

        static void Changed() { themes = null; }

        static List<Theme> LoadThemes()
        {
            var list = new List<Theme>();

            foreach (string root in new[] { FolderThemes, Made })
                if (Directory.Exists(root))
                    foreach (string folder in Directory.GetDirectories(root).Where(d => !d.EndsWith(".new") && !d.EndsWith(".old")).OrderBy(d => Path.GetFileName(d) != Flagship).ThenBy(d => d))
                    {
                        var paths = Roles.Select(r =>
                        {
                            string ani = Path.Combine(folder, r[0] + ".ani");
                            return File.Exists(ani) ? ani : Path.Combine(folder, r[0] + ".cur");
                        }).ToArray();
                        if (!paths.All(File.Exists) || list.Any(t => t.Name == Path.GetFileName(folder))) continue;
                        string version = Path.Combine(folder, "engine.txt");
                        list.Add(new Theme { Name = Path.GetFileName(folder), Source = "lampfish", Paths = paths, Made = root == Made, Version = File.Exists(version) ? File.ReadAllText(version).Trim() : null });
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
                    if (paths.Length >= 13 && paths.Take(Roles.Length).Any(p => p.Length > 0 && File.Exists(p))) list.Add(new Theme { Name = name, Source = source, Paths = paths });
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
            Remember();
            using (var key = Registry.CurrentUser.CreateSubKey(Key))
            {
                for (int i = 0; i < Roles.Length; i++)
                    key.SetValue(Roles[i][0], i < theme.Paths.Length ? theme.Paths[i] : "", RegistryValueKind.ExpandString);
                key.SetValue("", name);
                key.SetValue("Scheme Source", theme.Source == "system" ? 2 : 1, RegistryValueKind.DWord);
            }

            ShowInWindows(name);
            Reload();
            Trail.CursorChanged();
        }

        // The mouse panel of Windows shows the theme of lampfish in use, and only that one: each theme tried used to stay there.
        static void ShowInWindows(string name)
        {
            var own = Themes().Where(t => t.Source == "lampfish").ToList();
            var ownNames = new HashSet<string>(own.Select(t => t.Name), StringComparer.OrdinalIgnoreCase);
            var theme = own.FirstOrDefault(t => t.Name == name);
            using (var schemas = Registry.CurrentUser.CreateSubKey(Key + @"\Schemes"))
            {
                foreach (string other in schemas.GetValueNames())
                    if (ownNames.Contains(other) && other != name) schemas.DeleteValue(other, false);
                if (theme != null) schemas.SetValue(name, string.Join(",", theme.Paths), RegistryValueKind.ExpandString);
            }
            Changed();
        }

        static bool Assign(string role, string file)
        {
            if (!Roles.Any(r => r[0] == role) || !File.Exists(file)) return false;
            Remember();
            using (var key = Registry.CurrentUser.CreateSubKey(Key)) key.SetValue(role, file, RegistryValueKind.ExpandString);
            Reload();
            return true;
        }

        // A theme chosen in the page: it heads the recent ones and brings its trail back (R86).
        static void Chosen(string name)
        {
            var recent = Program.R.MouseRecent ?? new List<string>();
            recent.Remove(name);
            recent.Insert(0, name);
            Program.R.MouseRecent = recent.Take(8).ToList();
            Trail.FollowCursor();
        }

        // Trying the colours of a family one after the other is one change: Undo goes back to before the first click.
        static Snapshot undoBefore;
        static DateTime undoUntil;

        static Snapshot UndoPoint() { return DateTime.UtcNow < undoUntil && undoBefore != null ? undoBefore : Capture(); }

        static void OfferUndo(string text, Snapshot before)
        {
            undoBefore = before;
            undoUntil = DateTime.UtcNow.AddSeconds(8);
            Program.Undoable(text, () => { undoBefore = null; undoUntil = DateTime.MinValue; Restore(before); Trail.CursorChanged(); });
        }

        static string[] aero;
        static string[] Aero()
        {
            if (aero != null) return aero;
            using (var key = Registry.LocalMachine.OpenSubKey(SchemesKey))
            {
                string v = key == null ? null : key.GetValue("Windows Aero") as string;
                if (v != null) aero = v.Split(',').Select(c => Environment.ExpandEnvironmentVariables(c.Trim())).ToArray();
            }
            return aero;
        }

        static Snapshot Capture()
        {
            var s = new Snapshot();
            using (var key = Registry.CurrentUser.OpenSubKey(Key))
            {
                foreach (var r in Roles) s.Roles[r[0]] = key == null ? "" : (key.GetValue(r[0], "", RegistryValueOptions.DoNotExpandEnvironmentNames) as string) ?? "";
                s.Scheme = key == null ? null : key.GetValue("") as string;
                object source = key == null ? null : key.GetValue("Scheme Source"), size = key == null ? null : key.GetValue("CursorBaseSize");
                s.Source = source is int ? (int)source : 0;
                s.Size = size is int ? (int)size : 32;
            }
            return s;
        }

        static readonly string[] PointerKeys = { "speed", "precision", "doubleClick", "knob", "invert", "shadow", "trails", "sonar", "hide", "buttonInitial" };

        static Dictionary<string, int> PointerNow()
        {
            var acceleration = new int[3];
            SystemParametersInfo(SPI_GETMOUSE, 0, acceleration, 0);
            int rows = Read(SPI_GETWHEELSCROLLLINES);
            return new Dictionary<string, int>
            {
                { "speed", Read(SPI_GETMOUSESPEED) }, { "precision", acceleration[2] != 0 ? 1 : 0 }, { "doubleClick", (int)GetDoubleClickTime() },
                { "knob", rows < 0 || rows > 100 ? -1 : rows }, { "invert", GetSystemMetrics(23) != 0 ? 1 : 0 }, { "shadow", Read(SPI_GETCURSORSHADOW) != 0 ? 1 : 0 },
                { "trails", Read(SPI_GETMOUSETRAILS) > 1 ? Read(SPI_GETMOUSETRAILS) : 0 }, { "sonar", Read(SPI_GETMOUSESONAR) != 0 ? 1 : 0 }, { "hide", Read(SPI_GETMOUSEVANISH) != 0 ? 1 : 0 },
                { "buttonInitial", Read(SPI_GETSNAPTODEFBUTTON) != 0 ? 1 : 0 },
            };
        }

        static Snapshot Full()
        {
            var s = Capture();
            s.Pointer = PointerNow();
            return s;
        }

        static void Restore(Snapshot s)
        {
            if (s.Roles != null)
            {
                using (var key = Registry.CurrentUser.CreateSubKey(Key))
                {
                    foreach (var r in Roles)
                    {
                        string v;
                        key.SetValue(r[0], s.Roles.TryGetValue(r[0], out v) && v != null ? Still(v) : "", RegistryValueKind.ExpandString);
                    }
                    if (s.Scheme != null) key.SetValue("", s.Scheme); else key.DeleteValue("", false);
                    key.SetValue("Scheme Source", s.Source, RegistryValueKind.DWord);
                }
                ShowInWindows(s.Scheme);
                SetSize(Math.Max(1, Math.Min(15, (s.Size - 32) / 16 + 1)));
            }
            if (s.Pointer != null)
                foreach (var p in s.Pointer)
                    if (PointerKeys.Contains(p.Key)) Adjust(p.Key, p.Value);
            Reload();
        }

        // A theme made by the engine first comes as still .cur files, then as .ani: a saved state may name the one that is gone.
        static string Still(string path)
        {
            string full = Environment.ExpandEnvironmentVariables(path ?? "");
            if (full.Length == 0 || File.Exists(full) || !full.StartsWith(Made + "\\", StringComparison.OrdinalIgnoreCase)) return path;
            string other = Path.ChangeExtension(full, full.EndsWith(".ani", StringComparison.OrdinalIgnoreCase) ? ".cur" : ".ani");
            return File.Exists(other) ? other : path;
        }

        static bool Same(Snapshot a, Snapshot b)
        {
            if (a == null || b == null) return false;
            if (a.Roles != null && b.Roles != null)
            {
                if (a.Size != b.Size) return false;
                foreach (var r in Roles)
                {
                    string x, y;
                    a.Roles.TryGetValue(r[0], out x);
                    b.Roles.TryGetValue(r[0], out y);
                    if (!string.Equals(Environment.ExpandEnvironmentVariables(x ?? ""), Environment.ExpandEnvironmentVariables(y ?? ""), StringComparison.OrdinalIgnoreCase)) return false;
                }
            }
            if (a.Pointer != null && b.Pointer != null)
                foreach (var p in a.Pointer)
                {
                    int v;
                    if (b.Pointer.TryGetValue(p.Key, out v) && v != p.Value) return false;
                }
            return true;
        }

        static bool Ours(string path)
        {
            path = Environment.ExpandEnvironmentVariables(path ?? "");
            return new[] { FolderThemes, Made, CustomFolder }.Any(root => path.StartsWith(root + "\\", StringComparison.OrdinalIgnoreCase));
        }

        public static void Uninstall()
        {
            var now = Capture();
            if (now.Roles.Values.Any(Ours))
            {
                var original = Program.R.CursorsOriginal;
                bool usable = original != null && original.Roles != null && !original.Roles.Values.Any(Ours);
                string[] fallback = Aero() ?? new string[0];
                using (var key = Registry.CurrentUser.CreateSubKey(Key))
                {
                    for (int i = 0; i < Roles.Length; i++)
                    {
                        string kept;
                        string v = !usable ? (i < fallback.Length ? fallback[i] : "") : original.Roles.TryGetValue(Roles[i][0], out kept) && kept != null ? kept : "";
                        key.SetValue(Roles[i][0], v, RegistryValueKind.ExpandString);
                    }
                    string scheme = usable ? original.Scheme : fallback.Length > 0 ? "Windows Aero" : null;
                    if (scheme != null) key.SetValue("", scheme); else key.DeleteValue("", false);
                    key.SetValue("Scheme Source", usable ? original.Source : 2, RegistryValueKind.DWord);
                }
                Reload();
            }
            using (var schemes = Registry.CurrentUser.OpenSubKey(Key + @"\Schemes", true))
                if (schemes != null)
                    foreach (string name in schemes.GetValueNames())
                    {
                        string row = schemes.GetValue(name, null, RegistryValueOptions.DoNotExpandEnvironmentNames) as string;
                        if (row != null && row.Split(',').Any(Ours)) schemes.DeleteValue(name, false);
                    }
            // The 16 px of older versions is below what Windows offers: give back its smallest size.
            using (var key = Registry.CurrentUser.OpenSubKey(Key))
                if (key != null && key.GetValue("CursorBaseSize") is int && (int)key.GetValue("CursorBaseSize") < 32) { SetSize(1); Reload(); }
        }

        static void Remember()
        {
            if (Program.R.CursorsOriginal != null) return;
            var now = Full();
            if (now.Roles.Values.Any(Ours)) now.Roles = null;
            Program.R.CursorsOriginal = now;
            Program.Save();
        }

        public static void Reload()
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

        // A theme of lampfish keeps the cursors by name. Cursors changed one by one and not saved would be lost:
        // they are saved first as a theme of the user named after it.
        public static string ThemeForMood(string mood)
        {
            string name = CurrentTheme();
            var chosen = Find(name);
            if (chosen != null && !Differs(chosen, Current())) return name;
            if (chosen == null && Program.R.CursorsOriginal == null) return name;
            string saved = FreeName(Language.T("{0} cursors", mood));
            SaveAs(saved);
            return saved;
        }

        public static bool HasTheme(string name) { return Themes().Any(t => t.Name == name); }

        public static Dictionary<string, object> Looks(IEnumerable<string> names)
        {
            var wanted = new HashSet<string>(names.Where(n => !string.IsNullOrEmpty(n)));
            var looks = new Dictionary<string, object>();
            if (wanted.Count > 0)
                foreach (var t in Themes().Where(t => wanted.Contains(t.Name)))
                    looks[t.Name] = new { title = NameTheme(t.Name), arrow = Preview(t.Paths[0]) };
            return looks;
        }

        public static void SetTheme(string name) { ApplyTheme(name); }

        static string CurrentTheme()
        {
            using (var key = Registry.CurrentUser.OpenSubKey(Key)) return key == null ? null : key.GetValue("") as string;
        }

        // The library asks for about 500 previews each time it is sent: the answer is kept per file and date, in memory.
        static readonly Dictionary<string, KeyValuePair<long, object>> previews = new Dictionary<string, KeyValuePair<long, object>>(StringComparer.OrdinalIgnoreCase);

        public static object PreviewOf(string file) { return Preview(file); }
        public static bool IsCursor(string file) { return Readable(file); }
        public static string[] RoleNames { get { return Roles.Select(r => r[1]).ToArray(); } }
        public static string[] RoleIds { get { return Roles.Select(r => r[0]).ToArray(); } }

        // A pack made into a theme in the Workshop: its files copied into the user's own folder, then a scheme like any theme.
        public static string AddPack(string wanted, string[] files)
        {
            string name = FreeName(wanted);
            string safe = new string(name.Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '_' : c).ToArray()).Trim();
            string folder = Path.Combine(CustomFolder, "packs", safe.Length == 0 ? "pack" : safe);
            Directory.CreateDirectory(folder);
            var row = new string[Roles.Length];
            for (int i = 0; i < Roles.Length; i++)
            {
                if (i >= files.Length || string.IsNullOrEmpty(files[i]) || !File.Exists(files[i])) { row[i] = ""; continue; }
                string target = Path.Combine(folder, Roles[i][0] + Path.GetExtension(files[i]).ToLowerInvariant());
                File.Copy(files[i], target, true);
                row[i] = target;
            }
            WriteScheme(name, string.Join(",", row));
            Program.Send(Library());
            return name;
        }

        static object Preview(string file)
        {
            if (string.IsNullOrEmpty(file)) return null;
            var info = new FileInfo(file);
            if (!info.Exists) return null;
            long date = info.LastWriteTimeUtc.Ticks;
            KeyValuePair<long, object> known;
            lock (previews) if (previews.TryGetValue(file, out known) && known.Key == date) return known.Value;
            object made = MakePreview(file);
            if (made != null) lock (previews) previews[file] = new KeyValuePair<long, object>(date, made);
            return made;
        }

        static object MakePreview(string file)
        {
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

        static void Frames(string file)
        {
            if (string.IsNullOrEmpty(file) || !File.Exists(file) || !file.EndsWith(".ani", StringComparison.OrdinalIgnoreCase)) return;
            try
            {
                byte[] data = File.ReadAllBytes(file);
                int steps = 0, jiffies = 6;
                uint[] rates = null;
                // A damaged or hostile file must not loop forever: every chunk must move forward and fit in the file.
                for (int p = 12, guard = 0; p + 8 <= data.Length && guard < 10000; guard++)
                {
                    string id = Encoding.ASCII.GetString(data, p, 4);
                    int length = BitConverter.ToInt32(data, p + 4);
                    if (length < 0 || (long)p + 8 + length > data.Length) break;
                    if (id == "anih" && length < 36) break;
                    if (id == "anih") { steps = BitConverter.ToInt32(data, p + 16); jiffies = BitConverter.ToInt32(data, p + 36); }
                    else if (id == "rate" && steps > 0 && steps <= 4096 && length >= steps * 4)
                    {
                        rates = new uint[steps];
                        for (int i = 0; i < steps; i++) rates[i] = BitConverter.ToUInt32(data, p + 8 + i * 4);
                    }
                    if (id == "LIST") p += 12; else p += 8 + length + (length & 1);
                }
                steps = Math.Min(steps, 40);
                if (steps < 2) return;
                string key = KeyOf(file);
                var delays = new int[steps];
                IntPtr cursor = IntPtr.Zero;
                try
                {
                    for (int i = 0; i < steps; i++)
                    {
                        string png = Path.Combine(Cache, key + "-s" + i + ".png");
                        if (!File.Exists(png))
                        {
                            if (cursor == IntPtr.Zero) cursor = LoadImage(IntPtr.Zero, file, IMAGE_CURSOR, 64, 64, LR_LOADFROMFILE);
                            if (cursor == IntPtr.Zero) return;
                            using (var b = Render(cursor, 64, (uint)i)) b.Save(png, ImageFormat.Png);
                        }
                        delays[i] = (int)((rates != null ? rates[i] : (uint)jiffies) * 1000 / 60);
                    }
                }
                finally { if (cursor != IntPtr.Zero) DestroyCursor(cursor); }
                Program.Send(new { type = "mouse.frames", path = file, key = key, delays = delays });
            }
            catch (Exception ex) { Program.Log(ex); }
        }

        static readonly SHA1 sha = SHA1.Create();

        static string KeyOf(string file)
        {
            byte[] h;
            lock (sha) h = sha.ComputeHash(Encoding.UTF8.GetBytes("v2|" + file.ToLowerInvariant() + "|" + File.GetLastWriteTimeUtc(file).Ticks));
            return Path.GetFileNameWithoutExtension(file).ToLowerInvariant().Replace(' ', '-') + "-" + BitConverter.ToString(h, 0, 4).Replace("-", "").ToLowerInvariant();
        }

        static Bitmap Render(string file, int size, uint step = 0)
        {
            IntPtr cursor = LoadImage(IntPtr.Zero, file, IMAGE_CURSOR, size, size, LR_LOADFROMFILE);
            if (cursor == IntPtr.Zero) return null;
            try { return Render(cursor, size, step); }
            finally { DestroyCursor(cursor); }
        }

        static Bitmap Render(IntPtr cursor, int size, uint step)
        {
            {
                {
                    int[] n = Paint(cursor, size, 0, step), w = Paint(cursor, size, 0xFFFFFF, step), output = new int[n.Length];
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
        }

        static int[] Pixels(Bitmap b)
        {
            var data = b.LockBits(new Rectangle(0, 0, b.Width, b.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            var pixels = new int[b.Width * b.Height];
            Marshal.Copy(data.Scan0, pixels, 0, pixels.Length);
            b.UnlockBits(data);
            return pixels;
        }

        static int[] Paint(IntPtr cursor, int size, int wallpaper, uint step = 0)
        {
            var info = new BITMAPINFOHEADER { biSize = 40, biWidth = size, biHeight = -size, biPlanes = 1, biBitCount = 32 };
            IntPtr dc = CreateCompatibleDC(IntPtr.Zero), bits;
            IntPtr image = CreateDIBSection(dc, ref info, 0, out bits, IntPtr.Zero, 0);
            IntPtr before = SelectObject(dc, image);
            try
            {
                var pixels = Enumerable.Repeat(wallpaper, size * size).ToArray();
                Marshal.Copy(pixels, 0, bits, pixels.Length);
                DrawIconEx(dc, 0, 0, cursor, size, size, step, IntPtr.Zero, DI_NORMAL);
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

        // Windows itself must be able to read the file, and a cursor is never several megabytes.
        static bool Readable(string file)
        {
            try
            {
                if (new FileInfo(file).Length > 4 * 1024 * 1024) return false;
                IntPtr cursor = LoadImage(IntPtr.Zero, file, IMAGE_CURSOR, 32, 32, LR_LOADFROMFILE);
                if (cursor == IntPtr.Zero) return false;
                DestroyCursor(cursor);
                return true;
            }
            catch { return false; }
        }

        static int Add(IEnumerable<string> files)
        {
            int n = 0;
            foreach (string f in files.Where(f => Formats.Contains(Path.GetExtension(f).ToLowerInvariant())))
                try
                {
                    if (!Readable(f)) continue;
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
                return Math.Max(1, Math.Min(15, (base_ - 32) / 16 + 1));
            }
        }

        static void AdjustSize(int n)
        {
            Remember();
            SetSize(n);
            Reload();
        }

        static void SetSize(int n)
        {
            // Windows starts at 32 px: the 16 px step of older versions wrote two keys that disagreed.
            n = Math.Max(1, Math.Min(15, n));
            int pixels = 32 + (n - 1) * 16;
            using (var key = Registry.CurrentUser.CreateSubKey(Key)) key.SetValue("CursorBaseSize", pixels, RegistryValueKind.DWord);
            using (var key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Accessibility")) key.SetValue("CursorSize", Math.Max(1, n), RegistryValueKind.DWord);

            SystemParametersInfo(SPI_SETCURSORBASESIZE, 0, new IntPtr(pixels), SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);
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
                knob = rows < 0 || rows > 100 ? -1 : rows,
                invert = GetSystemMetrics(23 ) != 0,
                shadow = Read(SPI_GETCURSORSHADOW) != 0,
                trails = Read(SPI_GETMOUSETRAILS) > 1,
                sonar = Read(SPI_GETMOUSESONAR) != 0,
                hide = Read(SPI_GETMOUSEVANISH) != 0,
                buttonInitial = Read(SPI_GETSNAPTODEFBUTTON) != 0,
            };
        }

        // While a slider moves, the value is applied without rewriting the profile or telling every window; the release does both.
        // Values come back whole from "Back to original": a wheel at 30 lines, one screen at a time, a trail of 4, 1500 ms.
        static void Adjust(string what, object value, bool live = false)
        {
            uint write = live ? 0 : SPIF_UPDATEINIFILE | SPIF_SENDCHANGE;
            int n = Convert.ToInt32(value is bool ? ((bool)value ? 1 : 0) : value);
            switch (what)
            {
                case "size": AdjustSize(n); break;
                case "speed": SystemParametersInfo(SPI_SETMOUSESPEED, 0, new IntPtr(Math.Max(1, Math.Min(20, n))), write); break;
                case "precision": SystemParametersInfo(SPI_SETMOUSE, 0, n != 0 ? new[] { 6, 10, 1 } : new[] { 0, 0, 0 }, write); break;
                case "doubleClick": SystemParametersInfo(SPI_SETDOUBLECLICKTIME, (uint)Math.Max(100, Math.Min(5000, n)), IntPtr.Zero, write); break;
                // 0 and below mean one screen at a time: older saves wrote 0 for it, and a wheel that never scrolls helps nobody.
                case "knob": SystemParametersInfo(SPI_SETWHEELSCROLLLINES, n <= 0 ? 0xFFFFFFFF : (uint)Math.Min(100, n), IntPtr.Zero, write); break;
                case "invert": SystemParametersInfo(SPI_SETMOUSEBUTTONSWAP, (uint)n, IntPtr.Zero, write); break;
                case "shadow": SystemParametersInfo(SPI_SETCURSORSHADOW, 0, new IntPtr(n), write); break;
                // The switch sends true or false; a saved state sends the length (an older save sent 1 for on).
                case "trails": SystemParametersInfo(SPI_SETMOUSETRAILS, value is bool ? (n != 0 ? 7u : 0u) : n == 0 ? 0u : n == 1 ? 7u : (uint)Math.Min(16, n), IntPtr.Zero, write); break;
                case "sonar": SystemParametersInfo(SPI_SETMOUSESONAR, 0, new IntPtr(n), write); break;
                case "hide": SystemParametersInfo(SPI_SETMOUSEVANISH, 0, new IntPtr(n), write); break;
                case "buttonInitial": SystemParametersInfo(SPI_SETSNAPTODEFBUTTON, (uint)n, IntPtr.Zero, write); break;
            }
        }

        static object Library()
        {
            var all = Themes();
            return new
            {
                type = "mouse.library",
                themes = all.Select(t => new
                {
                    name = t.Name,
                    title = NameTheme(t.Name),
                    custom = t.Source == "user",
                    lampfish = t.Source == "lampfish",
                    made = t.Made,
                    version = t.Version,
                    kind = t.Source == "lampfish" ? "lampfish" : t.Source == "user" ? "mine" : "system",
                    showcase = Showcase.Where(i => i < t.Paths.Length).Select(i => Preview(t.Paths[i])).Where(a => a != null).ToArray(),
                }).OrderBy(t => t.lampfish ? 0 : t.custom ? 2 : 1).ToArray(),
                windows = List(FolderWindows, false),
                // The cursors of Windows by role, read from Windows' own schemes: each file goes to the role it was made for,
                // named after its scheme (Windows, large, Black...). 189 files become a handful per role (M2.3).
                windowsRoles = Roles.Select((r, i) => all.Where(t => t.Source == "system" && i < t.Paths.Length && t.Paths[i].Length > 0 && File.Exists(t.Paths[i]))
                    .GroupBy(t => t.Paths[i], StringComparer.OrdinalIgnoreCase).Select(g => new { path = g.Key, name = NameTheme(g.First().Name), preview = Preview(g.Key) })
                    .Where(x => x.preview != null).ToArray()).ToArray(),
                custom = List(CustomFolder, true),
                lampfishCursors = all.Where(t => t.Source == "lampfish" && !t.Made).Select(t => new
                {
                    name = t.Name,
                    title = NameTheme(t.Name),
                    cursors = t.Paths.Take(Roles.Length).Select((path, i) => new { path, role = Roles[i][1], animated = path.EndsWith(".ani", StringComparison.OrdinalIgnoreCase), preview = File.Exists(path) ? Preview(path) : null })
                        .Where(x => x.preview != null).ToArray(),
                }).ToArray(),
            };
        }

        public static bool Receive(string action, Dictionary<string, object> m, List<string> files)
        {
            switch (action)
            {
                case "library": Program.Send(Library()); return false;
                case "frames": Frames(Text(m, "path")); return false;
                case "theme":
                {
                    string name = Text(m, "name");
                    if (Find(name) == null) return false;
                    var before = UndoPoint();
                    ApplyTheme(name);
                    Chosen(name);
                    OfferUndo(Language.T("Cursors: {0}", NameTheme(name)), before);
                    return true;
                }
                case "make": return Make(m);
                case "favorite":
                {
                    string name = Text(m, "name");
                    if (string.IsNullOrEmpty(name)) return false;
                    var list = Program.R.MouseFavorites ?? new List<string>();
                    list.Remove(name);
                    if (m.ContainsKey("on") && Convert.ToBoolean(m["on"])) list.Insert(0, name);
                    Program.R.MouseFavorites = list.Take(64).ToList();
                    Program.Save();
                    return true;
                }
                // One cursor of a theme of lampfish for one role, by name: the page does not know where the files are.
                case "assignTheme":
                {
                    var theme = Find(Text(m, "theme"));
                    int i = Array.FindIndex(Roles, r => r[0] == Text(m, "role"));
                    if (theme == null || i < 0 || i >= theme.Paths.Length) return false;
                    var before = UndoPoint();
                    if (!Assign(Roles[i][0], theme.Paths[i])) return false;
                    OfferUndo(Language.T("Cursor changed"), before);
                    return true;
                }
                case "assign":
                {
                    var before = UndoPoint();
                    if (!Assign(Text(m, "role"), Text(m, "path"))) return false;
                    OfferUndo(Language.T("Cursor changed"), before);
                    return true;
                }
                case "initial":
                {
                    var before = Capture();
                    ApplyTheme("Windows Aero");
                    SetSize(1);
                    Reload();
                    Program.Undoable(Language.T("Cursors back to the Windows default"), () => Restore(before));
                    return true;
                }
                case "original":
                {
                    if (Program.R.CursorsOriginal == null) return false;
                    var before = Full();
                    Restore(Program.R.CursorsOriginal);
                    Program.Undoable(Language.T("Mouse back to how it was before lampfish"), () => Restore(before));
                    return true;
                }
                case "adjust":
                {
                    bool live = m.ContainsKey("live") && Convert.ToBoolean(m["live"]);
                    Remember();
                    Adjust(Text(m, "what"), m["value"], live);
                    return !live;
                }
                case "add":
                {
                    using (var dialog = new System.Windows.Forms.OpenFileDialog())
                    {
                        dialog.Title = Language.T("Add cursors");
                        dialog.Multiselect = true;
                        dialog.Filter = Language.T("Cursors") + "|*.cur;*.ani";
                        if (dialog.ShowDialog(Program.SettingsWindow) != System.Windows.Forms.DialogResult.OK) return false;
                        if (Add(dialog.FileNames) < dialog.FileNames.Length) Program.Announce("Some files could not be read as cursors");
                    }
                    Program.Send(Library());
                    return false;
                }
                case "drop":
                {
                    int n = Add(files);
                    if (n < files.Count) Program.Announce(files.All(f => Formats.Contains(Path.GetExtension(f).ToLowerInvariant())) ? "Some files could not be read as cursors" : "Only .cur and .ani files are supported");
                    Program.Send(Library());
                    return true;
                }
                case "remove": Remove(Text(m, "path")); Program.Send(Library()); return true;
                case "save":
                {
                    string name = FreeName(Text(m, "name"));
                    SaveAs(name);
                    Program.Announce("“{0}” saved", name);
                    Program.Send(Library());
                    return true;
                }
                case "update":
                {
                    var theme = Find(CurrentTheme());
                    if (theme == null || theme.Source != "user") return false;
                    string before = ReadScheme(theme.Name), name = theme.Name;
                    SaveAs(name);
                    Program.Undoable(Language.T("“{0}” updated", name), () => { if (before != null) WriteScheme(name, before); Program.Send(Library()); });
                    Program.Send(Library());
                    return true;
                }
                case "discard":
                {
                    var theme = Find(CurrentTheme());
                    if (theme == null) return false;
                    var before = Capture();
                    ApplyTheme(theme.Name);
                    Program.Undoable(Language.T("Changes discarded"), () => Restore(before));
                    return true;
                }
                case "rename":
                {
                    string from = Text(m, "name");
                    var theme = Find(from);
                    string row = theme == null || theme.Source != "user" ? null : ReadScheme(from);
                    if (row == null || string.IsNullOrWhiteSpace(Text(m, "to"))) return false;
                    string to = FreeName(Text(m, "to"), from);
                    if (to == from) return false;
                    WriteScheme(to, row);
                    DeleteScheme(from);
                    if (CurrentTheme() == from) Name(to);
                    Program.Send(Library());
                    return true;
                }
                case "duplicate":
                {
                    var theme = Find(Text(m, "name"));
                    if (theme == null) return false;
                    string name = FreeName(Language.T("{0} copy", NameTheme(theme.Name)));
                    WriteScheme(name, string.Join(",", Keep(name, theme.Paths)));
                    Program.Announce("“{0}” added", name);
                    Program.Send(Library());
                    return true;
                }
                case "removeTheme":
                {
                    string name = Text(m, "name");
                    var theme = Find(name);
                    string row = theme == null || theme.Source != "user" ? null : ReadScheme(name);
                    if (row == null) return false;
                    bool current = CurrentTheme() == name;
                    DeleteScheme(name);
                    if (current) using (var key = Registry.CurrentUser.CreateSubKey(Key)) key.SetValue("", "");
                    Program.UndoableRemoval(name, () =>
                    {
                        WriteScheme(name, row);
                        if (current) Name(name);
                        Program.Send(Library());
                    }, () =>
                    {
                        // Its own copy of engine files goes with it, unless another theme or the pointer still uses it.
                        string kept = Path.Combine(CustomFolder, "themes");
                        var folders = row.Split(',').Select(p => Path.GetDirectoryName(Environment.ExpandEnvironmentVariables(p.Trim())) ?? "")
                            .Where(d => d.StartsWith(kept + "\\", StringComparison.OrdinalIgnoreCase)).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
                        var stillUsed = Themes().SelectMany(t => t.Paths).Concat(Current()).Where(p => p != null).ToList();
                        foreach (string d in folders)
                            if (!stillUsed.Any(p => p.StartsWith(d + "\\", StringComparison.OrdinalIgnoreCase)) && Directory.Exists(d)) Directory.Delete(d, true);
                    });
                    Program.Send(Library());
                    return true;
                }
                case "folder": System.Diagnostics.Process.Start("explorer.exe", "\"" + CustomFolder + "\""); return false;
            }
            return false;
        }

        static readonly System.Text.RegularExpressions.Regex MadeName = new System.Text.RegularExpressions.Regex(@"^lampfish [\p{L}\p{N}][\p{L}\p{N} '-]{0,60}$");

        // Writes the files the page drew for a theme, in a fresh folder that replaces the old one in one move, then applies it if asked.
        static bool Make(Dictionary<string, object> m)
        {
            string name = Text(m, "name");
            object raw;
            var files = m.TryGetValue("files", out raw) ? raw as Dictionary<string, object> : null;
            if (files == null || name == null || !MadeName.IsMatch(name)) return false;
            if (Vip.IsVipTheme(name) && !Vip.Unlocked) return false;
            object apply;
            bool asked = m.TryGetValue("apply", out apply) && Convert.ToBoolean(apply);
            var before = asked ? UndoPoint() : null;
            var allowed = new HashSet<string>(Roles.SelectMany(r => Formats.Select(f => r[0] + f)), StringComparer.OrdinalIgnoreCase);
            if (files.Count != Roles.Length || files.Keys.Any(k => !allowed.Contains(k))) return false;
            Directory.CreateDirectory(Made);
            string folder = Path.Combine(Made, name), fresh = folder + ".new", old = folder + ".old";
            if (Directory.Exists(fresh)) Directory.Delete(fresh, true);
            Directory.CreateDirectory(fresh);
            foreach (var f in files) File.WriteAllBytes(Path.Combine(fresh, f.Key), Convert.FromBase64String(f.Value as string ?? ""));
            File.WriteAllText(Path.Combine(fresh, "engine.txt"), Text(m, "version") ?? "");
            if (Directory.Exists(old)) Directory.Delete(old, true);
            // An antivirus may still hold a file just written: retry, and never leave the registry pointing at no folder.
            bool moved = false;
            for (int i = 0; i < 5 && !moved; i++)
            {
                try
                {
                    if (Directory.Exists(folder)) Directory.Move(folder, old);
                    Directory.Move(fresh, folder);
                    moved = true;
                    Changed();
                }
                catch (IOException ex)
                {
                    if (!Directory.Exists(folder) && Directory.Exists(old)) try { Directory.Move(old, folder); } catch (Exception back) { Program.Log(back); }
                    if (i == 4) { Program.Log(ex); return false; }
                    System.Threading.Thread.Sleep(150);
                }
            }
            try { if (Directory.Exists(old)) Directory.Delete(old, true); } catch (Exception ex) { Program.Log(ex); }
            // The theme in use is applied again even if the page did not ask: a still .cur may have become an .ani.
            if (asked || CurrentTheme() == name) ApplyTheme(name);
            if (asked) { Chosen(name); OfferUndo(Language.T("Cursors: {0}", NameTheme(name)), before); }
            Program.Send(Library());
            return true;
        }

        public static object State()
        {
            var current = Current();
            string theme = CurrentTheme();
            var now = Full();
            var aero = Aero();
            Func<Snapshot, bool> standard = x => aero != null && x.Size <= 32 && Roles.Select((r, i) => i).All(i =>
            {
                string v;
                x.Roles.TryGetValue(Roles[i][0], out v);
                return string.IsNullOrEmpty(v) || string.Equals(Environment.ExpandEnvironmentVariables(v), i < aero.Length ? aero[i] : "", StringComparison.OrdinalIgnoreCase);
            });
            var original = Program.R.CursorsOriginal;
            var chosen = Find(theme);
            return new
            {
                theme = theme,
                based = chosen != null,
                editable = chosen != null && chosen.Source == "user",
                unsaved = chosen != null ? Differs(chosen, current) : !standard(now),
                standard = standard(now),
                original = original != null && !Same(original, now),
                themeTitle = chosen == null ? Language.T("Custom") : NameTheme(theme),
                roles = Roles.Select((r, i) => new { id = r[0], name = r[1], path = current[i], preview = Preview(current[i]) }).ToArray(),
                settings = Settings(),
                favorites = Program.R.MouseFavorites ?? new List<string>(),
                recent = Program.R.MouseRecent ?? new List<string>(),
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
