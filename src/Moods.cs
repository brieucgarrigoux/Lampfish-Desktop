using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

namespace Bramble
{
    class MoodSetting
    {
        public string Id, Name, Wallpaper, Fit, Theme, Time, LastRun, Power, App, Icon;
        public int Light, Speed, Blur, Saturation, Dim, Volume, Screens;
        public bool SoundsActive, Silence, Headset;
        public List<string> Opens;
        public bool? Reactive;
        public int? Warm;
        public bool? Dark;
        public List<ScreenWallpaper> ScreenWallpapers;
    }

    static class Moods
    {
        static Timer timer;
        static int screenCount;
        static PowerLineStatus power;
        static MoodSetting pending, revertFor, revertState;
        static string revertKind, revertMood;
        static readonly Dictionary<string, bool> appsRunning = new Dictionary<string, bool>();
        static readonly Dictionary<string, string> appIcons = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        static bool? headphones;
        static bool primed;
        static readonly JavaScriptSerializer json = new JavaScriptSerializer();

        static List<MoodSetting> All { get { return Program.R.Moods; } }

        static readonly string[] Icons = { "spark", "moon", "sun", "target", "film", "game", "music", "book", "coffee", "leaf", "bolt", "heart", "code" };

        static string IconOrNone(string icon) { return Icons.Contains(icon) ? icon : null; }

        public static void Start()
        {
            foreach (var m in All.Where(x => x.Icon == null))
                foreach (var kind in new[] { "night", "focus", "cinema" })
                {
                    string english = kind == "night" ? "Night" : kind == "focus" ? "Focus" : "Cinema";
                    if (string.Equals(m.Name, english, StringComparison.OrdinalIgnoreCase) || string.Equals(m.Name, Language.T(english), StringComparison.OrdinalIgnoreCase))
                        m.Icon = kind == "night" ? "moon" : kind == "focus" ? "target" : "film";
                }
            screenCount = Screen.AllScreens.Length;
            power = SystemInformation.PowerStatus.PowerLineStatus;
            timer = new Timer { Interval = 20000 };
            timer.Tick += (s, e) => CheckSchedule();
            timer.Start();
            var watch = new Timer { Interval = 3000 };
            watch.Tick += (s, e) => Watch();
            watch.Start();
            SystemEvents.PowerModeChanged += (s, e) => { if (e.Mode == PowerModes.StatusChange) Program.OnInterface(PowerChanged); };
        }

        static string Text(Dictionary<string, object> m, string key)
        {
            object v;
            return m.TryGetValue(key, out v) && v != null ? v.ToString() : "";
        }

        static List<ScreenWallpaper> Copy(List<ScreenWallpaper> list)
        {
            return list == null ? new List<ScreenWallpaper>() : list.Select(x => new ScreenWallpaper { Key = x.Key, Wallpaper = x.Wallpaper }).ToList();
        }

        static MoodSetting Capture(string name)
        {
            var r = Program.R;
            return new MoodSetting
            {
                Id = Guid.NewGuid().ToString("N").Substring(0, 8), Name = name, Wallpaper = r.Wallpaper, Fit = r.Fit, Theme = Mouse.ThemeName,
                Light = r.Light, Speed = r.Speed, Blur = r.Blur, Saturation = r.Saturation, Dim = r.Dim,
                SoundsActive = r.Dock.Active, Silence = r.Dock.Silence, Volume = r.Dock.Volume, Time = "", Power = "",
                Reactive = r.Reactive, Warm = Display.WarmStrength, Dark = Display.Dark(), ScreenWallpapers = Copy(r.ScreenWallpapers),
            };
        }

        static void Overwrite(MoodSetting target, MoodSetting source)
        {
            string id = target.Id, name = target.Name, time = target.Time, last = target.LastRun, powerTrigger = target.Power, app = target.App, icon = target.Icon;
            int screens = target.Screens;
            bool headset = target.Headset;
            var opens = target.Opens;
            foreach (var f in typeof(MoodSetting).GetFields()) f.SetValue(target, f.GetValue(source));
            target.Id = id; target.Name = name; target.Time = time; target.LastRun = last; target.Screens = screens; target.Power = powerTrigger;
            target.App = app; target.Headset = headset; target.Opens = opens; target.Icon = icon;
        }

        public static bool Matches(MoodSetting m)
        {
            var r = Program.R;
            var mine = (m.ScreenWallpapers ?? new List<ScreenWallpaper>()).OrderBy(x => x.Key).Select(x => x.Key + "=" + x.Wallpaper);
            var now = r.ScreenWallpapers.OrderBy(x => x.Key).Select(x => x.Key + "=" + x.Wallpaper);
            return m.Wallpaper == r.Wallpaper && mine.SequenceEqual(now) && m.Fit == r.Fit && m.Light == r.Light && m.Speed == r.Speed
                && m.Blur == r.Blur && m.Saturation == r.Saturation && m.Dim == r.Dim
                && (m.SoundsActive && !m.Silence) == (r.Dock.Active && !r.Dock.Silence) && m.Volume == r.Dock.Volume
                && (!m.Reactive.HasValue || m.Reactive.Value == r.Reactive)
                && (!m.Warm.HasValue || m.Warm.Value == Display.WarmStrength)
                && (!m.Dark.HasValue || m.Dark == Display.Dark())
                && (string.IsNullOrEmpty(m.Theme) || m.Theme == Mouse.ThemeName);
        }

        public static MoodSetting Active()
        {
            var chosen = All.FirstOrDefault(x => x.Id == Program.R.CurrentMood);
            return chosen != null && Matches(chosen) ? chosen : All.FirstOrDefault(Matches);
        }

        static void Set(MoodSetting mood)
        {
            var r = Program.R;
            r.Wallpaper = mood.Wallpaper; r.Fit = mood.Fit; r.Light = mood.Light; r.Speed = mood.Speed;
            r.Blur = mood.Blur; r.Saturation = mood.Saturation; r.Dim = mood.Dim;
            r.ScreenWallpapers = Copy(mood.ScreenWallpapers);
            r.Dock.Active = mood.SoundsActive; r.Dock.Silence = mood.Silence; r.Dock.Volume = mood.Volume;
            if (mood.Reactive.HasValue && mood.Reactive.Value != r.Reactive) { r.Reactive = mood.Reactive.Value; AudioMeter.Set(r.Reactive); }
            if (mood.Warm.HasValue && mood.Warm.Value != Display.WarmStrength) Display.SetWarm(mood.Warm.Value);
            if (mood.Dark.HasValue && mood.Dark != Display.Dark()) Display.SetDark(mood.Dark.Value);
            if (!string.IsNullOrEmpty(mood.Theme) && mood.Theme != Mouse.ThemeName) Mouse.SetTheme(mood.Theme);
            Program.WallpaperChanged();
            Program.UpdateMenu();
        }

        static void Open(MoodSetting mood)
        {
            if (mood.Opens == null) return;
            foreach (string path in mood.Opens)
                try
                {
                    if (!File.Exists(path)) continue;
                    if (path.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) && Running(path)) continue;
                    Process.Start(new ProcessStartInfo(path) { UseShellExecute = true, WorkingDirectory = Path.GetDirectoryName(path) });
                }
                catch (Exception ex) { Program.Log(ex); }
        }

        static bool Running(string path)
        {
            var list = Process.GetProcessesByName(Path.GetFileNameWithoutExtension(path));
            foreach (var p in list) p.Dispose();
            return list.Length > 0;
        }

        static void Watch()
        {
            foreach (var m in All.Where(x => !string.IsNullOrEmpty(x.App)).ToList())
            {
                bool now = Running(m.App), was;
                bool known = appsRunning.TryGetValue(m.Id, out was);
                appsRunning[m.Id] = now;
                if (!known || !primed) continue;
                if (now && !was && !Matches(m)) Begin(m, "app:" + m.Id);
                else if (!now && was) End("app:" + m.Id);
            }
            if (All.Any(x => x.Headset))
            {
                bool now = AudioMeter.Headphones();
                if (headphones.HasValue && now != headphones.Value && primed)
                {
                    if (now) { var m = All.FirstOrDefault(x => x.Headset && !Matches(x)); if (m != null) Begin(m, "headset"); }
                    else End("headset");
                }
                headphones = now;
            }
            else headphones = null;
            primed = true;
        }

        static void Begin(MoodSetting mood, string kind)
        {
            var before = Capture("");
            revertMood = Program.R.CurrentMood;
            Automatic(mood);
            revertFor = mood;
            revertState = before;
            revertKind = kind;
        }

        static void End(string kind)
        {
            if (revertKind != kind || revertFor == null) return;
            var mood = revertFor;
            var back = revertState;
            revertFor = null; revertState = null; revertKind = null;
            if (!Matches(mood)) return;
            Set(back);
            Program.R.CurrentMood = revertMood;
            Program.Announce("{0} ended, previous setup back", mood.Name);
            Program.Save();
            Program.SendState();
        }

        static void Apply(MoodSetting mood, bool manual)
        {
            var before = Capture("");
            if (manual && Active() == null) Program.R.MoodBefore = before;
            Set(mood);
            Open(mood);
            Program.R.CurrentMood = mood.Id;
            if (manual) Program.Undoable(Language.T("{0} applied", mood.Name), () => { Set(before); Program.Save(); });
            else Program.Announce("{0} applied", mood.Name);
        }

        public static void ApplyById(string id)
        {
            var mood = All.FirstOrDefault(m => m.Id == id);
            if (mood == null) return;
            Apply(mood, true);
            Program.Save();
            Program.SendState();
        }

        static void Automatic(MoodSetting due)
        {
            if (due == null) return;
            Apply(due, false);
            Program.Save();
            Program.SendState();
        }

        static void CheckSchedule()
        {
            string now = DateTime.Now.ToString("HH:mm"), today = DateTime.Now.ToString("yyyy-MM-dd");
            var due = All.FirstOrDefault(m => m.Time == now && m.LastRun != today);
            if (due == null) return;
            due.LastRun = today;
            Automatic(due);
        }

        public static void ScreensChanged()
        {
            int count = Screen.AllScreens.Length;
            if (count == screenCount) return;
            screenCount = count;
            Automatic(All.FirstOrDefault(m => m.Screens == count && !Matches(m)));
        }

        static void PowerChanged()
        {
            var now = SystemInformation.PowerStatus.PowerLineStatus;
            if (now == power || now == PowerLineStatus.Unknown) return;
            power = now;
            string kind = now == PowerLineStatus.Online ? "mains" : "battery";
            Automatic(All.FirstOrDefault(m => m.Power == kind && !Matches(m)));
        }

        static readonly string[] Starters = { "night", "focus", "cinema" };

        static bool Tune(MoodSetting mood, string kind)
        {
            switch (kind)
            {
                case "night": mood.Dim = Math.Min(100, mood.Dim + 30); mood.Light = Math.Max(10, mood.Light - 20); mood.Volume = Math.Min(mood.Volume, 50); mood.Warm = 50; return true;
                case "focus": mood.Silence = true; mood.Dim = Math.Min(100, mood.Dim + 20); mood.Speed = Math.Max(10, mood.Speed - 25); return true;
                case "cinema": mood.Silence = true; mood.Dim = 70; mood.Light = Math.Max(10, mood.Light - 15); return true;
            }
            return false;
        }

        static MoodSetting Starter(string kind)
        {
            if (!Starters.Contains(kind)) return null;
            var mood = Capture(Language.T(kind == "night" ? "Night" : kind == "focus" ? "Focus" : "Cinema"));
            Tune(mood, kind);
            mood.Icon = kind == "night" ? "moon" : kind == "focus" ? "target" : "film";
            return mood;
        }

        public static object Models()
        {
            var r = Program.R;
            return Starters.Select(kind =>
            {
                var m = new MoodSetting { Wallpaper = r.Wallpaper, Fit = r.Fit, Light = r.Light, Speed = r.Speed, Blur = r.Blur, Saturation = r.Saturation, Dim = r.Dim, Volume = r.Dock.Volume, Warm = Display.WarmStrength };
                Tune(m, kind);
                return new { kind, wallpaper = m.Wallpaper, fit = m.Fit, light = m.Light, speed = m.Speed, blur = m.Blur, saturation = m.Saturation, dim = m.Dim, warm = m.Warm };
            }).ToArray();
        }

        static string IconOf(string path)
        {
            if (string.IsNullOrEmpty(path)) return null;
            string icon;
            if (!appIcons.TryGetValue(path, out icon))
            {
                icon = File.Exists(path) || Directory.Exists(path) ? Tasks.IconOf(path) : null;
                appIcons[path] = icon;
            }
            return icon;
        }

        static void Export(MoodSetting mood)
        {
            using (var dialog = new SaveFileDialog())
            {
                dialog.Title = Language.T("Export a theme");
                dialog.Filter = Language.T("Bramble theme") + "|*.json";
                dialog.FileName = string.Join("_", mood.Name.Split(Path.GetInvalidFileNameChars())) + ".json";
                if (dialog.ShowDialog(Program.SettingsWindow) != DialogResult.OK) return;
                var data = new Dictionary<string, object>
                {
                    { "bramble", "mood" }, { "version", 1 }, { "name", mood.Name }, { "wallpaper", mood.Wallpaper }, { "fit", mood.Fit },
                    { "light", mood.Light }, { "speed", mood.Speed }, { "blur", mood.Blur }, { "saturation", mood.Saturation }, { "dim", mood.Dim },
                    { "theme", mood.Theme }, { "soundsOn", mood.SoundsActive }, { "silent", mood.Silence }, { "volume", mood.Volume },
                    { "reactive", mood.Reactive }, { "time", mood.Time }, { "screens", mood.Screens }, { "power", mood.Power }, { "headphones", mood.Headset },
                    { "icon", mood.Icon }, { "warm", mood.Warm },
                };
                File.WriteAllText(dialog.FileName, json.Serialize(data));
                Program.Announce("{0} exported", mood.Name);
            }
        }

        static int Number(Dictionary<string, object> d, string key, int min, int max, int fallback)
        {
            object v;
            if (!d.TryGetValue(key, out v) || v == null) return fallback;
            try { return Math.Max(min, Math.Min(max, Convert.ToInt32(v))); } catch { return fallback; }
        }

        static string Word(Dictionary<string, object> d, string key, int length)
        {
            object v;
            string s = d.TryGetValue(key, out v) && v is string ? ((string)v).Trim() : "";
            return s.Length > length ? s.Substring(0, length) : s;
        }

        static void Import()
        {
            using (var dialog = new OpenFileDialog())
            {
                dialog.Title = Language.T("Import a theme");
                dialog.Filter = Language.T("Bramble theme") + "|*.json";
                if (dialog.ShowDialog(Program.SettingsWindow) != DialogResult.OK) return;
                Dictionary<string, object> d = null;
                try { if (new FileInfo(dialog.FileName).Length <= 64 * 1024) d = json.Deserialize<Dictionary<string, object>>(File.ReadAllText(dialog.FileName)); }
                catch (Exception ex) { Program.Log(ex); }
                if (d == null || Word(d, "bramble", 10) != "mood") { Program.Announce("This file is not a Bramble theme"); Program.SendState(); return; }

                string wallpaper = Word(d, "wallpaper", 200), time = Word(d, "time", 5), powerTrigger = Word(d, "power", 10), fit = Word(d, "fit", 4);
                if (wallpaper != Path.GetFileName(wallpaper) || wallpaper.Contains("..")) wallpaper = "";
                DateTime parsed;
                object reactive;
                pending = new MoodSetting
                {
                    Id = Guid.NewGuid().ToString("N").Substring(0, 8), Name = Word(d, "name", 40), Wallpaper = wallpaper, Fit = fit == "fit" ? "fit" : "fill",
                    Light = Number(d, "light", 0, 100, 50), Speed = Number(d, "speed", 0, 100, 50), Blur = Number(d, "blur", 0, 100, 0),
                    Saturation = Number(d, "saturation", 0, 100, 50), Dim = Number(d, "dim", 0, 100, 0), Theme = Word(d, "theme", 120),
                    SoundsActive = d.ContainsKey("soundsOn") && d["soundsOn"] is bool && (bool)d["soundsOn"],
                    Silence = d.ContainsKey("silent") && d["silent"] is bool && (bool)d["silent"], Volume = Number(d, "volume", 0, 100, 80),
                    Reactive = d.TryGetValue("reactive", out reactive) && reactive is bool ? (bool?)reactive : null,
                    Time = DateTime.TryParseExact(time, "HH:mm", null, System.Globalization.DateTimeStyles.None, out parsed) ? time : "",
                    Screens = Number(d, "screens", 0, 8, 0), Power = powerTrigger == "mains" || powerTrigger == "battery" ? powerTrigger : "",
                    Headset = d.ContainsKey("headphones") && d["headphones"] is bool && (bool)d["headphones"],
                    Icon = IconOrNone(Word(d, "icon", 20)), Warm = d.ContainsKey("warm") && d["warm"] != null ? (int?)Number(d, "warm", 0, 100, 0) : null,
                    ScreenWallpapers = new List<ScreenWallpaper>(),
                };
                if (pending.Name.Length == 0) pending.Name = string.Format(Language.T("Theme {0}"), All.Count + 1);
                bool hasWallpaper = pending.Wallpaper.Length > 0 && (File.Exists(Path.Combine(Program.WallpapersFolder, pending.Wallpaper)) || Directory.Exists(Path.Combine(Program.WallpapersFolder, pending.Wallpaper)));
                if (!hasWallpaper) pending.Wallpaper = Program.R.Wallpaper;
                bool hasTheme = pending.Theme.Length == 0 || Mouse.HasTheme(pending.Theme);
                if (!hasTheme) pending.Theme = "";
                Program.Send(new { type = "moods.preview", mood = Describe(pending), missingWallpaper = !hasWallpaper && Word(d, "wallpaper", 200).Length > 0, missingTheme = !hasTheme });
            }
        }

        static object Describe(MoodSetting m) { return Describe(m, null, Mouse.Looks(new[] { m.Theme })); }

        static object Describe(MoodSetting m, MoodSetting active, Dictionary<string, object> looks)
        {
            object look;
            looks.TryGetValue(m.Theme ?? "", out look);
            return new
            {
                id = m.Id, name = m.Name, icon = m.Icon, warm = m.Warm, wallpaper = m.Wallpaper, fit = m.Fit, dim = m.Dim, light = m.Light, speed = m.Speed, blur = m.Blur, saturation = m.Saturation,
                screenWallpapers = m.ScreenWallpapers == null ? 0 : m.ScreenWallpapers.Count, reactive = m.Reactive,
                theme = m.Theme, look,
                sounds = m.SoundsActive && !m.Silence ? "on" : "off", volume = m.Volume, time = m.Time, screens = m.Screens, power = m.Power ?? "",
                app = string.IsNullOrEmpty(m.App) ? null : Path.GetFileNameWithoutExtension(m.App), appIcon = IconOf(m.App), headset = m.Headset,
                opens = (m.Opens ?? new List<string>()).Select(o => new { name = Path.GetFileNameWithoutExtension(o), icon = IconOf(o) }).ToArray(),
                current = m == active,
            };
        }

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            string id = Text(m, "id");
            var mood = All.FirstOrDefault(x => x.Id == id);
            switch (action)
            {
                case "save":
                {
                    string name = Text(m, "name").Trim();
                    if (name.Length == 0) name = string.Format(Language.T("Theme {0}"), All.Count + 1);
                    var fresh = Capture(name.Length > 40 ? name.Substring(0, 40) : name);
                    All.Add(fresh);
                    Program.R.CurrentMood = fresh.Id;
                    return true;
                }
                case "starter":
                {
                    var fresh = Starter(Text(m, "kind"));
                    if (fresh == null) return false;
                    All.Add(fresh);
                    return true;
                }
                case "apply": if (mood == null) return false; Apply(mood, true); return true;
                case "release":
                {
                    var back = Program.R.MoodBefore;
                    if (back == null) { Program.Announce("The setup from before this theme is not known: apply another theme"); return false; }
                    var now = Capture("");
                    string current = Program.R.CurrentMood;
                    Set(back);
                    Program.R.CurrentMood = null;
                    Program.R.MoodBefore = null;
                    Program.Undoable(Language.T("{0} turned off", mood != null ? mood.Name : ""), () => { Set(now); Program.R.CurrentMood = current; Program.R.MoodBefore = back; Program.Save(); });
                    return true;
                }
                case "update":
                    if (mood == null) return false;
                    Overwrite(mood, Capture(mood.Name));
                    Program.R.CurrentMood = mood.Id;
                    Program.Announce("{0} updated", mood.Name);
                    return true;
                case "remove":
                {
                    if (mood == null) return false;
                    int index = All.IndexOf(mood);
                    All.Remove(mood);
                    if (Program.R.CurrentMood == id) Program.R.CurrentMood = null;
                    Program.UndoableRemoval(mood.Name, () => All.Insert(Math.Min(index, All.Count), mood));
                    return true;
                }
                case "rename":
                {
                    string name = Text(m, "name").Trim();
                    if (mood == null || name.Length == 0) return false;
                    mood.Name = name.Length > 40 ? name.Substring(0, 40) : name;
                    return true;
                }
                case "screens":
                {
                    if (mood == null) return false;
                    int n;
                    mood.Screens = int.TryParse(Text(m, "value"), out n) ? Math.Max(0, Math.Min(8, n)) : 0;
                    return true;
                }
                case "power":
                {
                    if (mood == null) return false;
                    string value = Text(m, "value");
                    mood.Power = value == "mains" || value == "battery" ? value : "";
                    return true;
                }
                case "time":
                {
                    if (mood == null) return false;
                    string value = Text(m, "value");
                    DateTime parsed;
                    mood.Time = DateTime.TryParseExact(value, "HH:mm", null, System.Globalization.DateTimeStyles.None, out parsed) ? value : "";
                    mood.LastRun = null;
                    return true;
                }
                case "app":
                {
                    if (mood == null) return false;
                    using (var dialog = new OpenFileDialog())
                    {
                        dialog.Title = Language.T("Choose the app that starts this theme");
                        dialog.Filter = Language.T("Programs") + "|*.exe";
                        if (dialog.ShowDialog(Program.SettingsWindow) != DialogResult.OK) return false;
                        mood.App = dialog.FileName;
                        appsRunning.Remove(mood.Id);
                    }
                    return true;
                }
                case "appClear": if (mood == null) return false; mood.App = null; appsRunning.Remove(mood.Id); return true;
                case "headset": if (mood == null) return false; mood.Headset = Text(m, "value") == "True" || Text(m, "value") == "true"; return true;
                case "icon": if (mood == null) return false; mood.Icon = IconOrNone(Text(m, "value")); return true;
                case "openAdd":
                {
                    if (mood == null) return false;
                    using (var dialog = new OpenFileDialog())
                    {
                        dialog.Title = Language.T("Apps or files to open with this theme");
                        dialog.Filter = Language.T("Programs and shortcuts") + "|*.exe;*.lnk|" + Language.T("All files") + "|*.*";
                        dialog.Multiselect = true;
                        if (dialog.ShowDialog(Program.SettingsWindow) != DialogResult.OK) return false;
                        if (mood.Opens == null) mood.Opens = new List<string>();
                        foreach (string f in dialog.FileNames)
                            if (mood.Opens.Count < 8 && !mood.Opens.Contains(f, StringComparer.OrdinalIgnoreCase)) mood.Opens.Add(f);
                    }
                    return true;
                }
                case "openRemove":
                {
                    int i;
                    if (mood == null || mood.Opens == null || !int.TryParse(Text(m, "index"), out i) || i < 0 || i >= mood.Opens.Count) return false;
                    mood.Opens.RemoveAt(i);
                    return true;
                }
                case "export": if (mood != null) Export(mood); Program.SendState(); return false;
                case "import": Import(); return false;
                case "add":
                    if (pending == null) return false;
                    All.Add(pending);
                    Program.Announce("{0} added", pending.Name);
                    pending = null;
                    return true;
                case "cancel": pending = null; return false;
            }
            return false;
        }

        public static object State()
        {
            var active = Active();
            var looks = Mouse.Looks(All.Select(m => m.Theme));
            return All.Select(m => Describe(m, active, looks)).ToArray();
        }
    }
}
