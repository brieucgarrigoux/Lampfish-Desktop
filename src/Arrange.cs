using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Windows.Forms;

namespace Bramble
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

        static string Signature()
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
            ArrangeIcons(groups, elements, R.Arrangement);
        }

        class Grid
        {
            public Rectangle Zone; public int Columns, Rows;
            public readonly HashSet<Point> Taken = new HashSet<Point>();
            readonly Size cell;
            readonly int icon, lead, line;
            readonly Font font;
            double originX, originY, stepX, stepY;
            readonly Dictionary<int, double> shift = new Dictionary<int, double>();

            public Grid(Rectangle zone, Size c, double scale, int iconSize)
            {
                Zone = zone;
                cell = c;
                icon = (int)Math.Round(iconSize * scale);
                lead = (int)Math.Round(4 * scale, MidpointRounding.AwayFromZero);
                var title = SystemFonts.IconTitleFont;
                font = new Font(title.FontFamily, (float)(title.SizeInPoints * 96 / 72 * scale), title.Style, GraphicsUnit.Pixel);
                line = font.Height;
                Columns = Math.Max(1, zone.Width / c.Width);
                Rows = Math.Max(1, (zone.Height - line) / c.Height);
                originX = zone.X + Math.Max(0, (c.Width - icon) / 2);
                stepX = c.Width;
                Spread(Visual(1));
            }

            // Windows draws the icon a few pixels below the item position, so this runs from the top of the icon to the bottom of its name.
            int Visual(int lines) { return icon + lead + lines * line; }

            // Like the columns, the rows keep half the space between two rows above the first one and below the last one.
            void Spread(int bottom)
            {
                stepY = Math.Max(cell.Height, (Zone.Height + Visual(1) - bottom) / (double)Rows);
                originY = Zone.Y + (stepY - Visual(1)) / 2 - lead;
            }

            int Lines(string name)
            {
                if (string.IsNullOrEmpty(name)) return 1;
                var size = TextRenderer.MeasureText(name, font, new Size(int.MaxValue, int.MaxValue), TextFormatFlags.NoPadding | TextFormatFlags.SingleLine);
                return size.Width > cell.Width - lead * 2 ? 2 : 1;
            }

            public void Fit(List<KeyValuePair<Point, DesktopIcons.Element>> used, string arrangement)
            {
                if (used.Count == 0) return;
                int minX = used.Min(u => u.Key.X), maxX = used.Max(u => u.Key.X), minY = used.Min(u => u.Key.Y), maxY = used.Max(u => u.Key.Y);
                int bottom = used.Where(u => u.Key.Y == maxY).Max(u => Lines(u.Value.Name));
                if (arrangement == "center")
                {
                    int w = maxX - minX + 1, h = maxY - minY + 1;
                    stepY = cell.Height;
                    originX = Zone.X + (Zone.Width - w * cell.Width) / 2.0 + Math.Max(0, (cell.Width - icon) / 2) - minX * cell.Width;
                    originY = Zone.Y + (Zone.Height - ((h - 1) * cell.Height + Visual(bottom))) / 2.0 - lead - minY * cell.Height;
                    foreach (var row in used.GroupBy(u => u.Key.Y))
                        shift[row.Key] = (w - row.Count()) * cell.Width / 2.0;
                    return;
                }
                if (maxX == Columns - 1 && Columns > 1) stepX = (Zone.Width - cell.Width) / (double)(Columns - 1);
                if (maxY == Rows - 1) Spread(Visual(bottom));
            }

            public Point Pixel(Point p)
            {
                double extra;
                shift.TryGetValue(p.Y, out extra);
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

        static List<List<Point>> Rows(string arrangement, Grid g, int n)
        {
            int C = g.Columns, L = g.Rows;
            var r = new List<List<Point>>();
            switch (arrangement)
            {
                case "right": for (int x = C - 1; x >= 0; x--) r.Add(Row(x, 0, 0, 1, L)); break;
                case "top": for (int y = 0; y < L; y++) r.Add(Row(0, y, 1, 0, C)); break;
                case "bottom": for (int y = L - 1; y >= 0; y--) r.Add(Row(0, y, 1, 0, C)); break;
                case "frame":

                    for (int k = 0; k < (Math.Min(C, L) + 1) / 2; k++)
                    {
                        int x0 = k, y0 = k, x1 = C - 1 - k, y1 = L - 1 - k;
                        var turn = new List<Point>();
                        for (int x = x0; x <= x1; x++) turn.Add(new Point(x, y0));
                        for (int y = y0 + 1; y <= y1; y++) turn.Add(new Point(x1, y));
                        if (y1 > y0) for (int x = x1 - 1; x >= x0; x--) turn.Add(new Point(x, y1));
                        if (x1 > x0) for (int y = y1 - 1; y > y0; y--) turn.Add(new Point(x0, y));
                        r.Add(turn);
                    }
                    break;
                case "center":
                {
                    int w = Math.Max(1, Math.Min(C, (int)Math.Ceiling(Math.Sqrt(n * 2.2))));
                    int h = Math.Min(L, (n + w - 1) / w);
                    int x0 = (C - w) / 2, y0 = (L - h) / 2;
                    for (int y = 0; y < h; y++) r.Add(Row(x0, y0 + y, 1, 0, w));
                    break;
                }
                default: for (int x = 0; x < C; x++) r.Add(Row(x, 0, 0, 1, L)); break;
            }
            return r;
        }

        static void ArrangeIcons(List<List<DesktopIcons.Element>> groups, List<DesktopIcons.Element> all, string arrangement)
        {
            Size c = DesktopIcons.Case();
            if (c.Width <= 0 || c.Height <= 0) return;
            int iconSize = DesktopIcons.IconSize();
            var grids = TargetScreens().Select(s => new Grid(s.WorkingArea, c, Scale(s), iconSize)).ToList();
            var slots = new Dictionary<string, KeyValuePair<Grid, KeyValuePair<Point, DesktopIcons.Element>>>();
            var rest = new List<DesktopIcons.Element>();
            groups = groups.Where(g => g.Count > 0).ToList();
            Action<Grid, Point, DesktopIcons.Element> set = (g, p, el) =>
            {
                g.Taken.Add(p);
                slots[el.Id] = new KeyValuePair<Grid, KeyValuePair<Point, DesktopIcons.Element>>(g, new KeyValuePair<Point, DesktopIcons.Element>(p, el));
            };

            if (arrangement == "corners" || arrangement == "blocks")
            {
                Grid g = grids[0];
                int C = g.Columns, L = g.Rows;
                if (arrangement == "corners")
                {
                    int qc = Math.Max(1, C / 2), ql = Math.Max(1, L / 2);
                    for (int i = 0; i < groups.Count; i++)
                    {
                        if (i >= 4) { rest.AddRange(groups[i]); continue; }
                        bool right = i % 2 == 1, down = i >= 2;
                        var cases = new List<Point>();
                        for (int x = 0; x < qc; x++) for (int y = 0; y < ql; y++) cases.Add(new Point(right ? C - 1 - x : x, down ? L - 1 - y : y));
                        int k = 0;
                        foreach (var el in groups[i])
                        {
                            while (k < cases.Count && g.Taken.Contains(cases[k])) k++;
                            if (k < cases.Count) set(g, cases[k++], el); else rest.Add(el);
                        }
                    }
                }
                else
                {
                    int n = groups.Count, h = Math.Min(L, 2);
                    while (h < L && groups.Sum(gr => (gr.Count + h - 1) / h) + n - 1 > C) h++;
                    var widths = groups.Select(gr => (gr.Count + h - 1) / h).ToList();
                    int spare = Math.Max(0, C - widths.Sum()), x = 0;
                    for (int k = 0; k < n; k++)
                    {
                        var group = groups[k];
                        int w = widths[k];
                        if (x + w > C) { rest.AddRange(group); continue; }
                        for (int i = 0; i < group.Count; i++) set(g, new Point(x + i % w, i / w), group[i]);
                        x += w + (n > 1 ? spare / (n - 1) + (k < spare % (n - 1) ? 1 : 0) : 0);
                    }
                }
            }
            else
            {
                bool muted = arrangement != "frame" && arrangement != "center";
                int remaining = groups.Sum(g => g.Count), e = 0, li = 0, k = 0;
                var rows = grids.Count > 0 ? Rows(arrangement, grids[0], remaining) : new List<List<Point>>();
                foreach (var group in groups)
                {
                    if (k > 0) { if (muted) { li++; k = 0; } else if (arrangement == "frame") k++; }
                    foreach (var el in group)
                    {
                        bool placed = false;
                        while (!placed && e < grids.Count)
                        {
                            if (li >= rows.Count)
                            {
                                e++; li = 0; k = 0;
                                if (e < grids.Count) rows = Rows(arrangement, grids[e], remaining);
                                continue;
                            }
                            if (k >= rows[li].Count) { li++; k = 0; continue; }
                            var p = rows[li][k++];
                            if (grids[e].Taken.Contains(p)) continue;
                            set(grids[e], p, el);
                            placed = true;
                        }
                        if (!placed) rest.Add(el);
                        remaining--;
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
            Place(slots.ToDictionary(v => v.Key, v => v.Value.Key.Pixel(v.Value.Value.Key)));
            R.Placed = Capture();
        }

        static bool Same(List<IconPosition> a, List<IconPosition> b)
        {
            if (a == null || b == null || a.Count == 0 || a.Count != b.Count) return false;
            var map = b.GroupBy(p => p.Id).ToDictionary(g => g.Key, g => g.First());
            IconPosition q;
            return a.All(p => map.TryGetValue(p.Id, out q) && Math.Abs(p.X - q.X) <= 2 && Math.Abs(p.Y - q.Y) <= 2);
        }

        static void Later(int ms, Action run)
        {
            var t = new Timer { Interval = ms };
            t.Tick += (s, e) => { t.Stop(); t.Dispose(); run(); };
            t.Start();
        }

        // Windows keeps free-placed icons where they were when their size changes, so bigger icons pile up.
        static void Reflow(List<IconPosition> before, Size cell, bool arranged)
        {
            try
            {
                Size now = DesktopIcons.Case();
                if (now == cell || now.Width <= 0 || cell.Width <= 0 || (DesktopIcons.Flags() & DesktopIcons.FWF_AUTOARRANGE) != 0) return;
                if (arranged) Sort(R.LastSort);
                else
                {
                    var screens = Screens();
                    var positions = new Dictionary<string, Point>();
                    foreach (var p in before)
                    {
                        var area = (screens.FirstOrDefault(s => s.Bounds.Contains(p.X, p.Y)) ?? screens[0]).WorkingArea;
                        int x = area.X + (int)Math.Round((p.X - area.X) * (double)now.Width / cell.Width);
                        int y = area.Y + (int)Math.Round((p.Y - area.Y) * (double)now.Height / cell.Height);
                        positions[p.Id] = new Point(Math.Max(area.X, Math.Min(x, area.Right - now.Width)), Math.Max(area.Y, Math.Min(y, area.Bottom - now.Height)));
                    }
                    Place(positions);
                }
                Program.Send(Map(false));
                Program.SendState();
            }
            catch (Exception ex) { Program.Log(ex); }
        }

        [System.Runtime.InteropServices.DllImport("user32.dll")] static extern IntPtr MonitorFromPoint(Point pt, int flags);
        [System.Runtime.InteropServices.DllImport("shcore.dll")] static extern int GetDpiForMonitor(IntPtr monitor, int type, out uint x, out uint y);

        public static double Scale(Screen s)
        {
            uint x, y;
            try { if (GetDpiForMonitor(MonitorFromPoint(new Point(s.Bounds.X + 1, s.Bounds.Y + 1), 2), 0, out x, out y) == 0) return x / 96.0; }
            catch { }
            return 1;
        }

        static List<IconPosition> Capture()
        {
            return DesktopIcons.List(false).Select(e => new IconPosition { Id = e.Id, X = e.Position.X, Y = e.Position.Y }).ToList();
        }

        static void Remember()
        {
            var now = Capture();
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

        // Auto arrange and the grid would both pull the icons back to Windows' own layout.
        static void Place(Dictionary<string, Point> positions, bool remember = true)
        {
            if (remember) Remember();
            uint flags = DesktopIcons.Flags();
            if ((flags & DesktopIcons.FWF_AUTOARRANGE) != 0) DesktopIcons.Flag(DesktopIcons.FWF_AUTOARRANGE, false);
            if ((flags & DesktopIcons.FWF_SNAPTOGRID) != 0) DesktopIcons.Flag(DesktopIcons.FWF_SNAPTOGRID, false);
            DesktopIcons.Place(positions);
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

        public static void ScreensChanged()
        {
            if (R.RestoreAuto && restoreTimer != null) { restoreTimer.Stop(); restoreTimer.Start(); }
        }

        static void RestoreByScreens()
        {
            string signature = Signature();
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
            try
            {
                switch (action)
                {
                    case "map": Program.Send(Map(m.ContainsKey("full") && Convert.ToBoolean(m["full"]))); return false;
                    case "move":
                        Place(new Dictionary<string, Point> { { Text(m, "id"), new Point(Convert.ToInt32(m["x"]), Convert.ToInt32(m["y"])) } });
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
                        if (active) R.BeforeAuto = Capture();
                        DesktopIcons.Flag(DesktopIcons.FWF_AUTOARRANGE, active);
                        if (!active && R.BeforeAuto != null && R.BeforeAuto.Count > 0)
                        {
                            var positions = new Dictionary<string, Point>();
                            foreach (var p in R.BeforeAuto) positions[p.Id] = new Point(p.X, p.Y);
                            DesktopIcons.Place(positions);
                            R.BeforeAuto = null;
                        }
                        Program.Send(Map(false));
                        return true;
                    }
                    case "iconSize":
                    {
                        var before = Capture();
                        Size cell = DesktopIcons.Case();
                        bool arranged = Same(before, R.Placed);
                        DesktopIcons.SetIconSize(Convert.ToInt32(m["value"]));
                        Program.Send(Map(false));
                        Later(350, () => Reflow(before, cell, arranged));
                        return false;
                    }
                    case "grid": DesktopIcons.Flag(DesktopIcons.FWF_SNAPTOGRID, Convert.ToBoolean(m["value"])); Program.Send(Map(false)); return false;
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
                        Program.Send(Map(false));
                        return false;
                    }
                    case "undo": Undo(); Program.Send(Map(false)); return true;
                    case "original":
                        if (R.Original == null) return false;
                        Remember();
                        Apply(R.Original);
                        Program.Send(Map(false));
                        return true;
                    case "erase": Erase(Convert.ToInt32(m["index"])); return true;
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
            return new
            {
                layouts = R.Layouts.Select(d => new { name = d.Name, screens = Label(d.Screens), date = d.Date, current = d.Screens == signature }).ToArray(),
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
