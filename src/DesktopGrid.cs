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
    // plus the cells of that grid, faded in while the desktop is in front or an icon is carried. Windows seats every icon let go; nothing here moves an icon.
    static class DesktopGrid
    {
        const double FadeIn = .12, FadeOut = .2;
        static readonly JavaScriptSerializer json = new JavaScriptSerializer();
        static GridSettings S = new GridSettings();
        static readonly List<Overlay> overlays = new List<Overlay>();
        static Timer tick;
        static bool wasDown, onIcon, carrying, built, covered;
        static Point pressedAt, grab;
        static double shown;
        static DateTime quietUntil, flashUntil, checkedAt, steppedAt, frontAt;
        static string lookAt;
        static List<IconPosition> icons;
        static Size iconCase;
        static int iconSize;

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

        // An arrangement lifted the snapping to place the icons, or Windows would pull them back onto its cells: the grid is off until it is asked for again, and it says so.
        static bool? snapBeforeLifted;
        public static void Lifted(bool announce)
        {
            if (!S.On) return;
            snapBeforeLifted = S.SnapBefore;
            S.On = false;
            S.SnapBefore = null;
            Save();
            Apply();
            if (announce) Program.Announce("The grid is off: this arrangement places the icons itself");
            Program.SendState();
        }

        static List<IconPosition> Snapshot()
        {
            try { return Arrange.Snapshot(); }
            catch (Exception ex) { Program.Log(ex); return new List<IconPosition>(); }
        }

        static void Apply()
        {
            if (S.On) { built = false; steppedAt = DateTime.Now; tick.Start(); }
            else { tick.Stop(); Close(); wasDown = onIcon = carrying = false; }
        }

        static void Close()
        {
            foreach (var o in overlays) o.Dispose();
            overlays.Clear();
            built = false;
            shown = 0;
        }

        // The desktop is in front when nothing else has the focus: its window, or the one behind its icons.
        static bool DesktopInFront()
        {
            var window = Native.GetForegroundWindow();
            if (window == IntPtr.Zero) return true;
            string name = ClassOf(window);
            return name == "Progman" || name == "WorkerW";
        }

        // The list of icons of the desktop, not another window over it: a press elsewhere never shows the grid.
        static bool OnDesktop(Point at)
        {
            var list = WindowFromPoint(new Native.POINT { X = at.X, Y = at.Y });
            if (ClassOf(list) != "SysListView32") return false;
            var view = GetParent(list);
            if (ClassOf(view) != "SHELLDLL_DefView") return false;
            string host = ClassOf(GetParent(view));
            return host == "Progman" || host == "WorkerW";
        }

        static string ClassOf(IntPtr window)
        {
            if (window == IntPtr.Zero) return "";
            var name = new StringBuilder(64);
            Native.GetClassName(window, name, name.Capacity);
            return name.ToString();
        }

        // Only what changed is drawn again, and only while nothing shows.
        static void Build()
        {
            List<Arrange.GridScreen> screens;
            try { screens = Arrange.GridScreens(); }
            catch (Exception ex) { Program.Log(ex); screens = new List<Arrange.GridScreen>(); }
            lookAt = Look();
            built = true;
            if (overlays.Count == screens.Count && overlays.Zip(screens, (o, s) => o.Shows(s)).All(same => same))
            {
                for (int i = 0; i < screens.Count; i++) overlays[i].Screen = screens[i];
                return;
            }
            Close();
            built = true;
            foreach (var s in screens) overlays.Add(new Overlay(s));
        }

        // Asking Explorer for the icons while it handles this very press took half a second: the last reading is enough to know what was pressed.
        static void Press()
        {
            var at = Cursor.Position;
            pressedAt = at;
            onIcon = false;
            if (icons == null || !OnDesktop(at)) return;
            var icon = Arrange.IconAt(at, icons, iconCase, iconSize);
            if (icon == null) return;
            onIcon = true;
            grab = new Point(at.X - icon.Value.X, at.Y - icon.Value.Y);
            if (!built) Build();
        }

        static void Step()
        {
            var now = DateTime.Now;
            double dt = Math.Min(.03, (now - steppedAt).TotalSeconds);
            steppedAt = now;
            bool down = (GetAsyncKeyState(0x01) & 0x8000) != 0;
            if (now < quietUntil) { shown = 0; foreach (var o in overlays) o.Fade(0); wasDown = down; return; }

            if (down && !wasDown) Press();
            if (down && onIcon && !carrying)
            {
                var at = Cursor.Position;
                carrying = Math.Abs(at.X - pressedAt.X) >= SystemInformation.DragSize.Width || Math.Abs(at.Y - pressedAt.Y) >= SystemInformation.DragSize.Height;
            }
            if (!down) onIcon = carrying = false;
            // An icon let go has moved: read the icons again soon, for the next press.
            if (!down && wasDown) checkedAt = now.AddSeconds(-2.4);
            wasDown = down;

            // The focus leaves the desktop for an instant around a click: the grid only follows when it stays away.
            if (DesktopInFront()) frontAt = now;
            bool want = carrying || now < flashUntil || (now - frontAt).TotalMilliseconds < 250;
            if (!want) covered = false;
            else if (shown == 0) covered = FullScreenApp();
            want = want && !covered;
            if (want && !built) Build();
            double before = shown;
            shown = want ? Math.Min(1, shown + dt / FadeIn) : Math.Max(0, shown - dt / FadeOut);
            if (shown != before) foreach (var o in overlays) o.Fade(shown);
            if (carrying && shown > 0)
            {
                var icon = new Point(Cursor.Position.X - grab.X, Cursor.Position.Y - grab.Y);
                foreach (var o in overlays) o.Aim(icon);
            }
            else if (before > 0 && shown == 0) foreach (var o in overlays) o.Aim(null);
            tick.Interval = carrying || (want ? shown < 1 : shown > 0) ? 15 : 40;

            // The cells follow the size and spacing of the icons, and where Windows seats them; an arrangement that lifted the snapping turns the grid off.
            if (!down && (now - checkedAt).TotalSeconds > 3)
            {
                checkedAt = now;
                if (!Snapping()) { Enable(false, false); Program.SendState(); return; }
                if (built && Look() != lookAt)
                {
                    built = false;
                    if (shown > 0) { Build(); foreach (var o in overlays) o.Fade(shown); }
                }
            }
        }

        static string Look()
        {
            try
            {
                iconCase = DesktopIcons.Case();
                iconSize = DesktopIcons.IconSize();
                icons = Arrange.Snapshot();
                return iconCase + " " + iconSize + " " + string.Join(";", icons.Select(p => p.X + "," + p.Y));
            }
            catch { return lookAt; }
        }

        static bool FullScreenApp()
        {
            int state;
            return SHQueryUserNotificationState(out state) == 0 && (state == 2 || state == 3 || state == 4);
        }

        [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int state);
        [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
        [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Native.POINT point);
        [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr window);

        // A click-through window with its own alpha. Fading only changes a constant: the picture is not sent again.
        class Sheet : Form
        {
            public Sheet(Rectangle bounds)
            {
                FormBorderStyle = FormBorderStyle.None;
                StartPosition = FormStartPosition.Manual;
                ShowInTaskbar = false;
                TopMost = true;
                AutoScaleMode = AutoScaleMode.None;
                Bounds = bounds;
            }

            protected override bool ShowWithoutActivation { get { return true; } }
            protected override CreateParams CreateParams
            {
                get { var p = base.CreateParams; p.ExStyle |= Native.WS_EX_LAYERED | Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE | 0x20; return p; }
            }

            public void Picture(Bitmap bmp, double alpha)
            {
                IntPtr screenDc = GetDC(IntPtr.Zero), memory = CreateCompatibleDC(screenDc), hbitmap = bmp.GetHbitmap(Color.FromArgb(0)), old = SelectObject(memory, hbitmap);
                try
                {
                    var size = new SIZE { cx = bmp.Width, cy = bmp.Height };
                    var source = new Native.POINT();
                    var top = new Native.POINT { X = Left, Y = Top };
                    var blend = Blend(alpha);
                    UpdateLayeredWindow(Handle, screenDc, ref top, ref size, memory, ref source, 0, ref blend, 2);
                }
                finally { SelectObject(memory, old); DeleteObject(hbitmap); DeleteDC(memory); ReleaseDC(IntPtr.Zero, screenDc); }
            }

            public void Alpha(double alpha)
            {
                var blend = Blend(alpha);
                UpdateAlpha(Handle, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 0, ref blend, 2);
            }

            static BLENDFUNCTION Blend(double alpha) { return new BLENDFUNCTION { BlendOp = 0, SourceConstantAlpha = (byte)Math.Round(255 * alpha * alpha * (3 - 2 * alpha)), AlphaFormat = 1 }; }

            [StructLayout(LayoutKind.Sequential)] struct SIZE { public int cx, cy; }
            [StructLayout(LayoutKind.Sequential, Pack = 1)] struct BLENDFUNCTION { public byte BlendOp, BlendFlags, SourceConstantAlpha, AlphaFormat; }
            [DllImport("user32.dll")] static extern bool UpdateLayeredWindow(IntPtr hwnd, IntPtr dst, ref Native.POINT pptDst, ref SIZE psize, IntPtr src, ref Native.POINT pptSrc, int key, ref BLENDFUNCTION blend, int flags);
            [DllImport("user32.dll", EntryPoint = "UpdateLayeredWindow")] static extern bool UpdateAlpha(IntPtr hwnd, IntPtr dst, IntPtr pptDst, IntPtr psize, IntPtr src, IntPtr pptSrc, int key, ref BLENDFUNCTION blend, int flags);
            [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr hwnd);
            [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr hwnd, IntPtr dc);
            [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr dc);
            [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);
            [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc, IntPtr obj);
            [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);
        }

        // The cells of a screen on one sheet, drawn once, and the aimed cell on a small sheet of its own that moves.
        class Overlay : IDisposable
        {
            readonly Sheet cells, lit;
            int aimed = -1;
            double alpha;

            public Arrange.GridScreen Screen;

            public Overlay(Arrange.GridScreen screen)
            {
                Screen = screen;
                cells = new Sheet(Sheetable(screen.Area));
                lit = new Sheet(new Rectangle(screen.Area.Location, new Size(1, 1)));
                Draw();
            }

            // A topmost window that covers a whole screen makes Windows report a full screen app: the grid hid itself for it, came back, and flashed.
            // One pixel less keeps it out of that test. It also kept the button of the assistant on screen.
            static Rectangle Sheetable(Rectangle area) { return new Rectangle(area.X, area.Y, area.Width, area.Height - 1); }

            public bool Shows(Arrange.GridScreen other) { return Screen.Area == other.Area && Screen.Slots.SequenceEqual(other.Slots); }

            public void Fade(double value)
            {
                alpha = value;
                if (value <= 0) { cells.Hide(); lit.Hide(); return; }
                cells.Alpha(value);
                if (!cells.Visible) cells.Show();
                if (lit.Visible) lit.Alpha(value);
            }

            public void Aim(Point? at)
            {
                int slot = at == null || !Screen.Area.Contains(at.Value) ? -1 : Screen.Nearest(at.Value);
                if (slot == aimed) return;
                aimed = slot;
                if (slot < 0 || slot >= Screen.Slots.Count) { lit.Hide(); return; }
                var r = Screen.Slots[slot];
                r.Inflate(2, 2);
                lit.Bounds = r;
                using (var bmp = new Bitmap(r.Width, r.Height, PixelFormat.Format32bppArgb))
                {
                    using (var g = Graphics.FromImage(bmp))
                    {
                        g.SmoothingMode = SmoothingMode.AntiAlias;
                        var accent = Color.FromArgb(0x1E, 0xBB, 0xAA);
                        using (var fill = new SolidBrush(Color.FromArgb(70, accent)))
                        using (var ring = new Pen(accent, 2f))
                        using (var path = Rounded(new Rectangle(2, 2, r.Width - 4, r.Height - 4), Math.Max(6, r.Width / 7)))
                        {
                            g.FillPath(fill, path);
                            g.DrawPath(ring, path);
                        }
                    }
                    lit.Picture(bmp, alpha);
                }
                if (!lit.Visible) lit.Show();
            }

            void Draw()
            {
                int w = Screen.Area.Width, h = Screen.Area.Height - 1;
                if (w <= 0 || h <= 0) return;
                using (var bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb))
                {
                    using (var g = Graphics.FromImage(bmp))
                    {
                        g.SmoothingMode = SmoothingMode.AntiAlias;
                        using (var edge = new Pen(Color.FromArgb(70, 255, 255, 255), 1.5f))
                        using (var shade = new Pen(Color.FromArgb(60, 0, 0, 0), 3f))
                        using (var fill = new SolidBrush(Color.FromArgb(18, 255, 255, 255)))
                            foreach (var slot in Screen.Slots)
                            {
                                var r = slot;
                                r.Offset(-Screen.Area.X, -Screen.Area.Y);
                                using (var path = Rounded(r, Math.Max(6, r.Width / 7)))
                                {
                                    g.FillPath(fill, path);
                                    g.DrawPath(shade, path);
                                    g.DrawPath(edge, path);
                                }
                            }
                    }
                    cells.Picture(bmp, 0);
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

            public void Dispose()
            {
                cells.Dispose();
                lit.Dispose();
            }
        }
    }
}
