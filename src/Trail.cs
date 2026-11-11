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
            string cursor = Mouse.ThemeName, found;
            return cursor != null && Match.TryGetValue(cursor, out found) ? found : "bubbles-abyss";
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
            return new { kind = Program.R.Trail ?? "auto", effective = Effective(), density = Program.R.TrailDensity, duration = Program.R.TrailDuration, click = Program.R.TrailClick };
        }

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            object v;
            if (action == "previews") { SendPreviews(); return false; }
            if (action == "set"&& m.TryGetValue("kind", out v))
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

        // A still of each trail, drawn by its own recipe along an S stroke, for the picker. Made once, on first ask.
        static Dictionary<string, string> previews;
        public static void SendPreviews()
        {
            if (previews == null)
            {
                previews = new Dictionary<string, string>();
                const int W = 232, H = 104;
                foreach (string kind in Kinds)
                {
                    var r = TrailRecipe.Make(kind);
                    r.Scale = 2.6f; r.Density = 3; r.Duration = 1.5f;
                    // Drawn twice as high as the tile, then framed on the weight of the drawing: bubbles rise, confetti falls.
                    using (var tall = new Bitmap(W, H * 2, PixelFormat.Format32bppPArgb))
                    using (var bmp = new Bitmap(W, H, PixelFormat.Format32bppPArgb))
                    using (var g = Graphics.FromImage(tall))
                    {
                        g.SmoothingMode = SmoothingMode.AntiAlias;
                        PointF prev = new PointF(22, H * 1.12f);
                        double now = 0;
                        for (int i = 1; i <= 40; i++)
                        {
                            now += 16;
                            float t = i / 40f;
                            var p = new PointF(22 + t * (W - 64), H + (float)Math.Sin(t * Math.PI * 1.6 + .5) * H * .2f);
                            r.Move(p, prev, (float)(Math.Sqrt(Math.Pow(p.X - prev.X, 2) + Math.Pow(p.Y - prev.Y, 2)) / 2.6 / 16), now);
                            r.LastMove = now;
                            prev = p;
                            g.Clear(Color.Transparent);
                            r.Draw(g, 16, now);
                        }
                        for (int i = 0; i < 6; i++) { now += 16; g.Clear(Color.Transparent); r.Draw(g, 16, now); }
                        var data = tall.LockBits(new Rectangle(0, 0, W, H * 2), ImageLockMode.ReadOnly, PixelFormat.Format32bppPArgb);
                        var pixels = new byte[data.Stride * H * 2];
                        Marshal.Copy(data.Scan0, pixels, 0, pixels.Length);
                        tall.UnlockBits(data);
                        double weight = 0, sum = 0;
                        for (int y = 0; y < H * 2; y++)
                            for (int x = 0; x < W; x += 2) { int a = pixels[y * data.Stride + x * 4 + 3]; weight += a; sum += a * y; }
                        int top = weight > 0 ? (int)Math.Max(0, Math.Min(H, sum / weight - H / 2)) : H / 2;
                        using (var gg = Graphics.FromImage(bmp)) gg.DrawImage(tall, new Rectangle(0, 0, W, H), new Rectangle(0, top, W, H), GraphicsUnit.Pixel);
                        using (var ms = new System.IO.MemoryStream())
                        {
                            bmp.Save(ms, ImageFormat.Png);
                            previews[kind] = "data:image/png;base64," + Convert.ToBase64String(ms.ToArray());
                        }
                    }
                }
            }
            Program.Send(new { type = "trail.previews", previews = previews });
        }

        // The cursor changed: a trail that follows the cursor follows it.
        public static void CursorChanged() { if ((Program.R.Trail ?? "auto") == "auto") Apply(); }
    }

    class TrailWindow : Form
    {
        const int Box = 640;
        readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
        readonly Stopwatch clock = Stopwatch.StartNew();
        TrailRecipe recipe;
        Point last;
        bool down, shown, paused, saver;
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
            try { SetWindowDisplayAffinity(Handle, 0x11); } catch (Exception ex) { Program.Log(ex); }
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
            recipe.Density = density;
            recipe.Duration = duration;
            recipe.ClickFx = click;
            timer.Interval = 33;
            timer.Start();
        }

        public void Stop() { timer.Stop(); if (shown) { ShowWindow(Handle, 0); shown = false; } }

        protected override void Dispose(bool disposing)
        {
            timer.Stop();
            Release();
            probe.Dispose();
            base.Dispose(disposing);
        }

        double Now { get { return clock.Elapsed.TotalMilliseconds; } }

        void Tick()
        {
            double now = Now;
            if (now - lastCheck > 2000) { lastCheck = now; paused = Paused(); saver = Saver(); }
            var p = Cursor.Position;
            bool pressed = (GetAsyncKeyState(0x01) & 0x8000) != 0;
            if (paused) { recipe.Clear(); if (shown) { ShowWindow(Handle, 0); shown = false; } last = p; down = pressed; timer.Interval = 100; return; }
            float k = (float)Arrange.Scale(Screen.FromPoint(p));
            recipe.Scale = k;
            if (p != last)
            {
                double dt = Math.Max(1, now - lastFrame);
                recipe.Move(new PointF(p.X, p.Y), new PointF(last.X, last.Y), (float)(Math.Sqrt(Math.Pow(p.X - last.X, 2) + Math.Pow(p.Y - last.Y, 2)) / k / Math.Max(16, dt)), now);
                lastMove = now;
                recipe.LastMove = now;
            }
            if (pressed && !down && recipe.ClickFx) recipe.Click(new PointF(p.X, p.Y), now);
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
            if (now - lastSample > 500) { lastSample = now; Sample(p); }
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
        struct SYSTEM_POWER_STATUS { public byte ACLineStatus, BatteryFlag, BatteryLifePercent, SystemStatusFlag; public int BatteryLifeTime, BatteryFullLifeTime; }
        [DllImport("kernel32.dll")] static extern bool GetSystemPowerStatus(out SYSTEM_POWER_STATUS status);
        [DllImport("gdi32.dll")] static extern IntPtr CreateDIBSection(IntPtr dc, ref BITMAPINFOHEADER info, uint usage, out IntPtr bits, IntPtr section, uint offset);
        [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr dc);
        [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc, IntPtr obj);
        [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);
        [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);
    }
}
