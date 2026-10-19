using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

namespace Bramble
{
    class Wav
    {
        public int Channels, Frequency;
        public float[] Data;

        public double Duration { get { return Data.Length / (double)Channels / Frequency; } }

        struct Format { public int Code, Channels, Frequency, Block, Bits; }

        public static double ReadDuration(string path)
        {
            try
            {
                using (var r = new BinaryReader(File.OpenRead(path)))
                {
                    Format f; long start, size;
                    if (!Browse(r, out f, out start, out size) || !Taken(f)) return 0;
                    return size / f.Block / (double)f.Frequency;
                }
            }
            catch { return 0; }
        }

        public static Wav Read(string path)
        {
            byte[] o = File.ReadAllBytes(path);
            Format f; long start, size;
            using (var r = new BinaryReader(new MemoryStream(o)))
                if (!Browse(r, out f, out start, out size) || !Taken(f))
                    throw new InvalidDataException("Unsupported WAV format: " + path);

            int width = f.Bits / 8;
            long n = size / width;
            n -= n % f.Channels;
            var d = new float[n];
            int p = (int)start;
            for (long i = 0; i < n; i++, p += width)
            {
                switch (f.Bits)
                {
                    case 8: d[i] = (o[p] - 128) / 128f; break;
                    case 16: d[i] = BitConverter.ToInt16(o, p) / 32768f; break;
                    case 24: d[i] = (o[p] | o[p + 1] << 8 | (sbyte)o[p + 2] << 16) / 8388608f; break;
                    case 32: d[i] = f.Code == 3 ? BitConverter.ToSingle(o, p) : BitConverter.ToInt32(o, p) / 2147483648f; break;
                    default: d[i] = (float)BitConverter.ToDouble(o, p); break;
                }
            }
            return new Wav { Channels = f.Channels, Frequency = f.Frequency, Data = d };
        }

        static bool Browse(BinaryReader r, out Format f, out long start, out long size)
        {
            f = new Format();
            start = size = 0;
            Stream s = r.BaseStream;
            if (s.Length < 12 || Id(r) != "RIFF") return false;
            r.ReadUInt32();
            if (Id(r) != "WAVE") return false;
            bool hasFormat = false;
            while (s.Position + 8 <= s.Length)
            {
                string id = Id(r);
                long t = r.ReadUInt32();
                long suite = s.Position + t + (t & 1);
                if (id == "fmt ")
                {
                    f.Code = r.ReadUInt16(); f.Channels = r.ReadUInt16(); f.Frequency = (int)r.ReadUInt32();
                    r.ReadUInt32(); f.Block = r.ReadUInt16(); f.Bits = r.ReadUInt16();

                    if (f.Code == 0xFFFE && t >= 40) { r.ReadUInt16(); r.ReadUInt16(); r.ReadUInt32(); f.Code = r.ReadUInt16(); }
                    hasFormat = true;
                }
                else if (id == "data")
                {
                    start = s.Position;
                    size = Math.Min(t, s.Length - start);
                    return hasFormat;
                }
                s.Position = suite;
            }
            return false;
        }

        static bool Taken(Format f)
        {
            bool pcm = f.Code == 1 && (f.Bits == 8 || f.Bits == 16 || f.Bits == 24 || f.Bits == 32);
            bool isFloat = f.Code == 3 && (f.Bits == 32 || f.Bits == 64);
            return (pcm || isFloat) && f.Channels > 0 && f.Frequency > 0 && f.Block == f.Channels * f.Bits / 8;
        }

        static string Id(BinaryReader r) { return Encoding.ASCII.GetString(r.ReadBytes(4)); }

        public byte[] Render(float gain, double from = 0)
        {
            int first = Math.Max(0, Math.Min(Data.Length / Channels, (int)(from * Frequency)));
            int c = Math.Min(Channels, 2), images = Data.Length / Channels - first, bytes = images * c * 2;
            var output = new byte[44 + bytes];
            Write(output, 0, "RIFF"); Write32(output, 4, 36 + bytes); Write(output, 8, "WAVE");
            Write(output, 12, "fmt "); Write32(output, 16, 16); Write16(output, 20, 1); Write16(output, 22, c);
            Write32(output, 24, Frequency); Write32(output, 28, Frequency * c * 2); Write16(output, 32, c * 2); Write16(output, 34, 16);
            Write(output, 36, "data"); Write32(output, 40, bytes);
            int p = 44;
            for (int i = 0; i < images; i++)
                for (int k = 0; k < c; k++, p += 2)
                {
                    float v = Data[(first + i) * Channels + k] * gain;
                    if (v > 1) v = 1; else if (v < -1) v = -1;
                    Write16(output, p, (int)Math.Round(v * 32767));
                }
            return output;
        }

        public float Normalisation()
        {
            const double Target = 0.126;
            int images = Data.Length / Channels, window = Math.Max(1, Frequency * 2 / 5);
            if (images == 0) return 1;
            double best = 0, sum = 0, peak = 0;
            var squares = new double[images];
            for (int i = 0; i < images; i++)
            {
                double s = 0;
                for (int k = 0; k < Channels; k++)
                {
                    double v = Data[i * Channels + k];
                    s += v * v;
                    if (v > peak) peak = v; else if (-v > peak) peak = -v;
                }
                squares[i] = s / Channels;
                sum += squares[i];
                if (i >= window) sum -= squares[i - window];
                double average = sum / Math.Min(i + 1, window);
                if (average > best) best = average;
            }
            double rms = Math.Sqrt(best);
            if (rms < 1e-5 || peak < 1e-5) return 1;
            return (float)Math.Max(0.1, Math.Min(Math.Min(Target / rms, 0.97 / peak), 6));
        }

        public void Envelope(int framesPerSecond, float gain, out double[] rms, out double[] peak)
        {
            int step = Math.Max(1, Frequency / framesPerSecond), images = Data.Length / Channels;
            int frames = (images + step - 1) / step;
            rms = new double[frames];
            peak = new double[frames];
            for (int t = 0; t < frames; t++)
            {
                int start = t * step * Channels, end = Math.Min(images, (t + 1) * step) * Channels;
                double sum = 0, max = 0;
                for (int i = start; i < end; i++)
                {
                    double v = Data[i];
                    sum += v * v;
                    if (v > max) max = v; else if (-v > max) max = -v;
                }
                rms[t] = Math.Round(Math.Sqrt(sum / Math.Max(1, end - start)) * gain, 4);
                peak[t] = Math.Round(max * gain, 3);
            }
        }

        public double[][] Spectrum(int framesPerSecond, int bands)
        {
            const int window = 2048;
            int images = Data.Length / Channels;
            int frames = Math.Min(framesPerSecond * 40, (int)Math.Ceiling(images / (double)Frequency * framesPerSecond));
            var centers = new double[bands];
            for (int b = 0; b < bands; b++) centers[b] = 60 * Math.Pow(Math.Min(15000, Frequency / 2.2) / 60, b / (double)(bands - 1));
            var hann = new double[window];
            for (int i = 0; i < window; i++) hann[i] = 0.5 - 0.5 * Math.Cos(2 * Math.PI * i / (window - 1));
            var result = new double[frames][];
            var mono = new double[window];
            double top = 1e-9;
            for (int f = 0; f < frames; f++)
            {
                int centre = (int)((f + 0.5) / framesPerSecond * Frequency), first = centre - window / 2;
                for (int i = 0; i < window; i++)
                {
                    int k = first + i;
                    double v = 0;
                    if (k >= 0 && k < images) { for (int c = 0; c < Channels; c++) v += Data[k * Channels + c]; v /= Channels; }
                    mono[i] = v * hann[i];
                }
                var row = new double[bands];
                for (int b = 0; b < bands; b++)
                {
                    double w = 2 * Math.PI * centers[b] / Frequency, coeff = 2 * Math.Cos(w), s1 = 0, s2 = 0;
                    for (int i = 0; i < window; i++) { double s0 = mono[i] + coeff * s1 - s2; s2 = s1; s1 = s0; }
                    row[b] = Math.Sqrt(Math.Max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2));
                    if (row[b] > top) top = row[b];
                }
                result[f] = row;
            }
            foreach (var row in result)
                for (int b = 0; b < bands; b++)
                {
                    double db = 20 * Math.Log10(Math.Max(row[b], 1e-9) / top);
                    row[b] = Math.Round(Math.Max(0, Math.Min(1, (db + 48) / 48)), 2);
                }
            return result;
        }

        static void Write(byte[] o, int p, string s) { for (int i = 0; i < 4; i++) o[p + i] = (byte)s[i]; }
        static void Write16(byte[] o, int p, int v) { o[p] = (byte)v; o[p + 1] = (byte)(v >> 8); }
        static void Write32(byte[] o, int p, int v) { o[p] = (byte)v; o[p + 1] = (byte)(v >> 8); o[p + 2] = (byte)(v >> 16); o[p + 3] = (byte)(v >> 24); }
    }

    static class Player
    {
        static IntPtr buffer = IntPtr.Zero;

        public static bool Play(byte[] wav)
        {
            Stop();
            buffer = Marshal.AllocHGlobal(wav.Length);
            Marshal.Copy(wav, 0, buffer, wav.Length);
            if (Native.PlaySound(buffer, IntPtr.Zero, Native.SND_MEMORY | Native.SND_ASYNC | Native.SND_NODEFAULT)) return true;
            Stop();
            return false;
        }

        public static void Stop()
        {
            Native.PlaySound(IntPtr.Zero, IntPtr.Zero, 0);
            if (buffer == IntPtr.Zero) return;
            Marshal.FreeHGlobal(buffer);
            buffer = IntPtr.Zero;
        }
    }
}
