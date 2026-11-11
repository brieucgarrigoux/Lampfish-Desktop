using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Linq;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace Lampfish
{
    // The trails of the special edition: particles drawn behind the pointer by a small window that lets every click through.
    // It only covers a square around the pointer and follows it; it draws while the pointer moves and the particles live,
    // then hides and only watches the pointer. Paused in full screen on the pointer's screen and when Windows
    // asks for less motion. Never in a screen capture or a screen share.
    static class Trail
    {
        public static readonly string[] Kinds =
        {
            "bubbles-gold", "bubbles-abyss", "bubbles-pearl", "bubbles-prism", "bubbles-soap",
            "plankton-abyss", "plankton-gold", "plankton-berry", "constellation", "sparkles-gold", "sparkles-silver", "sparkles-rose",
            "school", "ribbon-lagoon", "ribbon-sunset", "ripples", "snow",
            "neon-pink", "neon-teal", "comet", "pearls", "pearls-gold", "sequins", "confetti", "halftone", "ink",
        };

        // The trail a cursor family suggests when the setting is Matching the cursor.
        static readonly Dictionary<string, string> Match = new Dictionary<string, string>
        {
            { "lampfish Lure Gold", "bubbles-gold" }, { "lampfish Lure Abyss", "bubbles-abyss" }, { "lampfish Lure Pearl", "bubbles-pearl" }, { "lampfish Lure Prism", "bubbles-prism" },
            { "lampfish Bubble", "bubbles-soap" }, { "lampfish Photophore Abyss", "plankton-abyss" }, { "lampfish Photophore Gold", "plankton-gold" },
            { "lampfish Photophore Berry", "plankton-berry" }, { "lampfish Photophore Ember", "constellation" }, { "lampfish Gold Pure", "sparkles-gold" },
            { "lampfish Metal Silver", "sparkles-silver" }, { "lampfish Metal Rose Gold", "sparkles-rose" }, { "lampfish Deep Lagoon", "ribbon-lagoon" },
            { "lampfish Deep Sunset", "ribbon-sunset" }, { "lampfish Deep Midnight", "ripples" }, { "lampfish Nacre Black Pearl", "snow" },
            { "lampfish Neon Pink", "neon-pink" }, { "lampfish Neon Teal", "neon-teal" }, { "lampfish Nacre Pearl", "pearls" }, { "lampfish Gold Black", "pearls-gold" },
            { "lampfish Scale", "sequins" }, { "lampfish Origami", "confetti" }, { "lampfish Riso", "halftone" }, { "lampfish Metal Black Chrome", "ink" },
        };

        static TrailWindow window;

        public static string Effective()
        {
            string k = Program.R.Trail ?? "auto";
            if (!Vip.Unlocked || k.Length == 0) return null;
            if (k != "auto") return Kinds.Contains(k) ? k : null;
            // Only a lampfish family has a trail of its own: Windows, Bramble and the user's themes come without one.
            string cursor = Mouse.ThemeName, found;
            if (cursor == null || !cursor.StartsWith("lampfish ", StringComparison.Ordinal)) return null;
            return Match.TryGetValue(cursor, out found) ? found : "bubbles-abyss";
        }

        public static void Start() { Apply(); }

        public static void Apply()
        {
            string kind = Effective();
            if (kind == null) { if (window != null) { window.Stop(); window.Dispose(); window = null; } return; }
            if (window == null) window = new TrailWindow();
            // settings.json can be edited by hand: a value out of range would freeze a recipe or break its colours.
            Program.R.TrailDensity = Clamp(Program.R.TrailDensity, .4, 2);
            Program.R.TrailDuration = Clamp(Program.R.TrailDuration, .5, 2);
            window.Use(kind, (float)Program.R.TrailDensity, (float)Program.R.TrailDuration, Program.R.TrailClick);
        }

        static double Clamp(double v, double min, double max) { return double.IsNaN(v) ? 1 : Math.Max(min, Math.Min(max, v)); }

        public static object State()
        {
            return new { excluded = Program.R.TrailExcluded ?? new List<string>(), kind = Program.R.Trail ?? "auto", effective = Effective(), density = Program.R.TrailDensity, duration = Program.R.TrailDuration, click = Program.R.TrailClick };
        }

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            object v;
            // A preview of the gallery is under the pointer: the real trail would draw a second one on top of it.
            if (action == "preview") { PreviewUntil = m.ContainsKey("on") && Convert.ToBoolean(m["on"]) ? DateTime.UtcNow.AddSeconds(2) : DateTime.MinValue; return false; }
            // Apps where the trail goes quiet (M8.2): picked as a program, kept by name.
            if (action == "exclude")
            {
                using (var dialog = new System.Windows.Forms.OpenFileDialog { Filter = Language.T("Programs") + "|*.exe", Title = Language.T("An app where the trail goes quiet") })
                {
                    if (dialog.ShowDialog(Program.SettingsWindow) != System.Windows.Forms.DialogResult.OK) return false;
                    string name = System.IO.Path.GetFileNameWithoutExtension(dialog.FileName).ToLowerInvariant();
                    var list = Program.R.TrailExcluded ?? new List<string>();
                    if (!list.Contains(name)) list.Add(name);
                    Program.R.TrailExcluded = list.Take(40).ToList();
                }
                return true;
            }
            if (action == "include" && m.TryGetValue("name", out v)) { if (Program.R.TrailExcluded != null) Program.R.TrailExcluded.Remove(v as string); return true; }
            if (action == "set" && m.TryGetValue("kind", out v))
            {
                string k = v as string ?? "";
                if (k.Length > 0 && k != "auto" && !Kinds.Contains(k)) return false;
                Program.R.Trail = k;
            }
            else if (action == "adjust" && m.TryGetValue("what", out v) && m.ContainsKey("value"))
            {
                string what = v as string;
                if (what == "density") Program.R.TrailDensity = Math.Max(.4, Math.Min(2, Convert.ToDouble(m["value"])));
                else if (what == "duration") Program.R.TrailDuration = Math.Max(.5, Math.Min(2, Convert.ToDouble(m["value"])));
                else if (what == "click") Program.R.TrailClick = Convert.ToBoolean(m["value"]);
                else return false;
            }
            else return false;
            Apply();
            return true;
        }

        public static DateTime PreviewUntil = DateTime.MinValue;

        // A cursor theme chosen in Mouse brings its own trail back (R86), even after another trail or Off was picked.
        public static void FollowCursor()
        {
            if (!Vip.Unlocked || Program.R.Trail == "auto") return;
            Program.R.Trail = "auto";
            Apply();
        }

        // The cursor changed: a trail that follows the cursor follows it.
        public static void CursorChanged() { if ((Program.R.Trail ?? "auto") == "auto") Apply(); }
    }

    class TrailWindow : Form
    {
        // The square grows with the largest scale of the screens: at 200 % a long trail needs twice the room (M3.5).
        static readonly int Box = Math.Min(1280, (int)(640 * Math.Max(1, System.Windows.Forms.Screen.AllScreens.Max(x => Arrange.Scale(x)))) / 4 * 4);
        readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
        readonly Stopwatch clock = Stopwatch.StartNew();
        TrailRecipe recipe;
        Point last;
        const uint RawSize = 64;
        IntPtr raw = Marshal.AllocHGlobal((int)RawSize);
        bool down, shown, paused, saver, charged;
        double pressAt;
        Point pressPoint;
        float density = 1;
        double lastMove = -10000, lastFrame, lastCheck = -10000;
        Point origin;
        Bitmap frame;
        IntPtr dib, dibDC, dibOld;

        public TrailWindow()
        {
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            TopMost = true;
            Size = new Size(Box, Box);
            timer.Tick += (s, e) => Tick();
            CreateHandle();
            // Like the pointer itself, the trail is never in a screenshot, a recording or a shared screen (Windows 10 2004 and later).
            // Before 2004 the same call blanks the window in captures instead of leaving it out: a grey square would show.
            if (Native.Build >= 19041) try { SetWindowDisplayAffinity(Handle, 0x11); } catch (Exception ex) { Program.Log(ex); }
            // The wheel cannot be polled: Raw Input reads it, read only and without a hook, as Microsoft advises.
            try { var device = new RAWINPUTDEVICE { usUsagePage = 1, usUsage = 2, dwFlags = 0x100, hwndTarget = Handle }; RegisterRawInputDevices(new[] { device }, 1, (uint)Marshal.SizeOf(typeof(RAWINPUTDEVICE))); }
            catch (Exception ex) { Program.Log(ex); }
            last = Cursor.Position;
        }

        protected override bool ShowWithoutActivation { get { return true; } }

        protected override CreateParams CreateParams
        {
            get { var p = base.CreateParams; p.ExStyle |= Native.WS_EX_LAYERED | 0x20 | Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE | 0x8; return p; }
        }

        public void Use(string kind, float density, float duration, bool click)
        {
            if (recipe == null || recipe.Kind != kind) { bool light = recipe != null && recipe.Light; recipe = TrailRecipe.Make(kind); recipe.Light = light; }
            this.density = density;
            recipe.Density = density;
            recipe.Duration = duration;
            recipe.ClickFx = click;
            timer.Interval = 33;
            timer.Start();
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == 0x00FF && recipe != null && !paused && DateTime.UtcNow >= Trail.PreviewUntil)
            {
                uint size = RawSize, got = GetRawInputData(m.LParam, 0x10000003, raw, ref size, (uint)(IntPtr.Size == 8 ? 24 : 16));
                int head = IntPtr.Size == 8 ? 24 : 16;
                if (got != uint.MaxValue && got >= head + 8 && Marshal.ReadInt32(raw) == 0)
                {
                    ushort flags = (ushort)Marshal.ReadInt16(raw, head + 4);
                    short data = Marshal.ReadInt16(raw, head + 6);
                    if ((flags & 0x0400) != 0 && data != 0)
                    {
                        var p = Cursor.Position;
                        recipe.Scale = (float)Arrange.Scale(Screen.FromPoint(p));
                        recipe.Wheel(new PointF(p.X, p.Y), data > 0, Now);
                        lastMove = Now;
                        timer.Interval = saver ? 33 : 16;
                    }
                }
            }
            base.WndProc(ref m);
        }

        public void Stop() { timer.Stop(); if (shown) { ShowWindow(Handle, 0); shown = false; } }

        protected override void Dispose(bool disposing)
        {
            timer.Stop();
            Release();
            probe.Dispose();
            try { var device = new RAWINPUTDEVICE { usUsagePage = 1, usUsage = 2, dwFlags = 0x1, hwndTarget = IntPtr.Zero }; RegisterRawInputDevices(new[] { device }, 1, (uint)Marshal.SizeOf(typeof(RAWINPUTDEVICE))); } catch { }
            if (raw != IntPtr.Zero) { Marshal.FreeHGlobal(raw); raw = IntPtr.Zero; }
            base.Dispose(disposing);
        }

        double Now { get { return clock.Elapsed.TotalMilliseconds; } }

        void Tick()
        {
            double now = Now;
            if (now - lastCheck > 2000) { lastCheck = now; paused = Paused(); saver = Saver(); }
            var p = Cursor.Position;
            // GetAsyncKeyState reads the physical button: with swapped buttons the primary click is the right one.
            bool pressed = (GetAsyncKeyState(GetSystemMetrics(23) != 0 ? 0x02 : 0x01) & 0x8000) != 0;
            if (paused || DateTime.UtcNow < Trail.PreviewUntil) { recipe.Clear(); if (shown) { ShowWindow(Handle, 0); shown = false; } last = p; down = pressed; timer.Interval = paused ? 100 : 33; return; }
            float k = (float)Arrange.Scale(Screen.FromPoint(p));
            recipe.Scale = k;
            if (p != last)
            {
                double dt = Math.Max(1, now - lastFrame);
                recipe.Move(new PointF(p.X, p.Y), new PointF(last.X, last.Y), (float)(Math.Sqrt(Math.Pow(p.X - last.X, 2) + Math.Pow(p.Y - last.Y, 2)) / k / Math.Max(16, dt)), now);
                lastMove = now;
                recipe.LastMove = now;
            }
            if (pressed && !down) { pressAt = now; pressPoint = p; charged = false; }
            if (pressed && !down && recipe.ClickFx) recipe.Click(new PointF(p.X, p.Y), now);
            // A long press charges a second effect (M8.1); a drag leaves a denser trail.
            if (pressed && !charged && recipe.ClickFx && now - pressAt > 650 && Math.Abs(p.X - pressPoint.X) + Math.Abs(p.Y - pressPoint.Y) < 8 * k) { charged = true; recipe.Click(new PointF(p.X, p.Y), now); }
            recipe.Density = pressed && p != last ? density * 1.8f : density;
            down = pressed;
            last = p;
            bool busy = recipe.Alive || now - lastMove < 600;
            if (!busy)
            {
                if (shown) { ShowWindow(Handle, 0); shown = false; }
                timer.Interval = 33;
                lastFrame = now;
                return;
            }
            timer.Interval = saver ? 33 : 16;
            // Reading the screen makes Windows wait for the graphics card: done when the pointer reaches another window, at most
            // every 3 s, so moving it never stutters.
            if (now - lastSample > 3000) { IntPtr under = GetAncestor(WindowFromPoint(new Native.POINT { X = p.X, Y = p.Y }), 2); if (under != lastUnder) { lastUnder = under; lastSample = now; Sample(p); } }
            // The square follows the pointer; the particles live in screen coordinates and are drawn shifted by its corner.
            int half = Box / 2;
            if (!shown || Math.Abs(p.X - (origin.X + half)) > Box / 4 || Math.Abs(p.Y - (origin.Y + half)) > Box / 4) origin = new Point(p.X - half, p.Y - half);
            Draw((float)Math.Min(50, now - lastFrame), now);
            lastFrame = now;
        }

        // On a pale window the dark-screen colours vanish, so the recipe switches to its ink colours. The window is out of
        // captures, so the copy only sees what is under it. Two thresholds, so a grey area does not make it flicker.
        readonly Bitmap probe = new Bitmap(24, 24, PixelFormat.Format32bppArgb);
        double lastSample = -10000;
        IntPtr lastUnder = IntPtr.Zero;
        void Sample(Point p)
        {
            try
            {
                using (var g = Graphics.FromImage(probe)) g.CopyFromScreen(p.X - 12, p.Y + 4, 0, 0, probe.Size);
                double sum = 0;
                for (int y = 0; y < 24; y += 4)
                    for (int x = 0; x < 24; x += 4) { var c = probe.GetPixel(x, y); sum += (.2126 * c.R + .7152 * c.G + .0722 * c.B) / 255; }
                double l = sum / 36;
                if (l > .62) recipe.Light = true;
                else if (l < .48) recipe.Light = false;
            }
            catch { }
        }

        // With the energy saver on, the trail keeps going at half the frame rate rather than vanishing.
        static bool Saver()
        {
            SYSTEM_POWER_STATUS power;
            return GetSystemPowerStatus(out power) && power.SystemStatusFlag == 1;
        }

        static bool Paused()
        {
            var quiet = Program.R.TrailExcluded;
            if (quiet != null && quiet.Count > 0)
            {
                uint pid;
                GetWindowThreadProcessId(Native.GetForegroundWindow(), out pid);
                try { if (pid != 0 && quiet.Contains(Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant())) return true; } catch { }
            }
            // A game or a player in a window that hides the pointer and keeps it in the middle would gather particles there.
            var info = new CURSORINFO { cbSize = Marshal.SizeOf(typeof(CURSORINFO)) };
            if (GetCursorInfo(ref info) && (info.flags & 1) == 0) return true;
            bool motion = true;
            SystemParametersInfo(0x1042, 0, ref motion, 0);
            if (!motion) return true;
            int state;
            if (SHQueryUserNotificationState(out state) == 0 && (state == 2 || state == 3 || state == 4))
            {
                if (state == 4) return true;
                Native.RECT r;
                IntPtr front = Native.GetForegroundWindow();
                if (front != IntPtr.Zero && Native.GetWindowRect(front, out r) && Screen.FromRectangle(Rectangle.FromLTRB(r.Left, r.Top, r.Right, r.Bottom)).Bounds == Screen.FromPoint(Cursor.Position).Bounds) return true;
            }
            return false;
        }

        void Draw(float dt, double now)
        {
            if (frame == null) Surface();
            using (var g = Graphics.FromImage(frame))
            {
                g.CompositingMode = CompositingMode.SourceCopy;
                g.Clear(Color.Transparent);
                g.CompositingMode = CompositingMode.SourceOver;
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.TranslateTransform(-origin.X, -origin.Y);
                recipe.Draw(g, dt, now);
            }
            IntPtr screen = GetDC(IntPtr.Zero);
            try
            {
                var size = new SIZE { cx = Box, cy = Box };
                var source = new Native.POINT();
                var top = new Native.POINT { X = origin.X, Y = origin.Y };
                var blend = new BLENDFUNCTION { BlendOp = 0, SourceConstantAlpha = 255, AlphaFormat = 1 };
                UpdateLayeredWindow(Handle, screen, ref top, ref size, dibDC, ref source, 0, ref blend, 2);
            }
            finally { ReleaseDC(IntPtr.Zero, screen); }
            if (!shown) { ShowWindow(Handle, 4); shown = true; }
        }

        void Surface()
        {
            var info = new BITMAPINFOHEADER { biSize = 40, biWidth = Box, biHeight = -Box, biPlanes = 1, biBitCount = 32 };
            IntPtr bits;
            dib = CreateDIBSection(IntPtr.Zero, ref info, 0, out bits, IntPtr.Zero, 0);
            dibDC = CreateCompatibleDC(IntPtr.Zero);
            dibOld = SelectObject(dibDC, dib);
            frame = new Bitmap(Box, Box, Box * 4, PixelFormat.Format32bppPArgb, bits);
        }

        void Release()
        {
            if (frame != null) { frame.Dispose(); frame = null; }
            if (dibDC != IntPtr.Zero) { SelectObject(dibDC, dibOld); DeleteDC(dibDC); dibDC = IntPtr.Zero; }
            if (dib != IntPtr.Zero) { DeleteObject(dib); dib = IntPtr.Zero; }
        }

        [StructLayout(LayoutKind.Sequential)] struct SIZE { public int cx, cy; }
        [StructLayout(LayoutKind.Sequential, Pack = 1)] struct BLENDFUNCTION { public byte BlendOp, BlendFlags, SourceConstantAlpha, AlphaFormat; }
        [StructLayout(LayoutKind.Sequential)] struct BITMAPINFOHEADER { public int biSize, biWidth, biHeight; public short biPlanes, biBitCount; public int biCompression, biSizeImage, biXPelsPerMeter, biYPelsPerMeter, biClrUsed, biClrImportant; }
        [DllImport("user32.dll")] static extern bool UpdateLayeredWindow(IntPtr hwnd, IntPtr dst, ref Native.POINT pptDst, ref SIZE psize, IntPtr src, ref Native.POINT pptSrc, int key, ref BLENDFUNCTION blend, int flags);
        [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr hwnd);
        [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr hwnd, IntPtr dc);
        [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd, int cmd);
        [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
        [DllImport("user32.dll")] static extern bool SetWindowDisplayAffinity(IntPtr hwnd, uint affinity);
        [DllImport("user32.dll")] static extern bool SystemParametersInfo(uint action, uint param, ref bool value, uint ini);
        [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int state);
        [StructLayout(LayoutKind.Sequential)] struct CURSORINFO { public int cbSize, flags; public IntPtr cursor; public Native.POINT position; }
        [DllImport("user32.dll")] static extern bool GetCursorInfo(ref CURSORINFO info);
        [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
        [StructLayout(LayoutKind.Sequential)] struct RAWINPUTDEVICE { public ushort usUsagePage, usUsage; public uint dwFlags; public IntPtr hwndTarget; }
        [DllImport("user32.dll")] static extern bool RegisterRawInputDevices(RAWINPUTDEVICE[] devices, uint count, uint size);
        [DllImport("user32.dll")] static extern uint GetRawInputData(IntPtr input, uint command, IntPtr data, ref uint size, uint header);
        [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
        [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Native.POINT point);
        [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
        struct SYSTEM_POWER_STATUS { public byte ACLineStatus, BatteryFlag, BatteryLifePercent, SystemStatusFlag; public int BatteryLifeTime, BatteryFullLifeTime; }
        [DllImport("kernel32.dll")] static extern bool GetSystemPowerStatus(out SYSTEM_POWER_STATUS status);
        [DllImport("gdi32.dll")] static extern IntPtr CreateDIBSection(IntPtr dc, ref BITMAPINFOHEADER info, uint usage, out IntPtr bits, IntPtr section, uint offset);
        [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr dc);
        [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc, IntPtr obj);
        [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);
        [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);
    }
}
