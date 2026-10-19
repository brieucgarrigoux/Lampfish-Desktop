using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace Bramble
{
    static class AudioMeter
    {
        static IAudioMeterInformation meter;
        static Timer timer;
        static DateTime lookedFor = DateTime.MinValue;
        static double ceiling = 0.05, last;

        public static void Set(bool on)
        {
            if (on && timer == null)
            {
                timer = new Timer { Interval = 50 };
                timer.Tick += (s, e) => Tick();
                timer.Start();
            }
            else if (!on && timer != null)
            {
                timer.Stop();
                timer.Dispose();
                timer = null;
                Release();
                last = 0;
                Program.SendAudio(0);
            }
        }

        static void Tick()
        {
            float peak = 0;
            try
            {
                if (meter == null && (DateTime.Now - lookedFor).TotalSeconds > 2) { lookedFor = DateTime.Now; meter = Open(); }
                if (meter != null && meter.GetPeakValue(out peak) != 0) { Release(); peak = 0; }
            }
            catch { Release(); }
            ceiling = Math.Max(0.05, Math.Max(ceiling * 0.995, peak));
            double level = Math.Min(1, peak / ceiling);
            level = Math.Round(level * level * 0.6 + level * 0.4, 2);
            if (level == 0 && last == 0) return;
            last = level;
            Program.SendAudio(level);
        }

        static IAudioMeterInformation Open()
        {
            var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumerator();
            IMMDevice device;
            if (enumerator.GetDefaultAudioEndpoint(0, 1, out device) != 0) return null;
            Guid id = typeof(IAudioMeterInformation).GUID;
            object meterObject;
            if (device.Activate(ref id, 23, IntPtr.Zero, out meterObject) != 0) return null;
            return (IAudioMeterInformation)meterObject;
        }

        static void Release()
        {
            if (meter != null) try { Marshal.ReleaseComObject(meter); } catch { }
            meter = null;
        }

        [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { }

        [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDeviceEnumerator
        {
            [PreserveSig] int EnumAudioEndpoints(int flow, int state, out IntPtr devices);
            [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice device);
        }

        [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDevice
        {
            [PreserveSig] int Activate(ref Guid id, int context, IntPtr parameters, [MarshalAs(UnmanagedType.IUnknown)] out object result);
        }

        [ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IAudioMeterInformation
        {
            [PreserveSig] int GetPeakValue(out float peak);
        }
    }
}
