using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Linq;
using System.Windows.Forms;

namespace Lampfish
{
    static class Tray
    {
        static NotifyIcon icon;
        static ContextMenuStrip menu;
        static ToolStripMenuItem open, next, pause, moods, sounds, quit;
        static readonly Dictionary<string, Image> pictures = new Dictionary<string, Image>();

        public static void Create()
        {
            menu = new ContextMenuStrip { Renderer = new Renderer(), ShowImageMargin = true, ShowCheckMargin = true, Padding = new Padding(4, 6, 4, 6) };
            open = Item((s, e) => Program.OpenSettings());
            open.Font = new Font(menu.Font, FontStyle.Bold);
            next = Item((s, e) => Program.NextWallpaper());
            pause = Item((s, e) => Program.TogglePause());
            moods = Item(null);
            ((ToolStripDropDownMenu)moods.DropDown).ShowImageMargin = false;
            moods.DropDown.Renderer = menu.Renderer;
            moods.DropDown.Padding = menu.Padding;
            moods.DropDown.HandleCreated += (s, e) => Native.Rounded(((Control)s).Handle);
            sounds = Item((s, e) => { Sounds.Toggle(); Program.Save(); Update(); Program.SendState(); });
            quit = Item((s, e) => Program.Quit());
            menu.Items.AddRange(new ToolStripItem[] { open, new ToolStripSeparator(), next, pause, moods, sounds, new ToolStripSeparator(), quit });
            menu.HandleCreated += (s, e) => Native.Rounded(menu.Handle);
            menu.Opening += (s, e) => Update();

            icon = new NotifyIcon { Icon = new Icon(Program.AppIcon, SystemInformation.SmallIconSize), Text = "lampfish", ContextMenuStrip = menu, Visible = true };
            icon.MouseUp += (s, e) => { if (e.Button == MouseButtons.Left) Program.OpenSettings(); };
            Update();
        }

        static Image Picture(string name)
        {
            string key = name + Appearance.Light;
            Image known;
            if (pictures.TryGetValue(key, out known)) return known;
            try
            {
                var image = Image.FromFile(System.IO.Path.Combine(Program.Root, "app", "ui", "tray", name + ".png"));
                if (Appearance.Light) image = Inked(image);
                pictures[key] = image;
                return image;
            }
            catch (Exception ex) { Program.Log(ex); return null; }
        }

        // The pictures are white: on the light menu they take the color of the text.
        static Image Inked(Image white)
        {
            var inked = new Bitmap(white.Width, white.Height, PixelFormat.Format32bppArgb);
            var matrix = new ColorMatrix { Matrix00 = 13 / 255f, Matrix11 = 19 / 255f, Matrix22 = 21 / 255f };
            using (var g = Graphics.FromImage(inked))
            using (var attributes = new ImageAttributes())
            {
                attributes.SetColorMatrix(matrix);
                g.DrawImage(white, new Rectangle(0, 0, white.Width, white.Height), 0, 0, white.Width, white.Height, GraphicsUnit.Pixel, attributes);
            }
            white.Dispose();
            return inked;
        }

        static ToolStripMenuItem Item(EventHandler click)
        {
            var item = new ToolStripMenuItem { Padding = new Padding(2, 5, 2, 5) };
            if (click != null) item.Click += click;
            return item;
        }

        public static void Update()
        {
            if (icon == null) return;
            open.Text = Language.T("Open lampfish");
            open.Image = Picture("open");
            next.Image = Picture("next");
            moods.Image = Picture("themes");
            sounds.Image = Picture("sounds");
            quit.Image = Picture("quit");
            next.Text = Language.T("Next wallpaper");
            next.Enabled = Program.WallpaperCount > 1;
            pause.Text = Language.T(Program.Paused ? "Resume wallpaper" : "Pause wallpaper");
            pause.Image = Picture(Program.Paused ? "resume" : "pause");
            moods.Text = Language.T("Themes");
            sounds.Text = Language.T("Sounds");
            sounds.Checked = Sounds.Active;
            quit.Text = Language.T("Quit");

            moods.DropDownItems.Clear();
            var active = Moods.Active();
            foreach (var m in Program.R.Moods)
            {
                string id = m.Id;
                var item = Item((s, e) => Moods.ApplyById(id));
                item.Text = m.Name.Replace("&", "&&");
                item.Checked = m == active;
                moods.DropDownItems.Add(item);
            }
            moods.Enabled = moods.DropDownItems.Count > 0;
        }

        public static void Hide()
        {
            if (icon != null) icon.Visible = false;
        }

        class Colors : ProfessionalColorTable
        {
            static Color Back { get { return Appearance.Light ? Color.FromArgb(219, 224, 225) : Color.FromArgb(25, 30, 31); } }
            public static Color Line { get { return Appearance.Light ? Color.FromArgb(190, 197, 199) : Color.FromArgb(39, 46, 47); } }
            public override Color ToolStripDropDownBackground { get { return Back; } }
            public override Color ImageMarginGradientBegin { get { return Back; } }
            public override Color ImageMarginGradientMiddle { get { return Back; } }
            public override Color ImageMarginGradientEnd { get { return Back; } }
            public override Color MenuBorder { get { return Line; } }
            public override Color MenuItemBorder { get { return Color.Transparent; } }
            public override Color MenuItemSelected { get { return Line; } }
            public override Color SeparatorDark { get { return Line; } }
            public override Color SeparatorLight { get { return Back; } }
        }

        class Renderer : ToolStripProfessionalRenderer
        {
            static Color Text { get { return Appearance.Light ? Color.FromArgb(13, 19, 21) : Color.FromArgb(255, 255, 255); } }
            static Color Pale { get { return Appearance.Light ? Color.FromArgb(54, 66, 74) : Color.FromArgb(147, 153, 155); } }
            static Color Accent { get { return Appearance.Light ? Color.FromArgb(10, 116, 105) : Color.FromArgb(30, 187, 170); } }

            public Renderer() : base(new Colors()) { RoundedEdges = false; }

            protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e)
            {
                if (!e.Item.Selected || !e.Item.Enabled) return;
                var r = new Rectangle(2, 0, e.Item.Width - 4, e.Item.Height);
                using (var path = Round(r, 5))
                using (var brush = new SolidBrush(Colors.Line))
                {
                    e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                    e.Graphics.FillPath(brush, path);
                }
            }

            protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
            {
                e.TextColor = e.Item.Enabled ? Text : Pale;
                base.OnRenderItemText(e);
            }

            protected override void OnRenderArrow(ToolStripArrowRenderEventArgs e)
            {
                e.ArrowColor = e.Item.Enabled ? Text : Pale;
                base.OnRenderArrow(e);
            }

            protected override void OnRenderItemCheck(ToolStripItemImageRenderEventArgs e)
            {
                var g = e.Graphics;
                g.SmoothingMode = SmoothingMode.AntiAlias;
                var r = e.ImageRectangle;
                float x = r.X + r.Width / 2f, y = r.Y + r.Height / 2f;
                using (var pen = new Pen(Accent, 1.8f) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round })
                    g.DrawLines(pen, new[] { new PointF(x - 4.5f, y), new PointF(x - 1.5f, y + 3f), new PointF(x + 4.5f, y - 3.5f) });
            }

            protected override void OnRenderSeparator(ToolStripSeparatorRenderEventArgs e)
            {
                int y = e.Item.Height / 2;
                using (var pen = new Pen(Colors.Line))
                    e.Graphics.DrawLine(pen, 10, y, e.Item.Width - 10, y);
            }

            static GraphicsPath Round(Rectangle r, int radius)
            {
                var path = new GraphicsPath();
                int d = radius * 2;
                path.AddArc(r.X, r.Y, d, d, 180, 90);
                path.AddArc(r.Right - d - 1, r.Y, d, d, 270, 90);
                path.AddArc(r.Right - d - 1, r.Bottom - d - 1, d, d, 0, 90);
                path.AddArc(r.X, r.Bottom - d - 1, d, d, 90, 90);
                path.CloseFigure();
                return path;
            }
        }
    }
}
