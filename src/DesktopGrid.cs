using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

namespace Bramble
{
    class GridSettings
    {
        public bool On;
    }

    // A magnetic grid on the desktop: while it is on, the slots of the grid show on every screen whenever the desktop is in front,
    // and an icon let go between two slots goes to the nearest free one. Only Windows' own icons list is moved, the way Arrange does it.
    static class DesktopGrid
    {
        static readonly JavaScriptSerializer json = new JavaScriptSerializer();
        static GridSettings S = new GridSettings();
        static readonly List<Overlay> overlays = new List<Overlay>();
        static Timer tick;
        static bool wasDown, dragging, settling, built;
        static DateTime releasedAt, scannedAt, quietUntil, flashUntil;

        static string SettingsFile { get { return Path.Combine(Program.DataFolder("Grid"), "settings.json"); } }

        public static bool On { get { return S.On; } }
        public static object State() { return new { on = S.On }; }

        public static void Start()
        {
            try { if (File.Exists(SettingsFile)) S = json.Deserialize<GridSettings>(File.ReadAllText(SettingsFile)) ?? new GridSettings(); }
            catch (Exception ex) { Program.Log(ex); }
            tick = new Timer { Interval = 40 };
            tick.Tick += (s, e) => Step();
            SystemEvents.DisplaySettingsChanged += (s, e) => { quietUntil = DateTime.Now.AddSeconds(8); built = false; };
            Apply();
        }

        public static void Stop()
        {
            if (tick != null) tick.Stop();
            Close();
        }

        static void Save()
        {
            try { File.WriteAllText(SettingsFile, json.Serialize(S)); }
            catch (Exception ex) { Program.Log(ex); }
        }

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            if (action == "set") { Enable(Convert.ToBoolean(m["on"]), true); return true; }
            return false;
        }

        public static void Enable(bool on, bool seat)
        {
            if (S.On == on) return;
            S.On = on;
            Save();
            Apply();
            if (!on || !seat) return;
            // The icons that are in between slots settle at once, and one undo takes everything back, grid included.
            int moved = 0;
            try
            {
                Arrange.RememberNow();
                moved = Arrange.Magnet();
            }
            catch (Exception ex) { Program.Log(ex); }
            flashUntil = DateTime.Now.AddSeconds(4);
            Program.Undoable(Language.T(moved > 0 ? "The icons sit on the grid" : "The grid is on"), () => { Enable(false, false); if (moved > 0) Arrange.UndoLast(); Program.SendState(); });
        }

        static void Apply()
        {
            if (S.On) { built = false; tick.Start(); }
            else { tick.Stop(); Close(); wasDown = dragging = false; }
        }

        static void Close()
        {
            foreach (var o in overlays) { o.Hide(); o.Dispose(); }
            overlays.Clear();
            built = false;
        }

        // The desktop is in front when nothing else has the focus: its window, or the one behind its icons.
        static bool OnDesktop()
        {
            var window = Native.GetForegroundWindow();
            if (window == IntPtr.Zero) return true;
            var name = new StringBuilder(64);
            Native.GetClassName(window, name, name.Capacity);
            string c = name.ToString();
            return c == "Progman" || c == "WorkerW";
        }

        static void Build()
        {
            Close();
            List<Arrange.GridScreen> screens;
            try { screens = Arrange.GridScreens(); }
            catch (Exception ex) { Program.Log(ex); screens = new List<Arrange.GridScreen>(); }
            foreach (var s in screens) overlays.Add(new Overlay(s));
            built = true;
        }

        static void Step()
        {
            var now = DateTime.Now;
            bool down = (GetAsyncKeyState(0x01) & 0x8000) != 0, desk = OnDesktop();
            bool show = desk || now < flashUntil;
            if (now < quietUntil) { foreach (var o in overlays) o.Hide(); wasDown = down; return; }
            if (show && !built) Build();
            foreach (var o in overlays) o.Visible = show && !FullScreenApp();

            if (down && !wasDown) dragging = desk;
            if (down && dragging)
            {
                var at = Cursor.Position;
                foreach (var o in overlays) o.Aim(at);
            }
            if (!down && wasDown)
            {
                foreach (var o in overlays) o.Aim(null);
                if (dragging) { releasedAt = now; settling = true; }
                dragging = false;
            }
            wasDown = down;

            // Windows has let go of the icon a moment after the button.
            if (settling && !down && (now - releasedAt).TotalMilliseconds > 250) { settling = false; Seat(); scannedAt = now; }
            // An icon that Windows puts somewhere itself (a new file) is seated too.
            else if (!down && (now - scannedAt).TotalSeconds > 3)
            {
                scannedAt = now;
                // The slots follow the size of the icons and their spacing.
                string look = Look();
                if (look != lookAt) { lookAt = look; built = false; }
                Seat();
            }
        }

        static string lookAt;

        static string Look()
        {
            try { return DesktopIcons.Case() + " " + DesktopIcons.IconSize(); }
            catch { return lookAt; }
        }

        static void Seat()
        {
            try { Arrange.Magnet(); }
            catch (Exception ex) { Program.Log(ex); }
        }

        static bool FullScreenApp()
        {
            int state;
            return SHQueryUserNotificationState(out state) == 0 && (state == 2 || state == 3 || state == 4);
        }

        [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int state);
        [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);

        // One click-through window over the work area of a screen, drawn with its own alpha.
        class Overlay : Form
        {
            readonly Arrange.GridScreen screen;
            int aimed = -1;

            public Overlay(Arrange.GridScreen screen)
            {
                this.screen = screen;
                FormBorderStyle = FormBorderStyle.None;
                StartPosition = FormStartPosition.Manual;
                ShowInTaskbar = false;
                TopMost = true;
                AutoScaleMode = AutoScaleMode.None;
                Bounds = screen.Area;
            }

            protected override bool ShowWithoutActivation { get { return true; } }
            protected override CreateParams CreateParams
            {
                get { var p = base.CreateParams; p.ExStyle |= Native.WS_EX_LAYERED | Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE | 0x20; return p; }
            }

            public new bool Visible
            {
                get { return base.Visible; }
                set
                {
                    if (value == base.Visible) return;
                    if (value) { Bounds = screen.Area; Show(); Redraw(); }
                    else Hide();
                }
            }

            public void Aim(Point? at)
            {
                int slot = at == null || !screen.Area.Contains(at.Value) ? -1 : screen.Nearest(at.Value);
                if (slot == aimed) return;
                aimed = slot;
                if (base.Visible) Redraw();
            }

            void Redraw()
            {
                int w = screen.Area.Width, h = screen.Area.Height;
                if (w <= 0 || h <= 0) return;
                using (var bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb))
                {
                    using (var g = Graphics.FromImage(bmp))
                    {
                        g.SmoothingMode = SmoothingMode.AntiAlias;
                        var accent = Color.FromArgb(0x1E, 0xBB, 0xAA);
                        using (var edge = new Pen(Color.FromArgb(70, 255, 255, 255), 1.5f))
                        using (var shade = new Pen(Color.FromArgb(60, 0, 0, 0), 3f))
                        using (var fill = new SolidBrush(Color.FromArgb(18, 255, 255, 255)))
                        using (var lit = new SolidBrush(Color.FromArgb(70, accent)))
                        using (var ring = new Pen(accent, 2f))
                            for (int i = 0; i < screen.Slots.Count; i++)
                            {
                                var r = screen.Slots[i];
                                r.Offset(-screen.Area.X, -screen.Area.Y);
                                using (var path = Rounded(r, Math.Max(6, r.Width / 7)))
                                {
                                    if (i == aimed) { g.FillPath(lit, path); g.DrawPath(ring, path); continue; }
                                    g.FillPath(fill, path);
                                    g.DrawPath(shade, path);
                                    g.DrawPath(edge, path);
                                }
                            }
                    }
                    Layered(bmp);
                }
            }

            static GraphicsPath Rounded(Rectangle r, int radius)
            {
                int d = radius * 2;
                var path = new GraphicsPath();
                path.AddArc(r.X, r.Y, d, d, 180, 90);
                path.AddArc(r.Right - d, r.Y, d, d, 270, 90);
                path.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
                path.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
                path.CloseFigure();
                return path;
            }

            void Layered(Bitmap bmp)
            {
                IntPtr screenDc = GetDC(IntPtr.Zero), memory = CreateCompatibleDC(screenDc), hbitmap = bmp.GetHbitmap(Color.FromArgb(0)), old = SelectObject(memory, hbitmap);
                try
                {
                    var size = new SIZE { cx = bmp.Width, cy = bmp.Height };
                    var source = new Native.POINT();
                    var top = new Native.POINT { X = Left, Y = Top };
                    var blend = new BLENDFUNCTION { BlendOp = 0, SourceConstantAlpha = 255, AlphaFormat = 1 };
                    UpdateLayeredWindow(Handle, screenDc, ref top, ref size, memory, ref source, 0, ref blend, 2);
                }
                finally { SelectObject(memory, old); DeleteObject(hbitmap); DeleteDC(memory); ReleaseDC(IntPtr.Zero, screenDc); }
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
