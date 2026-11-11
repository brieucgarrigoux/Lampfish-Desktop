using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Linq;

namespace Lampfish
{
    // One particle of any trail; each recipe uses the fields it needs.
    class P
    {
        public float X, Y, Vx, Vy, R, Life, Max, Ph, Grow, Hue, S, Rot, Spin, Vr, G, Drag, Tw, Floor;
        public int C;
        public bool Free, Burst;
        public double T;
    }

    class Fx { public double T, Dur; public Action<Graphics, float> Paint; }

    // The recipes of board 5 (traines-5.js), the same physics and drawing, in screen pixels: lengths are multiplied by the
    // scale of the pointer's screen, speeds are in pixels per millisecond. Light: the screen under the pointer is pale.
    abstract class TrailRecipe
    {
        public string Kind;
        public float Density = 1, Duration = 1, Scale = 1;
        public bool ClickFx = true, Light;
        public double LastMove;
        protected readonly List<P> Items = new List<P>(), Pops = new List<P>(), Extra = new List<P>();
        protected readonly List<Fx> Effects = new List<Fx>();
        protected static readonly Random Rnd = new Random();
        const int Cap = 260;

        protected static float Rn(float a, float b) { return a + (float)Rnd.NextDouble() * (b - a); }
        protected static float Ease(float k) { k = Math.Min(1, Math.Max(0, k)); return 1 - (float)Math.Pow(1 - k, 3); }
        protected void Add(List<P> list, P p) { if (list.Count < Cap) list.Add(p); }
        protected int Count(float speed, float rate, float cap)
        {
            float v = speed * rate * Density;
            return (int)Math.Min(cap * Density, Math.Floor(v) + (Rnd.NextDouble() < v % 1 ? 1 : 0));
        }
        protected void Along(PointF prev, PointF p, int n, Action<float, float> f)
        {
            for (int i = 0; i < n; i++) { float k = (float)Rnd.NextDouble(); f(prev.X + (p.X - prev.X) * k, prev.Y + (p.Y - prev.Y) * k); }
        }
        protected static void Fly(P d, float dt, float g, float drag)
        {
            d.X += d.Vx * dt; d.Y += d.Vy * dt; d.Vy += g * dt;
            if (drag > 0) { float f = (float)Math.Pow(1 - drag, dt / 16); d.Vx *= f; d.Vy *= f; }
        }

        public virtual bool Alive { get { return Items.Count + Pops.Count + Extra.Count + Effects.Count > 0; } }
        public virtual void Clear() { Items.Clear(); Pops.Clear(); Extra.Clear(); Effects.Clear(); }

        public abstract void Move(PointF p, PointF prev, float speed, double now);
        protected abstract void Paint(Graphics g, float dt, double now);
        public virtual void Click(PointF p, double now) { }

        public void Draw(Graphics g, float dt, double now)
        {
            Paint(g, dt, now);
            for (int i = Effects.Count - 1; i >= 0; i--)
            {
                var f = Effects[i];
                float k = (float)((now - f.T) / f.Dur);
                if (k >= 1) { Effects.RemoveAt(i); continue; }
                var state = g.Save();
                f.Paint(g, Math.Max(0, k));
                g.Restore(state);
            }
        }

        // ---------- Drawing helpers ----------
        protected static Color Rgb(string rgb, double a)
        {
            var p = rgb.Split(',');
            return Color.FromArgb((int)Math.Max(0, Math.Min(255, a * 255)), int.Parse(p[0]), int.Parse(p[1]), int.Parse(p[2]));
        }
        protected static Color Hex(string hex, double a)
        {
            int v = Convert.ToInt32(hex.TrimStart('#'), 16);
            return Color.FromArgb((int)Math.Max(0, Math.Min(255, a * 255)), (v >> 16) & 255, (v >> 8) & 255, v & 255);
        }
        protected static Color Hsl(double h, double s, double l, double a)
        {
            h = ((h % 360) + 360) % 360 / 360;
            Func<double, double, double, double> f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1.0 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2.0 / 3 ? p + (q - p) * (2.0 / 3 - t) * 6 : p; };
            double qq = l < .5 ? l * (1 + s) : l + s - l * s, pp = 2 * l - qq;
            return Color.FromArgb((int)Math.Max(0, Math.Min(255, a * 255)), (int)(f(pp, qq, h + 1.0 / 3) * 255), (int)(f(pp, qq, h) * 255), (int)(f(pp, qq, h - 1.0 / 3) * 255));
        }
        protected static void Disc(Graphics g, float x, float y, float r, Color c)
        {
            if (r <= 0 || c.A == 0) return;
            using (var b = new SolidBrush(c)) g.FillEllipse(b, x - r, y - r, r * 2, r * 2);
        }
        protected static void Ring(Graphics g, float x, float y, float r, float w, Color c)
        {
            if (r <= 0 || c.A == 0) return;
            using (var p = new Pen(c, w)) g.DrawEllipse(p, x - r, y - r, r * 2, r * 2);
        }
        protected static void Line(Graphics g, float x1, float y1, float x2, float y2, float w, Color c)
        {
            if (c.A == 0) return;
            using (var p = new Pen(c, Math.Max(.5f, w)) { StartCap = LineCap.Round, EndCap = LineCap.Round }) g.DrawLine(p, x1, y1, x2, y2);
        }
        protected static void Star(Graphics g, float x, float y, float r, float w, float rot, Color c)
        {
            if (c.A == 0) return;
            var pts = new PointF[8];
            for (int i = 0; i < 8; i++)
            {
                double a = rot + i * Math.PI / 4, d = i % 2 == 0 ? r : w * 1.414;
                pts[i] = new PointF(x + (float)(Math.Sin(a) * d), y - (float)(Math.Cos(a) * d));
            }
            using (var b = new SolidBrush(c)) g.FillPolygon(b, pts);
        }
        // A soft light, from a disc drawn once per colour and alpha step.
        static readonly Dictionary<string, Bitmap> glows = new Dictionary<string, Bitmap>();
        protected static void Glow(Graphics g, float x, float y, float r, string rgb, double a)
        {
            if (a <= .02 || r < .5f) return;
            int step = (int)Math.Ceiling(Math.Min(1, a) * 8);
            string key = rgb + "|" + step;
            Bitmap sprite;
            if (!glows.TryGetValue(key, out sprite))
            {
                sprite = new Bitmap(64, 64, System.Drawing.Imaging.PixelFormat.Format32bppPArgb);
                using (var gg = Graphics.FromImage(sprite))
                using (var path = new GraphicsPath())
                {
                    path.AddEllipse(0, 0, 64, 64);
                    using (var brush = new PathGradientBrush(path))
                    {
                        double al = step / 8.0;
                        brush.CenterColor = Color.FromArgb((int)(255 * al), 255, 255, 255);
                        brush.SurroundColors = new[] { Rgb(rgb, 0) };
                        var blend = new ColorBlend(4) { Positions = new[] { 0f, .55f, .82f, 1f }, Colors = new[] { Rgb(rgb, 0), Rgb(rgb, .28 * al), Rgb(rgb, .95 * al), Color.FromArgb((int)(255 * al), 255, 255, 255) } };
                        brush.InterpolationColors = blend;
                        gg.FillEllipse(brush, 0, 0, 64, 64);
                    }
                }
                glows[key] = sprite;
            }
            g.DrawImage(sprite, x - r, y - r, r * 2, r * 2);
        }

        public static TrailRecipe Make(string kind)
        {
            TrailRecipe r;
            switch (kind)
            {
                case "bubbles-gold": r = new Bubbles("255,214,120", "255,226,160", "150,100,20", true, false); break;
                case "bubbles-abyss": r = new Bubbles("46,217,198", "170,255,244", "8,80,86", false, false); break;
                case "bubbles-pearl": r = new Bubbles("255,245,225", "255,250,240", "150,120,70", false, false); break;
                case "bubbles-prism": r = new Bubbles("170,150,255", null, null, false, true); break;
                case "bubbles-soap": r = new Bubbles("200,255,250", null, null, false, true); break;
                case "plankton-abyss": r = new Plankton("80,255,235", "8,90,96"); break;
                case "plankton-gold": r = new Plankton("255,200,90", "150,100,20"); break;
                case "plankton-berry": r = new Plankton("170,130,255", "80,50,150"); break;
                case "constellation": r = new Constellation("255,140,80", "255,230,210", "120,50,20"); break;
                case "sparkles-gold": r = new Sparkles("255,200,90", "#fff3cf", "#a87412"); break;
                case "sparkles-silver": r = new Sparkles("200,225,235", "#ffffff", "#5b666b"); break;
                case "sparkles-rose": r = new Sparkles("255,170,150", "#fff0ea", "#9a5141"); break;
                case "school": r = new School(); break;
                case "ribbon-lagoon": r = new Ribbon(7, false, new[] { new float[] { 0, 200, 255, 248 }, new float[] { .3f, 46, 217, 198 }, new float[] { .7f, 13, 93, 112 }, new float[] { 1, 8, 26, 54 } }); break;
                case "ribbon-sunset": r = new Ribbon(7, false, new[] { new float[] { 0, 255, 241, 201 }, new float[] { .3f, 255, 179, 92 }, new float[] { .7f, 194, 65, 107 }, new float[] { 1, 42, 15, 58 } }); break;
                case "comet": r = new Ribbon(6, true, null); break;
                case "ripples": r = new Ripples("150,190,255", "27,47,122"); break;
                case "snow": r = new Snow(); break;
                case "neon-pink": r = new Neon("#ff4fd8"); break;
                case "neon-teal": r = new Neon("#2ED9C6"); break;
                case "pearls": r = new Pearls(true, null, "#9aa6b0"); break;
                case "pearls-gold": r = new Pearls(false, "#e8b64c", "#7a4d0e"); break;
                case "sequins": r = new Sequins("#4fe3d2", "#178f85"); break;
                case "confetti": r = new Confetti(new[] { "#78f5e6", "#1EBBAA", "#0b6b66", "#c9fff7" }); break;
                case "halftone": r = new Halftone(); break;
                default: r = new Ink(); break;
            }
            r.Kind = kind;
            return r;
        }
    }

    class Bubbles : TrailRecipe
    {
        readonly string fill, rim, rimLight; readonly bool dust, prism;
        public Bubbles(string fill, string rim, string rimLight, bool dust, bool prism) { this.fill = fill; this.rim = rim; this.rimLight = rimLight; this.dust = dust; this.prism = prism; }

        public override void Move(PointF p, PointF prev, float speed, double now)
        {
            float s = Scale;
            Along(prev, p, Count(speed, .9f, 4), (x, y) => Add(Items, new P { X = x + Rn(-2.5f, 2.5f) * s + 2 * s, Y = y + Rn(6, 12) * s, R = 1.3f + (float)(Rnd.NextDouble() * Rnd.NextDouble()) * 4.6f, Vy = -Rn(.018f, .045f) * s, Ph = Rn(0, 6.28f), Max = Rn(900, 1900) * Duration, Grow = Rn(1, 1.5f), Hue = Rn(0, 360) }));
            if (dust && Rnd.NextDouble() < Math.Min(.9, speed * .5 * Density)) Add(Extra, new P { X = p.X + Rn(-5, 5) * s, Y = p.Y + Rn(4, 12) * s, Max = Rn(500, 1000) * Duration, Vy = Rn(.02f, .05f) * s, S = Rn(.8f, 2.2f) });
        }

        void Bubble(Graphics g, float x, float y, float r, float a, double now, float hue, bool big)
        {
            Color rc = prism ? Hsl(hue + now * .05, .9, Light ? .4 : .75, .85 * a) : Rgb(Light ? rimLight : rim, .8 * a);
            Disc(g, x, y, r, Rgb(fill, (big ? .1 : .07) * a));
            Ring(g, x, y, r, Math.Max(.8f, r * .12f), rc);
            using (var pen = new Pen(Color.FromArgb((int)(217 * a), 255, 255, 255), Math.Max(.7f, r * .14f))) g.DrawArc(pen, x - r * .62f, y - r * .62f, r * 1.24f, r * 1.24f, 198, 63);
        }

        protected override void Paint(Graphics g, float dt, double now)
        {
            float s = Scale;
            for (int i = Items.Count - 1; i >= 0; i--)
            {
                var b = Items[i];
                b.Life += dt; b.Ph += dt * .006f; b.Vy -= .00005f * dt * s;
                b.X += ((float)Math.Sin(b.Ph) * .015f * s + b.Vx) * dt; b.Y += b.Vy * dt; b.Vx *= (float)Math.Pow(.97, dt / 16);
                float k = b.Life / b.Max, r = b.R * s * (1 + (b.Grow - 1) * k);
                if (k >= 1) { Pops.Add(new P { X = b.X, Y = b.Y, R = r, Hue = b.Hue }); Items.RemoveAt(i); continue; }
                float a = k < .1f ? k * 10 : 1 - Math.Max(0, k - .75f) * 2;
                Bubble(g, b.X, b.Y, r, a, now, b.Hue, false);
            }
            for (int i = Pops.Count - 1; i >= 0; i--)
            {
                var p = Pops[i]; p.Life += dt; float k = p.Life / 200;
                if (k >= 1) { Pops.RemoveAt(i); continue; }
                Ring(g, p.X, p.Y, p.R * (1 + k * .9f), s, prism ? Hsl(p.Hue, .9, .7, .5 * (1 - k)) : Rgb(Light ? rimLight : rim, .5 * (1 - k)));
            }
            for (int i = Extra.Count - 1; i >= 0; i--)
            {
                var d = Extra[i]; d.Life += dt; float k = d.Life / d.Max;
                if (k >= 1) { Extra.RemoveAt(i); continue; }
                Fly(d, dt, 0, .02f);
                double a = Math.Sin(k * Math.PI) * (.6 + .4 * Math.Sin(d.Life * .03));
                Star(g, d.X, d.Y, d.S * 2 * s, d.S * .35f * s, 0, Light ? Hex("#a87412", a) : Hex("#ffe39a", a));
            }
        }

        // A big bubble swells under the click, wobbles, then bursts into droplets and a handful of small bubbles.
        public override void Click(PointF p, double now)
        {
            float s = Scale;
            var drops = Enumerable.Range(0, 9).Select(i => new PointF((float)(i / 9.0 * 6.283 + Rn(-.2f, .2f)), Rn(.8f, 1.2f))).ToArray();
            bool burst = false;
            Effects.Add(new Fx { T = now, Dur = 950, Paint = (g, k) =>
            {
                if (k < .38f) { float e = Ease(k / .38f), r = (3 + 13 * e) * s + (float)Math.Sin(k * 60) * (1 - e) * 1.5f * s; Bubble(g, p.X, p.Y, r, 1, now, 180, true); return; }
                if (!burst)
                {
                    burst = true;
                    for (int i = 0; i < 7; i++) Add(Items, new P { X = p.X + Rn(-8, 8) * s, Y = p.Y + Rn(-8, 8) * s, R = Rn(1.2f, 3.2f), Vy = -Rn(.03f, .06f) * s, Vx = Rn(-.04f, .04f) * s, Ph = Rn(0, 6.28f), Max = Rn(700, 1300), Grow = 1.2f, Hue = Rn(0, 360) });
                    if (dust) for (int i = 0; i < 14; i++) { double a = i / 14.0 * 6.283; Add(Extra, new P { X = p.X, Y = p.Y, Vx = (float)Math.Cos(a) * Rn(.08f, .16f) * s, Vy = (float)Math.Sin(a) * Rn(.08f, .16f) * s, Max = Rn(600, 1000), S = Rn(1, 2.4f) }); }
                }
                float kk = (k - .38f) / .62f;
                Color c = prism ? Hsl(now * .1, .9, Light ? .45 : .72, 1 - kk) : Rgb(Light ? rimLight : rim, 1 - kk);
                Ring(g, p.X, p.Y, (16 + kk * 12) * s, 1.4f * s, Color.FromArgb((int)(c.A * .8), c));
                foreach (var d in drops)
                {
                    float dist = (16 + 26 * Ease(kk)) * d.Y * s;
                    Disc(g, p.X + (float)Math.Cos(d.X) * dist, p.Y + (float)Math.Sin(d.X) * dist + kk * kk * 10 * s, (1.7f * (1 - kk) + .3f) * s, c);
                }
            } });
        }
    }

    class Sparkles : TrailRecipe
    {
        readonly string glow, core, dark;
        public Sparkles(string glow, string core, string dark) { this.glow = glow; this.core = core; this.dark = dark; }
        public override void Move(PointF p, PointF prev, float speed, double now)
        {
            float s = Scale;
            Along(prev, p, Count(speed, 1.1f, 5), (x, y) => Add(Items, new P { X = x + Rn(-8, 8) * s, Y = y + Rn(-6, 10) * s, Max = Rn(400, 950) * Duration, Vy = Rn(.01f, .045f) * s, Vx = Rn(-.015f, .015f) * s, S = Rn(1, 3.2f), Rot = Rn(0, .8f), Tw = Rn(.015f, .04f) }));
        }
        protected override void Paint(Graphics g, float dt, double now)
        {
            float s = Scale;
            for (int i = Items.Count - 1; i >= 0; i--)
            {
                var d = Items[i]; d.Life += dt; float k = d.Life / d.Max;
                if (k >= 1) { Items.RemoveAt(i); continue; }
                Fly(d, dt, 0, d.Drag);
                double a = Math.Sin(k * Math.PI) * (.55 + .45 * Math.Sin(d.Life * d.Tw));
                if (!Light) Glow(g, d.X, d.Y, d.S * 3 * s, glow, a);
                Star(g, d.X, d.Y, d.S * 2.2f * s, d.S * .32f * s, d.Rot, Light ? Hex(dark, a) : Hex(core, a));
            }
        }
        // A lens flare: a great four-point star that opens and turns, and a ring of small stars thrown out.
        public override void Click(PointF p, double now)
        {
            float s = Scale;
            for (int i = 0; i < 12; i++) { double a = i / 12.0 * 6.283; Add(Items, new P { X = p.X, Y = p.Y, Vx = (float)Math.Cos(a) * Rn(.1f, .18f) * s, Vy = (float)Math.Sin(a) * Rn(.1f, .18f) * s, Drag = .06f, Max = Rn(500, 800), S = Rn(1.2f, 2.4f), Rot = (float)a, Tw = .03f }); }
            Effects.Add(new Fx { T = now, Dur = 650, Paint = (g, k) =>
            {
                float size = 26 * (float)Math.Sin(Math.PI * Math.Min(1, k * 1.15)) * s;
                if (!Light) Glow(g, p.X, p.Y, size * 1.3f, glow, 1 - k);
                Color c = Light ? Hex(dark, 1 - k * .6) : Hex(core, 1 - k * .6);
                Star(g, p.X, p.Y, size, size * .09f, k * .8f, c);
                Star(g, p.X, p.Y, size * .45f, size * .06f, k * .8f + (float)Math.PI / 4, c);
            } });
        }
    }

    class Plankton : TrailRecipe
    {
        readonly string glow, dark;
        public Plankton(string glow, string dark) { this.glow = glow; this.dark = dark; }
        public override void Move(PointF p, PointF prev, float speed, double now)
        {
            float s = Scale;
            Along(prev, p, Count(speed, 1.2f, 5), (x, y) => Add(Items, new P { X = x + Rn(-12, 12) * s, Y = y + Rn(-12, 12) * s, Vx = Rn(-.012f, .012f) * s, Vy = Rn(-.012f, .012f) * s, Max = Rn(1200, 2400) * Duration, S = Rn(1.2f, 3.2f), Ph = Rn(0, 6.28f) }));
        }
        protected override void Paint(Graphics g, float dt, double now)
        {
            float s = Scale;
            for (int i = Items.Count - 1; i >= 0; i--)
            {
                var d = Items[i]; d.Life += dt; float k = d.Life / d.Max;
                if (k >= 1) { Items.RemoveAt(i); continue; }
                Fly(d, dt, 0, d.Drag); d.X += (float)Math.Sin(d.Life * .002 + d.Ph) * .003f * dt * s;
                double a = Math.Max(0, (k < .15f ? k / .15f : 1 - (k - .15f) / .85f) * (.6 + .4 * Math.Sin(d.Life * .01 + d.Ph)));
                if (Light) { Disc(g, d.X, d.Y, d.S * 1.6f * s, Rgb(dark, .22 * a)); Disc(g, d.X, d.Y, d.S * .75f * s, Rgb(dark, a)); }
                else Glow(g, d.X, d.Y, d.S * 3.2f * s, glow, a);
            }
        }
        // The water lights up: a soft pulse of light, and the plankton around it wakes in a ring.
        public override void Click(PointF p, double now)
        {
            float s = Scale;
            for (int i = 0; i < 34; i++) { float a = Rn(0, 6.283f), r = Rn(6, 16) * s; Add(Items, new P { X = p.X + (float)Math.Cos(a) * r, Y = p.Y + (float)Math.Sin(a) * r, Vx = (float)Math.Cos(a) * Rn(.05f, .11f) * s, Vy = (float)Math.Sin(a) * Rn(.05f, .11f) * s, Drag = .05f, Max = Rn(1100, 1900), S = Rn(1.2f, 3), Ph = Rn(0, 6.28f) }); }
            Effects.Add(new Fx { T = now, Dur = 1000, Paint = (g, k) => Glow(g, p.X, p.Y, (10 + 62 * Ease(k)) * s, Light ? dark : glow, .35 * (1 - k)) });
        }
    }

    class Constellation : TrailRecipe
    {
        readonly string glow, core, dark; float travel;
        public Constellation(string glow, string core, string dark) { this.glow = glow; this.core = core; this.dark = dark; }
        public override void Move(PointF p, PointF prev, float speed, double now)
        {
            float s = Scale;
            travel += (float)Math.Sqrt(Math.Pow(p.X - prev.X, 2) + Math.Pow(p.Y - prev.Y, 2)) / s;
            if (travel > 30 / Density) { travel = 0; Add(Items, new P { X = p.X + Rn(-8, 8) * s, Y = p.Y + Rn(-8, 8) * s, T = now, S = Rn(1, 2.2f) }); }
        }
        void Point(Graphics g, float x, float y, float size, double a)
        {
            float s = Scale;
            if (!Light) Glow(g, x, y, size * 5 * s, glow, a);
            Star(g, x, y, size * 2.2f * s, size * .4f * s, 0, Rgb(Light ? dark : core, a));
        }
        protected override void Paint(Graphics g, float dt, double now)
        {
            double life = 1500 * Duration;
            while (Items.Count > 0 && now - Items[0].T > life) Items.RemoveAt(0);
            for (int i = 1; i < Items.Count; i++) { var a = Items[i - 1]; var b = Items[i]; Line(g, a.X, a.Y, b.X, b.Y, .8f * Scale, Rgb(Light ? dark : core, .45 * (1 - (now - a.T) / life))); }
            foreach (var p in Items) Point(g, p.X, p.Y, p.S, (1 - (now - p.T) / life) * (.7 + .3 * Math.Sin(now * .012 + p.X)));
        }
        // A new constellation is drawn star by star around the click, then fades.
        public override void Click(PointF p, double now)
        {
            float s = Scale;
            var pts = new List<PointF[]> ();
            var stars = new List<P> { new P { X = p.X, Y = p.Y, S = 2.6f } };
            for (int i = 0; i < 6; i++) { double a = -1.9 + i * 1.05 + Rn(-.25f, .25f); float r = Rn(16, 34) * s; stars.Add(new P { X = p.X + (float)Math.Cos(a) * r, Y = p.Y + (float)Math.Sin(a) * r * .8f, S = Rn(1.2f, 2.4f) }); }
            Effects.Add(new Fx { T = now, Dur = 1700, Paint = (g, k) =>
            {
                double fade = k > .6f ? 1 - (k - .6f) / .4f : 1;
                for (int i = 1; i < stars.Count; i++)
                {
                    float show = Math.Min(1, Math.Max(0, (k - i * .06f) / .06f));
                    if (show <= 0) continue;
                    var a = stars[i - 1]; var b = stars[i];
                    Line(g, a.X, a.Y, a.X + (b.X - a.X) * show, a.Y + (b.Y - a.Y) * show, .9f * s, Rgb(Light ? dark : core, .6 * fade));
                }
                for (int i = 0; i < stars.Count; i++) if (k > i * .06f) Point(g, stars[i].X, stars[i].Y, stars[i].S, fade);
            } });
        }
    }

    class Ribbon : TrailRecipe
    {
        readonly float width; readonly bool prism; readonly float[][] stops;
        public Ribbon(float width, bool prism, float[][] stops) { this.width = width; this.prism = prism; this.stops = stops; }
        public override void Move(PointF p, PointF prev, float speed, double now) { Add(Items, new P { X = p.X, Y = p.Y, T = now }); }
        Color ColorAt(float a, double now, float i)
        {
            if (prism) return Hsl(now * .2 + i * 9, .95, Light ? .45 : .65, 1 - a);
            for (int j = 1; j < stops.Length; j++)
                if (a <= stops[j][0])
                {
                    float[] s0 = stops[j - 1], s1 = stops[j];
                    float t = (a - s0[0]) / Math.Max(.0001f, s1[0] - s0[0]);
                    return Color.FromArgb((int)(255 * Math.Max(0, (1 - a) * (Light ? .9 : .85))), (int)(s0[1] + (s1[1] - s0[1]) * t), (int)(s0[2] + (s1[2] - s0[2]) * t), (int)(s0[3] + (s1[3] - s0[3]) * t));
                }
            var l = stops[stops.Length - 1];
            return Color.FromArgb(0, (int)l[1], (int)l[2], (int)l[3]);
        }
        // Curves through the midpoints, so a fast movement never shows a corner.
        protected override void Paint(Graphics g, float dt, double now)
        {
            double life = 480 * Duration;
            while (Items.Count > 0 && now - Items[0].T > life) Items.RemoveAt(0);
            for (int i = 1; i < Items.Count; i++)
            {
                var a = Items[i - 1]; var b = Items[i]; P c = i + 1 < Items.Count ? Items[i + 1] : null;
                var m1 = new PointF((a.X + b.X) / 2, (a.Y + b.Y) / 2); var m2 = c != null ? new PointF((b.X + c.X) / 2, (b.Y + c.Y) / 2) : new PointF(b.X, b.Y);
                float age = (float)Math.Min(1, (now - b.T) / life);
                using (var pen = new Pen(ColorAt(age, now, i), Math.Max(.5f, width * (1 - age) * Scale)) { StartCap = LineCap.Round, EndCap = LineCap.Round })
                    g.DrawBezier(pen, m1, new PointF(m1.X + (b.X - m1.X) * 2 / 3, m1.Y + (b.Y - m1.Y) * 2 / 3), new PointF(m2.X + (b.X - m2.X) * 2 / 3, m2.Y + (b.Y - m2.Y) * 2 / 3), m2);
            }
        }
        // The ribbon ties itself in a spiral under the click, from the centre outward, then lets go.
        public override void Click(PointF p, double now)
        {
            float s = Scale;
            Effects.Add(new Fx { T = now, Dur = 1100, Paint = (g, k) =>
            {
                float grow = Math.Min(1, k * 2.2f), fade = k > .5f ? 1 - (k - .5f) / .5f : 1;
                PointF? prev = null;
                for (float u = 0; u <= grow; u += .02f)
                {
                    double a = u * Math.PI * 4.2; float r = (2 + 17 * u) * s;
                    var pt = new PointF(p.X + (float)Math.Cos(a) * r, p.Y + (float)Math.Sin(a) * r);
                    if (prev.HasValue) { var c = ColorAt(u, now, u * 40); Line(g, prev.Value.X, prev.Value.Y, pt.X, pt.Y, width * .7f * (1 - u * .6f) * s, Color.FromArgb((int)(255 * fade * (Light ? .9 : .85)), c)); }
                    prev = pt;
                }
            } });
        }
    }

    class Ripples : TrailRecipe
    {
        readonly string rgb, dark; float travel;
        public Ripples(string rgb, string dark) { this.rgb = rgb; this.dark = dark; }
        public override void Move(PointF p, PointF prev, float speed, double now)
        {
            travel += (float)Math.Sqrt(Math.Pow(p.X - prev.X, 2) + Math.Pow(p.Y - prev.Y, 2)) / Scale;
            if (travel > 26 / Density) { travel = 0; Add(Items, new P { X = p.X, Y = p.Y, T = now }); }
        }
        void Wave(Graphics g, float x, float y, float r, double a)
        {
            if (r <= .1f || a <= 0) return;
            foreach (var m in new[] { new[] { 1f, 1.4f }, new[] { .62f, 1f } })
                using (var pen = new Pen(Rgb(Light ? dark : rgb, Math.Min(1, a) * .75), m[1] * Scale)) g.DrawEllipse(pen, x - r * m[0], y - r * m[0] * .55f, r * m[0] * 2, r * m[0] * 1.1f);
        }
        protected override void Paint(Graphics g, float dt, double now)
        {
            double life = 1000 * Duration;
            for (int i = Items.Count - 1; i >= 0; i--)
            {
                var r = Items[i]; float k = (float)((now - r.T) / life);
                if (k >= 1) { Items.RemoveAt(i); continue; }
                Wave(g, r.X, r.Y, 22 * Ease(k) * Scale, 1 - k);
            }
        }
        // A stone in the water: three rings one after the other, and droplets that jump and fall back.
        public override void Click(PointF p, double now)
        {
            float s = Scale;
            var drops = Enumerable.Range(0, 7).Select(i => new float[] { Rn(-14, 14), Rn(10, 22), Rn(1, 2) }).ToArray();
            Effects.Add(new Fx { T = now, Dur = 1500, Paint = (g, k) =>
            {
                for (int j = 0; j < 3; j++) { float kk = (k - j * .14f) / .72f; if (kk > 0 && kk < 1) Wave(g, p.X, p.Y, 44 * Ease(kk) * s, (1 - kk) * 1.1); }
                float kd = k / .45f;
                if (kd < 1) foreach (var d in drops) Disc(g, p.X + d[0] * kd * s, p.Y - (float)Math.Sin(Math.PI * kd) * d[1] * s, d[2] * s, Rgb(Light ? dark : rgb, 1 - kd));
            } });
        }
    }

    class Snow : TrailRecipe
    {
        public override void Move(PointF p, PointF prev, float speed, double now)
        {
            float s = Scale;
            Along(prev, p, Count(speed, .5f, 3), (x, y) => Add(Items, new P { X = x + Rn(-10, 10) * s, Y = y + Rn(-4, 8) * s, Vy = Rn(.008f, .025f) * s, Ph = Rn(0, 6.28f), Max = Rn(1800, 3200) * Duration, S = Rn(.6f, 1.8f) }));
        }
        protected override void Paint(Graphics g, float dt, double now)
        {
            float s = Scale;
            for (int i = Items.Count - 1; i >= 0; i--)
            {
                var d = Items[i]; d.Life += dt; float k = d.Life / d.Max;
                if (k >= 1) { Items.RemoveAt(i); continue; }
                Fly(d, dt, 0, d.Burst ? .045f : 0);
                if (d.Burst && Math.Sqrt(d.Vx * d.Vx + d.Vy * d.Vy) < .03f * s) { d.Burst = false; d.Vx = 0; d.Vy = Rn(.008f, .02f) * s; }
                d.X += (float)Math.Sin(d.Life * .0015 + d.Ph) * .005f * dt * s;
                double a = Math.Sin(k * Math.PI) * .85;
                Disc(g, d.X, d.Y, d.S * s, Light ? Color.FromArgb((int)(204 * a), 40, 70, 74) : Color.FromArgb((int)(230 * a), 230, 250, 248));
            }
        }
        // A gust: a puff of flakes blown out from the click, which slow down and fall again.
        public override void Click(PointF p, double now)
        {
            float s = Scale;
            for (int i = 0; i < 30; i++) { float a = Rn(0, 6.283f), v = Rn(.08f, .22f) * s; Add(Items, new P { X = p.X, Y = p.Y, Vx = (float)Math.Cos(a) * v, Vy = (float)Math.Sin(a) * v, Burst = true, Ph = Rn(0, 6.28f), Max = Rn(1800, 2800), S = Rn(.7f, 2) }); }
        }
    }

    class School : TrailRecipe
    {
        class Fish { public float X, Y, A, Ph, Vx, Vy, S; }
        readonly List<Fish> fish = new List<Fish>();
        readonly List<P> path = new List<P>();
        float fade = 1;
        PointF attract; double attractAt = -1e9; bool scattered = true;
        public override bool Alive { get { return fish.Count > 0 || base.Alive; } }
        public override void Clear() { base.Clear(); fish.Clear(); path.Clear(); }

        void Spawn(PointF p, float spread)
        {
            if (fish.Count > 0) return;
            for (int i = 0; i < 6; i++) fish.Add(new Fish { X = p.X - (20 + i * 8) * Scale, Y = p.Y + Rn(-spread, spread) * Scale, Ph = Rn(0, 6), S = Rn(1.15f, 1.5f) });
        }
        public override void Move(PointF p, PointF prev, float speed, double now)
        {
            path.Add(new P { X = p.X, Y = p.Y, T = now });
            while (path.Count > 0 && now - path[0].T > 2000) path.RemoveAt(0);
            Spawn(p, 10);
            fade = 1;
        }
        protected override void Paint(Graphics g, float dt, double now)
        {
            if (fish.Count == 0) return;
            float s = Scale;
            bool luring = now - attractAt < 520;
            if (now - LastMove > 2600 && now - attractAt > 1400) fade = Math.Max(0, fade - dt / 900);
            if (!scattered && now - attractAt >= 560)
            {
                scattered = true;
                foreach (var f in fish) { float dx = f.X - attract.X, dy = f.Y - attract.Y, d = Math.Max(1, (float)Math.Sqrt(dx * dx + dy * dy)); f.Vx += dx / d * 9; f.Vy += dy / d * 9; }
            }
            var head = path.Count > 0 ? new PointF(path[path.Count - 1].X, path[path.Count - 1].Y) : new PointF(fish[0].X, fish[0].Y);
            for (int i = 0; i < fish.Count; i++)
            {
                var f = fish[i];
                float tx, ty;
                if (luring) { tx = attract.X + (float)Math.Cos(i * 1.05) * 12 * s; ty = attract.Y + (float)Math.Sin(i * 1.05) * 9 * s; }
                else
                {
                    double lag = (i + 1) * 120 * Duration; var target = head;
                    for (int j = path.Count - 1; j >= 0; j--) if (now - path[j].T >= lag) { target = new PointF(path[j].X, path[j].Y); break; }
                    float off = (float)Math.Sin(now * .002 + i * 1.7) * (8 + i * 1.5f);
                    tx = target.X - 12 * s + (float)Math.Cos(i * 2.1) * 10 * s; ty = target.Y + 8 * s + off * .6f * s;
                }
                float pull = luring ? .0024f : .0009f;
                f.Vx += (tx - f.X) / s * pull * dt; f.Vy += (ty - f.Y) / s * pull * dt;
                foreach (var o in fish) if (o != f) { float dx = f.X - o.X, dy = f.Y - o.Y, d = (float)Math.Sqrt(dx * dx + dy * dy) / s; if (d > 0 && d < 10) { f.Vx += dx / s / d * .012f * dt; f.Vy += dy / s / d * .012f * dt; } }
                float damp = (float)Math.Pow(.9, dt / 16); f.Vx *= damp; f.Vy *= damp;
                f.X += f.Vx * dt * .06f * s; f.Y += f.Vy * dt * .06f * s;
                float sp = (float)Math.Sqrt(f.Vx * f.Vx + f.Vy * f.Vy);
                if (sp > .02f) { float want = (float)Math.Atan2(f.Vy, f.Vx), da = want - f.A; while (da > Math.PI) da -= 6.283f; while (da < -Math.PI) da += 6.283f; f.A += da * Math.Min(1, dt / 80); }
                f.Ph += dt * (.008f + sp * .02f);
                DrawFish(g, f, s);
            }
            if (fade <= 0) { fish.Clear(); path.Clear(); }
        }
        void DrawFish(Graphics g, Fish f, float s)
        {
            var state = g.Save();
            g.TranslateTransform(f.X, f.Y); g.RotateTransform(f.A * 57.2958f); g.ScaleTransform(f.S * s, f.S * s);
            Color body = Light ? Color.FromArgb((int)(255 * fade), 0x0b, 0x3a, 0x3c) : Color.FromArgb((int)(255 * fade), 0x3f, 0xae, 0xa4);
            using (var b = new SolidBrush(body))
            {
                g.FillEllipse(b, -6, -3.2f, 12, 6.4f);
                var tail = g.Save();
                g.TranslateTransform(-5.2f, 0); g.RotateTransform((float)Math.Sin(f.Ph) * .45f * 57.2958f);
                g.FillPolygon(b, new[] { new PointF(0, 0), new PointF(-4.4f, -3), new PointF(-3.6f, 0), new PointF(-4.4f, 3) });
                g.Restore(tail);
            }
            using (var pen = new Pen(body, .6f)) g.DrawBezier(pen, 3, -2.4f, 5.3f, -5.1f, 7.3f, -5.7f, 9, -4.2f);
            if (!Light) Glow(g, 9, -4.2f, 5, "80,255,235", fade);
            Disc(g, 9, -4.2f, .9f, Light ? Color.FromArgb((int)(255 * fade), 15, 157, 143) : Color.FromArgb((int)(255 * fade), 255, 255, 255));
            Disc(g, 3.2f, -.6f, .7f, Light ? Color.FromArgb((int)(255 * fade), 255, 255, 255) : Color.FromArgb((int)(255 * fade), 3, 25, 26));
            g.Restore(state);
        }
        // The fish dart to the click as if to food, then scatter.
        public override void Click(PointF p, double now)
        {
            Spawn(new PointF(p.X - 10 * Scale, p.Y), 14);
            fade = 1; attract = p; attractAt = now; scattered = false;
            float s = Scale;
            Effects.Add(new Fx { T = now, Dur = 700, Paint = (g, k) =>
            {
                for (int i = 0; i < 3; i++) { float r = (2 + i * 3 + k * 4) * s; Disc(g, p.X + (float)Math.Cos(i * 2.1 + k * 3) * r, p.Y + (float)Math.Sin(i * 2.1 + k * 3) * r, 1.2f * s, Light ? Color.FromArgb((int)(204 * (1 - k)), 15, 157, 143) : Color.FromArgb((int)(204 * (1 - k)), 80, 255, 235)); }
            } });
        }
    }

    class Neon : TrailRecipe
    {
        readonly string tube;
        public Neon(string tube) { this.tube = tube; }
        public override void Move(PointF p, PointF prev, float speed, double now) { Add(Items, new P { X = p.X, Y = p.Y, T = now }); }
        protected override void Paint(Graphics g, float dt, double now)
        {
            double life = 380 * Duration;
            while (Items.Count > 0 && now - Items[0].T > life) Items.RemoveAt(0);
            if (Items.Count < 2) return;
            double fl = .85 + .15 * Math.Sin(now * .09) * Math.Sin(now * .023);
            float s = Scale;
            // A wide faint stroke stands for the glow of the tube, then the tube, then its white core.
            foreach (var pass in new[] { new[] { 12f, .16f, 0 }, new[] { 5f, 1f, 0 }, new[] { 1.6f, 1f, 1 } })
                for (int i = 1; i < Items.Count; i++)
                {
                    var a = Items[i - 1]; var b = Items[i]; P c = i + 1 < Items.Count ? Items[i + 1] : null;
                    double age = 1 - (now - b.T) / life;
                    if (age <= 0) continue;
                    var m1 = new PointF((a.X + b.X) / 2, (a.Y + b.Y) / 2); var m2 = c != null ? new PointF((b.X + c.X) / 2, (b.Y + c.Y) / 2) : new PointF(b.X, b.Y);
                    Color col = pass[2] == 1 && !Light ? Color.FromArgb((int)(255 * age * fl), 255, 255, 255) : Hex(tube, age * fl * pass[1]);
                    using (var pen = new Pen(col, pass[0] * (float)(.4 + .6 * age) * s) { StartCap = LineCap.Round, EndCap = LineCap.Round })
                        g.DrawBezier(pen, m1, new PointF(m1.X + (b.X - m1.X) * 2 / 3, m1.Y + (b.Y - m1.Y) * 2 / 3), new PointF(m2.X + (b.X - m2.X) * 2 / 3, m2.Y + (b.Y - m2.Y) * 2 / 3), m2);
                }
        }
        // A neon sign switches on under the click: it stutters, holds, and goes out.
        public override void Click(PointF p, double now)
        {
            float s = Scale;
            Effects.Add(new Fx { T = now, Dur = 1000, Paint = (g, k) =>
            {
                int[] stutter = { 0, 1, 0, 1, 1, 0, 1 };
                if (k < .22f && stutter[Math.Min(6, (int)(k / .22f * 7))] == 0) return;
                double a = k > .6f ? 1 - (k - .6f) / .4f : 1;
                foreach (float r in new[] { 15f, 7f })
                {
                    Ring(g, p.X, p.Y, r * s, (r > 10 ? 9 : 7) * s, Hex(tube, .16 * a));
                    Ring(g, p.X, p.Y, r * s, (r > 10 ? 3.2f : 2.4f) * s, Hex(tube, a));
                    Ring(g, p.X, p.Y, r * s, (r > 10 ? 1.1f : .8f) * s, Light ? Hex(tube, a) : Color.FromArgb((int)(255 * a), 255, 255, 255));
                }
            } });
        }
    }

    class Pearls : TrailRecipe
    {
        readonly bool pearl; readonly string mid, edge; float travel;
        public Pearls(bool pearl, string mid, string edge) { this.pearl = pearl; this.mid = mid; this.edge = edge; }
        public override void Move(PointF p, PointF prev, float speed, double now)
        {
            travel += (float)Math.Sqrt(Math.Pow(p.X - prev.X, 2) + Math.Pow(p.Y - prev.Y, 2)) / Scale;
            while (travel > 9 / Density) { travel -= 9 / Density; Add(Items, new P { X = p.X, Y = p.Y, Max = 900 * Duration, R = Rn(2.2f, 3.4f), Hue = (float)(now * .08 % 360) }); }
        }
        void Bead(Graphics g, float x, float y, float r, float hue, double a)
        {
            Color body = pearl ? Hsl(hue, .7, .88, a) : Hex(mid, a);
            Disc(g, x, y, r, body);
            Ring(g, x, y, r, Math.Max(.6f, r * .18f), Hex(edge, .7 * a));
            Disc(g, x - r * .35f, y - r * .4f, r * .38f, Color.FromArgb((int)(230 * a), 255, 255, 255));
        }
        protected override void Paint(Graphics g, float dt, double now)
        {
            float s = Scale;
            for (int i = Items.Count - 1; i >= 0; i--)
            {
                var b = Items[i]; b.Life += dt; float k = b.Life / b.Max;
                if (k >= 1) { Items.RemoveAt(i); continue; }
                if (b.Free) { Fly(b, dt, .0007f * s, .01f); if (b.Y > b.Floor && b.Vy > 0) { b.Y = b.Floor; b.Vy *= -.45f; b.Vx *= .7f; } }
                else if (k > .35f) { b.Vy += .0006f * dt; b.Y += b.Vy * dt * .06f * s; }
                float r = b.R * s * (1 - Math.Max(0, k - .7f) * 2);
                if (r > .1f) Bead(g, b.X, b.Y, r, b.Hue, 1 - Math.Max(0, k - .6f) * 2.5f);
            }
        }
        // The string breaks: pearls burst out, fall and bounce on the floor of the water.
        public override void Click(PointF p, double now)
        {
            float s = Scale;
            for (int i = 0; i < 14; i++) { double a = -Math.PI / 2 + Rn(-1.3f, 1.3f); float v = Rn(.12f, .26f) * s; Add(Items, new P { X = p.X, Y = p.Y, Vx = (float)Math.Cos(a) * v, Vy = (float)Math.Sin(a) * v, Free = true, Floor = p.Y + Rn(30, 44) * s, Max = Rn(1400, 1900), R = Rn(2.2f, 3.6f), Hue = Rn(0, 360) }); }
        }
    }

    class Sequins : TrailRecipe
    {
        readonly string front, back;
        public Sequins(string front, string back) { this.front = front; this.back = back; }
        public override void Move(PointF p, PointF prev, float speed, double now)
        {
            float s = Scale;
            Along(prev, p, Count(speed, .8f, 4), (x, y) => Add(Items, new P { X = x + Rn(-6, 6) * s, Y = y + Rn(0, 8) * s, Vy = Rn(.02f, .05f) * s, Vx = Rn(-.02f, .02f) * s, Ph = Rn(0, 6.28f), Spin = Rn(.008f, .02f), Max = Rn(900, 1600) * Duration, S = Rn(3.6f, 5.6f), Rot = Rn(0, 6.28f) }));
        }
        protected override void Paint(Graphics g, float dt, double now)
        {
            float s = Scale;
            for (int i = Items.Count - 1; i >= 0; i--)
            {
                var d = Items[i]; d.Life += dt; float k = d.Life / d.Max;
                if (k >= 1) { Items.RemoveAt(i); continue; }
                Fly(d, dt, d.G, d.G > 0 ? .02f : 0); d.Ph += d.Spin * dt;
                float flip = (float)Math.Cos(d.Ph); bool bright = flip > 0;
                var state = g.Save();
                g.TranslateTransform(d.X, d.Y); g.RotateTransform(d.Rot * 57.2958f); g.ScaleTransform(Math.Max(.08f, Math.Abs(flip)) * s, s);
                double a = Math.Min(1, (1 - k) * 1.6);
                using (var path = new GraphicsPath())
                {
                    path.AddArc(-d.S, -d.S, d.S * 2, d.S * 2, 9, 162);
                    path.AddLine(-d.S * .95f, d.S * .3f, 0, -d.S * .6f);
                    path.CloseFigure();
                    using (var b = new SolidBrush(Hex(bright ? front : back, a))) g.FillPath(b, path);
                }
                if (bright) Disc(g, -d.S * .3f, d.S * .2f, d.S * .25f, Color.FromArgb((int)(178 * a), 255, 255, 255));
                g.Restore(state);
            }
        }
        // A handful of scales thrown in the air, flashing as they turn, then raining down.
        public override void Click(PointF p, double now)
        {
            float s = Scale;
            for (int i = 0; i < 18; i++) { double a = -Math.PI / 2 + Rn(-1.1f, 1.1f); float v = Rn(.14f, .26f) * s; Add(Items, new P { X = p.X, Y = p.Y, Vx = (float)Math.Cos(a) * v, Vy = (float)Math.Sin(a) * v, G = .00045f * s, Ph = Rn(0, 6.28f), Spin = Rn(.015f, .03f), Max = Rn(1300, 1800), S = Rn(3.6f, 5.6f), Rot = Rn(0, 6.28f) }); }
        }
    }

    class Confetti : TrailRecipe
    {
        readonly string[] colors;
        public Confetti(string[] colors) { this.colors = colors; }
        public override void Move(PointF p, PointF prev, float speed, double now)
        {
            float s = Scale;
            Along(prev, p, Count(speed, .8f, 4), (x, y) => Add(Items, new P { X = x + Rn(-6, 6) * s, Y = y + Rn(0, 6) * s, Vy = Rn(-.02f, .01f) * s, Vx = Rn(-.03f, .03f) * s, G = .00012f * s, Ph = Rn(0, 6.28f), Spin = Rn(.006f, .016f), Rot = Rn(0, 6.28f), Vr = Rn(-.004f, .004f), Max = Rn(1100, 1800) * Duration, S = Rn(4, 6.5f), C = Rnd.Next(colors.Length) }));
        }
        protected override void Paint(Graphics g, float dt, double now)
        {
            float s = Scale;
            for (int i = Items.Count - 1; i >= 0; i--)
            {
                var d = Items[i]; d.Life += dt; float k = d.Life / d.Max;
                if (k >= 1) { Items.RemoveAt(i); continue; }
                Fly(d, dt, d.G, d.Drag); d.Ph += d.Spin * dt; d.Rot += d.Vr * dt;
                float f = (float)Math.Cos(d.Ph);
                var state = g.Save();
                g.TranslateTransform(d.X, d.Y); g.RotateTransform(d.Rot * 57.2958f); g.ScaleTransform(s, Math.Max(.1f, Math.Abs(f)) * s);
                using (var b = new SolidBrush(Hex(colors[(d.C + (f < 0 ? 1 : 0)) % colors.Length], Math.Min(1, (1 - k) * 2))))
                    g.FillPolygon(b, new[] { new PointF(0, -d.S), new PointF(d.S * .9f, d.S * .6f), new PointF(-d.S * .9f, d.S * .6f) });
                g.Restore(state);
            }
        }
        // A party popper: a cone of paper shot upward that tumbles down.
        public override void Click(PointF p, double now)
        {
            float s = Scale;
            for (int i = 0; i < 30; i++) { double a = -Math.PI / 2 + Rn(-.7f, .7f); float v = Rn(.18f, .34f) * s; Add(Items, new P { X = p.X, Y = p.Y, Vx = (float)Math.Cos(a) * v, Vy = (float)Math.Sin(a) * v, G = .0005f * s, Drag = .03f, Ph = Rn(0, 6.28f), Spin = Rn(.01f, .025f), Rot = Rn(0, 6.28f), Vr = Rn(-.01f, .01f), Max = Rn(1500, 2100), S = Rn(4, 6.5f), C = Rnd.Next(colors.Length) }); }
        }
    }

    class Halftone : TrailRecipe
    {
        float travel;
        public override void Move(PointF p, PointF prev, float speed, double now)
        {
            travel += (float)Math.Sqrt(Math.Pow(p.X - prev.X, 2) + Math.Pow(p.Y - prev.Y, 2)) / Scale;
            while (travel > 6 / Density) { travel -= 6 / Density; Add(Items, new P { X = p.X, Y = p.Y, T = now }); }
        }
        Color Ink(double a) { return Light ? Color.FromArgb((int)(217 * a), 8, 23, 26) : Color.FromArgb((int)(230 * a), 30, 187, 170); }
        Color Second(double a) { return Color.FromArgb((int)(140 * a), 255, 79, 139); }
        protected override void Paint(Graphics g, float dt, double now)
        {
            double life = 700 * Duration; float s = Scale;
            while (Items.Count > 0 && now - Items[0].T > life) Items.RemoveAt(0);
            foreach (var d in Items) { float r = 5.2f * (float)(1 - (now - d.T) / life) * s; if (r > .3f) Disc(g, d.X + 1.6f * s, d.Y + 1.2f * s, r, Second(1)); }
            foreach (var d in Items) { float r = 5.2f * (float)(1 - (now - d.T) / life) * s; if (r > .3f) Disc(g, d.X, d.Y, r, Ink(1)); }
        }
        // A rubber stamp: a disc of halftone dots printed in two inks, slightly off register.
        public override void Click(PointF p, double now)
        {
            float s = Scale;
            Effects.Add(new Fx { T = now, Dur = 1000, Paint = (g, k) =>
            {
                float shrink = k < .1f ? k / .1f : 1 - Math.Max(0, k - .45f) / .55f;
                for (int pass = 0; pass < 2; pass++)
                    for (int i = -6; i <= 6; i++)
                        for (int j = -6; j <= 6; j++)
                        {
                            float dx = (i + (j % 2 != 0 ? .5f : 0)) * 4.6f, dy = j * 4, d = (float)Math.Sqrt(dx * dx + dy * dy);
                            if (d > 28) continue;
                            float r = (1 - d / 28) * 2.4f * shrink;
                            if (r > .25f) Disc(g, p.X + (dx + (pass == 0 ? 1.8f : 0)) * s, p.Y + (dy + (pass == 0 ? 1.4f : 0)) * s, r * s, pass == 0 ? Second(1) : Ink(1));
                        }
            } });
        }
    }

    class Ink : TrailRecipe
    {
        public override void Move(PointF p, PointF prev, float speed, double now)
        {
            float s = Scale;
            Along(prev, p, Count(speed, .7f, 3), (x, y) => Add(Items, new P { X = x + Rn(-3, 3) * s, Y = y + Rn(-3, 3) * s, Vx = Rn(-.01f, .01f) * s, Vy = Rn(-.015f, .005f) * s, R = Rn(3, 7), Max = Rn(1300, 2200) * Duration }));
        }
        Color Tone(double a) { return Light ? Color.FromArgb((int)(255 * Math.Min(1, a)), 8, 23, 26) : Color.FromArgb((int)(255 * Math.Min(1, a)), 120, 240, 226); }
        protected override void Paint(Graphics g, float dt, double now)
        {
            float s = Scale;
            for (int i = Items.Count - 1; i >= 0; i--)
            {
                var d = Items[i]; d.Life += dt; float k = d.Life / d.Max;
                if (k >= 1) { Items.RemoveAt(i); continue; }
                Fly(d, dt, 0, 0);
                float r = d.R * (1 + k * 2.4f) * s;
                double a = (k < .08f ? k / .08f : 1 - k) * (Light ? .22 : .2);
                // A soft blot from three discs, densest in the middle.
                Disc(g, d.X, d.Y, r, Tone(a * .35)); Disc(g, d.X, d.Y, r * .7f, Tone(a * .45)); Disc(g, d.X, d.Y, r * .4f, Tone(a * .55));
            }
        }
        // A splash of ink: a ragged blot that spreads fast, droplets around it, then it dilutes.
        public override void Click(PointF p, double now)
        {
            float s = Scale;
            var lobes = Enumerable.Range(0, 16).Select(i => Rn(.7f, 1.3f)).ToArray();
            var drops = Enumerable.Range(0, 8).Select(i => new[] { Rn(0, 6.283f), Rn(17, 28), Rn(1, 3) }).ToArray();
            Effects.Add(new Fx { T = now, Dur = 1700, Paint = (g, k) =>
            {
                float grow = Ease(Math.Min(1, k * 4)), r0 = 11 * grow * (1 + k * .5f) * s;
                double a = (Light ? .6 : .45) * (1 - k);
                var pts = new PointF[33];
                for (int i = 0; i <= 32; i++) { double t = i / 32.0 * 6.283; float rr = r0 * (lobes[(i / 2) % 16] + (float)Math.Sin(t * 5) * .08f); pts[i] = new PointF(p.X + (float)Math.Cos(t) * rr, p.Y + (float)Math.Sin(t) * rr); }
                using (var b = new SolidBrush(Tone(a))) { if (r0 > .5f) g.FillPolygon(b, pts); }
                foreach (var d in drops) Disc(g, p.X + (float)Math.Cos(d[0]) * d[1] * grow * s, p.Y + (float)Math.Sin(d[0]) * d[1] * grow * s, d[2] * grow * s, Tone(a));
            } });
        }
    }
}
