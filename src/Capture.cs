using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

namespace Bramble
{
    // A screen capture: the screens freeze under a dark veil, a drag takes a zone, a click takes the window under the pointer,
    // Enter takes the whole screen. The image lands on the shelf and in the clipboard, and a small note offers to annotate it.
    static class Capture
    {
        static Overlay overlay;
        static Note note;
        static PageForm annotate;
        static string annotated;
        // True while the screen is being taken, so that what floats over the desktop can step aside.
        public static event Action<bool> Busy;

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            if (action == "start") Start(m.ContainsKey("delay") ? Convert.ToInt32(m["delay"]) : 0, m.ContainsKey("whole") && Convert.ToBoolean(m["whole"]));
            if (action == "annotate" && m.ContainsKey("name")) Annotate(Path.Combine(Shelf.Folder, Path.GetFileName(Convert.ToString(m["name"]))));
            return false;
        }

        // A delay leaves time to open a menu; the main window steps aside so it is not in the picture.
        public static void Start(int delay, bool whole = false)
        {
            if (overlay != null) return;
            if (Busy != null) Busy(true);
            // The card of the last capture would land in the next one.
            if (note != null && !note.IsDisposed && note.Visible) note.Hide();
            var window = Program.SettingsWindow;
            bool hide = window != null && window.Visible && window.WindowState != FormWindowState.Minimized && window.ContainsFocus;
            if (hide) { shape = window.WindowState; window.WindowState = FormWindowState.Minimized; }
            int wait = Math.Max(0, Math.Min(10, delay));
            if (wait > 0) Countdown.Run(wait, () => Take(hide, whole));
            else { var t = new Timer { Interval = hide ? 350 : 60 }; t.Tick += (s, e) => { t.Stop(); t.Dispose(); Take(hide, whole); }; t.Start(); }
        }

        // The whole screen under the pointer goes straight to the shelf, without choosing.
        static void Take(bool restore, bool whole)
        {
            if (!whole) { Freeze(restore); return; }
            var bounds = Screen.FromPoint(Cursor.Position).Bounds;
            using (var image = new Bitmap(bounds.Width, bounds.Height))
            {
                using (var g = Graphics.FromImage(image)) g.CopyFromScreen(bounds.Left, bounds.Top, 0, 0, bounds.Size);
                Done(image);
            }
            if (Busy != null) Busy(false);
            if (restore) Restore();
        }

        // The window comes back as it was, maximized included.
        static FormWindowState shape;
        static void Restore()
        {
            if (Program.SettingsWindow != null) Program.SettingsWindow.WindowState = shape;
        }

        static void Freeze(bool restore)
        {
            Rectangle all = SystemInformation.VirtualScreen;
            var shot = new Bitmap(all.Width, all.Height);
            using (var g = Graphics.FromImage(shot)) g.CopyFromScreen(all.Left, all.Top, 0, 0, all.Size);
            overlay = new Overlay(shot, all, Windows(all));
            overlay.FormClosed += (s, e) =>
            {
                var picked = overlay.Picked;
                overlay = null;
                if (picked.Width >= 4 && picked.Height >= 4)
                    using (var image = shot.Clone(picked, shot.PixelFormat)) Done(image);
                shot.Dispose();
                if (Busy != null) Busy(false);
                if (restore) Restore();
            };
            overlay.Show();
            overlay.Activate();
        }

        static void Done(Bitmap image)
        {
            string path = Shelf.Keep(image);
            try { Clipboard.SetImage(image); } catch (Exception ex) { Program.Log(ex); }
            if (note == null || note.IsDisposed) note = new Note();
            note.Show(path, image);
        }

        // Top-level windows, front to back, with their visible frame (without the invisible resize border of Windows 10 and 11).
        static List<Rectangle> Windows(Rectangle all)
        {
            var list = new List<Rectangle>();
            Native.EnumWindows((h, p) =>
            {
                if (!IsWindowVisible(h) || Native.IsIconic(h)) return true;
                int cloaked;
                if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
                var name = new StringBuilder(64);
                Native.GetClassName(h, name, 64);
                if (name.ToString() == "Progman" || name.ToString() == "WorkerW") return true;
                Native.RECT r;
                if (DwmGetWindowAttribute(h, 9, out r, Marshal.SizeOf(typeof(Native.RECT))) != 0) Native.GetWindowRect(h, out r);
                var box = Rectangle.FromLTRB(r.Left, r.Top, r.Right, r.Bottom);
                box.Intersect(all);
                if (box.Width > 40 && box.Height > 24) list.Add(new Rectangle(box.X - all.X, box.Y - all.Y, box.Width, box.Height));
                return true;
            }, IntPtr.Zero);
            return list;
        }

        [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
        [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out Native.RECT value, int size);
        [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out int value, int size);

        // Opens the capture in a window with drawing tools; Done writes it back to the shelf and the clipboard.
        public static async void Annotate(string path)
        {
            if (!File.Exists(path)) return;
            annotated = path;
            if (annotate != null && !annotate.IsDisposed) { annotate.Close(); annotate = null; }
            var screen = Screen.FromPoint(Cursor.Position).WorkingArea;
            Size size;
            using (var image = Image.FromFile(path)) size = image.Size;
            // Room for the tools on one line and a capture seen large, without covering the whole screen.
            int w = Math.Min(screen.Width * 92 / 100, Math.Max(screen.Width * 3 / 4, size.Width + 60)), h = Math.Min(screen.Height * 92 / 100, Math.Max(screen.Height * 3 / 4, size.Height + 160));
            annotate = new PageForm("annotate.html?name=" + Uri.EscapeDataString(Path.GetFileName(path)), Annotated)
            {
                Text = Language.T("Annotate"), StartPosition = FormStartPosition.Manual,
                Bounds = new Rectangle(screen.Left + (screen.Width - w) / 2, screen.Top + (screen.Height - h) / 2, w, h),
            };
            annotate.Show();
            await annotate.Open();
        }

        static void Annotated(Dictionary<string, object> m)
        {
            string action = m.ContainsKey("action") ? Convert.ToString(m["action"]) : "";
            if (action == "annotate.load" && annotated != null && File.Exists(annotated))
                annotate.Send(new { type = "annotate.image", data = "data:image/png;base64," + Convert.ToBase64String(File.ReadAllBytes(annotated)) });
            else if (action == "annotate.save" && annotated != null)
            {
                string data = Convert.ToString(m["data"]);
                int comma = data.IndexOf(',');
                if (!data.StartsWith("data:image/png;base64,") || comma < 0) return;
                byte[] bytes = Convert.FromBase64String(data.Substring(comma + 1));
                File.WriteAllBytes(annotated, bytes);
                using (var stream = new MemoryStream(bytes))
                using (var image = Image.FromStream(stream))
                    try { Clipboard.SetImage(new Bitmap(image)); } catch (Exception ex) { Program.Log(ex); }
                Shelf.SendList();
                annotate.Close();
            }
            else if (action == "annotate.close") annotate.Close();
            else if (action == "annotate.delete" && annotated != null)
            {
                annotate.Close();
                Program.SetAside(annotated, Path.GetFileName(annotated), Shelf.SendList);
                Shelf.SendList();
                Program.SendState();
            }
            else if (action == "pageError") Program.Log(new Exception("Annotate: " + m["text"]));
        }

        class Overlay : Form
        {
            readonly Bitmap shot;
            readonly List<Rectangle> windows;
            Point start;
            Rectangle hover, drag;
            bool dragging;
            public Rectangle Picked { get; private set; }

            public Overlay(Bitmap shot, Rectangle all, List<Rectangle> windows)
            {
                this.shot = shot;
                this.windows = windows;
                FormBorderStyle = FormBorderStyle.None;
                StartPosition = FormStartPosition.Manual;
                AutoScaleMode = AutoScaleMode.None;
                Bounds = all;
                TopMost = true;
                ShowInTaskbar = false;
                DoubleBuffered = true;
                KeyPreview = true;
                Cursor = Cursors.Cross;
            }

            protected override CreateParams CreateParams { get { var p = base.CreateParams; p.ExStyle |= Native.WS_EX_TOOLWINDOW; return p; } }

            Rectangle Selection { get { return dragging ? drag : hover; } }

            protected override void OnMouseDown(MouseEventArgs e)
            {
                if (e.Button == MouseButtons.Right) { Close(); return; }
                start = e.Location;
                dragging = false;
            }

            protected override void OnMouseMove(MouseEventArgs e)
            {
                if (e.Button == MouseButtons.Left && (dragging || Math.Abs(e.X - start.X) + Math.Abs(e.Y - start.Y) > 4))
                {
                    dragging = true;
                    drag = Rectangle.FromLTRB(Math.Min(start.X, e.X), Math.Min(start.Y, e.Y), Math.Max(start.X, e.X), Math.Max(start.Y, e.Y));
                }
                else if (!dragging) hover = windows.FirstOrDefault(w => w.Contains(e.Location));
                Invalidate();
            }

            protected override void OnMouseUp(MouseEventArgs e)
            {
                if (e.Button != MouseButtons.Left) return;
                Picked = dragging ? drag : hover.IsEmpty ? ScreenAt(e.Location) : hover;
                Close();
            }

            Rectangle ScreenAt(Point p)
            {
                var s = Screen.FromPoint(new Point(p.X + Left, p.Y + Top)).Bounds;
                return new Rectangle(s.X - Left, s.Y - Top, s.Width, s.Height);
            }

            protected override void OnKeyDown(KeyEventArgs e)
            {
                if (e.KeyCode == Keys.Escape) Close();
                else if (e.KeyCode == Keys.Enter) { Picked = ScreenAt(PointToClient(Cursor.Position)); Close(); }
            }

            protected override void OnPaint(PaintEventArgs e)
            {
                var g = e.Graphics;
                g.DrawImageUnscaled(shot, 0, 0);
                var pick = Selection;
                using (var veil = new SolidBrush(Color.FromArgb(120, 6, 6, 12)))
                using (var outside = new Region(ClientRectangle))
                {
                    if (!pick.IsEmpty) outside.Exclude(pick);
                    g.FillRegion(veil, outside);
                }
                if (pick.IsEmpty) return;
                using (var pen = new Pen(Color.FromArgb(0x95, 0x61, 0xf3), 2)) g.DrawRectangle(pen, pick.X, pick.Y, pick.Width - 1, pick.Height - 1);
                string size = pick.Width + " × " + pick.Height;
                using (var font = new Font("Segoe UI", 9f, FontStyle.Bold))
                {
                    var box = TextRenderer.MeasureText(size, font);
                    var at = new Rectangle(pick.X, pick.Y >= box.Height + 10 ? pick.Y - box.Height - 8 : pick.Bottom + 6, box.Width + 12, box.Height + 4);
                    using (var back = new SolidBrush(Color.FromArgb(230, 20, 21, 27))) g.FillRectangle(back, at);
                    TextRenderer.DrawText(g, size, font, at, Color.FromArgb(0xe8, 0xe9, 0xf0), TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
                }
            }
        }

        // The seconds before a delayed capture, at the bottom of the screen under the pointer.
        static class Countdown
        {
            public static void Run(int seconds, Action then)
            {
                var screen = Screen.FromPoint(Cursor.Position).WorkingArea;
                double k = Arrange.Scale(Screen.FromPoint(Cursor.Position));
                int side = (int)(72 * k);
                var form = new Form
                {
                    FormBorderStyle = FormBorderStyle.None, StartPosition = FormStartPosition.Manual, ShowInTaskbar = false, TopMost = true,
                    BackColor = Color.FromArgb(0x14, 0x15, 0x1b), Size = new Size(side, side), AutoScaleMode = AutoScaleMode.None,
                    Location = new Point(screen.Left + (screen.Width - side) / 2, screen.Bottom - side - (int)(72 * k)),
                };
                int left = seconds;
                form.Paint += (s, e) =>
                {
                    e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                    using (var font = new Font("Segoe UI", 22f * (float)k / (e.Graphics.DpiY / 96f), FontStyle.Bold))
                        TextRenderer.DrawText(e.Graphics, left.ToString(), font, form.ClientRectangle, Color.FromArgb(0x95, 0x61, 0xf3), TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
                };
                form.Shown += (s, e) => Native.Rounded(form.Handle);
                var timer = new Timer { Interval = 1000 };
                timer.Tick += (s, e) =>
                {
                    if (--left > 0) { form.Invalidate(); return; }
                    timer.Stop(); timer.Dispose();
                    form.Close(); form.Dispose();
                    var t = new Timer { Interval = 120 };
                    t.Tick += (a, b) => { t.Stop(); t.Dispose(); then(); };
                    t.Start();
                };
                form.Show();
                timer.Start();
            }
        }

        // After a capture: a small card at the bottom right, without taking the focus; a click opens the annotation.
        class Note : Form
        {
            readonly Timer fade;
            Bitmap thumb;
            string path;
            DateTime shownAt;

            public Note()
            {
                FormBorderStyle = FormBorderStyle.None;
                StartPosition = FormStartPosition.Manual;
                ShowInTaskbar = false;
                TopMost = true;
                AutoScaleMode = AutoScaleMode.None;
                BackColor = Color.FromArgb(0x14, 0x15, 0x1b);
                DoubleBuffered = true;
                Cursor = Cursors.Hand;
                fade = new Timer { Interval = 16 };
                fade.Tick += (s, e) =>
                {
                    double t = (DateTime.Now - shownAt).TotalMilliseconds;
                    if (ClientRectangle.Contains(PointToClient(Cursor.Position))) { shownAt = DateTime.Now.AddMilliseconds(-200); Opacity = 1; return; }
                    if (t < 150) Opacity = t / 150;
                    else if (t < 5000) Opacity = 1;
                    else if (t < 5400) Opacity = 1 - (t - 5000) / 400;
                    else { fade.Stop(); Hide(); }
                };
                Click += (s, e) => { fade.Stop(); Hide(); Annotate(path); };
            }

            protected override bool ShowWithoutActivation { get { return true; } }
            protected override CreateParams CreateParams { get { var p = base.CreateParams; p.ExStyle |= Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE; return p; } }

            public void Show(string path, Bitmap image)
            {
                this.path = path;
                var screen = Screen.FromPoint(Cursor.Position);
                double k = Arrange.Scale(screen);
                int th = (int)(56 * k), tw = Math.Max(1, Math.Min((int)(96 * k), image.Width * th / Math.Max(1, image.Height)));
                if (thumb != null) thumb.Dispose();
                thumb = new Bitmap(tw, th);
                using (var g = Graphics.FromImage(thumb)) { g.InterpolationMode = InterpolationMode.HighQualityBicubic; g.DrawImage(image, 0, 0, tw, th); }
                Size = new Size((int)(300 * k), (int)(80 * k));
                Location = new Point(screen.WorkingArea.Right - Width - (int)(16 * k), screen.WorkingArea.Bottom - Height - (int)(16 * k));
                Native.Rounded(Handle);
                shownAt = DateTime.Now;
                if (!Visible) { Opacity = 0; base.Show(); }
                Invalidate();
                fade.Start();
            }

            protected override void OnPaint(PaintEventArgs e)
            {
                double k = Arrange.Scale(Screen.FromControl(this));
                float points = (float)k / (e.Graphics.DpiY / 96f);
                var g = e.Graphics;
                using (var edge = new Pen(Color.FromArgb(40, 255, 255, 255))) g.DrawRectangle(edge, 0, 0, Width - 1, Height - 1);
                int pad = (int)(12 * k);
                if (thumb != null) g.DrawImage(thumb, pad, (Height - thumb.Height) / 2);
                int left = pad * 2 + (thumb != null ? thumb.Width : 0);
                var flags = TextFormatFlags.EndEllipsis | TextFormatFlags.NoPrefix | TextFormatFlags.SingleLine;
                using (var bold = new Font("Segoe UI", 10.5f * points, FontStyle.Bold))
                using (var small = new Font("Segoe UI", 9f * points))
                {
                    TextRenderer.DrawText(g, Language.T("Capture copied"), bold, new Rectangle(left, (int)(18 * k), Width - left - pad, (int)(22 * k)), Color.FromArgb(0xe8, 0xe9, 0xf0), flags);
                    TextRenderer.DrawText(g, Language.T("On the shelf, click to annotate"), small, new Rectangle(left, (int)(40 * k), Width - left - pad, (int)(20 * k)), Color.FromArgb(0x95, 0x61, 0xf3), flags);
                }
            }
        }
    }
}
