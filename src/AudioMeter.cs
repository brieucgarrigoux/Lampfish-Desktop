using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace Bramble
{
    static class AudioMeter
    {
        static readonly List<IAudioMeterInformation> meters = new List<IAudioMeterInformation>();
        static Timer timer;
        static DateTime lookedFor = DateTime.MinValue, opened = DateTime.MinValue;
        static double ceiling = 0.05, last;

        static bool wanted, previewing;

        public static void Set(bool on) { wanted = on; Refresh(); }

        public static void Preview(bool on) { previewing = on; Refresh(); }

        static void Refresh()
        {
            bool on = wanted || previewing;
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
                // Outputs come and go (HDMI screen, headphones, default device), and a meter on a removed or idle output stays silent.
                if (meters.Count > 0 && (DateTime.Now - opened).TotalSeconds > 4) Release();
                if (meters.Count == 0 && (DateTime.Now - lookedFor).TotalSeconds > 2) { lookedFor = opened = DateTime.Now; Open(); }
                foreach (var meter in meters)
                {
                    float one;
                    if (meter.GetPeakValue(out one) != 0) { Release(); peak = 0; break; }
                    peak = Math.Max(peak, one);
                }
            }
            catch { Release(); }
            ceiling = Math.Max(0.05, Math.Max(ceiling * 0.995, peak));
            double level = Math.Min(1, peak / ceiling);
            level = Math.Round(level * level * 0.6 + level * 0.4, 2);
            if (level == 0 && last == 0) return;
            last = level;
            Program.SendAudio(level);
        }

        static void Open()
        {
            var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumerator();
            IMMDeviceCollection devices;
            if (enumerator.EnumAudioEndpoints(0, 1, out devices) != 0) return;
            uint count;
            devices.GetCount(out count);
            Guid id = typeof(IAudioMeterInformation).GUID;
            for (uint i = 0; i < count; i++)
            {
                IMMDevice device;
                object meterObject;
                if (devices.Item(i, out device) != 0 || device.Activate(ref id, 23, IntPtr.Zero, out meterObject) != 0) continue;
                meters.Add((IAudioMeterInformation)meterObject);
            }
        }

        public static bool Headphones()
        {
            IMMDevice device = null;
            IPropertyStore store = null;
            try
            {
                var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumerator();
                if (enumerator.GetDefaultAudioEndpoint(0, 0, out device) != 0 || device == null) return false;
                if (device.OpenPropertyStore(0, out store) != 0 || store == null) return false;
                var key = new PropertyKey { Format = new Guid("1da5d803-d492-4edd-8c23-e0c0ffee7f0e"), Id = 0 };
                PropVariant value;
                if (store.GetValue(ref key, out value) != 0 || value.Type != 19) return false;
                return value.Number == 3 || value.Number == 5;
            }
            catch { return false; }
            finally
            {
                if (store != null) Marshal.ReleaseComObject(store);
                if (device != null) Marshal.ReleaseComObject(device);
            }
        }

        // Programs with a running audio stream on any output (music, a call, a video) are in use even without a window in front.
        public static HashSet<int> Playing()
        {
            var ids = new HashSet<int>();
            IMMDeviceCollection devices = null;
            try
            {
                var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumerator();
                if (enumerator.EnumAudioEndpoints(0, 1, out devices) != 0) return ids;
                uint count;
                devices.GetCount(out count);
                Guid id = typeof(IAudioSessionManager2).GUID;
                for (uint i = 0; i < count; i++)
                {
                    IMMDevice device;
                    object manager;
                    if (devices.Item(i, out device) != 0) continue;
                    if (device.Activate(ref id, 23, IntPtr.Zero, out manager) == 0)
                    {
                        IAudioSessionEnumerator sessions;
                        if (((IAudioSessionManager2)manager).GetSessionEnumerator(out sessions) == 0)
                        {
                            int n;
                            sessions.GetCount(out n);
                            for (int k = 0; k < n; k++)
                            {
                                object session;
                                if (sessions.GetSession(k, out session) != 0) continue;
                                var control = session as IAudioSessionControl2;
                                int state;
                                uint process;
                                if (control != null && control.GetState(out state) == 0 && state == 1 && control.GetProcessId(out process) == 0 && process != 0) ids.Add((int)process);
                                Marshal.ReleaseComObject(session);
                            }
                            Marshal.ReleaseComObject(sessions);
                        }
                        Marshal.ReleaseComObject(manager);
                    }
                    Marshal.ReleaseComObject(device);
                }
            }
            catch { }
            finally { if (devices != null) Marshal.ReleaseComObject(devices); }
            return ids;
        }

        static void Release()
        {
            foreach (var meter in meters) try { Marshal.ReleaseComObject(meter); } catch { }
            meters.Clear();
        }

        // The default output and input, read and set through the documented endpoint volume of Core Audio.
        public static object Endpoints()
        {
            float level, unused; bool muted, micMuted;
            bool output = Endpoint(0, v => { }, out level, out muted);
            bool input = Endpoint(1, v => { }, out unused, out micMuted);
            return new { volume = output ? (int?)Math.Round(level * 100) : null, muted = output && muted, mic = input, micMuted = input && micMuted };
        }

        delegate void Use(IAudioEndpointVolume volume);

        static bool Endpoint(int flow, Use use, out float level, out bool muted)
        {
            level = 0; muted = false;
            IMMDevice device = null;
            object found = null;
            try
            {
                var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumerator();
                if (enumerator.GetDefaultAudioEndpoint(flow, 0, out device) != 0 || device == null) return false;
                var id = typeof(IAudioEndpointVolume).GUID;
                if (device.Activate(ref id, 23, IntPtr.Zero, out found) != 0 || found == null) return false;
                var volume = (IAudioEndpointVolume)found;
                float l = 0; bool m = false;
                volume.GetMasterVolumeLevelScalar(out l);
                volume.GetMute(out m);
                level = l; muted = m;
                use(volume);
                return true;
            }
            catch { return false; }
            finally
            {
                if (found != null) Marshal.ReleaseComObject(found);
                if (device != null) Marshal.ReleaseComObject(device);
            }
        }

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            float level; bool muted;
            Guid none = Guid.Empty;
            switch (action)
            {
                case "volume":
                {
                    int value = Math.Max(0, Math.Min(100, Convert.ToInt32(m["value"])));
                    Endpoint(0, v => { v.SetMasterVolumeLevelScalar(value / 100f, ref none); if (value > 0) v.SetMute(false, ref none); }, out level, out muted);
                    return !(m.ContainsKey("live") && Convert.ToBoolean(m["live"]));
                }
                case "mute":
                {
                    bool on = Convert.ToBoolean(m["on"]);
                    Endpoint(0, v => v.SetMute(on, ref none), out level, out muted);
                    return true;
                }
                case "mic":
                {
                    bool on = Convert.ToBoolean(m["on"]);
                    Endpoint(1, v => v.SetMute(!on, ref none), out level, out muted);
                    Program.Undoable(Language.T(on ? "Microphone on" : "Microphone off"), () => Endpoint(1, v => v.SetMute(on, ref none), out level, out muted));
                    return true;
                }
            }
            return false;
        }

        [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IAudioEndpointVolume
        {
            [PreserveSig] int RegisterControlChangeNotify(IntPtr notify);
            [PreserveSig] int UnregisterControlChangeNotify(IntPtr notify);
            [PreserveSig] int GetChannelCount(out uint count);
            [PreserveSig] int SetMasterVolumeLevel(float level, ref Guid context);
            [PreserveSig] int SetMasterVolumeLevelScalar(float level, ref Guid context);
            [PreserveSig] int GetMasterVolumeLevel(out float level);
            [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
            [PreserveSig] int SetChannelVolumeLevel(uint channel, float level, ref Guid context);
            [PreserveSig] int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid context);
            [PreserveSig] int GetChannelVolumeLevel(uint channel, out float level);
            [PreserveSig] int GetChannelVolumeLevelScalar(uint channel, out float level);
            [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid context);
            [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
        }

        // The only class for it in lampfish: Windows gives one enumerator per process, and .NET refuses it to a second class with the same identifier.
        [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] internal class MMDeviceEnumerator { }

        [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDeviceEnumerator
        {
            [PreserveSig] int EnumAudioEndpoints(int flow, int state, out IMMDeviceCollection devices);
            [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice device);
        }

        [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDeviceCollection
        {
            [PreserveSig] int GetCount(out uint count);
            [PreserveSig] int Item(uint index, out IMMDevice device);
        }

        [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDevice
        {
            [PreserveSig] int Activate(ref Guid id, int context, IntPtr parameters, [MarshalAs(UnmanagedType.IUnknown)] out object result);
            [PreserveSig] int OpenPropertyStore(int access, out IPropertyStore store);
        }

        [ComImport, Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IPropertyStore
        {
            [PreserveSig] int GetCount(out uint count);
            [PreserveSig] int GetAt(uint index, out PropertyKey key);
            [PreserveSig] int GetValue(ref PropertyKey key, out PropVariant value);
        }

        [StructLayout(LayoutKind.Sequential)] struct PropertyKey { public Guid Format; public int Id; }

        [StructLayout(LayoutKind.Explicit, Size = 24)]
        struct PropVariant
        {
            [FieldOffset(0)] public ushort Type;
            [FieldOffset(8)] public uint Number;
        }

        [ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IAudioMeterInformation
        {
            [PreserveSig] int GetPeakValue(out float peak);
        }

        [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IAudioSessionManager2
        {
            [PreserveSig] int GetAudioSessionControl(IntPtr session, int flags, out IntPtr control);
            [PreserveSig] int GetSimpleAudioVolume(IntPtr session, int flags, out IntPtr volume);
            [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator sessions);
        }

        [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IAudioSessionEnumerator
        {
            [PreserveSig] int GetCount(out int count);
            [PreserveSig] int GetSession(int index, [MarshalAs(UnmanagedType.IUnknown)] out object session);
        }

        [ComImport, Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IAudioSessionControl2
        {
            [PreserveSig] int GetState(out int state);
            [PreserveSig] int GetDisplayName(out IntPtr name);
            [PreserveSig] int SetDisplayName(IntPtr name, IntPtr context);
            [PreserveSig] int GetIconPath(out IntPtr path);
            [PreserveSig] int SetIconPath(IntPtr path, IntPtr context);
            [PreserveSig] int GetGroupingParam(out Guid group);
            [PreserveSig] int SetGroupingParam(IntPtr group, IntPtr context);
            [PreserveSig] int RegisterAudioSessionNotification(IntPtr client);
            [PreserveSig] int UnregisterAudioSessionNotification(IntPtr client);
            [PreserveSig] int GetSessionIdentifier(out IntPtr id);
            [PreserveSig] int GetSessionInstanceIdentifier(out IntPtr id);
            [PreserveSig] int GetProcessId(out uint id);
        }
    }
}
