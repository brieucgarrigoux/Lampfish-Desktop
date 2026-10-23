using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace Bramble
{
    class AudioSettings
    {
        public bool Shortcut;
        public int Modifiers = 3, Key = 0x7A;
        public string Label = "Ctrl + Alt + F11";
    }

    static class AudioDevices
    {
        class Device
        {
            public string Id, Name, Adapter, Kind;
            public bool Output, Active, Disabled;
            public int Rate, Bits, Channels;
            public IAudioEndpointVolume Volume;
            public IAudioMeterInformation Meter;
        }

        static readonly string[] Actions = { "watch", "use", "deviceVolume", "deviceMute", "shortcut", "shortcutKeys", "settings" };
        static readonly JavaScriptSerializer json = new JavaScriptSerializer();
        static IMMDeviceEnumerator enumerator;
        static Notifications notifications;
        static List<Device> devices = new List<Device>();
        static Timer timer, changed;
        static Bubble bubble;
        static bool watching;
        static string sent, levels, shortcutError;
        static int ticks;

        public static AudioSettings S = new AudioSettings();

        static string SettingsFile { get { return Path.Combine(Program.DataFolder("Audio"), "settings.json"); } }

        public static bool Handles(string action) { return Actions.Contains(action); }

        public static void Start()
        {
            try { if (File.Exists(SettingsFile)) S = json.Deserialize<AudioSettings>(File.ReadAllText(SettingsFile)) ?? new AudioSettings(); }
            catch (Exception ex) { Program.Log(ex); }
            try
            {
                enumerator = (IMMDeviceEnumerator)new AudioMeter.MMDeviceEnumerator();
                notifications = new Notifications();
                enumerator.RegisterEndpointNotificationCallback(notifications);
            }
            catch (Exception ex) { Program.Log(ex); }
            changed = new Timer { Interval = 300 };
            changed.Tick += (s, e) => { changed.Stop(); if (watching) { Reload(); Send(); } Program.SendState(); };
            timer = new Timer { Interval = 60 };
            timer.Tick += (s, e) => Tick();
            Register();
        }

        public static void Stop()
        {
            Hotkeys.Unregister(Hotkeys.AudioOutput);
            try { if (enumerator != null && notifications != null) enumerator.UnregisterEndpointNotificationCallback(notifications); } catch { }
            Release();
        }

        static void Save()
        {
            try { File.WriteAllText(SettingsFile, json.Serialize(S)); }
            catch (Exception ex) { Program.Log(ex); }
        }

        static void Register()
        {
            shortcutError = null;
            Hotkeys.Unregister(Hotkeys.AudioOutput);
            if (!S.Shortcut) return;
            if (!Hotkeys.Register(Hotkeys.AudioOutput, S.Modifiers, S.Key, Next)) shortcutError = "taken";
        }

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            switch (action)
            {
                case "watch":
                    watching = Convert.ToBoolean(m["on"]);
                    if (watching) { Reload(); sent = null; Send(); timer.Start(); }
                    else { timer.Stop(); Release(); }
                    return false;
                case "use":
                {
                    var d = devices.FirstOrDefault(x => x.Id == (string)m["id"]);
                    if (d == null || !d.Active) return false;
                    string before = Default(d.Output);
                    if (before == d.Id) return false;
                    if (!SetDefault(d.Id)) { Open("ms-settings:sound"); return false; }
                    // Two devices often share a name (Speakers), so the toast adds the adapter.
                    string label = string.IsNullOrEmpty(d.Adapter) ? d.Name : d.Name + " (" + d.Adapter + ")";
                    Program.Undoable(Language.T(d.Output ? "Output: {0}" : "Input: {0}", label), () => { if (before != null) SetDefault(before); });
                    return true;
                }
                case "deviceVolume":
                {
                    var d = devices.FirstOrDefault(x => x.Id == (string)m["id"]);
                    if (d == null || d.Volume == null) return false;
                    int value = Math.Max(0, Math.Min(100, Convert.ToInt32(m["value"])));
                    Guid none = Guid.Empty;
                    try { d.Volume.SetMasterVolumeLevelScalar(value / 100f, ref none); if (value > 0) d.Volume.SetMute(false, ref none); } catch { }
                    return !(m.ContainsKey("live") && Convert.ToBoolean(m["live"]));
                }
                case "deviceMute":
                {
                    var d = devices.FirstOrDefault(x => x.Id == (string)m["id"]);
                    if (d == null || d.Volume == null) return false;
                    Guid none = Guid.Empty;
                    try { d.Volume.SetMute(Convert.ToBoolean(m["on"]), ref none); } catch { }
                    sent = null;
                    Send();
                    return true;
                }
                case "shortcut":
                    S.Shortcut = Convert.ToBoolean(m["on"]);
                    Register();
                    Save();
                    sent = null;
                    Send();
                    return false;
                case "shortcutKeys":
                    S.Modifiers = Convert.ToInt32(m["mods"]) & 0xF;
                    S.Key = Convert.ToInt32(m["key"]);
                    S.Label = Convert.ToString(m["label"]);
                    if (S.Label.Length > 60) S.Label = S.Label.Substring(0, 60);
                    S.Shortcut = true;
                    Register();
                    Save();
                    sent = null;
                    Send();
                    return false;
                case "settings":
                    Open("ms-settings:sound");
                    return false;
            }
            return false;
        }

        static void Open(string target)
        {
            try { System.Diagnostics.Process.Start(target); } catch (Exception ex) { Program.Log(ex); }
        }

        public static void Changed()
        {
            if (changed != null && !changed.Enabled) changed.Start();
        }

        static void Tick()
        {
            var window = Program.SettingsWindow;
            if (window == null || !window.Visible || window.WindowState == FormWindowState.Minimized) return;
            var values = new List<string>();
            foreach (var d in devices.Where(x => x.Meter != null))
            {
                float peak = 0;
                try { d.Meter.GetPeakValue(out peak); } catch { }
                values.Add(Math.Round(peak, 2).ToString(System.Globalization.CultureInfo.InvariantCulture));
            }
            string text = string.Join(",", values);
            if (text != levels)
            {
                levels = text;
                Program.Send(new { type = "audio.levels", ids = devices.Where(x => x.Meter != null).Select(x => x.Id).ToArray(), levels = values.Select(v => double.Parse(v, System.Globalization.CultureInfo.InvariantCulture)).ToArray() });
            }
            // A volume changed from the taskbar or another app has no event here, so it is read again twice a second.
            if (++ticks % 8 == 0) Send();
        }

        static void Send()
        {
            if (!watching) return;
            string output = Default(true), input = Default(false);
            var list = devices.Select(d =>
            {
                float level = 0; bool muted = false;
                if (d.Volume != null) try { d.Volume.GetMasterVolumeLevelScalar(out level); d.Volume.GetMute(out muted); } catch { }
                return new
                {
                    id = d.Id, name = d.Name, adapter = d.Adapter, kind = d.Kind, output = d.Output, active = d.Active, disabled = d.Disabled,
                    rate = d.Rate, bits = d.Bits, channels = d.Channels, volume = d.Volume != null ? (int?)Math.Round(level * 100) : null, muted,
                    isDefault = d.Id == (d.Output ? output : input),
                };
            }).ToArray();
            var message = new { type = "audio.devices", devices = list, shortcut = S.Shortcut, label = S.Label, error = shortcutError };
            string text = json.Serialize(message);
            if (text == sent) return;
            sent = text;
            Program.Send(message);
        }

        static void Reload()
        {
            Release();
            if (enumerator == null) return;
            var list = new List<Device>();
            foreach (int flow in new[] { 0, 1 })
            {
                IMMDeviceCollection all = null;
                try
                {
                    if (enumerator.EnumAudioEndpoints(flow, StateActive | StateDisabled | StateUnplugged, out all) != 0) continue;
                    uint count;
                    all.GetCount(out count);
                    for (uint i = 0; i < count; i++)
                    {
                        IMMDevice device;
                        if (all.Item(i, out device) != 0) continue;
                        try { var d = Read(device, flow == 0); if (d != null) list.Add(d); }
                        catch (Exception ex) { Program.Log(ex); }
                        finally { Marshal.ReleaseComObject(device); }
                    }
                }
                finally { if (all != null) Marshal.ReleaseComObject(all); }
            }
            devices = list.OrderBy(d => d.Output ? 0 : 1).ThenBy(d => d.Active ? 0 : 1).ThenBy(d => d.Name, StringComparer.CurrentCultureIgnoreCase).ThenBy(d => d.Adapter).ToList();
        }

        static Device Read(IMMDevice device, bool output)
        {
            IntPtr pointer;
            if (device.GetId(out pointer) != 0) return null;
            string id = Marshal.PtrToStringUni(pointer);
            Marshal.FreeCoTaskMem(pointer);
            int state;
            device.GetState(out state);
            var d = new Device { Id = id, Output = output, Active = state == StateActive, Disabled = state == StateDisabled };
            IPropertyStore store;
            if (device.OpenPropertyStore(0, out store) == 0 && store != null)
            {
                try
                {
                    d.Name = Text(store, DeviceDescription) ?? Text(store, FriendlyName) ?? "";
                    d.Adapter = Text(store, InterfaceName) ?? "";
                    d.Kind = Kind(Number(store, FormFactor), output);
                    Format(store, d);
                }
                finally { Marshal.ReleaseComObject(store); }
            }
            if (d.Active)
            {
                object found;
                Guid volume = typeof(IAudioEndpointVolume).GUID, meter = typeof(IAudioMeterInformation).GUID;
                if (device.Activate(ref volume, 23, IntPtr.Zero, out found) == 0) d.Volume = (IAudioEndpointVolume)found;
                if (watching && device.Activate(ref meter, 23, IntPtr.Zero, out found) == 0) d.Meter = (IAudioMeterInformation)found;
            }
            return d;
        }

        static string Kind(int? form, bool output)
        {
            switch (form)
            {
                case 3: return "headphones";
                case 5: case 6: return "headset";
                case 4: return "microphone";
                case 9: return "screen";
                case 7: case 8: return "digital";
                case 2: return "line";
                case 1: return "speakers";
            }
            return output ? "speakers" : "microphone";
        }

        static void Release()
        {
            foreach (var d in devices)
            {
                if (d.Volume != null) try { Marshal.ReleaseComObject(d.Volume); } catch { }
                if (d.Meter != null) try { Marshal.ReleaseComObject(d.Meter); } catch { }
                d.Volume = null;
                d.Meter = null;
            }
            levels = null;
        }

        static string Default(bool output)
        {
            IMMDevice device = null;
            try
            {
                if (enumerator == null || enumerator.GetDefaultAudioEndpoint(output ? 0 : 1, 0, out device) != 0 || device == null) return null;
                IntPtr pointer;
                if (device.GetId(out pointer) != 0) return null;
                string id = Marshal.PtrToStringUni(pointer);
                Marshal.FreeCoTaskMem(pointer);
                return id;
            }
            catch { return null; }
            finally { if (device != null) Marshal.ReleaseComObject(device); }
        }

        // Windows has no documented call to choose the default device. IPolicyConfig is the one the Sound settings use; EarTrumpet and SoundSwitch rely on it too.
        static bool SetDefault(string id)
        {
            object client = null;
            try
            {
                client = new PolicyConfigClient();
                var config = (IPolicyConfig)client;
                bool done = true;
                for (int role = 0; role < 3; role++) done &= config.SetDefaultEndpoint(id, role) == 0;
                return done;
            }
            catch (Exception ex) { Program.Log(ex); return false; }
            finally { if (client != null) Marshal.ReleaseComObject(client); }
        }

        public static string DefaultOutput() { return Default(true); }

        public static string NameOf(string id)
        {
            return WithDevice(id, (device, state) =>
            {
                IPropertyStore store;
                if (device.OpenPropertyStore(0, out store) != 0 || store == null) return null;
                try { return Text(store, FriendlyName) ?? Text(store, DeviceDescription); }
                finally { Marshal.ReleaseComObject(store); }
            });
        }

        public static bool IsActive(string id) { return WithDevice(id, (device, state) => state == StateActive ? "yes" : null) != null; }

        public static void Use(string id)
        {
            if (IsActive(id) && id != Default(true)) SetDefault(id);
        }

        static string WithDevice(string id, Func<IMMDevice, int, string> read)
        {
            IMMDevice device = null;
            try
            {
                if (enumerator == null || string.IsNullOrEmpty(id) || enumerator.GetDevice(id, out device) != 0 || device == null) return null;
                int state;
                device.GetState(out state);
                return read(device, state);
            }
            catch { return null; }
            finally { if (device != null) Marshal.ReleaseComObject(device); }
        }

        static void Next()
        {
            if (!watching) Reload();
            var outputs = devices.Where(d => d.Output && d.Active).ToList();
            if (outputs.Count == 0) return;
            string current = Default(true);
            int i = outputs.FindIndex(d => d.Id == current);
            var next = outputs[(i + 1) % outputs.Count];
            if (outputs.Count > 1 && !SetDefault(next.Id)) return;
            if (bubble == null || bubble.IsDisposed) bubble = new Bubble();
            bubble.Show(next.Name, next.Adapter, next.Kind);
            if (!watching) Release();
        }

        static string Text(IPropertyStore store, PropertyKey key)
        {
            IntPtr value = Marshal.AllocCoTaskMem(32);
            try
            {
                for (int i = 0; i < 32; i++) Marshal.WriteByte(value, i, 0);
                if (store.GetValue(ref key, value) != 0) return null;
                string text = Marshal.ReadInt16(value) == 31 ? Marshal.PtrToStringUni(Marshal.ReadIntPtr(value, 8)) : null;
                PropVariantClear(value);
                return string.IsNullOrWhiteSpace(text) ? null : text.Trim();
            }
            finally { Marshal.FreeCoTaskMem(value); }
        }

        static int? Number(IPropertyStore store, PropertyKey key)
        {
            IntPtr value = Marshal.AllocCoTaskMem(32);
            try
            {
                for (int i = 0; i < 32; i++) Marshal.WriteByte(value, i, 0);
                if (store.GetValue(ref key, value) != 0) return null;
                int? n = Marshal.ReadInt16(value) == 19 ? (int?)Marshal.ReadInt32(value, 8) : null;
                PropVariantClear(value);
                return n;
            }
            finally { Marshal.FreeCoTaskMem(value); }
        }

        // The shared mode format is a WAVEFORMATEX, or a WAVEFORMATEXTENSIBLE whose valid bits can be fewer than the container (24 in 32).
        static void Format(IPropertyStore store, Device d)
        {
            var key = DeviceFormat;
            IntPtr value = Marshal.AllocCoTaskMem(32);
            try
            {
                for (int i = 0; i < 32; i++) Marshal.WriteByte(value, i, 0);
                if (store.GetValue(ref key, value) != 0) return;
                if (Marshal.ReadInt16(value) == 65 && Marshal.ReadInt32(value, 8) >= 16)
                {
                    IntPtr blob = Marshal.ReadIntPtr(value, 8 + IntPtr.Size);
                    int size = Marshal.ReadInt32(value, 8);
                    int tag = (ushort)Marshal.ReadInt16(blob, 0);
                    d.Channels = Marshal.ReadInt16(blob, 2);
                    d.Rate = Marshal.ReadInt32(blob, 4);
                    d.Bits = Marshal.ReadInt16(blob, 14);
                    if (tag == 0xFFFE && size >= 20) { int valid = Marshal.ReadInt16(blob, 18); if (valid > 0) d.Bits = valid; }
                }
                PropVariantClear(value);
            }
            finally { Marshal.FreeCoTaskMem(value); }
        }

        const int StateActive = 1, StateDisabled = 2, StateUnplugged = 8;
        static readonly PropertyKey FriendlyName = new PropertyKey { Format = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), Id = 14 };
        static readonly PropertyKey DeviceDescription = new PropertyKey { Format = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), Id = 2 };
        static readonly PropertyKey InterfaceName = new PropertyKey { Format = new Guid("026e516e-b814-414b-83cd-856d6fef4822"), Id = 2 };
        static readonly PropertyKey FormFactor = new PropertyKey { Format = new Guid("1da5d803-d492-4edd-8c23-e0c0ffee7f0e"), Id = 0 };
        static readonly PropertyKey DeviceFormat = new PropertyKey { Format = new Guid("f19f064d-082c-4e27-bc73-6882a1bb8e4c"), Id = 0 };

        [DllImport("ole32.dll")] static extern int PropVariantClear(IntPtr value);

        class Bubble : Form
        {
            readonly Timer fade;
            string title, detail, kind;
            DateTime shownAt;

            public Bubble()
            {
                FormBorderStyle = FormBorderStyle.None;
                ShowInTaskbar = false;
                StartPosition = FormStartPosition.Manual;
                TopMost = true;
                BackColor = Color.FromArgb(0x14, 0x15, 0x1b);
                DoubleBuffered = true;
                fade = new Timer { Interval = 16 };
                fade.Tick += (s, e) =>
                {
                    double t = (DateTime.Now - shownAt).TotalMilliseconds;
                    if (t < 120) Opacity = t / 120;
                    else if (t < 1600) Opacity = 1;
                    else if (t < 1900) Opacity = 1 - (t - 1600) / 300;
                    else { fade.Stop(); Hide(); }
                };
            }

            protected override bool ShowWithoutActivation { get { return true; } }

            protected override CreateParams CreateParams
            {
                get { var p = base.CreateParams; p.ExStyle |= 0x80 | 0x08000000 | 0x8; return p; }
            }

            public void Show(string title, string detail, string kind)
            {
                this.title = title;
                this.detail = detail;
                this.kind = kind;
                var screen = Screen.FromPoint(Cursor.Position);
                double k = Arrange.Scale(screen);
                using (var g = CreateGraphics())
                using (var font = new Font("Segoe UI", 10.5f * (float)k / (g.DpiY / 96f), FontStyle.Bold))
                {
                    int text = TextRenderer.MeasureText(title ?? "", font).Width;
                    Size = new Size((int)Math.Min(screen.WorkingArea.Width * 0.8, Math.Max(240 * k, text + 92 * k)), (int)(64 * k));
                }
                Location = new Point(screen.WorkingArea.Left + (screen.WorkingArea.Width - Width) / 2, screen.WorkingArea.Bottom - Height - (int)(72 * k));
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
                g.SmoothingMode = SmoothingMode.AntiAlias;
                using (var edge = new Pen(Color.FromArgb(40, 255, 255, 255)))
                    g.DrawRectangle(edge, 0, 0, Width - 1, Height - 1);
                string glyph = kind == "headphones" ? "" : kind == "headset" ? "" : kind == "screen" ? "" : "";
                string family = FontFamily.Families.Any(f => f.Name == "Segoe Fluent Icons") ? "Segoe Fluent Icons" : "Segoe MDL2 Assets";
                using (var icon = new Font(family, 16f * points))
                    TextRenderer.DrawText(g, glyph, icon, new Rectangle((int)(16 * k), 0, (int)(40 * k), Height), Color.FromArgb(0x95, 0x61, 0xf3), TextFormatFlags.VerticalCenter | TextFormatFlags.HorizontalCenter);
                var left = (int)(68 * k);
                using (var bold = new Font("Segoe UI", 10.5f * points, FontStyle.Bold))
                using (var small = new Font("Segoe UI", 9f * points))
                {
                    var flags = TextFormatFlags.EndEllipsis | TextFormatFlags.NoPrefix | TextFormatFlags.SingleLine;
                    TextRenderer.DrawText(g, title ?? "", bold, new Rectangle(left, (int)(13 * k), Width - left - (int)(16 * k), (int)(22 * k)), Color.FromArgb(0xe8, 0xe9, 0xf0), flags);
                    TextRenderer.DrawText(g, string.IsNullOrEmpty(detail) ? Language.T("Output") : detail, small, new Rectangle(left, (int)(34 * k), Width - left - (int)(16 * k), (int)(18 * k)), Color.FromArgb(0x7c, 0x7e, 0x8c), flags);
                }
            }
        }

        [ComVisible(true)]
        class Notifications : IMMNotificationClient
        {
            public void OnDeviceStateChanged(string id, int state) { Program.OnInterface(Changed); }
            public void OnDeviceAdded(string id) { Program.OnInterface(Changed); }
            public void OnDeviceRemoved(string id) { Program.OnInterface(Changed); }
            public void OnDefaultDeviceChanged(int flow, int role, string id) { Program.OnInterface(Changed); }
            public void OnPropertyValueChanged(string id, PropertyKey key) { }
        }

        [ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")] class PolicyConfigClient { }

        [ComImport, Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IPolicyConfig
        {
            [PreserveSig] int GetMixFormat(string id, IntPtr format);
            [PreserveSig] int GetDeviceFormat(string id, int defaultFormat, IntPtr format);
            [PreserveSig] int ResetDeviceFormat(string id);
            [PreserveSig] int SetDeviceFormat(string id, IntPtr endpointFormat, IntPtr mixFormat);
            [PreserveSig] int GetProcessingPeriod(string id, int defaultPeriod, IntPtr period, IntPtr minimum);
            [PreserveSig] int SetProcessingPeriod(string id, IntPtr period);
            [PreserveSig] int GetShareMode(string id, IntPtr mode);
            [PreserveSig] int SetShareMode(string id, IntPtr mode);
            [PreserveSig] int GetPropertyValue(string id, IntPtr key, IntPtr value);
            [PreserveSig] int SetPropertyValue(string id, IntPtr key, IntPtr value);
            [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, int role);
            [PreserveSig] int SetEndpointVisibility(string id, int visible);
        }

        [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDeviceEnumerator
        {
            [PreserveSig] int EnumAudioEndpoints(int flow, int state, out IMMDeviceCollection devices);
            [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice device);
            [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
            [PreserveSig] int RegisterEndpointNotificationCallback(IMMNotificationClient client);
            [PreserveSig] int UnregisterEndpointNotificationCallback(IMMNotificationClient client);
        }

        [ComImport, Guid("7991EEC9-7E89-4D85-8390-6C703CEC60C0"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        public interface IMMNotificationClient
        {
            void OnDeviceStateChanged([MarshalAs(UnmanagedType.LPWStr)] string id, int state);
            void OnDeviceAdded([MarshalAs(UnmanagedType.LPWStr)] string id);
            void OnDeviceRemoved([MarshalAs(UnmanagedType.LPWStr)] string id);
            void OnDefaultDeviceChanged(int flow, int role, [MarshalAs(UnmanagedType.LPWStr)] string id);
            void OnPropertyValueChanged([MarshalAs(UnmanagedType.LPWStr)] string id, PropertyKey key);
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
            [PreserveSig] int GetId(out IntPtr id);
            [PreserveSig] int GetState(out int state);
        }

        [ComImport, Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IPropertyStore
        {
            [PreserveSig] int GetCount(out uint count);
            [PreserveSig] int GetAt(uint index, out PropertyKey key);
            [PreserveSig] int GetValue(ref PropertyKey key, IntPtr value);
        }

        [StructLayout(LayoutKind.Sequential)] public struct PropertyKey { public Guid Format; public int Id; }

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

        [ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IAudioMeterInformation
        {
            [PreserveSig] int GetPeakValue(out float peak);
        }
    }
}
