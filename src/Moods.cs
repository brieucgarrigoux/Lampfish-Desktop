using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows.Forms;

namespace Bramble
{
    class MoodSetting
    {
        public string Id, Name, Wallpaper, Fit, Theme, Time, LastRun;
        public int Light, Speed, Blur, Saturation, Dim, Volume;
        public bool SoundsActive, Silence;
    }

    static class Moods
    {
        static Timer timer;

        static List<MoodSetting> All { get { return Program.R.Moods; } }

        public static void Start()
        {
            timer = new Timer { Interval = 20000 };
            timer.Tick += (s, e) => CheckSchedule();
            timer.Start();
        }

        static string Text(Dictionary<string, object> m, string key)
        {
            object v;
            return m.TryGetValue(key, out v) && v != null ? v.ToString() : "";
        }

        static MoodSetting Capture(string name)
        {
            var r = Program.R;
            return new MoodSetting
            {
                Id = Guid.NewGuid().ToString("N").Substring(0, 8), Name = name, Wallpaper = r.Wallpaper, Fit = r.Fit, Theme = Mouse.ThemeName,
                Light = r.Light, Speed = r.Speed, Blur = r.Blur, Saturation = r.Saturation, Dim = r.Dim,
                SoundsActive = r.Dock.Active, Silence = r.Dock.Silence, Volume = r.Dock.Volume, Time = "",
            };
        }

        static void Overwrite(MoodSetting target, MoodSetting source)
        {
            string id = target.Id, name = target.Name, time = target.Time, last = target.LastRun;
            foreach (var f in typeof(MoodSetting).GetFields()) f.SetValue(target, f.GetValue(source));
            target.Id = id; target.Name = name; target.Time = time; target.LastRun = last;
        }

        static void Apply(MoodSetting mood)
        {
            var r = Program.R;
            r.Wallpaper = mood.Wallpaper; r.Fit = mood.Fit; r.Light = mood.Light; r.Speed = mood.Speed;
            r.Blur = mood.Blur; r.Saturation = mood.Saturation; r.Dim = mood.Dim;
            r.Dock.Active = mood.SoundsActive; r.Dock.Silence = mood.Silence; r.Dock.Volume = mood.Volume;
            if (!string.IsNullOrEmpty(mood.Theme) && mood.Theme != Mouse.ThemeName) Mouse.SetTheme(mood.Theme);
            r.CurrentMood = mood.Id;
            Program.WallpaperChanged();
            Program.UpdateMenu();
            Program.Announce("{0} applied", mood.Name);
        }

        static void CheckSchedule()
        {
            string now = DateTime.Now.ToString("HH:mm"), today = DateTime.Now.ToString("yyyy-MM-dd");
            var due = All.FirstOrDefault(m => m.Time == now && m.LastRun != today);
            if (due == null) return;
            due.LastRun = today;
            Apply(due);
            Program.Save();
            Program.SendState();
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
                case "apply": if (mood == null) return false; Apply(mood); return true;
                case "update":
                    if (mood == null) return false;
                    Overwrite(mood, Capture(mood.Name));
                    Program.R.CurrentMood = mood.Id;
                    Program.Announce("{0} updated", mood.Name);
                    return true;
                case "remove":
                    if (mood == null) return false;
                    All.Remove(mood);
                    if (Program.R.CurrentMood == id) Program.R.CurrentMood = null;
                    return true;
                case "rename":
                {
                    string name = Text(m, "name").Trim();
                    if (mood == null || name.Length == 0) return false;
                    mood.Name = name.Length > 40 ? name.Substring(0, 40) : name;
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
            }
            return false;
        }

        public static object State()
        {
            return All.Select(m => new
            {
                id = m.Id, name = m.Name, wallpaper = m.Wallpaper, dim = m.Dim, light = m.Light, theme = m.Theme,
                sounds = !m.SoundsActive ? "off" : m.Silence ? "silent" : "on", volume = m.Volume, time = m.Time,
                current = m.Id == Program.R.CurrentMood,
            }).ToArray();
        }
    }
}
