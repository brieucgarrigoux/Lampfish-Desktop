using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace Lampfish
{
    // Visibility and presentation (M7): a halo around the pointer, rings at each click (left and right in their own
    // colours), a large pointer while the mouse is shaken, the pointer hidden when idle, and a Presentation preset.
    // Unlike the trail, everything here is meant to be seen in a capture or a shared screen: it is free and plain.
    static class Spotlight
    {
        static AidWindow window;

        public static void Start()
        {
            Apply();
            Hotkeys.Register(Hotkeys.Halo, 2 | 1 | 4, 0x48, () => { Program.R.Halo = !Program.R.Halo; Apply(); Program.Save(); Program.SendState(); });
            Hotkeys.Register(Hotkeys.Trail, 2 | 1 | 4, 0x54, () =>
            {
                if (!Vip.Unlocked) return;
                if (Program.R.Trail == "") Program.R.Trail = Program.R.TrailLast;
                else { Program.R.TrailLast = Program.R.Trail; Program.R.Trail = ""; }
                Trail.Apply();
                Program.Save();
                Program.SendState();
            });
        }

        public static void Stop() { if (window != null) { window.Dispose(); window = null; } }

        static bool Needed { get { var r = Program.R; return r.Halo || r.ClickRings || r.Shake || r.HideIdle > 0; } }

        public static void Apply()
        {
            if (!Needed) { if (window != null) { window.Dispose(); window = null; } Mouse.EndTemp("hide"); Mouse.EndTemp("shake"); return; }
            if (window == null) window = new AidWindow();
            window.Start();
        }

        public static object State()
        {
            var r = Program.R;
            return new { halo = r.Halo, haloColor = r.HaloColor ?? "#2ed9c6", rings = r.ClickRings, left = r.ClickLeft ?? "#ffd166", right = r.ClickRight ?? "#a37bff", shake = r.Shake, hideIdle = r.HideIdle, presentation = r.Presentation };
        }

        static string Text(Dictionary<string, object> m, string key) { object v; return m.TryGetValue(key, out v) && v != null ? v.ToString() : null; }
        static bool Colour(string c) { return c != null && System.Text.RegularExpressions.Regex.IsMatch(c, "^#[0-9a-fA-F]{6}$"); }

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            var r = Program.R;
            if (action == "set" && m.ContainsKey("what") && m.ContainsKey("value"))
            {
                string what = Text(m, "what"), v = Text(m, "value");
                switch (what)
                {
                    case "halo": r.Halo = Convert.ToBoolean(m["value"]); break;
                    case "rings": r.ClickRings = Convert.ToBoolean(m["value"]); break;
                    case "shake": r.Shake = Convert.ToBoolean(m["value"]); break;
                    case "hideIdle": r.HideIdle = Math.Max(0, Math.Min(60, Convert.ToInt32(m["value"]))); break;
                    case "haloColor": if (!Colour(v)) return false; r.HaloColor = v; break;
                    case "left": if (!Colour(v)) return false; r.ClickLeft = v; break;
                    case "right": if (!Colour(v)) return false; r.ClickRight = v; break;
                    case "presentation": Present(Convert.ToBoolean(m["value"])); break;
                    default: return false;
                }
                Apply();
                return true;
            }
            return false;
        }

        // Presentation: halo and rings on, the decorative trail off, the pointer hidden after 3 s; then all as it was.
        static void Present(bool on)
        {
            var r = Program.R;
            if (on == r.Presentation) return;
            if (on)
            {
                r.PresentationBefore = new List<string> { r.Halo ? "1" : "0", r.ClickRings ? "1" : "0", r.HideIdle.ToString(), r.Trail ?? "\u0001" };
                r.Halo = true; r.ClickRings = true; r.HideIdle = 3;
                if (Vip.Unlocked) { r.Trail = ""; Trail.Apply(); }
            }
            else if (r.PresentationBefore != null && r.PresentationBefore.Count == 4)
            {
                var b = r.PresentationBefore;
                r.Halo = b[0] == "1"; r.ClickRings = b[1] == "1"; r.HideIdle = int.Parse(b[2]);
                if (Vip.Unlocked) { r.Trail = b[3] == "\u0001" ? null : b[3]; Trail.Apply(); }
                r.PresentationBefore = null;
            }
            r.Presentation = on;
        }

        // An empty cursor, written once, for the pointer hidden while idle.
        public static string BlankCursor()
        {
            string file = Path.Combine(Program.Root, "app", "blank.cur");
            if (File.Exists(file)) return file;
            using (var bmp = new Bitmap(32, 32, PixelFormat.Format32bppArgb))
            using (var ms = new MemoryStream())
            {
                bmp.Save(ms, ImageFormat.Png);
                byte[] png = ms.ToArray();
                using (var w = new BinaryWriter(File.Create(file)))
                {
                    w.Write((short)0); w.Write((short)2); w.Write((short)1);
                    w.Write((byte)32); w.Write((byte)32); w.Write((byte)0); w.Write((byte)0);
                    w.Write((short)0); w.Write((short)0); w.Write(png.Length); w.Write(22);
                    w.Write(png);
                }
            }
            return file;
        }
    }

    class AidWindow : Form
    {
        readonly int Box = (int)(240 * Math.Max(1, Screen.AllScreens.Max(s => Arrange.Scale(s)))) / 4 * 4;
        readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
        readonly Stopwatch clock = Stopwatch.StartNew();
        class Ring { public PointF P; public double T; public Color C; }
        readonly List<Ring> rings = new List<Ring>();
        readonly List<KeyValuePair<double, Point>> path = new List<KeyValuePair<double, Point>>();
        Point last, origin;
        bool leftDown, rightDown, shown, hidden, big;
        double lastMove, bigUntil;
        Bitmap frame;
        IntPtr dib, dibDC, dibOld;

        public AidWindow()
        {
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            TopMost = true;
            Size = new Size(Box, Box);
            timer.Interval = 16;
            timer.Tick += (s, e) => Tick();
            CreateHandle();
            last = Cursor.Position;
        }

        protected override bool ShowWithoutActivation { get { return true; } }
        protected override CreateParams CreateParams { get { var p = base.CreateParams; p.ExStyle |= Native.WS_EX_LAYERED | 0x20 | Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE | 0x8; return p; } }
        public void Start() { timer.Start(); }

        protected override void Dispose(bool disposing)
        {
            timer.Stop();
            if (frame != null) frame.Dispose();
            if (dibDC != IntPtr.Zero) { SelectObject(dibDC, dibOld); DeleteDC(dibDC); }
            if (dib != IntPtr.Zero) DeleteObject(dib);
            base.Dispose(disposing);
        }

        static Color Hex(string h, Color fallback) { try { return ColorTranslator.FromHtml(h); } catch { return fallback; } }

        void Tick()
        {
            var r = Program.R;
            double now = clock.Elapsed.TotalMilliseconds;
            var p = Cursor.Position;
            bool swapped = GetSystemMetrics(23) != 0;
            bool l = (GetAsyncKeyState(swapped ? 0x02 : 0x01) & 0x8000) != 0, rt = (GetAsyncKeyState(swapped ? 0x01 : 0x02) & 0x8000) != 0;
            bool moved = p != last;
            if (moved || l || rt) lastMove = now;
            if (r.ClickRings)
            {
                if (l && !leftDown) rings.Add(new Ring { P = p, T = now, C = Hex(r.ClickLeft, Color.Gold) });
                if (rt && !rightDown) rings.Add(new Ring { P = p, T = now, C = Hex(r.ClickRight, Color.MediumPurple) });
            }
            leftDown = l; rightDown = rt;

            // Shaken: four turns back within 600 ms make the pointer large for a moment, from any app.
            if (r.Shake && moved)
            {
                path.Add(new KeyValuePair<double, Point>(now, p));
                path.RemoveAll(x => now - x.Key > 600);
                int turns = 0; float run = 0;
                for (int i = 2; i < path.Count; i++)
                {
                    int a = path[i - 1].Value.X - path[i - 2].Value.X, b = path[i].Value.X - path[i - 1].Value.X;
                    run += Math.Abs(b);
                    if (Math.Sign(a) != 0 && Math.Sign(b) != 0 && Math.Sign(a) != Math.Sign(b) && Math.Abs(b) > 6) turns++;
                }
                if (turns >= 4 && run > 500 && !big && Mouse.TempOwner == null)
                {
                    int px = Math.Min(256, Math.Max(96, Mouse.EffectiveSize * 5 / 2));
                    if (Mouse.SetTemp("shake", Mouse.CurrentFile, px)) { big = true; bigUntil = now + 1400; path.Clear(); }
                }
            }
            if (big && now > bigUntil) { big = false; Mouse.EndTemp("shake"); }

            // Idle: the pointer goes after the delay, back at the first move.
            if (r.HideIdle > 0)
            {
                if (!hidden && now - lastMove > r.HideIdle * 1000 && Mouse.TempOwner == null) hidden = Mouse.SetTemp("hide", role => Spotlight.BlankCursor(), 32);
                else if (hidden && moved) { hidden = false; Mouse.EndTemp("hide"); }
            }
            else if (hidden) { hidden = false; Mouse.EndTemp("hide"); }
            last = p;

            rings.RemoveAll(x => now - x.T > 450);
            bool visible = (r.Halo && !hidden) || rings.Count > 0;
            if (!visible) { if (shown) { ShowWindow(Handle, 0); shown = false; } timer.Interval = 33; return; }
            timer.Interval = 16;
            if (!moved && rings.Count == 0 && shown && !l && !rt) return;
            origin = new Point(p.X - Box / 2, p.Y - Box / 2);
            Draw(p, now, r, l || rt);
        }

        void Draw(Point p, double now, Settings r, bool pressed)
        {
            if (frame == null)
            {
                var info = new BITMAPINFOHEADER { biSize = 40, biWidth = Box, biHeight = -Box, biPlanes = 1, biBitCount = 32 };
                IntPtr bits;
                dib = CreateDIBSection(IntPtr.Zero, ref info, 0, out bits, IntPtr.Zero, 0);
                dibDC = CreateCompatibleDC(IntPtr.Zero);
                dibOld = SelectObject(dibDC, dib);
                frame = new Bitmap(Box, Box, Box * 4, PixelFormat.Format32bppPArgb, bits);
            }
            float k = (float)Arrange.Scale(Screen.FromPoint(p));
            using (var g = Graphics.FromImage(frame))
            {
                g.CompositingMode = CompositingMode.SourceCopy;
                g.Clear(Color.Transparent);
                g.CompositingMode = CompositingMode.SourceOver;
                g.SmoothingMode = SmoothingMode.AntiAlias;
                float cx = Box / 2f, cy = Box / 2f;
                if (r.Halo)
                {
                    var c = Hex(r.HaloColor, Color.Turquoise);
                    float rad = (pressed ? 26 : 30) * k;
                    using (var b = new SolidBrush(Color.FromArgb(56, c))) g.FillEllipse(b, cx - rad, cy - rad, rad * 2, rad * 2);
                    using (var pen = new Pen(Color.FromArgb(200, c), 2 * k)) g.DrawEllipse(pen, cx - rad, cy - rad, rad * 2, rad * 2);
                }
                foreach (var ring in rings)
                {
                    float t = (float)((now - ring.T) / 450), rad = (10 + 40 * (1 - (1 - t) * (1 - t))) * k;
                    float dx = ring.P.X - origin.X, dy = ring.P.Y - origin.Y;
                    using (var pen = new Pen(Color.FromArgb((int)(230 * (1 - t)), ring.C), 3 * k)) g.DrawEllipse(pen, dx - rad, dy - rad, rad * 2, rad * 2);
                }
            }
            IntPtr screen = GetDC(IntPtr.Zero);
            try
            {
                var size = new SIZE { cx = Box, cy = Box };
                var source = new Native.POINT();
                var top = new Native.POINT { X = origin.X, Y = origin.Y };
                var blend = new BLENDFUNCTION { SourceConstantAlpha = 255, AlphaFormat = 1 };
                UpdateLayeredWindow(Handle, screen, ref top, ref size, dibDC, ref source, 0, ref blend, 2);
            }
            finally { ReleaseDC(IntPtr.Zero, screen); }
            if (!shown) { ShowWindow(Handle, 4); shown = true; }
        }

        [StructLayout(LayoutKind.Sequential)] struct SIZE { public int cx, cy; }
        [StructLayout(LayoutKind.Sequential, Pack = 1)] struct BLENDFUNCTION { public byte BlendOp, BlendFlags, SourceConstantAlpha, AlphaFormat; }
        [StructLayout(LayoutKind.Sequential)] struct BITMAPINFOHEADER { public int biSize, biWidth, biHeight; public short biPlanes, biBitCount; public int biCompression, biSizeImage, biXPelsPerMeter, biYPelsPerMeter, biClrUsed, biClrImportant; }
        [DllImport("user32.dll")] static extern bool UpdateLayeredWindow(IntPtr hwnd, IntPtr dst, ref Native.POINT pptDst, ref SIZE psize, IntPtr src, ref Native.POINT pptSrc, int key, ref BLENDFUNCTION blend, int flags);
        [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr hwnd);
        [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr hwnd, IntPtr dc);
        [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd, int cmd);
        [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
        [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
        [DllImport("gdi32.dll")] static extern IntPtr CreateDIBSection(IntPtr dc, ref BITMAPINFOHEADER info, uint usage, out IntPtr bits, IntPtr section, uint offset);
        [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr dc);
        [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc, IntPtr obj);
        [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);
        [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);
    }
}
