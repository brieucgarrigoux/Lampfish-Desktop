using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace Lampfish
{
    class KeyChoice
    {
        public bool On = true;
        public int Modifiers = 3, Key;
        public string Label;
    }

    class CompanionSettings
    {
        public bool On, Hidden;
        public int X = int.MinValue, Y;
        public KeyChoice Capture = new KeyChoice { Key = 0x53, Label = "Ctrl + Alt + S" };
        public KeyChoice Note = new KeyChoice { Key = 0x4E, Label = "Ctrl + Alt + N" };
        public KeyChoice Toggle = new KeyChoice { Key = 0x42, Label = "Ctrl + Alt + B" };
        public List<string> HiddenTabs = new List<string>();
        public List<string> TabOrder = new List<string>();
    }

    // The companion: a round button on the desktop, wherever it is put. A click opens a small window to write a note,
    // take a capture or glance at the PC. It steps aside when a window fills the screen.
    static class Companion
    {
        static readonly JavaScriptSerializer json = new JavaScriptSerializer();
        static CompanionSettings S = new CompanionSettings();
        static readonly Dictionary<string, string> errors = new Dictionary<string, string>();
        static Dot dot;
        static PageForm popup;
        static Timer watch, idle, refresh;
        static PerformanceCounter cpu;
        static string tab = "dashboard";
        static DateTime hiddenAt, asideAt;
        static bool aside, opening, retried, closing;
        static readonly string[] Tabs = { "dashboard", "quick", "desktop", "claude", "note", "capture", "shelf", "audio", "notes", "convert", "help" };
        // What the assistant may do on its own: the settings it shows, nothing else from the main window.
        static readonly HashSet<string> Shared = new HashSet<string>
        {
            "skin", "pauseOnBattery", "pauseAuto", "reactive", "shuffle", "startup", "display.dark", "display.warm", "power.saver", "audio.mute", "audio.mic", "audio.volume",
            "station.active", "arrange.arrangement", "arrange.undo", "arrange.original", "arrange.iconSize", "taskbar.set",
        };
        static DateTime shownAt;
        static int slide;

        static string SettingsFile { get { return Path.Combine(Program.DataFolder("Companion"), "settings.json"); } }

        public static bool On { get { return S.On; } }

        public static void Start()
        {
            try { if (File.Exists(SettingsFile)) S = json.Deserialize<CompanionSettings>(File.ReadAllText(SettingsFile)) ?? new CompanionSettings(); }
            catch (Exception ex) { Program.Log(ex); }
            watch = new Timer { Interval = 1000 };
            watch.Tick += (s, e) => Place();
            idle = new Timer { Interval = 120000 };
            idle.Tick += (s, e) => { idle.Stop(); if (popup != null && !popup.Visible) { popup.Dispose(); popup = null; } };
            refresh = new Timer { Interval = 2000 };
            refresh.Tick += (s, e) =>
            {
                if (popup == null || !popup.Visible || opening) return;
                // Windows can refuse to give the window the focus; it would then never close by itself.
                if ((DateTime.Now - shownAt).TotalSeconds > 2 && Native.GetForegroundWindow() != popup.Handle && !popup.ContainsFocus)
                {
                    if (!retried) { retried = true; popup.Activate(); }
                    else { Conceal(); return; }
                }
                if (tab == "dashboard" || tab == "claude" || tab == "quick" || tab == "desktop") SendData();
            };
            Capture.Busy += Aside;
            AudioDevices.Listed += message => { if (popup != null && !popup.IsDisposed && popup.Visible) popup.Send(message); };
            Apply();
        }

        public static void Stop()
        {
            if (dot != null) { dot.Close(); dot = null; }
            if (popup != null) { popup.Dispose(); popup = null; }
        }

        static void Save()
        {
            try { File.WriteAllText(SettingsFile, json.Serialize(S)); }
            catch (Exception ex) { Program.Log(ex); }
        }

        static void Apply()
        {
            Keys();
            if (S.On && !S.Hidden)
            {
                if (dot == null || dot.IsDisposed) dot = new Dot();
                Place();
                watch.Start();
            }
            else
            {
                watch.Stop();
                if (dot != null) dot.Hide();
                if (popup != null) popup.Hide();
            }
        }

        static void Keys()
        {
            errors.Clear();
            var all = new[] { Tuple.Create(Hotkeys.Capture, "capture", S.Capture, (Action)(() => Capture.Start(0))), Tuple.Create(Hotkeys.Note, "note", S.Note, (Action)(() => Open("note"))), Tuple.Create(Hotkeys.Companion, "toggle", S.Toggle, (Action)Toggle) };
            foreach (var k in all)
            {
                Hotkeys.Unregister(k.Item1);
                if (S.On && k.Item3.On && !Hotkeys.Register(k.Item1, k.Item3.Modifiers, k.Item3.Key, k.Item4)) errors[k.Item2] = "taken";
            }
        }

        static void Toggle()
        {
            S.Hidden = !S.Hidden;
            Save();
            Apply();
            Program.SendState();
        }

        public static void Enable(bool on)
        {
            S.On = on;
            S.Hidden = false;
            Save();
            Apply();
        }

        public static object State()
        {
            Func<string, KeyChoice, object> key = (name, k) => new { on = k.On, label = k.Label, error = errors.ContainsKey(name) ? errors[name] : null };
            return new { on = S.On, hidden = S.Hidden, hiddenTabs = S.HiddenTabs, tabOrder = S.TabOrder, capture = key("capture", S.Capture), note = key("note", S.Note), toggle = key("toggle", S.Toggle) };
        }

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            switch (action)
            {
                case "set": Enable(Convert.ToBoolean(m["on"])); return true;
                case "show": S.Hidden = false; Save(); Apply(); return true;
                case "tabs":
                {
                    var list = m.ContainsKey("hidden") ? m["hidden"] as System.Collections.IEnumerable : null;
                    var hidden = list == null ? new List<string>() : list.OfType<object>().Select(Convert.ToString).Where(x => Tabs.Contains(x)).Distinct().ToList();
                    S.HiddenTabs = hidden.Count >= Tabs.Length ? new List<string>() : hidden;
                    var order = m.ContainsKey("order") ? m["order"] as System.Collections.IEnumerable : null;
                    if (order != null) S.TabOrder = order.OfType<object>().Select(Convert.ToString).Where(x => Tabs.Contains(x)).Distinct().ToList();
                    Save();
                    SendData();
                    return true;
                }
                case "key":
                case "keyOn":
                {
                    string which = Convert.ToString(m["which"]);
                    var k = which == "capture" ? S.Capture : which == "note" ? S.Note : which == "toggle" ? S.Toggle : null;
                    if (k == null) return false;
                    if (action == "keyOn") k.On = Convert.ToBoolean(m["on"]);
                    else
                    {
                        k.Modifiers = Convert.ToInt32(m["mods"]) & 0xF;
                        k.Key = Convert.ToInt32(m["key"]);
                        k.Label = Convert.ToString(m["label"]);
                        if (k.Label.Length > 60) k.Label = k.Label.Substring(0, 60);
                        k.On = true;
                    }
                    Save();
                    Keys();
                    return true;
                }
            }
            return false;
        }

        // Stays where it was put, above everything; out of the way only while a game, a film or a presentation owns the screen.
        // A capture must not show the companion itself.
        static void Aside(bool away)
        {
            aside = away;
            asideAt = DateTime.Now;
            if (away) { if (dot != null && dot.Visible) dot.Hide(); }
            else Place();
        }

        // The state Windows keeps for "a full-screen application is running" (2), Direct3D full screen (3) and presentation mode (4).
        static bool FullScreenApp()
        {
            int state;
            return SHQueryUserNotificationState(out state) == 0 && (state == 2 || state == 3 || state == 4);
        }
        [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int state);

        static void Place()
        {
            // A capture that failed halfway must not leave the button hidden for good.
            if (aside && (DateTime.Now - asideAt).TotalMinutes > 2) aside = false;
            if (dot != null && dot.Held && (Control.MouseButtons & MouseButtons.Left) == 0) dot.Settle();
            if (dot == null || dot.IsDisposed || !S.On || S.Hidden || aside || dot.Held) return;
            int side = dot.Side;
            var home = S.X == int.MinValue ? new Point(Screen.PrimaryScreen.WorkingArea.Right - 1, Screen.PrimaryScreen.WorkingArea.Top) : new Point(S.X + side / 2, S.Y + side / 2);
            var area = Screen.FromPoint(home).WorkingArea;
            if (S.X == int.MinValue) { S.X = area.Right - side; S.Y = area.Top + area.Height * 3 / 5; }
            var at = new Point(Math.Max(area.Left, Math.Min(area.Right - side, S.X)), Math.Max(area.Top, Math.Min(area.Bottom - side, S.Y)));
            if (FullScreenApp()) { if (dot.Visible) dot.Hide(); return; }
            if (!dot.Gliding && (!dot.Visible || dot.Location != at || dot.Width != side)) dot.Put(at);
            // Another window that is always on top (the taskbar after a click, a video player) can end up above the button.
            else if (!dot.Gliding) dot.Raise();
        }

        static void Moved(Point p)
        {
            int side = dot.Side;
            var screen = Screen.FromPoint(new Point(p.X + side / 2, p.Y + side / 2));
            var area = screen.WorkingArea;
            // It stays where it is let go, kept inside the screen; close to an edge, it settles against it.
            int near = (int)(24 * Arrange.Scale(screen)), x = Math.Max(area.Left, Math.Min(area.Right - side, p.X)), y = Math.Max(area.Top, Math.Min(area.Bottom - side, p.Y));
            if (x - area.Left < near) x = area.Left;
            if (area.Right - side - x < near) x = area.Right - side;
            if (y - area.Top < near) y = area.Top;
            if (area.Bottom - side - y < near) y = area.Bottom - side;
            S.X = x; S.Y = y;
            Save();
            dot.GlideTo(new Point(x, y));
        }

        // The window is shown, still invisible, as soon as the button is pressed; it appears when the page says it has painted its data.
        public static async void Open(string which)
        {
            tab = which ?? tab;
            if (opening) return;
            opening = true;
            idle.Stop();
            ReadLink();
            if (dot != null) { dot.Opening(true); dot.Ripple(); }
            try
            {
                if (popup == null || popup.IsDisposed)
                {
                    popup = new PageForm("companion.html", FromPage)
                    {
                        FormBorderStyle = FormBorderStyle.None, ShowInTaskbar = false, TopMost = true, StartPosition = FormStartPosition.Manual, Text = "lampfish",
                    };
                    popup.Deactivate += (s, e) => { if (popup != null && !opening) { Conceal(); hiddenAt = DateTime.Now; idle.Start(); refresh.Stop(); } };
                    popup.Shown += (s, e) => Native.Rounded(popup.Handle);
                    popup.HandleCreated += (s, e) => Cloak(true);
                    // The page forgets what it showed, so the next opening never flashes the last one.
                    popup.VisibleChanged += (s, e) =>
                    {
                        if (popup == null || popup.IsDisposed || popup.Visible) return;
                        opening = false;
                        if (dot != null) { dot.Opening(false); dot.Lit(false); }
                        popup.Send(new { type = "companion.hidden" });
                        AudioDevices.Watch("companion", false);
                    };
                    Position();
                    popup.Show();
                    await popup.Open();
                }
                else
                {
                    Position();
                    Cloak(true);
                    popup.Show();
                    SendData(true);
                }
            }
            catch (Exception ex) { Program.Log(ex); opening = false; if (dot != null) dot.Opening(false); return; }
            refresh.Start();
            SendStill(400);
            AudioDevices.Watch("companion", tab == "audio");
            // If the page never answers, the window shows anyway.
            var guard = new Timer { Interval = 2500 };
            guard.Tick += (s, e) => { guard.Stop(); guard.Dispose(); Reveal(); };
            guard.Start();
        }

        // Whatever changed the wallpaper (the window, the tray, a theme, the slideshow), an open assistant shows the new one.
        public static void WallpaperChanged()
        {
            if (popup != null && !popup.IsDisposed && popup.Visible) SendStill(1600);
        }

        static string Small(byte[] jpg, int w, int h, long quality)
        {
            using (var source = new Bitmap(new MemoryStream(jpg)))
            using (var small = new Bitmap(w, h))
            using (var memory = new MemoryStream())
            {
                using (var g = Graphics.FromImage(small)) { g.InterpolationMode = InterpolationMode.HighQualityBicubic; g.DrawImage(source, 0, 0, w, h); }
                var codec = ImageCodecInfo.GetImageEncoders().First(c => c.FormatID == ImageFormat.Jpeg.Guid);
                var options = new EncoderParameters(1);
                options.Param[0] = new EncoderParameter(Encoder.Quality, quality);
                small.Save(memory, codec, options);
                return "data:image/jpeg;base64," + Convert.ToBase64String(memory.ToArray());
            }
        }

        // A picture of the wallpaper of the screen the assistant is on, for the top of Desktop.
        static int stillTurn;
        static Rectangle rest;
        static async void SendStill(int delay)
        {
            int mine = ++stillTurn;
            if (delay > 0) await System.Threading.Tasks.Task.Delay(delay);
            if (mine != stillTurn || popup == null || popup.IsDisposed) return;
            WallpaperForm form = null;
            var center = new Point(popup.Left + popup.Width / 2, popup.Top + popup.Height / 2);
            Program.ForEachWallpaper(f => { if (form == null || f.Screen.Contains(center)) form = f; });
            if (form == null) return;
            byte[] jpg = await form.Snapshot();
            if (jpg == null) return;
            try
            {
                // Two small pictures: a full screen one sent to the page and blurred there over the whole window made it slow to open.
                string url = Small(jpg, 640, 360, 82), back = Small(jpg, 64, 36, 90);
                string name = string.IsNullOrEmpty(form.ShownWallpaper) ? "" : Path.GetFileNameWithoutExtension(form.ShownWallpaper.TrimEnd('\\', '/'));
                // Where the window rests on its screen, as parts of the screen: the page lays the same picture, blurred, behind itself.
                var s = form.Screen;
                if (mine == stillTurn && popup != null && !popup.IsDisposed)
                    popup.Send(new { type = "companion.still", url, back, name, x = (double)(rest.X - s.X) / s.Width, y = (double)(rest.Y - s.Y) / s.Height, w = (double)rest.Width / s.Width, h = (double)rest.Height / s.Height });
            }
            catch (Exception ex) { Program.Log(ex); }
        }

        // Windows keeps the window drawn but off the screen until its page is ready: the material shows no empty pane meanwhile,
        // and the page keeps painting (a window hidden or faded out would not).
        static void Cloak(bool on)
        {
            if (popup == null || popup.IsDisposed || !popup.IsHandleCreated) return;
            int v = on ? 1 : 0;
            Native.DwmSetWindowAttribute(popup.Handle, 13, ref v, 4);
        }

        // The window slides out of the button while its page fades in.
        static void Reveal()
        {
            if (!opening || popup == null || popup.IsDisposed) return;
            opening = false;
            shownAt = DateTime.Now;
            retried = false;
            var end = popup.Left - slide;
            var started = DateTime.Now;
            // A press that is still held keeps its mouse: the window takes the focus after.
            if (dot == null || !dot.Held) popup.Activate();
            // The window slides out from behind the button: over it, it would cover the button with a pale rectangle for the length of the slide.
            if (dot != null) { dot.Raise(); dot.Opening(false); dot.Lit(true); }
            Cloak(false);
            popup.Send(new { type = "companion.shown" });
            var timer = new Timer { Interval = 12 };
            timer.Tick += (s, e) =>
            {
                if (popup == null || popup.IsDisposed || !popup.Visible) { timer.Stop(); timer.Dispose(); return; }
                double t = Math.Min(1, (DateTime.Now - started).TotalMilliseconds / 180), k = 1 - Math.Pow(1 - t, 3);
                popup.Left = end + (int)Math.Round(slide * (1 - k));
                if (t >= 1) { timer.Stop(); timer.Dispose(); popup.Left = end; }
            };
            timer.Start();
        }

        // The way out mirrors the way in: the window slides back to the button while it fades.
        static void Conceal()
        {
            if (popup == null || popup.IsDisposed || !popup.Visible || closing) return;
            closing = true;
            if (dot != null) dot.Raise();
            popup.Send(new { type = "companion.leaving" });
            int start = popup.Left, back = slide;
            var started = DateTime.Now;
            var timer = new Timer { Interval = 12 };
            timer.Tick += (s, e) =>
            {
                double t = popup == null || popup.IsDisposed ? 1 : Math.Min(1, (DateTime.Now - started).TotalMilliseconds / 140), k = t * t;
                if (popup != null && !popup.IsDisposed)
                {
                    popup.Left = start + (int)Math.Round(back * k);
                }
                if (t < 1) return;
                timer.Stop();
                timer.Dispose();
                closing = false;
                if (popup == null || popup.IsDisposed) return;
                Cloak(true);
                popup.Hide();
                popup.Left = start;
            };
            timer.Start();
        }

        static void Position()
        {
            var anchor = dot != null && dot.Visible ? dot.Disc : new Rectangle(Cursor.Position, Size.Empty);
            var screen = Screen.FromPoint(anchor.Location);
            double k = Arrange.Scale(screen);
            int w = (int)(380 * k), h = (int)(560 * k), gap = (int)(10 * k);
            var area = screen.WorkingArea;
            bool left = anchor.Left + anchor.Width / 2 > area.Left + area.Width / 2;
            int x = left ? anchor.Left - w - gap : anchor.Right + gap;
            int y = anchor.Top + anchor.Height / 2 - h / 2;
            slide = (int)((left ? 28 : -28) * k);
            popup.Bounds = new Rectangle(Math.Max(area.Left, Math.Min(area.Right - w, x)), Math.Max(area.Top, Math.Min(area.Bottom - h, y)), w, h);
            rest = popup.Bounds;
            popup.Left += slide;
        }

        // Reading the Wi-Fi can take a moment: it runs aside, at most every 10 seconds, and the last reading is shown meanwhile.
        static object link;
        static bool linkBusy;
        static DateTime linkAt;
        static void ReadLink()
        {
            if (linkBusy || (DateTime.Now - linkAt).TotalSeconds < 10) return;
            linkBusy = true;
            linkAt = DateTime.Now;
            System.Threading.Tasks.Task.Run(() => Network.Link()).ContinueWith(t => Program.OnInterface(() =>
            {
                linkBusy = false;
                if (t.IsFaulted) { Program.Log(t.Exception); return; }
                link = t.Result;
                SendData();
            }));
        }

        static void SendData(bool open = false)
        {
            if (popup == null) return;
            ReadLink();
            if (cpu == null) try { cpu = new PerformanceCounter("Processor Information", "% Processor Utility", "_Total"); cpu.NextValue(); } catch (Exception ex) { Program.Log(ex); }
            float processor = 0;
            try { if (cpu != null) processor = Math.Min(100, cpu.NextValue()); } catch { }
            var info = new Microsoft.VisualBasic.Devices.ComputerInfo();
            double memory = 100.0 * (info.TotalPhysicalMemory - info.AvailablePhysicalMemory) / info.TotalPhysicalMemory;
            var theme = Moods.Active();
            popup.Send(new
            {
                type = "companion.data", tab, open, language = Language.Code,
                processor = Math.Round(processor), memory = Math.Round(memory), battery = Hardware.Battery(), link, busiest = Health.Busiest,
                theme = theme == null ? null : theme.Name, output = AudioDevices.NameOf(AudioDevices.DefaultOutput()), disk = Disk(), origin = open ? Origin() : null,
                claude = ClaudeUsage.State(), desktop = DesktopState(), quick = tab == "quick" ? QuickState() : null, hiddenTabs = S.HiddenTabs, tabOrder = S.TabOrder, notes = Notes.Items().Take(40).ToArray(), shelf = Shelf.Items().Take(8).ToArray(),
            });
        }

        static object DesktopState()
        {
            bool hidden = false;
            try { hidden = (DesktopIcons.Flags() & DesktopIcons.FWF_NOICONS) != 0; } catch { }
            return new { grid = DesktopGrid.On, hidden, paused = Program.Paused, arrangement = Program.R.Arrange.Arrangement, undo = Program.R.Arrange.History.Count > 0, iconSize = DesktopIcons.IconSize(), taskbar = Taskbar.State() };
        }

        static object QuickState()
        {
            var r = Program.R;
            return new
            {
                skin = r.Skin, r.PauseOnBattery, r.PauseAuto, r.Reactive, r.Shuffle, startup = Program.StartupEnabled(), display = Display.State(), power = Power.State(), audio = AudioMeter.Endpoints(),
                sounds = r.Dock.Active && !r.Dock.Silence,
            };
        }

        static object Disk()
        {
            try
            {
                var drive = new DriveInfo(Path.GetPathRoot(Environment.SystemDirectory));
                return new { name = drive.Name.TrimEnd('\\'), free = drive.AvailableFreeSpace, total = drive.TotalSize };
            }
            catch { return null; }
        }

        // Where the button is on the window, so that the window grows out of it.
        static object Origin()
        {
            if (dot == null || popup == null) return null;
            double cx = dot.Left + dot.Width / 2.0, cy = dot.Top + dot.Height / 2.0;
            return new { x = cx < popup.Left + popup.Width / 2.0 ? 0 : 100, y = (int)Math.Max(5, Math.Min(95, (cy - popup.Top) * 100.0 / Math.Max(1, popup.Height))) };
        }

        static string Text(Dictionary<string, object> m, string key) { return m.ContainsKey(key) && m[key] != null ? Convert.ToString(m[key]) : ""; }

        static void FromPage(Dictionary<string, object> m)
        {
            string action = Text(m, "action");
            switch (action)
            {
                case "companion.ready": SendData(opening); if (opening) SendStill(400); return;
                case "companion.painted": Reveal(); return;
                case "companion.tab": tab = Text(m, "tab"); AudioDevices.Watch("companion", tab == "audio"); SendData(); return;
                case "companion.convert":
                    popup.Hide();
                    Program.OpenView("convert");
                    if (Program.SettingsWindow != null) Program.SettingsWindow.BeginInvoke((Action)(() => Converter.Receive("pick", m, null)));
                    return;
                case "companion.grid": DesktopGrid.Enable(Convert.ToBoolean(m["on"]), true); Program.SendState(); SendData(); return;
                case "companion.straighten": Arrange.Receive("align", m); SendData(); return;
                case "companion.refresh": Icons.Receive("refresh", m, null); return;
                case "companion.icons": Arrange.Receive("hide", new Dictionary<string, object> { { "value", Convert.ToBoolean(m["hidden"]) } }); SendData(); return;
                case "companion.wallpaper":
                {
                    string op = Text(m, "op");
                    if (op == "next") Program.NextWallpaper();
                    else if (op == "previous") Program.PreviousWallpaper();
                    else if (op == "pause") Program.TogglePause();
                    SendData();
                    // The new wallpaper needs a moment to load and fade in before its picture is taken.
                    if (op != "pause") SendStill(1600);
                    return;
                }
                case "companion.theme": Moods.Step(Convert.ToInt32(m["step"]) < 0 ? -1 : 1); SendData(); return;
                case "companion.audio":
                {
                    string op = Text(m, "op");
                    if (op == "use" || op == "deviceVolume" || op == "deviceMute") { if (AudioDevices.Receive(op, m)) Program.SendState(); }
                    SendData();
                    return;
                }
                case "companion.shelf":
                {
                    string op = Text(m, "op"), name = Text(m, "name");
                    if (op == "dragOut") { Shelf.DragOut(popup, name, () => { }); return; }
                    if (op == "add") popup.Hide();
                    Shelf.Receive(op, m, null);
                    if (op == "copy") popup.Hide();
                    SendData();
                    return;
                }
                case "companion.close": Conceal(); return;
                case "companion.do":
                {
                    string shared = Text(m, "name");
                    if (!Shared.Contains(shared)) return;
                    var message = new Dictionary<string, object>(m);
                    message["action"] = shared;
                    Program.Run(message);
                    Program.SendState();
                    SendData();
                    return;
                }
                case "companion.tabs": Receive("tabs", m); Program.SendState(); return;
                case "companion.note":
                {
                    string name = Notes.Add(Text(m, "title"), Text(m, "text"));
                    popup.Send(new { type = "companion.saved", name });
                    Notes.SendList();
                    Program.SendState();
                    return;
                }
                case "companion.openNote":
                    popup.Hide();
                    Program.OpenView("notes");
                    if (Text(m, "name").Length > 0) Program.Send(new { type = "notes.open", name = Text(m, "name") });
                    return;
                case "companion.capture":
                    popup.Hide();
                    Capture.Start(m.ContainsKey("delay") ? Convert.ToInt32(m["delay"]) : 0, Text(m, "whole") == "True");
                    return;
                case "companion.annotate":
                    popup.Hide();
                    Capture.Annotate(Path.Combine(Shelf.Folder, Path.GetFileName(Text(m, "name"))));
                    return;
                case "companion.open":
                    popup.Hide();
                    Program.OpenView(Text(m, "view"));
                    return;
                case "pageError": Program.Log(new Exception("Companion: " + Text(m, "text"))); return;
            }
        }

        // A round window drawn with its own alpha, so its edge has no jagged pixels on any wallpaper. The window is a little larger than the disc:
        // the margin holds the pulse of a click, the halo while the window is open and the arc that turns while it loads.
        class Dot : Form
        {
            readonly Image logo, logoBlack;
            Point down, start;
            bool moving, hover, pressed, busy;

            const int Diameter = 64, Pad = 10;
            readonly Timer glide = new Timer { Interval = 15 }, anim = new Timer { Interval = 16 };
            Point glideFrom, glideTo;
            DateTime glideAt, last, busyAt, rippleAt = DateTime.MinValue;
            double scale = 1, velocity, halo, haloTo, spin;

            static double Scale(Point at) { return Arrange.Scale(Screen.FromPoint(at)); }
            public int Side { get { return (int)((Diameter + 2 * Pad) * Scale(Location)); } }
            public Rectangle Disc { get { int pad = (int)Math.Round(Width * Pad / (double)(Diameter + 2 * Pad)); return new Rectangle(Left + pad, Top + pad, Width - 2 * pad, Height - 2 * pad); } }
            public bool Gliding { get { return glide.Enabled; } }
            // True from the press to the release, so that nothing moves, hides or redraws the button under the pointer.
            public bool Held { get { return pressed; } }

            public void Raise() { Native.SetWindowPos(Handle, Native.HWND_TOPMOST, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE); }

            // Windows resizes a window that crosses to a screen with another scale, but the picture of this one is drawn at its own size: the button is sized and drawn again when it is let go.
            protected override void WndProc(ref Message m)
            {
                if (m.Msg == 0x02E0) return;
                base.WndProc(ref m);
            }

            public Dot()
            {
                FormBorderStyle = FormBorderStyle.None;
                StartPosition = FormStartPosition.Manual;
                ShowInTaskbar = false;
                TopMost = true;
                AutoScaleMode = AutoScaleMode.None;
                try { logo = Image.FromFile(Path.Combine(Program.Root, "brand", "logo", "mark-lampfish-white.png")); } catch (Exception ex) { Program.Log(ex); }
                try { logoBlack = Image.FromFile(Path.Combine(Program.Root, "brand", "logo", "mark-lampfish-black.png")); } catch (Exception ex) { Program.Log(ex); }
                Appearance.Changed += () => { if (!IsDisposed) Draw(); };
                Cursor = Cursors.Hand;
                new ToolTip { InitialDelay = 700 }.SetToolTip(this, Language.T("lampfish: click to open, drag to move, right-click for the app"));
                glide.Tick += (s, e) =>
                {
                    double t = Math.Min(1, (DateTime.Now - glideAt).TotalMilliseconds / 180), k = 1 - Math.Pow(1 - t, 3);
                    Location = new Point(glideFrom.X + (int)Math.Round((glideTo.X - glideFrom.X) * k), glideFrom.Y + (int)Math.Round((glideTo.Y - glideFrom.Y) * k));
                    if (t >= 1) { glide.Stop(); Put(glideTo); }
                };
                anim.Tick += (s, e) => Step();
            }

            // The disc is pressed in under the finger, springs back past its size when let go, and swells a little while it is carried.
            void Step()
            {
                double dt = Math.Min(0.05, (DateTime.Now - last).TotalSeconds), target = pressed ? (moving ? 1.07 : .9) : 1;
                last = DateTime.Now;
                velocity += ((target - scale) * 420 - velocity * 22) * dt;
                scale += velocity * dt;
                halo += (haloTo - halo) * Math.Min(1, dt * 10);
                if (busy) spin = (spin + 300 * dt) % 360;
                bool calm = Math.Abs(scale - target) < .002 && Math.Abs(velocity) < .02 && Math.Abs(halo - haloTo) < .01 && !busy && (DateTime.Now - rippleAt).TotalMilliseconds > 560;
                if (calm) { scale = target; velocity = 0; halo = haloTo; anim.Stop(); }
                Draw();
            }

            void Kick() { if (!anim.Enabled) { last = DateTime.Now; anim.Start(); } }
            public void Ripple() { if ((DateTime.Now - rippleAt).TotalMilliseconds > 200) rippleAt = DateTime.Now; Kick(); }
            public void Opening(bool on) { if (on && !busy) busyAt = DateTime.Now; busy = on; Kick(); }
            public void Lit(bool on) { haloTo = on ? 1 : 0; Kick(); }

            // From where it was let go to where it settles, in a short ease instead of a jump.
            public void GlideTo(Point to)
            {
                glideFrom = Location; glideTo = to; glideAt = DateTime.Now;
                if (glideFrom == to) return;
                glide.Start();
            }

            protected override bool ShowWithoutActivation { get { return true; } }
            protected override CreateParams CreateParams { get { var p = base.CreateParams; p.ExStyle |= Native.WS_EX_LAYERED | Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE; return p; } }

            public void Put(Point at)
            {
                int side = (int)((Diameter + 2 * Pad) * Scale(at));
                Bounds = new Rectangle(at, new Size(side, side));
                if (!Visible) Show();
                Draw();
            }

            void Draw()
            {
                int side = Width;
                if (side < 16) return;
                float k = side / (float)(Diameter + 2 * Pad), pad = Pad * k, dia = Diameter * k, centre = side / 2f, r = dia / 2f * (float)scale;
                // The arc is for a real wait: a window that opens at once never shows it for a single frame.
                bool waiting = busy && (DateTime.Now - busyAt).TotalMilliseconds > 250;
                bool bright = hover || halo > .5 || waiting, day = Appearance.Light;
                var mark = day && logoBlack != null ? logoBlack : logo;
                using (var bmp = new Bitmap(side, side, PixelFormat.Format32bppArgb))
                {
                    using (var g = Graphics.FromImage(bmp))
                    {
                        g.SmoothingMode = SmoothingMode.AntiAlias;
                        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                        var accent = Color.FromArgb(0x1E, 0xBB, 0xAA);
                        // The halo of an open window: a soft ring around the disc.
                        for (int i = 3; i >= 1 && halo > .02; i--)
                            using (var pen = new Pen(Color.FromArgb((int)(halo * 34 / i), accent), (i * 1.6f + 1.5f) * k)) g.DrawEllipse(pen, centre - r - 1.5f * k * i, centre - r - 1.5f * k * i, (r + 1.5f * k * i) * 2, (r + 1.5f * k * i) * 2);
                        double rt = (DateTime.Now - rippleAt).TotalMilliseconds / 520;
                        if (rt >= 0 && rt < 1)
                        {
                            float rr = r + pad * .9f * (float)(1 - Math.Pow(1 - rt, 2));
                            using (var pen = new Pen(Color.FromArgb((int)(170 * (1 - rt)), accent), Math.Max(1.5f, 2.2f * k * (float)(1 - rt)))) g.DrawEllipse(pen, centre - rr, centre - rr, rr * 2, rr * 2);
                        }
                        using (var shadow = new SolidBrush(Color.FromArgb(70, 0, 0, 0))) g.FillEllipse(shadow, centre - r, centre - r + 1.5f * k, r * 2, r * 2 - 1.5f * k);
                        var disc = new RectangleF(centre - r + 1.5f * k, centre - r + 1.5f * k, r * 2 - 3 * k, r * 2 - 3 * k);
                        using (var body = new LinearGradientBrush(disc, day ? Color.FromArgb(0xcf, 0xd6, 0xd7) : Color.FromArgb(0x19, 0x1e, 0x1f), day ? Color.FromArgb(0xb4, 0xbc, 0xbe) : Color.FromArgb(0x0b, 0x0f, 0x10), 90f)) g.FillEllipse(body, disc);
                        var tone = day ? Color.FromArgb(0x0b, 0x85, 0x79) : accent;
                        using (var ring = new Pen(bright ? tone : Color.FromArgb(day ? 150 : 110, tone), Math.Max(1.5f, dia / 34f))) g.DrawEllipse(ring, disc);
                        if (waiting)
                            using (var arc = new Pen(accent, Math.Max(2f, 2.6f * k)) { StartCap = LineCap.Round, EndCap = LineCap.Round })
                            { float ra = r + 4.5f * k; g.DrawArc(arc, centre - ra, centre - ra, ra * 2, ra * 2, (float)spin, 100f); }
                        if (mark != null) { float w = dia * .66f * (float)scale, h = w * mark.Height / mark.Width; g.DrawImage(mark, centre - w / 2, centre - h / 2, w, h); }
                    }
                    Layered(bmp);
                }
            }

            void Layered(Bitmap bmp)
            {
                IntPtr screen = GetDC(IntPtr.Zero), memory = CreateCompatibleDC(screen), hbitmap = bmp.GetHbitmap(Color.FromArgb(0)), old = SelectObject(memory, hbitmap);
                try
                {
                    var size = new SIZE { cx = bmp.Width, cy = bmp.Height };
                    var source = new Native.POINT();
                    var top = new Native.POINT { X = Left, Y = Top };
                    var blend = new BLENDFUNCTION { BlendOp = 0, SourceConstantAlpha = 255, AlphaFormat = 1 };
                    UpdateLayeredWindow(Handle, screen, ref top, ref size, memory, ref source, 0, ref blend, 2);
                }
                finally { SelectObject(memory, old); DeleteObject(hbitmap); DeleteDC(memory); ReleaseDC(IntPtr.Zero, screen); }
            }

            protected override void OnMouseDown(MouseEventArgs e)
            {
                if (e.Button != MouseButtons.Left) return;
                glide.Stop();
                down = Cursor.Position;
                start = Location;
                moving = false;
                pressed = true;
                Capture = true;
                Kick();
            }

            protected override void OnMouseMove(MouseEventArgs e)
            {
                if (!hover) { hover = true; Draw(); }
                // Only a press that began on the button moves it: a button held down elsewhere and passing over it does nothing.
                if (!pressed) return;
                // A release that never reached the button (the focus moved while it was held) must not leave it following the pointer.
                if ((Control.MouseButtons & MouseButtons.Left) == 0) { Settle(); return; }
                var p = Cursor.Position;
                // A click that slips by a few pixels stays a click.
                if (!moving && Math.Sqrt(Math.Pow(p.X - down.X, 2) + Math.Pow(p.Y - down.Y, 2)) < 10 * Scale(down)) return;
                if (!moving) { moving = true; Kick(); }
                Location = new Point(start.X + p.X - down.X, start.Y + p.Y - down.Y);
            }

            protected override void OnMouseLeave(EventArgs e) { hover = false; Draw(); }

            // Lost while it is held (a lock screen, an Alt + Tab): it is let go where it is, not left stuck.
            protected override void OnMouseCaptureChanged(EventArgs e)
            {
                base.OnMouseCaptureChanged(e);
                if (pressed && !Capture) Settle();
            }

            // The press is over without a release: it ends where it is, and a carried button is put down.
            public void Settle()
            {
                if (!pressed) return;
                pressed = false;
                Capture = false;
                Kick();
                if (moving) { moving = false; Moved(Location); }
            }

            protected override void OnMouseUp(MouseEventArgs e)
            {
                bool was = pressed;
                pressed = false;
                Capture = false;
                Kick();
                if (e.Button == MouseButtons.Right) { Program.OpenSettings(); return; }
                // The press that closes the window only reaches the window, so this click answers with a dip and the ripple of any other click.
                if (e.Button == MouseButtons.Left && !was) { velocity = -3; Ripple(); return; }
                if (e.Button != MouseButtons.Left) return;
                if (moving) { moving = false; Moved(Location); return; }
                Ripple();
                if (opening) return;
                // A click on the button while the window is open closes it: the window already hid itself when it lost the focus.
                if (popup != null && popup.Visible) popup.Hide();
                else if ((DateTime.Now - hiddenAt).TotalMilliseconds > 300) Open(null);
            }

            [StructLayout(LayoutKind.Sequential)] struct SIZE { public int cx, cy; }
            [StructLayout(LayoutKind.Sequential, Pack = 1)] struct BLENDFUNCTION { public byte BlendOp, BlendFlags, SourceConstantAlpha, AlphaFormat; }
            [DllImport("user32.dll")] static extern bool UpdateLayeredWindow(IntPtr hwnd, IntPtr dst, ref Native.POINT pptDst, ref SIZE psize, IntPtr src, ref Native.POINT pptSrc, int key, ref BLENDFUNCTION blend, int flags);
            [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr hwnd);
            [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr hwnd, IntPtr dc);
            [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr dc);
            [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);
            [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc, IntPtr obj);
            [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);
        }
    }
}
