using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using Microsoft.Win32;

namespace Bramble
{
    class DockSettings
    {
        public bool Active = true;
        public bool Silence = false;
        public int Volume = 100;
        public string SoundA = "Crystal/Connect.wav";
        public string SoundB = "Crystal/Disconnect.wav";
        public string Device = "";
        public string DeviceName;
        public List<EventSetting> Events;
    }

    class EventSetting
    {
        public string Id;
        public bool Active;
        public string Sound;
    }

    static class Sounds
    {
        static readonly string[][] Events =
        {
            new[] { "startup", "Startup", "When you sign in", "Chime" },
            new[] { "shutdown", "Shutdown", "When shutting down or signing out", "Chime" },
            new[] { "wake", "Wake", "Back from sleep", "Glass" },
            new[] { "sleep", "Sleep", "Just before sleep", "Glass" },
            new[] { "unlock", "Unlock", "Back to your session", "Mechanical" },
            new[] { "lock", "Lock", "Win + L, or automatic lock", "Mechanical" },
            new[] { "station_on", "Dock connected", "The dock chosen in the panel", null },
            new[] { "station_off", "Dock disconnected", "The dock chosen in the panel", null },
            new[] { "mains_on", "Charger plugged in", "The laptop switches to mains power", "Drops" },
            new[] { "mains_off", "Charger unplugged", "The laptop switches to battery", "Drops" },
            new[] { "usb_on", "USB device connected", "Flash drive, disk, controller…", "Retro 8-bit" },
            new[] { "usb_off", "USB device removed", "Flash drive, disk, controller…", "Retro 8-bit" },
            new[] { "speedtest_start", "Speed test started", "When you launch it in Network", "Sonar" },
        };
        static System.Windows.Forms.PowerLineStatus mains;

        static readonly string Folder = Path.Combine(Program.Root, "sounds");
        const string CustomFolder = "My sounds";

        const string PackWindows = "Windows";
        static readonly string MediaWindows = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "Media");
        static readonly string LogFile = Path.Combine(Folder, "log.txt");

        static readonly string[][] Pairs =
        {
            new[] { "Crystal", "Crystal/Connect.wav", "Crystal/Disconnect.wav" },
            new[] { "Retro 8-bit", "Retro 8-bit/Connect.wav", "Retro 8-bit/Disconnect.wav" },
            new[] { "Sci-fi", "Sci-fi/Connect.wav", "Sci-fi/Disconnect.wav" },
            new[] { "Sonar", "Sonar/Connect.wav", "Sonar/Disconnect.wav" },
            new[] { "Glass", "Glass/Connect.wav", "Glass/Disconnect.wav" },
            new[] { "Chime", "Chime/Connect.wav", "Chime/Disconnect.wav" },
            new[] { "Analog", "Analog/Connect.wav", "Analog/Disconnect.wav" },
            new[] { "Drops", "Drops/Connect.wav", "Drops/Disconnect.wav" },
            new[] { "Mechanical", "Mechanical/Connect.wav", "Mechanical/Disconnect.wav" },
            new[] { "Windows", "Windows/Windows Hardware Insert.wav", "Windows/Windows Hardware Remove.wav" },
        };

        static readonly Dictionary<string, KeyValuePair<DateTime, double>> durations = new Dictionary<string, KeyValuePair<DateTime, double>>();
        static readonly object logLock = new object();
        static Dock station;

        static string playbackId, playbackDeck;
        static double playbackDuration, playbackFrom;
        static DateTime playbackStart;
        static bool playbackPause;
        static System.Windows.Forms.Timer save;

        static DockSettings R { get { return Program.R.Dock; } }
        public static bool Present { get { return station != null && station.Present; } }

        public static void Start(bool startup)
        {
            if (Program.R.Dock == null) Program.R.Dock = new DockSettings();
            Complete();
            if (R.Device == Belkin && R.DeviceName == null) R.DeviceName = "Belkin USB-C 8-in-1";
            save = new System.Windows.Forms.Timer { Interval = 600 };
            save.Tick += (s, e) => { save.Stop(); Program.Save(); };
            station = new Dock(R.Device, Change, present => Trigger(present ? "usb_on" : "usb_off"));
            WriteLog("Bramble started" + (station.Present ? ", dock connected" : ""));

            mains = System.Windows.Forms.SystemInformation.PowerStatus.PowerLineStatus;
            SystemEvents.SessionSwitch += (s, e) =>
            {
                if (e.Reason == SessionSwitchReason.SessionLock) Trigger("lock");
                else if (e.Reason == SessionSwitchReason.SessionUnlock) Trigger("unlock");
            };
            SystemEvents.PowerModeChanged += (s, e) =>
            {
                if (e.Mode == PowerModes.Suspend) Trigger("sleep", 2500);
                else if (e.Mode == PowerModes.Resume) Delay("wake", 1500);
                else if (e.Mode == PowerModes.StatusChange)
                {
                    var now = System.Windows.Forms.SystemInformation.PowerStatus.PowerLineStatus;
                    if (now == mains || now == System.Windows.Forms.PowerLineStatus.Unknown) return;
                    mains = now;
                    Trigger(now == System.Windows.Forms.PowerLineStatus.Online ? "mains_on" : "mains_off");
                }
            };

            SystemEvents.SessionEnding += (s, e) => Trigger("shutdown", 4000);
            if (startup) Delay("startup", 3000);
        }

        static void Complete()
        {
            bool first = R.Events == null;
            if (first) R.Events = new List<EventSetting>();
            for (int i = 0; i < Events.Length; i++)
            {
                string id = Events[i][0];
                if (R.Events.Any(x => x.Id == id)) continue;
                string[] pair = Events[i][3] == null ? null : Pairs.FirstOrDefault(p => p[0] == Events[i][3]);
                bool arrival = i % 2 == 0;
                string sound = pair != null ? (arrival ? pair[1] : pair[2]) : (arrival ? R.SoundA : R.SoundB);
                if (SoundPath(sound) == null) sound = arrival ? DefaultPair()[1] : DefaultPair()[2];
                R.Events.Add(new EventSetting { Id = id, Sound = sound, Active = id.StartsWith("station_") || id.StartsWith("speedtest_") });
            }
        }

        const string Belkin = "VID_050D&PID_015B";

        static EventSetting Setting(string id) { return R.Events.FirstOrDefault(x => x.Id == id); }
        static string Label(string id) { var e = Events.FirstOrDefault(x => x[0] == id); return e != null ? e[1] : id; }

        static void Delay(string id, int ms)
        {
            var timer = new System.Windows.Forms.Timer { Interval = ms };
            timer.Tick += (s, e) => { timer.Dispose(); Trigger(id); };
            timer.Start();
        }

        static void Trigger(string id, int wait = 0)
        {
            var setting = Setting(id);
            if (setting == null) return;
            WriteLog("Event " + id);
            bool plays = R.Active && !R.Silence && setting.Active;
            Program.Send(new { type = "station.event", @event = id, plays = plays });
            if (plays)
            {
                string sound = SoundPath(setting.Sound) != null ? setting.Sound : (id.EndsWith("_off") || id == "shutdown" || id == "sleep" || id == "lock" ? DefaultPair()[2] : DefaultPair()[1]);
                Play(sound, id);
                if (wait > 0 && playbackId != null) Thread.Sleep((int)Math.Min(wait, playbackDuration * 1000 + 100));
            }
            Program.UpdateMenu();
            Program.SendState();
        }

        public static void Fire(string id) { Trigger(id); }

        public static void Step(int n)
        {
            if (!R.Active || R.Silence) return;
            string file = Path.Combine(Program.Root, "app", "sounds", "step-" + n + ".wav");
            if (!File.Exists(file)) return;
            try
            {
                Wav wav = Wav.Read(file);
                Player.Play(wav.Render(Gain() * wav.Normalisation(), 0));
            }
            catch (Exception ex) { Program.Log(ex); }
        }

        public static void Stop() { Player.Stop(); }

        static void Change(bool present)
        {
            Trigger(present ? "station_on" : "station_off");
        }

        public static void Listen(string id, string deck)
        {
            if (!R.Active) { Program.Send(new { type = "station.refusal", reason = "off" }); return; }
            if (R.Silence) { Program.Send(new { type = "station.refusal", reason = "silence" }); return; }
            Play(id, deck);
        }

        public static void ListenEvent(string eventName)
        {
            var setting = Setting(eventName);
            if (setting != null) Listen(setting.Sound, eventName);
        }

        static void Play(string id, string deck, double from = 0)
        {
            string path = SoundPath(id);
            if (path == null) { Program.Send(new { type = "station.refusal", reason = "file" }); return; }
            try
            {
                Wav wav = Wav.Read(path);
                float gain = Gain() * wav.Normalisation();
                if (!Player.Play(wav.Render(gain, from))) { Program.Send(new { type = "station.refusal", reason = "output" }); return; }
                playbackId = id; playbackDeck = deck; playbackDuration = wav.Duration; playbackFrom = from;
                playbackStart = DateTime.Now; playbackPause = false;
                double[] rms, peak;
                wav.Envelope(60, gain, out rms, out peak);
                Program.Send(new { type = "station.playback", id = id, deck = deck, duration = Math.Round(wav.Duration, 3), from = Math.Round(from, 3), frames = 60, rms = rms, peak = peak, bands = 28, bandFrames = 30, spectrum = wav.Spectrum(30, 28) });
            }
            catch (Exception ex)
            {
                Program.Log(ex);
                Program.Send(new { type = "station.refusal", reason = "file" });
            }
        }

        static DateTime lastRestart = DateTime.MinValue;

        static float Gain()
        {
            float v = R.Volume / 100f;
            return v * v;
        }

        static string SoundPath(string id)
        {
            if (string.IsNullOrEmpty(id)) return null;
            try
            {
                if (id.StartsWith(PackWindows + "/"))
                {
                    string name = id.Substring(PackWindows.Length + 1);
                    string file = Path.Combine(MediaWindows, name);
                    return Path.GetFileName(name) == name && name.EndsWith(".wav", StringComparison.OrdinalIgnoreCase) && File.Exists(file) ? file : null;
                }
                string path = Path.GetFullPath(Path.Combine(Folder, id.Replace('/', '\\')));
                if (!path.StartsWith(Folder + "\\", StringComparison.OrdinalIgnoreCase)) return null;
                if (!path.EndsWith(".wav", StringComparison.OrdinalIgnoreCase) || !File.Exists(path)) return null;
                return path;
            }
            catch { return null; }
        }

        static object[] List()
        {
            var sounds = new List<object>();
            Directory.CreateDirectory(Path.Combine(Folder, CustomFolder));
            var pairOrder = Pairs.SelectMany(p => new[] { p[1], p[2] }).ToList();
            var packs = Directory.GetDirectories(Folder).Select(Path.GetFileName)
                .OrderBy(PackRank).ThenBy(p => p, StringComparer.CurrentCultureIgnoreCase);
            foreach (string pack in packs)
            {
                if (pack == PackWindows) continue;
                if (pack == CustomFolder) sounds.AddRange(WindowsSounds());

                var files = Directory.GetFiles(Path.Combine(Folder, pack), "*.wav")
                    .OrderBy(f => { int i = pairOrder.IndexOf(pack + "/" + Path.GetFileName(f)); return i < 0 ? int.MaxValue : i; })
                    .ThenBy(f => Path.GetFileName(f), StringComparer.CurrentCultureIgnoreCase);
                foreach (string f in files)
                {
                    double duration = Duration(f);
                    if (duration <= 0) continue;
                    sounds.Add(new
                    {
                        id = pack + "/" + Path.GetFileName(f),
                        pack = pack,
                        title = Path.GetFileNameWithoutExtension(f),
                        duration = Math.Round(duration, 2),
                        custom = pack == CustomFolder,
                    });
                }
            }
            return sounds.ToArray();
        }

        static IEnumerable<object> WindowsSounds()
        {
            if (!Directory.Exists(MediaWindows)) yield break;
            foreach (string f in Directory.GetFiles(MediaWindows, "*.wav").OrderBy(f => Path.GetFileName(f), StringComparer.CurrentCultureIgnoreCase))
            {
                string name = Path.GetFileName(f);
                if (name.StartsWith("Alarm") || name.StartsWith("Ring")) continue;
                double duration = Duration(f);
                if (duration <= 0 || duration > 8) continue;
                string title = Path.GetFileNameWithoutExtension(f);
                if (title.StartsWith("Windows ")) title = title.Substring(8);
                yield return new { id = PackWindows + "/" + name, pack = PackWindows, title = title, duration = Math.Round(duration, 2), custom = false };
            }
        }

        static string[] DefaultPair()
        {
            return Pairs.FirstOrDefault(p => SoundPath(p[1]) != null && SoundPath(p[2]) != null) ?? Pairs[0];
        }

        static int PackRank(string pack)
        {
            int i = Array.FindIndex(Pairs, p => p[0] == pack);
            return i >= 0 ? i : pack == CustomFolder ? 1000 : 100;
        }

        static double Duration(string path)
        {
            DateTime date = File.GetLastWriteTimeUtc(path);
            KeyValuePair<DateTime, double> known;
            if (durations.TryGetValue(path, out known) && known.Key == date) return known.Value;
            double d = Wav.ReadDuration(path);
            durations[path] = new KeyValuePair<DateTime, double>(date, d);
            return d;
        }

        static void Ingest(string name, string data)
        {
            try
            {
                byte[] bytes = Convert.FromBase64String(data);
                string folder = Path.Combine(Folder, CustomFolder);
                Directory.CreateDirectory(folder);
                string clean = CleanName(name);
                string target = Path.Combine(folder, clean + ".wav");
                for (int i = 2; File.Exists(target); i++) target = Path.Combine(folder, clean + " (" + i + ").wav");
                File.WriteAllBytes(target, bytes);
                if (Wav.ReadDuration(target) <= 0) { File.Delete(target); throw new InvalidDataException("Unreadable WAV received: " + name); }
                string title = Path.GetFileNameWithoutExtension(target);
                WriteLog("Sound added: " + title);
                Program.Send(new { type = "station.imported", ok = true, id = CustomFolder + "/" + Path.GetFileName(target), title = title });
            }
            catch (Exception ex)
            {
                Program.Log(ex);
                Program.Send(new { type = "station.imported", ok = false, title = name });
            }
        }

        static string CleanName(string name)
        {
            char[] forbidden = Path.GetInvalidFileNameChars();
            string s = new string((name ?? "").Select(c => forbidden.Contains(c) ? ' ' : c).ToArray()).Trim().TrimEnd('.');
            if (s.Length > 60) s = s.Substring(0, 60).Trim();
            return s.Length == 0 ? "Sound" : s;
        }

        static void Remove(string id)
        {
            string path = SoundPath(id);
            if (path == null || !id.StartsWith(CustomFolder + "/")) return;

            var affected = R.Events.Where(x => x.Sound == id).ToList();
            foreach (var e in affected)
            {
                int i = Array.FindIndex(Events, x => x[0] == e.Id);
                e.Sound = i % 2 == 0 ? DefaultPair()[1] : DefaultPair()[2];
            }
            string title = Path.GetFileNameWithoutExtension(path);
            Program.SetAside(path, title, () => { foreach (var e in affected) e.Sound = id; });
            WriteLog("Sound removed: " + title);
        }

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            switch (action)
            {
                case "listen": Listen(Text(m, "id"), Text(m, "deck")); return false;
                case "listenEvent": ListenEvent(Text(m, "event")); return false;
                case "stop": Player.Stop(); playbackId = null; Program.Send(new { type = "station.stop" }); return false;
                case "pause":
                {
                    if (playbackId == null) { Program.Send(new { type = "station.refusal", reason = "nothing" }); return false; }
                    if (playbackPause) { Play(playbackId, playbackDeck, playbackFrom); return false; }
                    double elapsed = playbackFrom + (DateTime.Now - playbackStart).TotalSeconds;
                    if (elapsed >= playbackDuration) { playbackId = null; Program.Send(new { type = "station.refusal", reason = "nothing" }); return false; }
                    Player.Stop();
                    playbackFrom = elapsed;
                    playbackPause = true;
                    Program.Send(new { type = "station.pause", from = Math.Round(elapsed, 3) });
                    return false;
                }
                case "assign":
                {
                    var setting = Setting(Text(m, "event"));
                    string id = Text(m, "id");
                    if (setting == null || SoundPath(id) == null) return false;
                    setting.Sound = id;
                    return true;
                }
                case "pair":
                {
                    string[] p = Pairs.FirstOrDefault(x => x[0] == Text(m, "pack"));
                    int i = Array.FindIndex(Events, x => x[0] == Text(m, "event"));
                    if (p == null || i < 0) return false;
                    i -= i % 2;
                    var first = Setting(Events[i][0]);
                    var second = Setting(Events[i + 1][0]);
                    string before1 = first.Sound, before2 = second.Sound;
                    first.Sound = p[1];
                    second.Sound = p[2];
                    Program.Undoable(Language.T("Pair loaded: {0}", Language.T(p[0])), () => { first.Sound = before1; second.Sound = before2; });
                    return true;
                }
                case "detect":

                    station.Detect((pattern, name) =>
                    {
                        if (pattern != null)
                        {
                            R.Device = pattern;
                            R.DeviceName = name ?? pattern;
                            station.ChangePattern(pattern);
                            WriteLog("Dock chosen: " + R.DeviceName);
                            Program.Save();
                        }
                        Program.Send(new { type = "station.detection", found = pattern != null, name = R.DeviceName });
                        Program.SendState();
                    });
                    Program.Send(new { type = "station.detection", running = true });
                    return false;
                case "forget":
                    R.Device = "";
                    R.DeviceName = null;
                    station.ChangePattern("");
                    return true;
                case "event":
                {
                    var setting = Setting(Text(m, "id"));
                    if (setting == null) return false;
                    setting.Active = Convert.ToBoolean(m["value"]);
                    return true;
                }
                case "volume":
                    R.Volume = Math.Max(0, Math.Min(100, Convert.ToInt32(m["value"])));

                    save.Stop();
                    save.Start();

                    if (playbackId != null && !playbackPause && (DateTime.Now - lastRestart).TotalMilliseconds > 120)
                    {
                        double elapsed = playbackFrom + (DateTime.Now - playbackStart).TotalSeconds;
                        if (elapsed < playbackDuration - 0.05) { lastRestart = DateTime.Now; Play(playbackId, playbackDeck, elapsed); }
                    }
                    return false;
                case "active":
                    R.Active = Convert.ToBoolean(m["value"]);
                    if (!R.Active) Player.Stop();
                    WriteLog(R.Active ? "Sounds on" : "Sounds off");
                    return true;
                case "silence":
                    R.Silence = Convert.ToBoolean(m["value"]);
                    if (R.Silence) Player.Stop();
                    return true;
                case "ingest": Ingest(Text(m, "name"), Text(m, "data")); return true;
                case "remove": Remove(Text(m, "id")); return true;
                case "folder": System.Diagnostics.Process.Start("explorer.exe", "\"" + Folder + "\""); return false;
            }
            return false;
        }

        public static void Toggle()
        {
            R.Active = !R.Active;
            if (!R.Active) Player.Stop();
            WriteLog(R.Active ? "Sounds on" : "Sounds off");
        }

        public static bool Active { get { return R.Active; } }

        static string Text(Dictionary<string, object> m, string key)
        {
            object v;
            return m.TryGetValue(key, out v) && v != null ? v.ToString() : null;
        }

        public static object State()
        {
            return new
            {
                active = R.Active,
                silence = R.Silence,
                volume = R.Volume,
                events = Events.Select((e, i) => new
                {
                    id = e[0], label = e[1], help = e[2], pair = i / 2,
                    active = Setting(e[0]).Active, sound = Setting(e[0]).Sound,
                }).ToArray(),
                present = Present,
                station = string.IsNullOrEmpty(R.Device) ? null : R.DeviceName ?? R.Device,
                mains = System.Windows.Forms.SystemInformation.PowerStatus.PowerLineStatus == System.Windows.Forms.PowerLineStatus.Online,
                sounds = List(),
                pairs = Pairs.Select(p => new { pack = p[0], a = p[1], b = p[2] }).ToArray(),
                log = ReadLog(20),
            };
        }

        static void WriteLog(string text)
        {
            try
            {
                lock (logLock)
                {
                    Directory.CreateDirectory(Folder);
                    File.AppendAllText(LogFile, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + text + Environment.NewLine, Encoding.UTF8);
                    string[] rows = File.ReadAllLines(LogFile, Encoding.UTF8);
                    if (rows.Length > 400) File.WriteAllLines(LogFile, rows.Skip(rows.Length - 200), Encoding.UTF8);
                }
            }
            catch (Exception ex) { Program.Log(ex); }
        }

        static object[] ReadLog(int count)
        {
            var list = new List<object>();
            try
            {
                if (!File.Exists(LogFile)) return list.ToArray();
                string[] rows;
                lock (logLock) rows = File.ReadAllLines(LogFile, Encoding.UTF8);
                for (int i = rows.Length - 1; i >= 0 && list.Count < count; i--)
                {
                    string l = rows[i];
                    int e = l.IndexOf("  Event ");
                    string type = e > 0 ? l.Substring(e + "  Event ".Length).Trim() : l.EndsWith("Dock connected") ? "station_on" : l.EndsWith("Dock disconnected") ? "station_off" : null;
                    DateTime when;
                    if (type == null || l.Length < 19 || !DateTime.TryParseExact(l.Substring(0, 19), "yyyy-MM-dd HH:mm:ss",
                        CultureInfo.InvariantCulture, DateTimeStyles.None, out when)) continue;
                    list.Add(new { when = when.ToString("yyyy-MM-ddTHH:mm:ss"), type = type });
                }
            }
            catch (Exception ex) { Program.Log(ex); }
            return list.ToArray();
        }
    }
}
