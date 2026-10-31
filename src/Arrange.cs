using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Windows.Forms;

namespace Lampfish
{
    class IconPosition { public string Id; public int X, Y; }

    class Layout
    {
        public string Name;
        public string Screens;
        public string Date;
        public List<IconPosition> Positions = new List<IconPosition>();
    }

    class ArrangeSettings
    {
        public List<Layout> Layouts = new List<Layout>();
        public bool RestoreAuto = false;
        public List<string> Categories = new List<string> { "folders", "apps", "files", "system" };
        public string Screen = "all";
        public string Arrangement = "left";
        public string LastSort = "name";
        public List<IconPosition> BeforeAuto;
        public string BeforeAutoScreens;
        public List<IconPosition> Original;
        public List<IconPosition> Placed;
        public List<List<IconPosition>> History = new List<List<IconPosition>>();
    }

    static class Arrange
    {
        static readonly Dictionary<string, string> icons = new Dictionary<string, string>();
        static readonly HashSet<string> sent = new HashSet<string>();
        static Timer restoreTimer;
        const int HistoryMax = 10;
        const int IconCacheMax = 1000;

        static ArrangeSettings R { get { return Program.R.Arrange; } }

        // The saved arrangement whose icons are on the desktop right now; any other change of the icons clears it.
        static string activeLayout;

        public static void Start()
        {
            if (Program.R.Arrange == null) Program.R.Arrange = new ArrangeSettings();
            restoreTimer = new Timer { Interval = 4000 };
            restoreTimer.Tick += (s, e) => { restoreTimer.Stop(); RestoreByScreens(); };
        }

        static List<Screen> Screens()
        {
            return Screen.AllScreens.OrderBy(s => s.Bounds.X).ThenBy(s => s.Bounds.Y).ToList();
        }

        public static string Signature()
        {
            return string.Join("|", Screens().Select(s => s.Bounds.Width + "x" + s.Bounds.Height + "@" + s.Bounds.X + "," + s.Bounds.Y));
        }

        static string Label(string signature)
        {
            var sizes = signature.Split('|').Select(p => p.Split('@')[0].Replace("x", " × ")).ToList();
            return (sizes.Count == 1 ? Language.T("1 screen") : Language.T("{0} screens", sizes.Count)) + " · " + string.Join(", ", sizes);
        }

        static List<Screen> TargetScreens()
        {
            var screens = Screens();
            int n;
            if (int.TryParse(R.Screen, out n) && n >= 1 && n <= screens.Count) return new List<Screen> { screens[n - 1] };
            return screens.OrderBy(s => s.Primary ? 0 : 1).ThenBy(s => s.Bounds.X).ToList();
        }

        static string Category(DesktopIcons.Element e)
        {
            if (e.Id.StartsWith("::") || (e.Attributes & DesktopIcons.SFGAO_FILESYSTEM) == 0) return "system";
            string ext = Path.GetExtension(e.Id).ToLowerInvariant();
            if ((e.Attributes & DesktopIcons.SFGAO_LINK) != 0 || ext == ".url" || ext == ".exe" || ext == ".appref-ms") return "apps";
            if ((e.Attributes & DesktopIcons.SFGAO_FOLDER) != 0 && (e.Attributes & DesktopIcons.SFGAO_STREAM) == 0) return "folders";
            return "files";
        }

        static DateTime Date(DesktopIcons.Element e)
        {
            try
            {
                if (File.Exists(e.Id)) return File.GetLastWriteTime(e.Id);
                if (Directory.Exists(e.Id)) return Directory.GetLastWriteTime(e.Id);
            }
            catch { }
            return DateTime.MinValue;
        }

        static long Size(DesktopIcons.Element e)
        {
            try { return File.Exists(e.Id) ? new FileInfo(e.Id).Length : 0; }
            catch { return 0; }
        }

        static readonly string[] Arrangements = { "left", "right", "top", "bottom", "frame", "center", "corners", "blocks" };

        static List<DesktopIcons.Element> Order(IEnumerable<DesktopIcons.Element> elements, string mode)
        {
            var name = StringComparer.CurrentCultureIgnoreCase;
            var sorted = elements.OrderBy(e => Category(e) == "system" ? 0 : Category(e) == "folders" ? 1 : 2);
            switch (mode)
            {
                case "type": sorted = sorted.ThenBy(e => e.Type ?? "", name).ThenBy(e => e.Name, name); break;
                case "date": sorted = sorted.ThenByDescending(Date).ThenBy(e => e.Name, name); break;
                case "size": sorted = sorted.ThenByDescending(Size).ThenBy(e => e.Name, name); break;
                default: sorted = sorted.ThenBy(e => e.Name, name); break;
            }
            return sorted.ToList();
        }

        static void Sort(string mode)
        {
            var elements = DesktopIcons.List(false);
            var groups = new List<List<DesktopIcons.Element>>();

            bool byCategory = mode == "categories" || R.Arrangement == "corners" || R.Arrangement == "blocks";
            if (byCategory)
                foreach (string c in R.Categories)
                    groups.Add(Order(elements.Where(e => Category(e) == c), mode == "categories" ? "name" : mode));
            else groups.Add(Order(elements, mode));
            ArrangeIcons(groups, R.Arrangement);
        }

        class Grid
        {
            public Rectangle Zone; public int Columns, Rows;
            public readonly HashSet<Point> Taken = new HashSet<Point>();
            readonly Size cell;
            // Windows draws the icon 5 px below the item position (measured at 100 and 125 %).
            const int lead = 5;
            readonly int icon, line, frame, edge;
            readonly Font font;
            double originX, originY, stepX, stepY;
            readonly Dictionary<int, double> shift = new Dictionary<int, double>();

            public Grid(Rectangle zone, Size c, double scale, int iconSize)
            {
                Zone = zone;
                cell = c;
                icon = (int)Math.Round(iconSize * scale);
                edge = (int)Math.Round(8 * scale);
                frame = Frame(c, scale);
                var title = SystemFonts.IconTitleFont;
                font = new Font(title.FontFamily, (float)(title.SizeInPoints * 96 / 72 * scale), title.Style, GraphicsUnit.Pixel);
                line = font.Height;
                Columns = Math.Max(1, (zone.Width - frame) / c.Width + 1);
                Rows = Math.Max(1, (zone.Height - line) / c.Height);
                originX = zone.X + Math.Max(0, (frame - icon) / 2);
                stepX = c.Width;
                Spread(Visual(1));
            }

            // The grid Windows itself snaps to: its cells from its own origin, with nothing spread over the work area.
            public Grid(Rectangle zone, Size c, double scale, int iconSize, Point origin)
            {
                Zone = zone;
                cell = c;
                icon = (int)Math.Round(iconSize * scale);
                edge = (int)Math.Round(8 * scale);
                frame = Frame(c, scale);
                font = SystemFonts.IconTitleFont;
                line = font.Height;
                originX = origin.X;
                originY = origin.Y;
                stepX = c.Width;
                stepY = c.Height;
                Columns = Math.Max(1, (zone.Right - origin.X + (c.Width - icon) / 2) / c.Width);
                Rows = Math.Max(1, (zone.Bottom - origin.Y) / c.Height);
            }

            int Visual(int lines) { return icon + lead + lines * line; }

            // The square an icon sits in, a little larger than the icon itself.
            public Rectangle Slot(Point cell)
            {
                var p = Pixel(new PointF(cell.X, cell.Y));
                int pad = Math.Max(3, edge * 3 / 4);
                return new Rectangle(p.X - pad, p.Y + lead - pad, icon + 2 * pad, icon + 2 * pad);
            }

            // The first row keeps half the space between two rows above it, as the columns do on the sides, so a title is never cut.
            // The last row sits a few pixels above the edge of the work area (the taskbar), so a full column reads as touching the bottom.
            void Spread(int bottom)
            {
                double step = Math.Max(cell.Height, (Zone.Height + Visual(1) - bottom) / (double)Rows), top = (step - Visual(1)) / 2;
                stepY = Rows > 1 ? Math.Max(step, (Zone.Height - top - edge - bottom) / (Rows - 1)) : step;
                originY = Zone.Y + top - lead;
            }

            int Lines(string name)
            {
                if (string.IsNullOrEmpty(name)) return 1;
                var size = TextRenderer.MeasureText(name, font, new Size(int.MaxValue, int.MaxValue), TextFormatFlags.NoPadding | TextFormatFlags.SingleLine);
                return size.Width > frame - 2 ? 2 : 1;
            }

            public void Fit(List<KeyValuePair<PointF, DesktopIcons.Element>> used, string arrangement)
            {
                if (used.Count == 0) return;
                float minX = used.Min(u => u.Key.X), maxX = used.Max(u => u.Key.X), minY = used.Min(u => u.Key.Y), maxY = used.Max(u => u.Key.Y);
                int bottom = used.Where(u => u.Key.Y == maxY).Max(u => Lines(u.Value.Name));
                if (arrangement == "center")
                {
                    int w = (int)(maxX - minX) + 1, h = (int)(maxY - minY) + 1;
                    stepY = cell.Height;
                    originX = Zone.X + (Zone.Width - w * cell.Width) / 2.0 + Math.Max(0, (cell.Width - icon) / 2) - minX * cell.Width;
                    originY = Zone.Y + (Zone.Height - ((h - 1) * cell.Height + Visual(bottom))) / 2.0 - lead - minY * cell.Height;
                    foreach (var row in used.GroupBy(u => (int)u.Key.Y))
                        shift[row.Key] = (w - row.Count()) * cell.Width / 2.0;
                    return;
                }
                if (maxX >= Columns - 1 && Columns > 1) stepX = (Zone.Width - frame) / (double)(Columns - 1);
                if (maxY >= Rows - 1) Spread(Visual(bottom));
            }

            public Point Cell(Point pixel)
            {
                int x = (int)Math.Round((pixel.X - originX) / stepX), y = (int)Math.Round((pixel.Y - originY) / stepY);
                return new Point(Math.Max(0, Math.Min(Columns - 1, x)), Math.Max(0, Math.Min(Rows - 1, y)));
            }

            public Point Pixel(PointF p)
            {
                double extra;
                shift.TryGetValue((int)p.Y, out extra);
                return new Point((int)Math.Round(originX + extra + p.X * stepX), (int)Math.Round(originY + p.Y * stepY));
            }

            public IEnumerable<Point> InColumns()
            {
                for (int x = 0; x < Columns; x++) for (int y = 0; y < Rows; y++) yield return new Point(x, y);
            }
        }

        static List<Point> Row(int x0, int y0, int dx, int dy, int n)
        {
            return Enumerable.Range(0, n).Select(i => new Point(x0 + i * dx, y0 + i * dy)).ToList();
        }

        static int CenterWidth(Grid g, List<int> sizes, out bool apart)
        {
            int n = sizes.Sum(), w = Math.Max(1, Math.Min(g.Columns, (int)Math.Ceiling(Math.Sqrt(n * 2.2))));
            Func<int, int> lines = width => sizes.Sum(s => (s + width - 1) / width);
            while (lines(w) > g.Rows && w < g.Columns) w++;
            apart = lines(w) <= g.Rows;
            return w;
        }

        static List<List<Point>> Rows(string arrangement, Grid g, List<int> sizes)
        {
            int C = g.Columns, L = g.Rows;
            var r = new List<List<Point>>();
            switch (arrangement)
            {
                case "right": for (int x = C - 1; x >= 0; x--) r.Add(Row(x, 0, 0, 1, L)); break;
                case "top": for (int y = 0; y < L; y++) r.Add(Row(0, y, 1, 0, C)); break;
                case "bottom": for (int y = L - 1; y >= 0; y--) r.Add(Row(0, y, 1, 0, C)); break;
                case "center":
                {
                    bool apart;
                    int w = CenterWidth(g, sizes, out apart), n = sizes.Sum();
                    int h = Math.Min(L, apart ? sizes.Sum(s => (s + w - 1) / w) : (n + w - 1) / w);
                    int x0 = (C - w) / 2, y0 = (L - h) / 2;
                    for (int y = 0; y < h; y++) r.Add(Row(x0, y0 + y, 1, 0, w));
                    break;
                }
                default: for (int x = 0; x < C; x++) r.Add(Row(x, 0, 0, 1, L)); break;
            }
            return r;
        }

        static List<PointF> Ring(int C, int L, int k)
        {
            int x0 = k, y0 = k, x1 = C - 1 - k, y1 = L - 1 - k;
            var turn = new List<PointF>();
            for (int x = x0; x <= x1; x++) turn.Add(new PointF(x, y0));
            for (int y = y0 + 1; y <= y1; y++) turn.Add(new PointF(x1, y));
            if (y1 > y0) for (int x = x1 - 1; x >= x0; x--) turn.Add(new PointF(x, y1));
            if (x1 > x0) for (int y = y1 - 1; y > y0; y--) turn.Add(new PointF(x0, y));
            return turn;
        }

        // Full rings from the edges inwards. A ring that is not full never shows holes: the outer one keeps its corners
        // and spaces the other icons evenly along each side, an inner one centers them on its top and bottom rows, then on its sides.
        static List<PointF> Frame(int n, int C, int L)
        {
            var all = new List<PointF>();
            for (int k = 0; n > 0 && k <= (Math.Min(C, L) - 1) / 2; k++)
            {
                var ring = Ring(C, L, k);
                if (n >= ring.Count) { all.AddRange(ring); n -= ring.Count; continue; }
                all.AddRange(k == 0 ? Spread(C, L, n) : Centered(C, L, k, n));
                n = 0;
            }
            return all;
        }

        static List<PointF> Spread(int C, int L, int r)
        {
            if (C < 3 || L < 3) return Ring(C, L, 0).Take(r).ToList();
            var corners = new[] { new PointF(0, 0), new PointF(C - 1, 0), new PointF(C - 1, L - 1), new PointF(0, L - 1) };
            if (r <= 4) return corners.Take(r).ToList();
            int s = r - 4, across = C - 2, down = L - 2;
            double share = s * across / (double)(across + down);
            // Top and bottom get the same number of icons, and so do the two sides, whenever the count allows it.
            int rows = s % 2 == 0 ? 2 * (int)Math.Round(share / 2) : (int)Math.Round(share);
            rows = Math.Max(0, Math.Min(Math.Min(2 * across, s), rows));
            int columns = s - rows;
            if (columns > 2 * down) { rows += columns - 2 * down; columns = 2 * down; }
            int top = (rows + 1) / 2, bottom = rows / 2, right = (columns + 1) / 2, left = columns / 2;
            var list = new List<PointF> { corners[0] };
            foreach (float x in Along(top, bottom, C)) list.Add(new PointF(x, 0));
            list.Add(corners[1]);
            foreach (float y in Along(right, left, L)) list.Add(new PointF(C - 1, y));
            list.Add(corners[2]);
            foreach (float x in Along(bottom, top, C)) list.Add(new PointF(C - 1 - x, L - 1));
            list.Add(corners[3]);
            foreach (float y in Along(left, right, L)) list.Add(new PointF(0, L - 1 - y));
            return list;
        }

        // Positions between two corners. Facing sides with as many icons share an even spacing, so they line up;
        // otherwise each side keeps to the cells of the grid, its gap in the middle, so the rows of both sides still match.
        static List<float> Along(int count, int facing, int length)
        {
            var list = new List<float>();
            int inside = length - 2;
            for (int i = 0; i < count; i++)
                list.Add(count == facing || inside <= 0 ? (i + 1) * (length - 1f) / (count + 1) : 1 + (float)Math.Round((i + .5) * inside / count - .5, MidpointRounding.AwayFromZero));
            return list;
        }

        static List<PointF> Centered(int C, int L, int k, int r)
        {
            int x0 = k, y0 = k, x1 = C - 1 - k, y1 = L - 1 - k, w = x1 - x0 + 1, sides = Math.Max(0, y1 - y0 - 1);
            var list = new List<PointF>();
            if (y1 == y0 || x1 == x0)
            {
                float start = ((y1 == y0 ? w : y1 - y0 + 1) - r) / 2f;
                for (int i = 0; i < r; i++) list.Add(y1 == y0 ? new PointF(x0 + start + i, y0) : new PointF(x0, y0 + start + i));
                return list;
            }
            int top = Math.Min(w, (r + 1) / 2), bottom = Math.Min(w, r - top), rest = r - top - bottom;
            int right = Math.Min(sides, (rest + 1) / 2), left = Math.Min(sides, rest / 2);
            for (int i = 0; i < top; i++) list.Add(new PointF(x0 + (w - top) / 2f + i, y0));
            for (int i = 0; i < right; i++) list.Add(new PointF(x1, y0 + 1 + (sides - right) / 2f + i));
            for (int i = 0; i < bottom; i++) list.Add(new PointF(x1 - (w - bottom) / 2f - i, y1));
            for (int i = 0; i < left; i++) list.Add(new PointF(x0, y1 - 1 - (sides - left) / 2f - i));
            return list;
        }

        // The smaller categories are sized first so the biggest one takes what is left; two blocks keep an empty row or column between them.
        static List<List<DesktopIcons.Element>> Balance(List<List<DesktopIcons.Element>> groups, int count)
        {
            var all = groups.SelectMany(x => x).ToList();
            count = Math.Max(1, Math.Min(count, all.Count));
            var result = new List<List<DesktopIcons.Element>>();
            for (int i = 0, start = 0; i < count; i++)
            {
                int size = all.Count / count + (i < all.Count % count ? 1 : 0);
                result.Add(all.GetRange(start, size));
                start += size;
            }
            return result;
        }

        static Size[] Corners(List<int> sizes, int C, int L)
        {
            int count = Math.Min(4, sizes.Count);
            var blocks = new Size[4];
            foreach (int i in Enumerable.Range(0, count).OrderBy(i => sizes[i]))
            {
                int m = sizes[i], beside = i ^ 1, below = i ^ 2, across = i ^ 3;
                int maxW = Math.Max(1, C - (blocks[beside].Width > 0 ? blocks[beside].Width + 1 : beside < count ? 2 : 0));
                int maxH = Math.Max(1, L - (blocks[below].Height > 0 ? blocks[below].Height + 1 : below < count ? 2 : 0));
                int h = Math.Max(1, Math.Min(maxH, (int)Math.Round(Math.Sqrt(m * (double)L / C))));
                int w = (m + h - 1) / h;
                while (w > maxW && h < maxH) { h++; w = (m + h - 1) / h; }
                Size d = blocks[across];
                while (d.Width > 0 && w + d.Width > C - 1 && h + d.Height > L - 1 && h > 1 && (m + h - 2) / (h - 1) <= maxW) { h--; w = (m + h - 1) / h; }
                blocks[i] = new Size(Math.Min(w, maxW), h);
            }
            return blocks;
        }

        static void ArrangeIcons(List<List<DesktopIcons.Element>> groups, string arrangement)
        {
            Size c = DesktopIcons.Case();
            if (c.Width <= 0 || c.Height <= 0) return;
            int iconSize = DesktopIcons.IconSize();
            var grids = TargetScreens().Select(s => new Grid(s.WorkingArea, c, Scale(s), iconSize)).ToList();
            if (grids.Count == 0) return;
            Place(Positions(groups, grids, arrangement));
            R.Placed = Capture();
        }

        static Dictionary<string, Point> Positions(List<List<DesktopIcons.Element>> groups, List<Grid> grids, string arrangement)
        {
            var slots = new Dictionary<string, KeyValuePair<Grid, KeyValuePair<PointF, DesktopIcons.Element>>>();
            var rest = new List<DesktopIcons.Element>();
            groups = groups.Where(g => g.Count > 0).ToList();
            Action<Grid, PointF, DesktopIcons.Element> set = (g, p, el) =>
            {
                g.Taken.Add(Point.Round(p));
                slots[el.Id] = new KeyValuePair<Grid, KeyValuePair<PointF, DesktopIcons.Element>>(g, new KeyValuePair<PointF, DesktopIcons.Element>(p, el));
            };

            // A desktop holds one big category and a few small ones (35 apps, 2 system icons): one block per category gave a huge block
            // and lone icons. The blocks share the icons evenly, in category order, as in the small pictures.
            if (arrangement == "corners" || arrangement == "blocks")
                groups = Balance(groups, arrangement == "corners" ? 4 : Math.Max(2, Math.Min(4, groups.Count)));

            if (arrangement == "corners")
            {
                Grid g = grids[0];
                int C = g.Columns, L = g.Rows;
                var blocks = Corners(groups.Select(x => x.Count).ToList(), C, L);
                var overflow = new List<KeyValuePair<int, DesktopIcons.Element>>();
                for (int i = 0; i < groups.Count; i++)
                {
                    if (i >= 4) { rest.AddRange(groups[i]); continue; }
                    bool right = i % 2 == 1, down = i >= 2;
                    Size b = blocks[i];
                    for (int k = 0; k < groups[i].Count; k++)
                    {
                        if (k >= b.Width * b.Height) { overflow.Add(new KeyValuePair<int, DesktopIcons.Element>(i, groups[i][k])); continue; }
                        int x = k / b.Height, y = k % b.Height;
                        set(g, new PointF(right ? C - 1 - x : x, down ? L - 1 - y : y), groups[i][k]);
                    }
                }
                // What a block cannot hold goes to the free cells nearest to its corner, not to the first free column.
                foreach (var o in overflow)
                {
                    bool right = o.Key % 2 == 1, down = o.Key >= 2;
                    var free = g.InColumns().Where(q => !g.Taken.Contains(q))
                        .Select(q => new { q, dx = right ? C - 1 - q.X : q.X, dy = down ? L - 1 - q.Y : q.Y })
                        .OrderBy(q => Math.Max(q.dx, q.dy)).ThenBy(q => q.dx).ThenBy(q => q.dy).FirstOrDefault();
                    if (free == null) rest.Add(o.Value); else set(g, free.q, o.Value);
                }
            }
            else if (arrangement == "blocks")
            {
                Grid g = grids[0];
                int C = g.Columns, L = g.Rows, n = groups.Count, h = Math.Min(L, 2);
                while (h < L && groups.Sum(gr => (gr.Count + h - 1) / h) + n - 1 > C) h++;
                var widths = groups.Select(gr => (gr.Count + h - 1) / h).ToList();
                int spare = Math.Max(0, C - widths.Sum()), x = 0;
                for (int k = 0; k < n; k++)
                {
                    var group = groups[k];
                    int w = widths[k];
                    if (x + w > C) { rest.AddRange(group); continue; }
                    for (int i = 0; i < group.Count; i++) set(g, new PointF(x + i % w, i / w), group[i]);
                    x += w + (n > 1 ? spare / (n - 1) + (k < spare % (n - 1) ? 1 : 0) : 0);
                }
            }
            else if (arrangement == "frame")
            {
                // Categories follow each other along the frame: an empty cell between two of them read as a missing icon.
                var queue = new Queue<DesktopIcons.Element>(groups.SelectMany(x => x));
                foreach (var g in grids)
                    foreach (var p in Frame(Math.Min(queue.Count, g.Columns * g.Rows), g.Columns, g.Rows)) set(g, p, queue.Dequeue());
                rest.AddRange(queue);
            }
            else
            {
                // Categories follow each other, in their order, as in the small pictures: one line per category left lines of a single icon.
                int total = groups.Sum(x => x.Count), done = 0;
                var sizes = new List<int> { total };
                int e = 0, li = 0, k = 0;
                var rows = Rows(arrangement, grids[0], sizes);
                for (int gi = 0; gi < groups.Count; gi++)
                {
                    var group = groups[gi];
                    for (int i = 0; i < group.Count; i++)
                    {
                        bool placed = false;
                        while (!placed && e < grids.Count)
                        {
                            if (li >= rows.Count)
                            {
                                e++; li = 0; k = 0;
                                if (e < grids.Count) rows = Rows(arrangement, grids[e], new List<int> { total - done });
                                continue;
                            }
                            if (k >= rows[li].Count) { li++; k = 0; continue; }
                            var p = rows[li][k++];
                            if (grids[e].Taken.Contains(p)) continue;
                            set(grids[e], p, group[i]);
                            placed = true;
                            done++;
                        }
                        if (!placed) rest.Add(group[i]);
                    }
                }
            }

            foreach (var el in rest)
            {
                var g = grids.FirstOrDefault(x => x.InColumns().Any(p => !x.Taken.Contains(p))) ?? grids.Last();
                var free = g.InColumns().Where(q => !g.Taken.Contains(q)).DefaultIfEmpty(new Point(g.Columns - 1, g.Rows - 1)).First();
                set(g, free, el);
            }
            foreach (var g in grids) g.Fit(slots.Values.Where(v => v.Key == g).Select(v => v.Value).ToList(), arrangement);
            return slots.ToDictionary(v => v.Key, v => v.Value.Key.Pixel(v.Value.Value.Key));
        }

        static bool Same(List<IconPosition> a, List<IconPosition> b)
        {
            if (a == null || b == null || a.Count == 0 || a.Count != b.Count) return false;
            var map = b.GroupBy(p => p.Id).ToDictionary(g => g.Key, g => g.First());
            IconPosition q;
            return a.All(p => map.TryGetValue(p.Id, out q) && Math.Abs(p.X - q.X) <= 2 && Math.Abs(p.Y - q.Y) <= 2);
        }

        class Resize { public List<IconPosition> Before; public Size Cell; public bool Arranged; public Dictionary<string, Grid> Seats; }
        static Resize pending;
        static bool resizing;
        static Timer resizeTimer;

        // Windows moves the icons by itself when their size changes, so the layout from before the first click of a series is kept until the series ends.
        static void ChangeIconSize(int size)
        {
            if (pending == null)
            {
                var before = Capture();
                pending = new Resize { Before = before, Cell = DesktopIcons.Case(), Arranged = Same(before, R.Placed) };
                if (DesktopGrid.On) pending.Seats = NativeGrids(pending.Cell, DesktopIcons.IconSize(), before);
            }
            DesktopIcons.SetIconSize(size);
            Program.Send(Map(false));
            if (resizeTimer != null) { resizeTimer.Stop(); resizeTimer.Dispose(); }
            resizeTimer = new Timer { Interval = 450 };
            resizeTimer.Tick += (s, e) => { resizeTimer.Stop(); resizeTimer.Dispose(); resizeTimer = null; var done = pending; pending = null; Reflow(done); };
            resizeTimer.Start();
        }

        static void Reflow(Resize r)
        {
            try
            {
                Size now = DesktopIcons.Case();
                if ((DesktopIcons.Flags() & DesktopIcons.FWF_AUTOARRANGE) != 0) return;
                if (now.Width <= 0 || r.Cell.Width <= 0) return;
                Remember(r.Before);
                resizing = true;
                if (r.Seats != null && DesktopGrid.On) Reseat(r, now);
                else if (r.Arranged) Sort(R.LastSort);
                else if (now == r.Cell) Place(r.Before.ToDictionary(p => p.Id, p => new Point(p.X, p.Y)), false);
                else
                {
                    int iconSize = DesktopIcons.IconSize();
                    var grids = Screen.AllScreens.Select(s => new Grid(s.WorkingArea, now, Scale(s), iconSize)).ToList();
                    Place(Keep(r.Before, r.Cell, grids));
                }
                Program.Send(Map(false));
                Program.SendState();
            }
            catch (Exception ex) { Program.Log(ex); }
            finally { resizing = false; }
        }

        // With the grid on, each icon keeps its cell on the grid Windows now snaps to, read from where it just seated the icons, and the grid stays on.
        static void Reseat(Resize r, Size now)
        {
            var grids = NativeGrids(now, DesktopIcons.IconSize(), Capture());
            var positions = new Dictionary<string, Point>();
            foreach (var p in r.Before.OrderBy(x => x.X).ThenBy(x => x.Y))
            {
                var at = new Point(p.X, p.Y);
                var screen = Screen.AllScreens.FirstOrDefault(x => x.Bounds.Contains(at)) ?? Screen.PrimaryScreen;
                var g = grids[screen.DeviceName];
                var was = r.Seats[screen.DeviceName].Cell(at);
                var cell = Free(g, new Point(Math.Min(g.Columns - 1, was.X), Math.Min(g.Rows - 1, was.Y)));
                g.Taken.Add(cell);
                positions[p.Id] = g.Pixel(cell);
            }
            Place(positions, false, true);
            DesktopGrid.Resume();
            if (r.Arranged) R.Placed = Capture();
        }

        // Each icon keeps its cell number in the new grid; one that no longer fits, or lands on another, takes the nearest free cell.
        static Dictionary<string, Point> Keep(List<IconPosition> before, Size old, List<Grid> grids)
        {
            var screens = Screen.AllScreens;
            var wanted = new List<KeyValuePair<IconPosition, Point>>();
            foreach (var p in before)
            {
                var screen = screens.FirstOrDefault(s => s.Bounds.Contains(p.X, p.Y)) ?? screens[0];
                var area = screen.WorkingArea;
                wanted.Add(new KeyValuePair<IconPosition, Point>(p, new Point((int)Math.Round((p.X - area.X) / (double)old.Width), (int)Math.Round((p.Y - area.Y) / (double)old.Height))));
            }
            var result = new Dictionary<string, Point>();
            foreach (var w in wanted.OrderBy(w => w.Value.X).ThenBy(w => w.Value.Y))
            {
                var screen = screens.FirstOrDefault(s => s.Bounds.Contains(w.Key.X, w.Key.Y)) ?? screens[0];
                var g = grids[Array.IndexOf(screens, screen)];
                var cell = Free(g, new Point(Math.Max(0, Math.Min(g.Columns - 1, w.Value.X)), Math.Max(0, Math.Min(g.Rows - 1, w.Value.Y))));
                g.Taken.Add(cell);
                result[w.Key.Id] = g.Pixel(cell);
            }
            return result;
        }

        // Every icon goes to the nearest cell of the grid of its screen, in the order of the screen, so the one that was there first keeps the cell.
        static void Align()
        {
            var now = Capture();
            if (now.Count == 0) return;
            Size c = DesktopIcons.Case();
            if (c.Width <= 0 || c.Height <= 0) return;
            int iconSize = DesktopIcons.IconSize();
            bool grid = DesktopGrid.On;
            var grids = grid ? NativeGrids(c, iconSize, now) : Screen.AllScreens.ToDictionary(s => s.DeviceName, s => new Grid(s.WorkingArea, c, Scale(s), iconSize));
            var positions = new Dictionary<string, Point>();
            foreach (var p in now.OrderBy(x => x.X).ThenBy(x => x.Y))
            {
                var screen = Screen.AllScreens.FirstOrDefault(x => x.Bounds.Contains(p.X, p.Y)) ?? Screen.PrimaryScreen;
                var g = grids[screen.DeviceName];
                var cell = Free(g, g.Cell(new Point(p.X, p.Y)));
                g.Taken.Add(cell);
                positions[p.Id] = g.Pixel(cell);
            }
            Place(positions, true, grid);
            R.Placed = Capture();
            DesktopGrid.Resume();
        }

        public static List<IconPosition> Snapshot() { return Capture(); }

        // The position of the icon under a point of the screen: its picture and two lines of name, in the frame Windows draws around them.
        public static Point? IconAt(Point pixel, List<IconPosition> icons, Size cell, int iconSize)
        {
            int high = Math.Min(cell.Height, (int)Math.Round((iconSize + 44) * Scale(Screen.FromPoint(pixel))));
            foreach (var p in icons)
                if (new Rectangle(p.X, p.Y, cell.Width, high).Contains(pixel)) return new Point(p.X, p.Y);
            return null;
        }
        public static void RememberNow() { Remember(); }
        public static void UndoLast() { Undo(); }

        // What the grid overlay draws: the cells of Windows' own grid on each screen, and which cell is the nearest to a point.
        public class GridScreen
        {
            public Rectangle Area;
            public List<Rectangle> Slots = new List<Rectangle>();
            public Func<Point, int> Nearest;
        }

        public static List<GridScreen> GridScreens()
        {
            var result = new List<GridScreen>();
            Size c = DesktopIcons.Case();
            if (c.Width <= 0 || c.Height <= 0) return result;
            var grids = NativeGrids(c, DesktopIcons.IconSize(), Capture());
            foreach (var s in Screen.AllScreens)
            {
                var g = grids[s.DeviceName];
                var screen = new GridScreen { Area = s.WorkingArea };
                for (int x = 0; x < g.Columns; x++) for (int y = 0; y < g.Rows; y++) screen.Slots.Add(g.Slot(new Point(x, y)));
                int rows = g.Rows;
                screen.Nearest = pixel => { var cell = g.Cell(pixel); return cell.X * rows + cell.Y; };
                result.Add(screen);
            }
            return result;
        }

        // Windows snaps an icon to multiples of its cell size from one origin for the whole desktop. That origin is read from the icons
        // already seated: the most common remainder of their positions, so the drawn cells are the ones an icon really falls into.
        static Dictionary<string, Grid> NativeGrids(Size c, int iconSize, List<IconPosition> icons)
        {
            Func<int, int, int> mod = (v, m) => ((v % m) + m) % m;
            Func<IEnumerable<int>, int> common = values => values.GroupBy(v => v).OrderByDescending(g => g.Count()).ThenBy(g => g.Key).Select(g => g.Key).DefaultIfEmpty(0).First();
            int ox = common(icons.Select(p => mod(p.X, c.Width))), oy = common(icons.Select(p => mod(p.Y, c.Height)));
            var grids = new Dictionary<string, Grid>();
            foreach (var s in Screen.AllScreens)
            {
                var zone = s.WorkingArea;
                var origin = new Point(zone.X + mod(ox - zone.X, c.Width), zone.Y + mod(oy - zone.Y, c.Height));
                grids[s.DeviceName] = new Grid(zone, c, Scale(s), iconSize, origin);
            }
            return grids;
        }

        static Point Free(Grid g, Point cell)
        {
            if (!g.Taken.Contains(cell)) return cell;
            Point best = cell;
            double distance = double.MaxValue;
            foreach (var c in g.InColumns())
            {
                if (g.Taken.Contains(c)) continue;
                double d = Math.Pow(c.X - cell.X, 2) * 1.5 + Math.Pow(c.Y - cell.Y, 2);
                if (d < distance) { distance = d; best = c; }
            }
            return best;
        }

        [System.Runtime.InteropServices.DllImport("user32.dll")] static extern IntPtr MonitorFromPoint(Point pt, int flags);
        [System.Runtime.InteropServices.DllImport("shcore.dll")] static extern int GetDpiForMonitor(IntPtr monitor, int type, out uint x, out uint y);

        [System.Runtime.InteropServices.DllImport("user32.dll")] static extern int GetSystemMetricsForDpi(int index, uint dpi);

        // The icon and its name are drawn in a frame as wide as the icon spacing of Windows, centered on the icon, which can be wider than a cell:
        // measured at 125 %, a 96 px cell and a 120 px frame, so a first column at the cell margin spilled 12 px onto the next screen.
        public static int Frame(Size cell, double scale)
        {
            int spacing = 0;
            try { spacing = GetSystemMetricsForDpi(38, (uint)Math.Round(scale * 96)) + 2; }
            catch { }
            return Math.Max(cell.Width, spacing);
        }

        public static double Scale(Screen s)
        {
            uint x, y;
            try { if (GetDpiForMonitor(MonitorFromPoint(new Point(s.Bounds.X + 1, s.Bounds.Y + 1), 2), 0, out x, out y) == 0) return x / 96.0; }
            catch { }
            return 1;
        }

        // Changes while Explorer is still resizing the desktop or moving the icons after a change of screens.
        public static string Fingerprint()
        {
            try { return DesktopIcons.Case() + " " + string.Join(";", Capture().Select(p => p.X + "," + p.Y)); }
            catch { return ""; }
        }

        static List<IconPosition> Capture()
        {
            return DesktopIcons.List(false).Select(e => new IconPosition { Id = e.Id, X = e.Position.X, Y = e.Position.Y }).ToList();
        }

        static void Remember(List<IconPosition> now = null)
        {
            now = now ?? Capture();
            if (now.Count == 0) return;
            if (R.Original == null) R.Original = now;
            R.History.Add(now);
            if (R.History.Count > HistoryMax) R.History.RemoveAt(0);
        }

        static void Apply(List<IconPosition> list)
        {
            var positions = new Dictionary<string, Point>();
            foreach (var p in list) positions[p.Id] = new Point(p.X, p.Y);
            Place(positions, false);
        }

        static void Undo()
        {
            if (R.History.Count == 0) return;
            var last = R.History[R.History.Count - 1];
            R.History.RemoveAt(R.History.Count - 1);
            Apply(last);
        }

        // Auto arrange and snapping would both pull the placed icons back to Windows' own cells, so both are lifted, and the grid with them.
        static void Place(Dictionary<string, Point> positions, bool remember = true, bool keepGrid = false)
        {
            if (remember && !resizing) Remember();
            uint flags = DesktopIcons.Flags();
            if ((flags & DesktopIcons.FWF_AUTOARRANGE) != 0) DesktopIcons.Flag(DesktopIcons.FWF_AUTOARRANGE, false);
            if ((flags & DesktopIcons.FWF_SNAPTOGRID) != 0)
            {
                DesktopIcons.Flag(DesktopIcons.FWF_SNAPTOGRID, false);
                if (!keepGrid) DesktopGrid.Lifted();
            }
            DesktopIcons.Place(Visible(positions));
        }

        // A position saved with other screens (undo, original layout, before auto arrange) can lie outside every screen.
        static Dictionary<string, Point> Visible(Dictionary<string, Point> positions)
        {
            var screens = Screen.AllScreens;
            Size cell = DesktopIcons.Case();
            var visible = new Dictionary<string, Point>();
            foreach (var item in positions)
            {
                Point p = item.Value;
                if (!screens.Any(x => x.Bounds.Contains(p)))
                {
                    var area = screens.Select(x => x.WorkingArea).OrderBy(a => Distance(a, p)).First();
                    p = new Point(Math.Max(area.Left, Math.Min(p.X, area.Right - Math.Max(1, cell.Width))), Math.Max(area.Top, Math.Min(p.Y, area.Bottom - Math.Max(1, cell.Height))));
                }
                visible[item.Key] = p;
            }
            return visible;
        }

        static double Distance(Rectangle a, Point p)
        {
            double dx = Math.Max(0, Math.Max(a.Left - p.X, p.X - a.Right)), dy = Math.Max(0, Math.Max(a.Top - p.Y, p.Y - a.Bottom));
            return dx * dx + dy * dy;
        }

        static void Save(string name)
        {
            name = (name ?? "").Trim();
            if (name.Length == 0)
                for (int i = 1; ; i++)
                    if (!R.Layouts.Any(x => x.Name == Language.T("Layout {0}", i))) { name = Language.T("Layout {0}", i); break; }
            if (name.Length > 40) name = name.Substring(0, 40).Trim();
            var d = new Layout { Name = name, Screens = Signature(), Date = DateTime.Now.ToString("s", CultureInfo.InvariantCulture) };
            d.Positions = Capture();
            R.Layouts.RemoveAll(x => x.Name == name);
            R.Layouts.Add(d);
            activeLayout = name;
        }

        static void Restore(Layout d)
        {
            Remember();
            Apply(d.Positions);
        }

        static void Erase(int index)
        {
            if (index < 0 || index >= R.Layouts.Count) return;
            var d = R.Layouts[index];
            R.Layouts.RemoveAt(index);
            Program.UndoableRemoval(d.Name, () => R.Layouts.Insert(Math.Min(index, R.Layouts.Count), d));
        }

        // The desktop icons follow the main screen: read before the change, the returned action puts the icons of the old main screen
        // on the new one cell for cell, and the reverse. An arrangement made by lampfish is made again on the new main screen.
        public static Action FollowPrimary(string from, string to)
        {
            try
            {
                var now = Capture();
                if (now.Count == 0) return null;
                bool placed = Same(now, R.Placed);
                Size c = DesktopIcons.Case();
                int iconSize = DesktopIcons.IconSize();
                var cells = new List<Tuple<string, string, Point>>();
                foreach (var p in now)
                {
                    var s = Screen.AllScreens.FirstOrDefault(x => x.Bounds.Contains(p.X, p.Y)) ?? Screen.PrimaryScreen;
                    cells.Add(Tuple.Create(p.Id, s.DeviceName, new Grid(s.WorkingArea, c, Scale(s), iconSize).Cell(new Point(p.X, p.Y))));
                }
                List<IconPosition> done = null;
                return () =>
                {
                    if (done != null) { if (!Same(Capture(), done)) Apply(done); return; }
                    if (placed) { Sort(R.LastSort); done = Capture(); return; }
                    var grids = Screen.AllScreens.ToDictionary(s => s.DeviceName, s => new Grid(s.WorkingArea, DesktopIcons.Case(), Scale(s), DesktopIcons.IconSize()));
                    var positions = new Dictionary<string, Point>();
                    foreach (var t in cells)
                    {
                        string device = t.Item2 == from ? to : t.Item2 == to ? from : t.Item2;
                        Grid g;
                        if (!grids.TryGetValue(device, out g)) continue;
                        var cell = Free(g, new Point(Math.Min(g.Columns - 1, t.Item3.X), Math.Min(g.Rows - 1, t.Item3.Y)));
                        g.Taken.Add(cell);
                        positions[t.Item1] = g.Pixel(cell);
                    }
                    Place(positions);
                    done = Capture();
                };
            }
            catch (Exception ex) { Program.Log(ex); return null; }
        }

        // Saved positions are desktop coordinates, which all move when the main screen changes. A layout saved with other screens
        // keeps its coordinates: they were made with another main screen and still match those screens when they come back.
        public static void Moved(int dx, int dy, string before)
        {
            Action<List<IconPosition>> shift = list => { if (list != null) foreach (var p in list) { p.X += dx; p.Y += dy; } };
            Func<string, string> sign = s => s == null ? null : string.Join("|", s.Split('|').Select(part =>
            {
                var m = System.Text.RegularExpressions.Regex.Match(part, @"^(\d+x\d+)@(-?\d+),(-?\d+)$");
                return m.Success ? m.Groups[1].Value + "@" + (int.Parse(m.Groups[2].Value) + dx) + "," + (int.Parse(m.Groups[3].Value) + dy) : part;
            }));
            foreach (var d in R.Layouts.Where(x => x.Screens == before)) { shift(d.Positions); d.Screens = sign(d.Screens); }
            if (R.BeforeAutoScreens == null || R.BeforeAutoScreens == before) { shift(R.BeforeAuto); R.BeforeAutoScreens = sign(R.BeforeAutoScreens); }
            shift(R.Original); shift(R.Placed);
            foreach (var h in R.History) shift(h);
            switched = sign(before);
        }

        // The screens a change of main screen leads to: the icons follow the main screen there, a saved layout must not pull them back.
        static string switched;

        public static void ScreensChanged()
        {
            if (R.RestoreAuto && restoreTimer != null) { restoreTimer.Stop(); restoreTimer.Start(); }
        }

        static void RestoreByScreens()
        {
            string signature = Signature();
            if (signature == switched) { switched = null; return; }
            switched = null;
            var d = R.Layouts.LastOrDefault(x => x.Screens == signature);
            if (d == null) return;
            try
            {
                Restore(d);
                Program.Announce("“{0}” restored", d.Name);
                Program.SendState();
            }
            catch (Exception ex) { Program.Log(ex); }
        }

        static object Map(bool full)
        {
            if (full || icons.Count > IconCacheMax) { sent.Clear(); if (icons.Count > IconCacheMax) icons.Clear(); }
            var screens = Screens();
            var elements = DesktopIcons.List(false);
            if (elements.Any(e => !icons.ContainsKey(e.Id))) elements = DesktopIcons.List(true);
            uint flags = DesktopIcons.Flags();
            Size c = DesktopIcons.Case();
            return new
            {
                type = "arrange.map",
                screens = screens.Select((s, i) => new
                {
                    n = i + 1,
                    x = s.Bounds.X, y = s.Bounds.Y, w = s.Bounds.Width, h = s.Bounds.Height,
                    tx = s.WorkingArea.X, ty = s.WorkingArea.Y, tw = s.WorkingArea.Width, th = s.WorkingArea.Height,
                    primary = s.Primary,
                    scale = Scale(s),
                    frame = Frame(c, Scale(s)),
                }).ToArray(),
                elements = elements.Select(e =>
                {
                    string image = null;
                    if (e.Icon != null)
                    {
                        if (!icons.ContainsKey(e.Id)) icons[e.Id] = ToDataUrl(e.Icon);
                        e.Icon.Dispose();
                    }
                    if (icons.ContainsKey(e.Id) && sent.Add(e.Id)) image = icons[e.Id];
                    return new { id = e.Id, name = e.Name, cat = Category(e), x = e.Position.X, y = e.Position.Y, icon = image };
                }).ToArray(),
                caseW = c.Width, caseH = c.Height,
                iconSize = DesktopIcons.IconSize(),
                auto = (flags & DesktopIcons.FWF_AUTOARRANGE) != 0,
                grid = (flags & DesktopIcons.FWF_SNAPTOGRID) != 0,
                hidden = (flags & DesktopIcons.FWF_NOICONS) != 0,
            };
        }

        static string ToDataUrl(Icon icon)
        {
            using (var b = icon.ToBitmap())
            using (var stream = new MemoryStream())
            {
                b.Save(stream, ImageFormat.Png);
                return "data:image/png;base64," + Convert.ToBase64String(stream.ToArray());
            }
        }

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            if (action != "map" && action != "restore" && action != "save" && action != "erase") activeLayout = null;
            try
            {
                switch (action)
                {
                    case "map": Program.Send(Map(m.ContainsKey("full") && Convert.ToBoolean(m["full"]))); return false;
                    case "move":
                        Place(new Dictionary<string, Point> { { Text(m, "id"), new Point(Convert.ToInt32(m["x"]), Convert.ToInt32(m["y"])) } }, true, DesktopGrid.On);
                        DesktopGrid.Resume();
                        Program.Send(Map(false));
                        return true;
                    case "sort":
                        R.LastSort = Text(m, "mode") ?? "name";
                        Sort(R.LastSort);
                        Program.Send(Map(false));
                        return true;
                    case "arrangement":
                    {
                        string a = Text(m, "value");
                        if (!Arrangements.Contains(a)) return false;
                        R.Arrangement = a;
                        Sort(R.LastSort);
                        Program.Send(Map(false));
                        return true;
                    }
                    case "screen": R.Screen = Text(m, "value") ?? "all"; return true;
                    case "auto":
                    {
                        bool active = Convert.ToBoolean(m["value"]);
                        if (active) { R.BeforeAuto = Capture(); R.BeforeAutoScreens = Signature(); }
                        DesktopIcons.Flag(DesktopIcons.FWF_AUTOARRANGE, active);
                        if (!active && R.BeforeAuto != null && R.BeforeAuto.Count > 0 && R.BeforeAutoScreens == Signature())
                        {
                            var positions = new Dictionary<string, Point>();
                            foreach (var p in R.BeforeAuto) positions[p.Id] = new Point(p.X, p.Y);
                            DesktopIcons.Place(Visible(positions));
                        }
                        if (!active) { R.BeforeAuto = null; R.BeforeAutoScreens = null; }
                        Program.Send(Map(false));
                        return true;
                    }
                    case "align": Align(); Program.Send(Map(false)); return true;
                    case "iconSize": ChangeIconSize(Convert.ToInt32(m["value"])); return false;
                    case "hide": DesktopIcons.Flag(DesktopIcons.FWF_NOICONS, Convert.ToBoolean(m["value"])); Program.Send(Map(false)); return false;
                    case "category":
                    {
                        string cat = Text(m, "cat");
                        int i = R.Categories.IndexOf(cat), j = i + Convert.ToInt32(m["direction"]);
                        if (i < 0 || j < 0 || j >= R.Categories.Count) return false;
                        R.Categories[i] = R.Categories[j];
                        R.Categories[j] = cat;
                        return true;
                    }
                    case "order":
                    {
                        var order = ((System.Collections.ArrayList)m["categories"]).Cast<object>().Select(x => x.ToString()).ToList();
                        if (order.Count != R.Categories.Count || order.Except(R.Categories).Any()) return false;
                        R.Categories = order;
                        return true;
                    }
                    case "save": Save(Text(m, "name")); return true;
                    case "restore":
                    {
                        int i = Convert.ToInt32(m["index"]);
                        if (i < 0 || i >= R.Layouts.Count) return false;
                        Restore(R.Layouts[i]);
                        activeLayout = R.Layouts[i].Name;
                        Program.Send(Map(false));
                        return true;
                    }
                    case "undo": Undo(); Program.Send(Map(false)); return true;
                    case "original":
                        if (R.Original == null) return false;
                        Remember();
                        Apply(R.Original);
                        Program.Send(Map(false));
                        return true;
                    case "erase": Erase(Convert.ToInt32(m["index"])); return true;
                    case "resetAll":
                    {
                        var defaults = new ArrangeSettings();
                        var categories = R.Categories.ToList();
                        string screen = R.Screen, arrangement = R.Arrangement, sort = R.LastSort;
                        bool moved = R.Original != null;
                        if (moved) { Remember(); Apply(R.Original); }
                        R.Categories = defaults.Categories; R.Screen = defaults.Screen; R.Arrangement = defaults.Arrangement; R.LastSort = defaults.LastSort;
                        Program.Undoable(Language.T("Arrange reset"), () =>
                        {
                            R.Categories = categories; R.Screen = screen; R.Arrangement = arrangement; R.LastSort = sort;
                            if (moved) Undo();
                            Program.Send(Map(false));
                        });
                        Program.Send(Map(false));
                        return true;
                    }
                    case "restoreAuto": R.RestoreAuto = Convert.ToBoolean(m["value"]); return true;
                }
            }
            catch (Exception ex)
            {
                Program.Log(ex);
                Program.Announce("Desktop unavailable for now");
                return true;
            }
            return false;
        }

        public static object State()
        {
            string signature = Signature();
            int n = Screens().Count, chosen;
            if (R.Screen != "all" && !(int.TryParse(R.Screen, out chosen) && chosen >= 1 && chosen <= n)) R.Screen = "all";
            int active = -1;
            if (activeLayout != null)
            {
                active = R.Layouts.FindIndex(d => d.Name == activeLayout && d.Screens == signature);
                if (active >= 0 && !Same(Capture(), R.Layouts[active].Positions)) active = -1;
                if (active < 0) activeLayout = null;
            }
            return new
            {
                active = active,
                layouts = R.Layouts.Select(d => new { name = d.Name, screens = Label(d.Screens), signature = d.Screens, date = d.Date, current = d.Screens == signature, points = d.Positions.Select(p => new[] { p.X, p.Y }).ToArray() }).ToArray(),
                restoreAuto = R.RestoreAuto,
                canUndo = R.History.Count > 0,
                hasOriginal = R.Original != null,
                categories = R.Categories.ToArray(),
                screen = R.Screen,
                arrangement = R.Arrangement,
                lastSort = R.LastSort,
                nbScreens = n,
                configuration = Label(signature),
            };
        }

        static string Text(Dictionary<string, object> m, string key)
        {
            object v;
            return m.TryGetValue(key, out v) && v != null ? v.ToString() : null;
        }
    }
}
