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

namespace Bramble
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
        static string tab = "note";
        static DateTime hiddenAt;
        static bool aside;

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
            refresh.Tick += (s, e) => { if (popup != null && popup.Visible && tab == "dashboard") SendData(); };
            Capture.Busy += Aside;
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
            return new { on = S.On, hidden = S.Hidden, capture = key("capture", S.Capture), note = key("note", S.Note), toggle = key("toggle", S.Toggle) };
        }

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            switch (action)
            {
                case "set": Enable(Convert.ToBoolean(m["on"])); return true;
                case "show": S.Hidden = false; Save(); Apply(); return true;
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

        // Stays where it was put; out of the way when a window fills that screen.
        // A capture must not show the companion itself.
        static void Aside(bool away)
        {
            aside = away;
            if (away) { if (dot != null && dot.Visible) dot.Hide(); }
            else Place();
        }

        static void Place()
        {
            if (dot == null || dot.IsDisposed || !S.On || S.Hidden || aside) return;
            var screen = Screen.FromPoint(S.X == int.MinValue ? new Point(Screen.PrimaryScreen.WorkingArea.Right - 1, Screen.PrimaryScreen.WorkingArea.Top) : new Point(S.X, S.Y));
            var area = screen.WorkingArea;
            int side = dot.Side;
            if (S.X == int.MinValue) { S.X = area.Right - side - 8; S.Y = area.Top + area.Height * 3 / 5; }
            var at = new Point(Math.Max(area.Left, Math.Min(area.Right - side, S.X)), Math.Max(area.Top, Math.Min(area.Bottom - side, S.Y)));
            bool covered = false;
            IntPtr active = Native.GetForegroundWindow();
            if (active != IntPtr.Zero && !Desktop.IsDesktop(active) && !(popup != null && active == popup.Handle))
            {
                Native.RECT r;
                if (Native.GetWindowRect(active, out r) && Rectangle.FromLTRB(r.Left, r.Top, r.Right, r.Bottom).Contains(screen.Bounds)) covered = true;
            }
            if (covered) { if (dot.Visible) dot.Hide(); return; }
            if (!dot.Gliding && (!dot.Visible || dot.Location != at || dot.Width != side)) dot.Put(at);
        }

        static void Moved(Point p)
        {
            int side = dot.Side;
            var area = Screen.FromPoint(new Point(p.X + side / 2, p.Y + side / 2)).WorkingArea;
            // It stays where it is let go, kept inside the screen; close to an edge, it settles a few pixels from it.
            int margin = (int)(8 * Arrange.Scale(Screen.FromPoint(p))), x = Math.Max(area.Left, Math.Min(area.Right - side, p.X)), y = Math.Max(area.Top, Math.Min(area.Bottom - side, p.Y));
            if (x - area.Left < margin * 3) x = area.Left + margin;
            if (area.Right - side - x < margin * 3) x = area.Right - side - margin;
            if (y - area.Top < margin * 3) y = area.Top + margin;
            if (area.Bottom - side - y < margin * 3) y = area.Bottom - side - margin;
            S.X = x; S.Y = y;
            Save();
            dot.GlideTo(new Point(x, y));
        }

        public static async void Open(string which)
        {
            tab = which ?? tab;
            if (popup == null || popup.IsDisposed)
            {
                popup = new PageForm("companion.html", FromPage)
                {
                    FormBorderStyle = FormBorderStyle.None, ShowInTaskbar = false, TopMost = true, StartPosition = FormStartPosition.Manual, Text = "Bramble",
                };
                popup.Deactivate += (s, e) => { if (popup != null) { popup.Hide(); hiddenAt = DateTime.Now; idle.Start(); refresh.Stop(); } };
                popup.Shown += (s, e) => Native.Rounded(popup.Handle);
                Position();
                popup.Show();
                await popup.Open();
            }
            else { Position(); popup.Show(); }
            idle.Stop();
            refresh.Start();
            popup.Activate();
            SendData(true);
        }

        static void Position()
        {
            var anchor = dot != null && dot.Visible ? dot.Bounds : new Rectangle(Cursor.Position, Size.Empty);
            var screen = Screen.FromPoint(anchor.Location);
            double k = Arrange.Scale(screen);
            int w = (int)(380 * k), h = (int)(560 * k), gap = (int)(10 * k);
            var area = screen.WorkingArea;
            int x = anchor.Left + anchor.Width / 2 > area.Left + area.Width / 2 ? anchor.Left - w - gap : anchor.Right + gap;
            int y = anchor.Top + anchor.Height / 2 - h / 2;
            popup.Bounds = new Rectangle(Math.Max(area.Left, Math.Min(area.Right - w, x)), Math.Max(area.Top, Math.Min(area.Bottom - h, y)), w, h);
        }

        static void SendData(bool open = false)
        {
            if (popup == null) return;
            if (cpu == null) try { cpu = new PerformanceCounter("Processor Information", "% Processor Utility", "_Total"); cpu.NextValue(); } catch (Exception ex) { Program.Log(ex); }
            float processor = 0;
            try { if (cpu != null) processor = Math.Min(100, cpu.NextValue()); } catch { }
            var info = new Microsoft.VisualBasic.Devices.ComputerInfo();
            double memory = 100.0 * (info.TotalPhysicalMemory - info.AvailablePhysicalMemory) / info.TotalPhysicalMemory;
            var theme = Moods.Active();
            popup.Send(new
            {
                type = "companion.data", tab, open, language = Language.Code,
                processor = Math.Round(processor), memory = Math.Round(memory), busiest = Health.Busiest,
                theme = theme == null ? null : theme.Name, output = AudioDevices.NameOf(AudioDevices.DefaultOutput()),
                claude = ClaudeUsage.State(), notes = Notes.Items().Take(3).ToArray(), captures = Shelf.Items().Take(3).ToArray(),
            });
        }

        static string Text(Dictionary<string, object> m, string key) { return m.ContainsKey(key) && m[key] != null ? Convert.ToString(m[key]) : ""; }

        static void FromPage(Dictionary<string, object> m)
        {
            string action = Text(m, "action");
            switch (action)
            {
                case "companion.ready": SendData(); return;
                case "companion.tab": tab = Text(m, "tab"); SendData(); return;
                case "companion.close": popup.Hide(); return;
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

        // A round window drawn with its own alpha, so its edge has no jagged pixels on any wallpaper.
        class Dot : Form
        {
            readonly Image logo;
            Point down, start;
            bool moving, hover;

            const int Diameter = 64;
            readonly Timer glide = new Timer { Interval = 15 };
            Point glideFrom, glideTo;
            DateTime glideAt;

            public int Side { get { return (int)(Diameter * Arrange.Scale(Screen.FromPoint(Location))); } }
            public bool Gliding { get { return glide.Enabled; } }

            public Dot()
            {
                FormBorderStyle = FormBorderStyle.None;
                StartPosition = FormStartPosition.Manual;
                ShowInTaskbar = false;
                TopMost = true;
                AutoScaleMode = AutoScaleMode.None;
                try { logo = Image.FromFile(Path.Combine(Program.Root, "brand", "logo", "logo-bramble-192.png")); } catch (Exception ex) { Program.Log(ex); }
                Cursor = Cursors.Hand;
                new ToolTip { InitialDelay = 700 }.SetToolTip(this, Language.T("Bramble: click to open, drag to move, right-click for the app"));
                glide.Tick += (s, e) =>
                {
                    double t = Math.Min(1, (DateTime.Now - glideAt).TotalMilliseconds / 180), k = 1 - Math.Pow(1 - t, 3);
                    Location = new Point(glideFrom.X + (int)Math.Round((glideTo.X - glideFrom.X) * k), glideFrom.Y + (int)Math.Round((glideTo.Y - glideFrom.Y) * k));
                    if (t >= 1) glide.Stop();
                };
            }

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
                int side = (int)(Diameter * Arrange.Scale(Screen.FromPoint(at)));
                Bounds = new Rectangle(at, new Size(side, side));
                if (!Visible) Show();
                Draw();
            }

            void Draw()
            {
                int side = Width;
                using (var bmp = new Bitmap(side, side, PixelFormat.Format32bppArgb))
                {
                    using (var g = Graphics.FromImage(bmp))
                    {
                        g.SmoothingMode = SmoothingMode.AntiAlias;
                        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                        var disc = new RectangleF(1.5f, 1.5f, side - 3, side - 3);
                        using (var shadow = new SolidBrush(Color.FromArgb(70, 0, 0, 0))) g.FillEllipse(shadow, 0, 1.5f, side - 1, side - 1.5f);
                        using (var body = new LinearGradientBrush(disc, Color.FromArgb(0x24, 0x22, 0x30), Color.FromArgb(0x12, 0x12, 0x18), 90f)) g.FillEllipse(body, disc);
                        using (var ring = new Pen(hover ? Color.FromArgb(0x95, 0x61, 0xf3) : Color.FromArgb(110, 0x95, 0x61, 0xf3), Math.Max(1.5f, side / 34f))) g.DrawEllipse(ring, disc);
                        if (logo != null) { float l = side * .64f; g.DrawImage(logo, (side - l) / 2, (side - l) / 2 + side * .01f, l, l); }
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
                Capture = true;
            }

            protected override void OnMouseMove(MouseEventArgs e)
            {
                if (!hover) { hover = true; Draw(); }
                if (e.Button != MouseButtons.Left) return;
                var p = Cursor.Position;
                if (!moving && Math.Abs(p.X - down.X) + Math.Abs(p.Y - down.Y) < 5) return;
                moving = true;
                Location = new Point(start.X + p.X - down.X, start.Y + p.Y - down.Y);
            }

            protected override void OnMouseLeave(EventArgs e) { hover = false; Draw(); }

            protected override void OnMouseUp(MouseEventArgs e)
            {
                Capture = false;
                if (e.Button == MouseButtons.Right) { Program.OpenSettings(); return; }
                if (e.Button != MouseButtons.Left) return;
                if (moving) { moving = false; Moved(Location); return; }
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
