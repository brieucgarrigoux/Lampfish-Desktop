using System;
using System.Collections.Generic;
using System.Drawing;
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
    // plus the cells of that grid, drawn in the wallpaper of each screen. They sit behind the icons and under every window, so they show
    // on the desktop and nowhere else, as long as the grid is on. Windows seats every icon let go; nothing here moves an icon.
    static class DesktopGrid
    {
        static readonly JavaScriptSerializer json = new JavaScriptSerializer();
        static GridSettings S = new GridSettings();
        static List<Arrange.GridScreen> screens = new List<Arrange.GridScreen>();
        static Timer tick;
        static bool wasDown, onIcon, carrying, stale;
        static Point pressedAt, grab;
        static int aimed = -1;
        static Rectangle aimedOn;
        static DateTime quietUntil, checkedAt;
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
            SystemEvents.DisplaySettingsChanged += (s, e) => { quietUntil = DateTime.Now.AddSeconds(8); stale = true; };
            if (S.On) Snap(true);
            Apply();
        }

        public static void Stop()
        {
            if (tick != null) tick.Stop();
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
            if (on && announce)
            {
                string text = moved == 0 ? Language.T("The grid is on") : moved == 1 ? Language.T("The grid is on, 1 icon snapped to it") : Language.T("The grid is on, {0} icons snapped to it", moved);
                Program.Undoable(text, () => { Enable(false, false); if (moved > 0) Arrange.UndoLast(); Program.SendState(); });
            }
        }

        // Icons placed on the cells of the grid itself, while it stays on: the snapping lifted for the move comes back, and the cells follow a new size.
        public static void Resume()
        {
            if (!S.On) return;
            Snap(true);
            Refresh();
        }

        // An arrangement lifted the snapping to place the icons, or Windows would pull them back onto its cells: the grid is off until it is asked for again, and it says so.
        public static void Lifted()
        {
            if (!S.On) return;
            S.On = false;
            S.SnapBefore = null;
            Save();
            Apply();
            Program.Announce("The grid is off: this arrangement places the icons itself");
            Program.SendState();
        }

        static List<IconPosition> Snapshot()
        {
            try { return Arrange.Snapshot(); }
            catch (Exception ex) { Program.Log(ex); return new List<IconPosition>(); }
        }

        static void Apply()
        {
            if (S.On) { Refresh(); tick.Start(); return; }
            tick.Stop();
            wasDown = onIcon = carrying = false;
            aimed = -1;
            screens = new List<Arrange.GridScreen>();
            Program.ForEachWallpaper(f => f.Run("window.__grid && window.__grid(null)"));
        }

        static void Refresh()
        {
            try { screens = Arrange.GridScreens(); }
            catch (Exception ex) { Program.Log(ex); screens = new List<Arrange.GridScreen>(); }
            lookAt = Look();
            Program.ForEachWallpaper(f => f.Run(ScriptFor(f.Screen)));
        }

        static Arrange.GridScreen ScreenOf(Rectangle form)
        {
            return screens.FirstOrDefault(s => form.Contains(s.Area.X + s.Area.Width / 2, s.Area.Y + s.Area.Height / 2));
        }

        // What a wallpaper page runs to draw the cells of its screen, or nothing while the grid is off. A page that loads asks for it too.
        public static string ScriptFor(Rectangle form)
        {
            if (!S.On) return null;
            var s = ScreenOf(form);
            if (s == null) return null;
            var cells = s.Slots.Select(r => new[] { r.X - form.X, r.Y - form.Y, r.Width, r.Height });
            return "window.__grid && window.__grid(" + json.Serialize(cells) + "," + form.Width + "," + form.Height + ")";
        }

        // The list of icons of the desktop, not another window over it.
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
        }

        // The cell an icon would fall into lights up while it is carried.
        static void Aim(Point? icon)
        {
            var s = icon == null ? null : screens.FirstOrDefault(x => x.Area.Contains(icon.Value));
            int slot = s == null ? -1 : s.Nearest(icon.Value);
            var on = s == null ? Rectangle.Empty : s.Area;
            if (slot == aimed && on == aimedOn) return;
            aimed = slot;
            aimedOn = on;
            Program.ForEachWallpaper(f => f.Run("window.__gridAim && window.__gridAim(" + (s != null && f.Screen.Contains(on.X + on.Width / 2, on.Y + on.Height / 2) ? slot : -1) + ")"));
        }

        static void Step()
        {
            var now = DateTime.Now;
            bool down = (GetAsyncKeyState(0x01) & 0x8000) != 0;
            if (now < quietUntil) { wasDown = down; return; }
            if (stale) { stale = false; Refresh(); }

            if (down && !wasDown) Press();
            if (down && onIcon && !carrying)
            {
                var at = Cursor.Position;
                carrying = Math.Abs(at.X - pressedAt.X) >= SystemInformation.DragSize.Width || Math.Abs(at.Y - pressedAt.Y) >= SystemInformation.DragSize.Height;
            }
            if (!down)
            {
                if (carrying) Aim(null);
                onIcon = carrying = false;
            }
            // An icon let go has moved: read the icons again soon, for the next press.
            if (!down && wasDown) checkedAt = now.AddSeconds(-2.4);
            wasDown = down;
            if (carrying) Aim(new Point(Cursor.Position.X - grab.X, Cursor.Position.Y - grab.Y));
            tick.Interval = carrying ? 15 : 40;

            // The cells follow the size and spacing of the icons, and where Windows seats them; an arrangement that lifted the snapping turns the grid off.
            if (!down && (now - checkedAt).TotalSeconds > 3)
            {
                checkedAt = now;
                if (!Snapping()) { Enable(false, false); Program.SendState(); return; }
                if (Look() != lookAt) Refresh();
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

        [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
        [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Native.POINT point);
        [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr window);
    }
}
