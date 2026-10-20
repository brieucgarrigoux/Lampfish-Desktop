using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

namespace Bramble
{
    class MoodSetting
    {
        public string Id, Name, Wallpaper, Fit, Theme, Time, LastRun, Power;
        public int Light, Speed, Blur, Saturation, Dim, Volume, Screens;
        public bool SoundsActive, Silence;
        public bool? Reactive;
        public List<ScreenWallpaper> ScreenWallpapers;
    }

    static class Moods
    {
        static Timer timer;
        static int screenCount;
        static PowerLineStatus power;
        static MoodSetting pending;
        static readonly JavaScriptSerializer json = new JavaScriptSerializer();

        static List<MoodSetting> All { get { return Program.R.Moods; } }

        public static void Start()
        {
            screenCount = Screen.AllScreens.Length;
            power = SystemInformation.PowerStatus.PowerLineStatus;
            timer = new Timer { Interval = 20000 };
            timer.Tick += (s, e) => CheckSchedule();
            timer.Start();
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
                Reactive = r.Reactive, ScreenWallpapers = Copy(r.ScreenWallpapers),
            };
        }

        static void Overwrite(MoodSetting target, MoodSetting source)
        {
            string id = target.Id, name = target.Name, time = target.Time, last = target.LastRun, powerTrigger = target.Power;
            int screens = target.Screens;
            foreach (var f in typeof(MoodSetting).GetFields()) f.SetValue(target, f.GetValue(source));
            target.Id = id; target.Name = name; target.Time = time; target.LastRun = last; target.Screens = screens; target.Power = powerTrigger;
        }

        public static bool Matches(MoodSetting m)
        {
            var r = Program.R;
            var mine = (m.ScreenWallpapers ?? new List<ScreenWallpaper>()).OrderBy(x => x.Key).Select(x => x.Key + "=" + x.Wallpaper);
            var now = r.ScreenWallpapers.OrderBy(x => x.Key).Select(x => x.Key + "=" + x.Wallpaper);
            return m.Wallpaper == r.Wallpaper && mine.SequenceEqual(now) && m.Fit == r.Fit && m.Light == r.Light && m.Speed == r.Speed
                && m.Blur == r.Blur && m.Saturation == r.Saturation && m.Dim == r.Dim
                && m.SoundsActive == r.Dock.Active && m.Silence == r.Dock.Silence && m.Volume == r.Dock.Volume
                && (!m.Reactive.HasValue || m.Reactive.Value == r.Reactive)
                && (string.IsNullOrEmpty(m.Theme) || m.Theme == Mouse.ThemeName);
        }

        static void Set(MoodSetting mood)
        {
            var r = Program.R;
            r.Wallpaper = mood.Wallpaper; r.Fit = mood.Fit; r.Light = mood.Light; r.Speed = mood.Speed;
            r.Blur = mood.Blur; r.Saturation = mood.Saturation; r.Dim = mood.Dim;
            r.ScreenWallpapers = Copy(mood.ScreenWallpapers);
            r.Dock.Active = mood.SoundsActive; r.Dock.Silence = mood.Silence; r.Dock.Volume = mood.Volume;
            if (mood.Reactive.HasValue && mood.Reactive.Value != r.Reactive) { r.Reactive = mood.Reactive.Value; AudioMeter.Set(r.Reactive); }
            if (!string.IsNullOrEmpty(mood.Theme) && mood.Theme != Mouse.ThemeName) Mouse.SetTheme(mood.Theme);
            Program.WallpaperChanged();
            Program.UpdateMenu();
        }

        static void Apply(MoodSetting mood, bool manual)
        {
            var before = Capture("");
            Set(mood);
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

        static MoodSetting Starter(string kind)
        {
            var mood = Capture(Language.T(kind == "night" ? "Night" : kind == "focus" ? "Focus" : "Cinema"));
            switch (kind)
            {
                case "night": mood.Dim = Math.Min(100, mood.Dim + 30); mood.Light = Math.Max(10, mood.Light - 20); mood.Volume = Math.Min(mood.Volume, 50); break;
                case "focus": mood.Silence = true; mood.Dim = Math.Min(100, mood.Dim + 20); mood.Speed = Math.Max(10, mood.Speed - 25); break;
                case "cinema": mood.Silence = true; mood.Dim = 70; mood.Light = Math.Max(10, mood.Light - 15); break;
                default: return null;
            }
            return mood;
        }

        static void Export(MoodSetting mood)
        {
            using (var dialog = new SaveFileDialog())
            {
                dialog.Title = Language.T("Export a mood");
                dialog.Filter = Language.T("Bramble mood") + "|*.json";
                dialog.FileName = string.Join("_", mood.Name.Split(Path.GetInvalidFileNameChars())) + ".json";
                if (dialog.ShowDialog(Program.SettingsWindow) != DialogResult.OK) return;
                var data = new Dictionary<string, object>
                {
                    { "bramble", "mood" }, { "version", 1 }, { "name", mood.Name }, { "wallpaper", mood.Wallpaper }, { "fit", mood.Fit },
                    { "light", mood.Light }, { "speed", mood.Speed }, { "blur", mood.Blur }, { "saturation", mood.Saturation }, { "dim", mood.Dim },
                    { "theme", mood.Theme }, { "soundsOn", mood.SoundsActive }, { "silent", mood.Silence }, { "volume", mood.Volume },
                    { "reactive", mood.Reactive }, { "time", mood.Time }, { "screens", mood.Screens }, { "power", mood.Power },
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
                dialog.Title = Language.T("Import a mood");
                dialog.Filter = Language.T("Bramble mood") + "|*.json";
                if (dialog.ShowDialog(Program.SettingsWindow) != DialogResult.OK) return;
                Dictionary<string, object> d = null;
                try { if (new FileInfo(dialog.FileName).Length <= 64 * 1024) d = json.Deserialize<Dictionary<string, object>>(File.ReadAllText(dialog.FileName)); }
                catch (Exception ex) { Program.Log(ex); }
                if (d == null || Word(d, "bramble", 10) != "mood") { Program.Announce("This file is not a Bramble mood"); Program.SendState(); return; }

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
                    ScreenWallpapers = new List<ScreenWallpaper>(),
                };
                if (pending.Name.Length == 0) pending.Name = string.Format(Language.T("Mood {0}"), All.Count + 1);
                bool hasWallpaper = pending.Wallpaper.Length > 0 && (File.Exists(Path.Combine(Program.WallpapersFolder, pending.Wallpaper)) || Directory.Exists(Path.Combine(Program.WallpapersFolder, pending.Wallpaper)));
                if (!hasWallpaper) pending.Wallpaper = Program.R.Wallpaper;
                bool hasTheme = pending.Theme.Length == 0 || Mouse.HasTheme(pending.Theme);
                if (!hasTheme) pending.Theme = "";
                Program.Send(new { type = "moods.preview", mood = Describe(pending), missingWallpaper = !hasWallpaper && Word(d, "wallpaper", 200).Length > 0, missingTheme = !hasTheme });
            }
        }

        static object Describe(MoodSetting m)
        {
            return new
            {
                id = m.Id, name = m.Name, wallpaper = m.Wallpaper, dim = m.Dim, light = m.Light, theme = m.Theme,
                sounds = !m.SoundsActive ? "off" : m.Silence ? "silent" : "on", volume = m.Volume, time = m.Time, screens = m.Screens, power = m.Power ?? "",
                current = Matches(m),
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
                    if (name.Length == 0) name = string.Format(Language.T("Mood {0}"), All.Count + 1);
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
            return All.Select(Describe).ToArray();
        }
    }
}
