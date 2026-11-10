using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace Lampfish
{
    // The moving mark outside the page (the round button of the assistant): the same data as app/ui/mark.js (mark-data.js,
    // written by src/mark.py) and the same swim, drawn with GDI+. Keep both in step when one changes.
    sealed class Mark
    {
        sealed class Shape { public float[][][] Rings; public GraphicsPath Mouth, Eye, Tip; public PointF Lamp; public float LampR, Halo1, Halo2; public PointF TailAt, Root, Light, Fin, Middle; public float Lid; }
        static Shape shape;
        static bool tried;

        static Shape Load()
        {
            if (tried) return shape;
            tried = true;
            try
            {
                string text = File.ReadAllText(Path.Combine(Program.Root, "app", "ui", "mark-data.js"));
                int at = text.IndexOf('{');
                var d = new JavaScriptSerializer { MaxJsonLength = int.MaxValue }.Deserialize<Dictionary<string, object>>(text.Substring(at, text.LastIndexOf('}') - at + 1));
                var m = Regex.Match((string)d["inner"], @"matrix\(([^)]+)\)").Groups[1].Value.Split(' ').Select(v => float.Parse(v, CultureInfo.InvariantCulture)).ToArray();
                var inner = new Matrix(m[0], m[1], m[2], m[3], m[4], m[5]);
                Func<string, GraphicsPath> paths = svg =>
                {
                    var p = new GraphicsPath(FillMode.Alternate);
                    foreach (Match one in Regex.Matches(svg, "d=\"([^\"]+)\"")) Parse(one.Groups[1].Value, p);
                    p.Transform(inner);
                    // Curves turned into short lines once: a button is too small to show the difference, and each frame fills faster.
                    p.Flatten(null, 1.5f);
                    return p;
                };
                Func<string, PointF> point = key => { var a = (System.Collections.ArrayList)d[key]; return new PointF(Convert.ToSingle(a[0]), Convert.ToSingle(a[1])); };
                // A third of the points: drawn at the size of a button, the outline stays the same and costs a third.
                var rings = ((System.Collections.ArrayList)d["rings"]).Cast<System.Collections.ArrayList>()
                    .Select(r => r.Cast<System.Collections.ArrayList>().Where((p, i) => i % 3 == 0).Select(p => p.Cast<object>().Select(Convert.ToSingle).ToArray()).ToArray()).ToArray();
                var lamp = Regex.Match((string)d["lamp"], "cx=\"([^\"]+)\" cy=\"([^\"]+)\" r=\"([^\"]+)\"");
                var halos = Regex.Matches((string)d["halos"], "r=\"([^\"]+)\"");
                Func<string, float> F = v => float.Parse(v, CultureInfo.InvariantCulture);
                var c = new[] { new PointF(F(lamp.Groups[1].Value), F(lamp.Groups[2].Value)) };
                inner.TransformPoints(c);
                float scale = (float)Math.Sqrt(m[0] * m[0] + m[1] * m[1]);
                var xs = rings[0].Select(p => p[0]); var ys = rings[0].Select(p => p[1]);
                shape = new Shape
                {
                    Rings = rings, Mouth = paths((string)d["mouth"]), Eye = paths((string)d["eye"]), Tip = paths((string)d["tip"]),
                    Lamp = c[0], LampR = F(lamp.Groups[3].Value) * scale, Halo1 = F(halos[0].Groups[1].Value) * scale, Halo2 = F(halos[1].Groups[1].Value) * scale,
                    TailAt = point("tail"), Root = point("root"), Light = point("light"), Fin = point("fin"), Lid = Convert.ToSingle(d["lid"]),
                    Middle = new PointF((xs.Min() + xs.Max()) / 2, (ys.Min() + ys.Max()) / 2),
                };
            }
            catch (Exception ex) { Program.Log(ex); shape = null; }
            return shape;
        }

        // The mark only uses absolute M, C and Z.
        static void Parse(string d, GraphicsPath p)
        {
            var t = Regex.Matches(d, @"[MCZ]|-?\d*\.?\d+(?:e-?\d+)?").Cast<Match>().Select(x => x.Value).ToArray();
            PointF cur = PointF.Empty;
            bool open = false;
            for (int i = 0; i < t.Length;)
            {
                string k = t[i++];
                Func<int, float> n = j => float.Parse(t[i + j], CultureInfo.InvariantCulture);
                if (k == "M") { if (open) p.CloseFigure(); p.StartFigure(); cur = new PointF(n(0), n(1)); i += 2; open = true; }
                else if (k == "C") { var a = new PointF(n(0), n(1)); var b = new PointF(n(2), n(3)); var e = new PointF(n(4), n(5)); p.AddBezier(cur, a, b, e); cur = e; i += 6; }
                else if (k == "Z") { p.CloseFigure(); open = false; }
                else i++;
            }
        }

        public static bool Ready { get { return Load() != null; } }

        sealed class Spring { public double X, V; public Spring(double x) { X = x; } public void To(double target, double w, double dt) { V += (w * w * (target - X) - 2 * w * V) * dt; X += V * dt; } }
        sealed class Gesture { public double Len, Amp, Beat, Bend, Weight; }
        sealed class Move { public Gesture G; public double At; public int Side; }

        static readonly Gesture[] Gestures = {
            new Gesture { Weight = 3, Len = 1.4, Amp = 6, Beat = .75 },
            new Gesture { Weight = 2, Len = .8, Amp = 9, Beat = 1.1 },
            new Gesture { Weight = 2, Len = 1.3, Bend = 9, Amp = -1.2 },
            new Gesture { Weight = 2, Len = .6, Bend = 12 },
            new Gesture { Weight = 1, Len = 2.2, Amp = -1.6, Beat = -.1 },
        };

        readonly Random dice = new Random();
        readonly Spring amp = new Spring(2), beat = new Spring(.385), bend = new Spring(0), rod = new Spring(0);
        Move move, own;
        double t, phase, nextMove = 1.5, blinkAt = -9, nextBlink = 2.5, nextRod = 4, pluckAt = -9, lit;
        int pluckSide = -1;

        static double Ease(double k) { k = Math.Max(0, Math.Min(1, k)); return .5 - Math.Cos(k * Math.PI) / 2; }
        static double WeightOf(Move m, double t) { return m == null ? 0 : Math.Min(Ease((t - m.At) / .3), Ease((m.G.Len - (t - m.At)) / .3)); }
        Gesture Pick() { double r = dice.NextDouble() * Gestures.Sum(g => g.Weight); foreach (var g in Gestures) if ((r -= g.Weight) < 0) return g; return Gestures[0]; }

        // The pointer on the mark: one lively gesture, the rod plucked.
        public void Poke()
        {
            if (own != null) return;
            own = new Move { G = Gestures[dice.NextDouble() < .5 ? 0 : 1], At = t, Side = dice.NextDouble() < .5 ? -1 : 1 };
            pluckAt = t; pluckSide = -1;
        }

        public void Step(double dt)
        {
            dt = Math.Max(0, Math.Min(.05, dt));
            t += dt;
            if (move == null && t >= nextMove) move = new Move { G = Pick(), At = t, Side = dice.NextDouble() < .5 ? -1 : 1 };
            if (move != null && t - move.At > move.G.Len) { move = null; nextMove = t + 1.8 + dice.NextDouble() * 1.7; }
            if (own != null && t - own.At > own.G.Len) own = null;
            if (t >= nextBlink) { blinkAt = t; nextBlink = t + 3 + dice.NextDouble() * 4 + (dice.NextDouble() < .25 ? -2.8 : 0); }
            if (t >= nextRod) { nextRod = t + 6 + dice.NextDouble() * 3; if (t - pluckAt > .3) { pluckAt = t; pluckSide = dice.NextDouble() < .7 ? -1 : 1; } }
            double env = .35 + .65 * Math.Pow(Math.Sin(t * 2 * Math.PI / 11) * .6 + Math.Sin(t * 2 * Math.PI / 6.7 + 1) * .4, 2);
            double a = WeightOf(move, t), b = WeightOf(own, t);
            Func<Func<Gesture, double>, double> add = f => (move != null ? a * f(move.G) : 0) + (own != null ? b * f(own.G) : 0);
            double side = (move != null ? a * move.Side * move.G.Bend : 0) + (own != null ? b * own.Side * own.G.Bend : 0);
            amp.To(Math.Max(.6, 2.8 * env + add(g => g.Amp)), 6, dt);
            beat.To(.385 * (1 + .08 * Math.Sin(t * 2 * Math.PI / 13)) + add(g => g.Beat), 5, dt);
            bend.To(side, 7, dt);
            phase = (phase + 2 * Math.PI * beat.X * dt) % (2 * Math.PI * 1000);
            double pu = (t - pluckAt) / .3, push = pu >= 0 && pu < 1 ? pluckSide * 300 * Math.Pow(Math.Sin(Math.PI * pu), 2) : 0;
            rod.V += (push - 81 * rod.X - 5.4 * rod.V) * dt;
            rod.X += rod.V * dt;
            lit += (b - lit) * .2;
        }

        static PointF Turn(float x, float y, PointF c, double a) { double cs = Math.Cos(a), sn = Math.Sin(a); return new PointF((float)(c.X + (x - c.X) * cs - (y - c.Y) * sn), (float)(c.Y + (x - c.X) * sn + (y - c.Y) * cs)); }

        // Draws the fish in its 512 box mapped onto box, in one color, its lamp and glow in the same color.
        public void Draw(Graphics g, RectangleF box, Color ink)
        {
            var s = Load();
            if (s == null) return;
            const double deg = Math.PI / 180;
            double bl = (t - blinkAt) / .26, lid = bl >= 0 && bl < 1 ? Math.Max(.08, Math.Abs(1 - 2 * bl)) : 1;
            double fin = (Math.Sin(t * 2 * Math.PI / 3.3) * 3.6 + Math.Sin(t * 2 * Math.PI / 1.9 + 1.3) * 1.4) * deg;
            double rodAngle = (Math.Sin(t * 2 * Math.PI / 9) * 1.5 + rod.X) * deg;
            Func<double, double> tail = w => (amp.X * Math.Sin(phase - 1.4 * w) + bend.X * w) * deg;
            double rock = Math.Sin(t * 2 * Math.PI / 5.3) * 1.8 + Math.Sin(t * 2 * Math.PI / 8.9 + .7) * .9;

            var state = g.Save();
            g.TranslateTransform(box.X, box.Y);
            g.ScaleTransform(box.Width / 512f, box.Height / 512f);
            g.TranslateTransform(s.Middle.X, s.Middle.Y);
            g.RotateTransform((float)rock);
            g.TranslateTransform(-s.Middle.X, -s.Middle.Y);
            using (var brush = new SolidBrush(ink))
            using (var body = new GraphicsPath(FillMode.Alternate))
            {
                foreach (var ring in s.Rings)
                {
                    var pts = new PointF[ring.Length];
                    for (int i = 0; i < ring.Length; i++)
                    {
                        float x = ring[i][0], y = ring[i][1], k = ring[i][2], w = ring[i][3];
                        if (k == 1 && w != 0) pts[i] = Turn(x, y, s.TailAt, tail(w) * w);
                        else if (k == 2 && w != 0) pts[i] = Turn(x, y, s.Root, rodAngle * w);
                        else if (k == 3 && lid != 1) pts[i] = new PointF(x, (float)(s.Lid + (y - s.Lid) * lid));
                        else if (k == 4 && fin != 0) pts[i] = Turn(x, y, s.Fin, fin);
                        else pts[i] = new PointF(x, y);
                    }
                    body.AddPolygon(pts);
                }
                g.FillPath(brush, body);
                g.FillPath(brush, s.Mouth);
                double eyeAlpha = Math.Max(0, Math.Min(1, (lid - .6) / .25));
                if (eyeAlpha > 0)
                    using (var eye = (GraphicsPath)s.Eye.Clone())
                    using (var squeeze = new Matrix(1, 0, 0, (float)lid, 0, (float)(s.Lid * (1 - lid))))
                    using (var eyeBrush = new SolidBrush(Color.FromArgb((int)(ink.A * eyeAlpha), ink)))
                    { eye.Transform(squeeze); g.FillPath(eyeBrush, eye); }
                var lampState = g.Save();
                g.TranslateTransform(s.Root.X, s.Root.Y);
                g.RotateTransform((float)(rodAngle / deg));
                g.TranslateTransform(-s.Root.X, -s.Root.Y);
                g.FillPath(brush, s.Tip);
                float glow = (float)(1 + .05 * Math.Sin(t * 2 * Math.PI / 3.6) + .1 * lit);
                foreach (var halo in new[] { new { R = s.Halo1 * glow, A = .26 }, new { R = s.Halo2 * glow, A = .42 } })
                    using (var hb = new SolidBrush(Color.FromArgb((int)(ink.A * halo.A), ink)))
                        g.FillEllipse(hb, s.Lamp.X - halo.R, s.Lamp.Y - halo.R, halo.R * 2, halo.R * 2);
                g.FillEllipse(brush, s.Lamp.X - s.LampR, s.Lamp.Y - s.LampR, s.LampR * 2, s.LampR * 2);
                g.Restore(lampState);
            }
            g.Restore(state);
        }

        // Windows asks for less motion when "Animation effects" is off.
        public static bool Still { get { bool on = true; return SystemParametersInfo(0x1042, 0, ref on, 0) && !on; } }
        [DllImport("user32.dll")] static extern bool SystemParametersInfo(int action, int param, ref bool value, int ini);
    }
}
