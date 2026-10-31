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

namespace Lampfish
{
    class GridSettings
    {
        public bool On;
        public bool? SnapBefore;
    }

    // A magnetic grid on the desktop: Windows' own Align to grid, turned on with the grid and put back as it was when the grid goes off,
    // plus the cells of that grid drawn on every screen whenever the desktop is in front. Windows seats every icon let go; nothing here moves an icon.
    static class DesktopGrid
    {
        static readonly JavaScriptSerializer json = new JavaScriptSerializer();
        static GridSettings S = new GridSettings();
        static readonly List<Overlay> overlays = new List<Overlay>();
        static Timer tick;
        static bool wasDown, dragging, built;
        static DateTime quietUntil, flashUntil, checkedAt;
        static string lookAt;

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
            if (S.On) Snap(true);
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

        static bool Snapping()
        {
            try { return (DesktopIcons.Flags() & DesktopIcons.FWF_SNAPTOGRID) != 0; }
            catch (Exception ex) { Program.Log(ex); return S.On; }
        }

        static void Snap(bool on)
        {
            try { DesktopIcons.Flag(DesktopIcons.FWF_SNAPTOGRID, on); }
            catch (Exception ex) { Program.Log(ex); }
        }

        // Windows seats every icon in its cells the moment its snapping is turned on: that move is remembered, so one Undo takes back the grid and the move.
        public static void Enable(bool on, bool announce)
        {
            if (S.On == on) return;
            int moved = 0;
            if (on)
            {
                S.SnapBefore = Snapping();
                var before = Snapshot();
                Arrange.RememberNow();
                Snap(true);
                var after = Snapshot();
                moved = after.Count(a => before.Any(b => b.Id == a.Id && (b.X != a.X || b.Y != a.Y)));
            }
            else { Snap(S.SnapBefore ?? false); S.SnapBefore = null; }
            S.On = on;
            Save();
            Apply();
            if (on) flashUntil = DateTime.Now.AddSeconds(4);
            if (on && announce)
            {
                string text = moved == 0 ? Language.T("The grid is on") : moved == 1 ? Language.T("The grid is on, 1 icon snapped to it") : Language.T("The grid is on, {0} icons snapped to it", moved);
                Program.Undoable(text, () => { Enable(false, false); if (moved > 0) Arrange.UndoLast(); Program.SendState(); });
            }
        }

        // Straighten placed the icons on the cells of the grid itself: the snapping comes back without a move to remember.
        public static void Resume()
        {
            if (S.On) return;
            S.On = true;
            S.SnapBefore = snapBeforeLifted;
            Snap(true);
            Save();
            Apply();
            Program.SendState();
        }

        // An arrangement lifted the snapping to place the icons: the grid is off until it is asked for again.
        static bool? snapBeforeLifted;
        public static void Lifted()
        {
            if (!S.On) return;
            snapBeforeLifted = S.SnapBefore;
            S.On = false;
            S.SnapBefore = null;
            Save();
            Apply();
            Program.SendState();
        }

        static List<IconPosition> Snapshot()
        {
            try { return Arrange.Snapshot(); }
            catch (Exception ex) { Program.Log(ex); return new List<IconPosition>(); }
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
            lookAt = Look();
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
            if (!down && wasDown) { foreach (var o in overlays) o.Aim(null); dragging = false; }
            wasDown = down;

            // The cells follow the size and spacing of the icons, and where Windows seats them; an arrangement that lifted the snapping turns the grid off.
            if (!down && (now - checkedAt).TotalSeconds > 3)
            {
                checkedAt = now;
                if (!Snapping()) { Enable(false, false); Program.SendState(); return; }
                if (Look() != lookAt) built = false;
            }
        }

        static string Look()
        {
            try { return DesktopIcons.Case() + " " + DesktopIcons.IconSize() + " " + Arrange.Fingerprint(); }
            catch { return lookAt; }
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
