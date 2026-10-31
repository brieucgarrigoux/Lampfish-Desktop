using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Management;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace Lampfish
{
    static class Display
    {
        static bool magnifier;

        static Settings R { get { return Program.R; } }

        public static void Start() { if (R.WarmOn) Warm(R.Warm); }

        public static void Stop() { Warm(0); }

        public static int WarmStrength { get { return R.WarmOn ? R.Warm : 0; } }

        public static void SetWarm(int strength)
        {
            if (strength > 0) { R.Warm = Math.Min(100, strength); R.WarmOn = true; }
            else R.WarmOn = false;
            Warm(WarmStrength);
        }

        // The color filter of Windows accessibility: documented and safe, unlike Night light whose only switch is an undocumented registry blob.
        // The filter belongs to the process, so it disappears with lampfish.
        static void Warm(int strength)
        {
            try
            {
                if (strength <= 0)
                {
                    if (!magnifier) return;
                    MagSetFullscreenColorEffect(Matrix(1, 1, 1));
                    MagUninitialize();
                    magnifier = false;
                    return;
                }
                if (!magnifier) magnifier = MagInitialize();
                double s = strength / 100.0;
                if (!magnifier || !MagSetFullscreenColorEffect(Matrix(1, 1 - .3 * s, 1 - .62 * s))) Program.Announce("The screen could not be warmed");
            }
            catch (Exception ex) { Program.Log(ex); }
        }

        static float[] Matrix(double red, double green, double blue)
        {
            var m = new float[25];
            m[0] = (float)red; m[6] = (float)green; m[12] = (float)blue; m[18] = 1; m[24] = 1;
            return m;
        }

        // The main screen is the one whose desktop starts at 0,0. The display configuration API moves every screen in one atomic change;
        // ChangeDisplaySettingsEx moved them one by one and Windows refused the first step with a laptop at 125 % and a screen at 100 %.
        static bool SetPrimary(string device, string before)
        {
            uint pathCount, modeCount;
            if (GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, out pathCount, out modeCount) != 0) return false;
            var paths = new DISPLAYCONFIG_PATH_INFO[pathCount];
            var modes = new DISPLAYCONFIG_MODE_INFO[modeCount];
            if (QueryDisplayConfig(QDC_ONLY_ACTIVE_PATHS, ref pathCount, paths, ref modeCount, modes, IntPtr.Zero) != 0) return false;
            int target = -1;
            for (int i = 0; i < pathCount && target < 0; i++)
            {
                var name = new DISPLAYCONFIG_SOURCE_DEVICE_NAME { type = DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME, size = (uint)Marshal.SizeOf(typeof(DISPLAYCONFIG_SOURCE_DEVICE_NAME)), adapterLow = paths[i].sourceAdapterLow, adapterHigh = paths[i].sourceAdapterHigh, id = paths[i].sourceId };
                if (DisplayConfigGetDeviceInfo(ref name) == 0 && name.viewGdiDeviceName == device) target = (int)paths[i].sourceModeInfoIdx;
            }
            if (target < 0 || target >= modeCount || modes[target].infoType != DISPLAYCONFIG_MODE_INFO_TYPE_SOURCE) return false;
            int dx = modes[target].positionX, dy = modes[target].positionY;
            if (dx == 0 && dy == 0) return true;
            for (int i = 0; i < modeCount; i++)
                if (modes[i].infoType == DISPLAYCONFIG_MODE_INFO_TYPE_SOURCE) { modes[i].positionX -= dx; modes[i].positionY -= dy; }
            if (SetDisplayConfig(pathCount, paths, modeCount, modes, SDC_APPLY | SDC_USE_SUPPLIED_DISPLAY_CONFIG | SDC_SAVE_TO_DATABASE | SDC_ALLOW_CHANGES) != 0) return false;
            Program.ScreensMoved(-dx, -dy, before);
            return true;
        }

        // The desktop icons are read before the switch and moved once Explorer has settled. Between two screens of different scales,
        // Explorer resizes the desktop and moves the icons by itself, sometimes well after the 1.5 s that used to be waited, and once
        // more after they are placed: the icons are then put back a second time.
        static bool Switch(string from, string to)
        {
            string before = Arrange.Signature();
            var follow = Arrange.FollowPrimary(from, to);
            if (!SetPrimary(to, before)) return false;
            if (follow == null) return true;
            Action run = () =>
            {
                try { follow(); Program.SendState(); }
                catch (Exception ex) { Program.Log(ex); }
            };
            var timer = new System.Windows.Forms.Timer { Interval = 300 };
            string seen = null;
            int ticks = 0, still = 0;
            timer.Tick += (s, e) =>
            {
                string now = Arrange.Fingerprint();
                still = now == seen ? still + 1 : 0;
                seen = now;
                if (++ticks < 4 || (still < 3 && ticks < 27)) return;
                timer.Dispose();
                run();
                var again = new System.Windows.Forms.Timer { Interval = 1500 };
                again.Tick += (s2, e2) => { again.Dispose(); run(); };
                again.Start();
            };
            timer.Start();
            return true;
        }

        class Panel { public string Key; public bool Builtin; public string Name; public int Value; }

        static readonly object brightnessLock = new object();
        static readonly Dictionary<string, int> wanted = new Dictionary<string, int>();
        static bool applying;

        static object Prop(object o, string name) { return o.GetType().GetProperty(name).GetValue(o); }

        static IntPtr MonitorOf(Screen s) { return MonitorFromPoint(new Point(s.Bounds.X + 1, s.Bounds.Y + 1), 2); }

        // The Monitor Configuration API (DDC/CI) reaches external screens; the laptop panel only answers through WMI. Both are documented and need no administrator.
        static int? Internal()
        {
            try
            {
                using (var search = new ManagementObjectSearcher(@"root\wmi", "SELECT CurrentBrightness, Active FROM WmiMonitorBrightness"))
                    foreach (ManagementObject m in search.Get())
                        if (Convert.ToBoolean(m["Active"])) return Convert.ToInt32(m["CurrentBrightness"]);
            }
            catch { }
            return null;
        }

        static bool SetInternal(int value)
        {
            try
            {
                using (var search = new ManagementObjectSearcher(@"root\wmi", "SELECT * FROM WmiMonitorBrightnessMethods"))
                    foreach (ManagementObject m in search.Get())
                        if (Convert.ToBoolean(m["Active"])) { m.InvokeMethod("WmiSetBrightness", new object[] { (uint)1, (byte)value }); return true; }
            }
            catch (Exception ex) { Program.Log(ex); }
            return false;
        }

        static PHYSICAL_MONITOR[] Physical(Screen s)
        {
            uint n;
            IntPtr monitor = MonitorOf(s);
            if (!GetNumberOfPhysicalMonitorsFromHMONITOR(monitor, out n) || n == 0) return new PHYSICAL_MONITOR[0];
            var list = new PHYSICAL_MONITOR[n];
            return GetPhysicalMonitorsFromHMONITOR(monitor, n, list) ? list : new PHYSICAL_MONITOR[0];
        }

        static int? External(Screen s)
        {
            var list = Physical(s);
            try
            {
                foreach (var p in list)
                {
                    uint min, now, max;
                    if (GetMonitorBrightness(p.Handle, out min, out now, out max) && max > min) return (int)Math.Round((now - min) * 100.0 / (max - min));
                }
            }
            finally { if (list.Length > 0) DestroyPhysicalMonitors((uint)list.Length, list); }
            return null;
        }

        static bool SetExternal(Screen s, int value)
        {
            var list = Physical(s);
            bool done = false;
            try
            {
                foreach (var p in list)
                {
                    uint min, now, max;
                    if (GetMonitorBrightness(p.Handle, out min, out now, out max) && max > min)
                        done |= SetMonitorBrightness(p.Handle, (uint)Math.Round(min + value / 100.0 * (max - min)));
                }
            }
            finally { if (list.Length > 0) DestroyPhysicalMonitors((uint)list.Length, list); }
            return done;
        }

        static List<Panel> Panels()
        {
            var result = new List<Panel>();
            foreach (object o in (Array)Hardware.Screens())
            {
                string key = (string)Prop(o, "key");
                var screen = Screen.AllScreens.FirstOrDefault(s => Program.ScreenKey(s.Bounds) == key);
                if (screen == null) continue;
                bool builtin = (bool)Prop(o, "builtin");
                int? value = builtin ? Internal() : External(screen);
                if (value != null) result.Add(new Panel { Key = key, Builtin = builtin, Name = (string)Prop(o, "name"), Value = value.Value });
            }
            return result;
        }

        static void Apply(string key, int value)
        {
            var screen = Screen.AllScreens.FirstOrDefault(s => Program.ScreenKey(s.Bounds) == key);
            if (screen == null) return;
            if (!SetExternal(screen, value)) SetInternal(value);
        }

        // Screens answer slowly, so only the latest value is sent while one is already being applied.
        static void Brighten(string key, int value)
        {
            lock (brightnessLock)
            {
                wanted[key] = value;
                if (applying) return;
                applying = true;
            }
            Task.Run(() =>
            {
                while (true)
                {
                    string next;
                    int v;
                    lock (brightnessLock)
                    {
                        next = wanted.Keys.FirstOrDefault();
                        if (next == null) { applying = false; return; }
                        v = wanted[next];
                        wanted.Remove(next);
                    }
                    try { Apply(next, v); } catch (Exception ex) { Program.Log(ex); }
                }
            });
        }

        static string Text(Dictionary<string, object> m, string key)
        {
            object v;
            return m.TryGetValue(key, out v) && v != null ? v.ToString() : "";
        }

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            switch (action)
            {
                case "warm":
                {
                    bool on = Text(m, "on") == "True" || Text(m, "on") == "true", live = Text(m, "live") == "True" || Text(m, "live") == "true";
                    int strength;
                    if (!int.TryParse(Text(m, "strength"), out strength)) strength = R.Warm;
                    R.Warm = Math.Max(10, Math.Min(100, strength));
                    R.WarmOn = on;
                    Warm(WarmStrength);
                    return !live;
                }
                case "dark":
                {
                    bool dark = Text(m, "on") == "True" || Text(m, "on") == "true";
                    bool? before = Dark();
                    if (before == dark) return false;
                    SetDark(dark);
                    if (before.HasValue) Program.Undoable(Language.T(dark ? "Windows is in dark mode" : "Windows is in light mode"), () => SetDark(before.Value));
                    return true;
                }
                case "screens":
                    Task.Run(() => Hardware.Screens()).ContinueWith(t => Program.OnInterface(() =>
                    {
                        if (t.IsFaulted) { Program.Log(t.Exception); return; }
                        Program.Send(new { type = "display.screens", screens = t.Result });
                    }));
                    return false;
                case "brightness":
                    Task.Run(() => Panels()).ContinueWith(t => Program.OnInterface(() =>
                    {
                        if (t.IsFaulted) { Program.Log(t.Exception); return; }
                        Program.Send(new { type = "display.brightness", screens = t.Result.Select(p => new { key = p.Key, builtin = p.Builtin, name = p.Name, value = p.Value }).ToArray() });
                    }));
                    return false;
                case "setBrightness":
                {
                    int value;
                    if (int.TryParse(Text(m, "value"), out value)) Brighten(Text(m, "key"), Math.Max(0, Math.Min(100, value)));
                    return false;
                }
                case "nightLight":
                    try { System.Diagnostics.Process.Start("ms-settings:nightlight"); } catch (Exception ex) { Program.Log(ex); }
                    return false;
                case "primary":
                {
                    string key = Text(m, "key");
                    var target = Screen.AllScreens.FirstOrDefault(s => Program.ScreenKey(s.Bounds) == key);
                    var before = Screen.PrimaryScreen;
                    if (target == null || target.Primary) return false;
                    string back = before.DeviceName, next = target.DeviceName;
                    if (Switch(back, next)) Program.Undoable(Language.T("Main screen changed"), () => Switch(next, back));
                    else Program.Announce("Windows refused to change the main screen");
                    return true;
                }
            }
            return false;
        }

        public static object State() { return new { warm = R.Warm, warmOn = R.WarmOn, dark = Dark() }; }

        // The light or dark mode of Windows has no public interface: these two values are the ones Settings and PowerToys write.
        const string Personalize = @"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize";

        public static bool? Dark()
        {
            try
            {
                using (var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(Personalize))
                {
                    var apps = key == null ? null : key.GetValue("AppsUseLightTheme");
                    return apps == null ? (bool?)null : Convert.ToInt32(apps) == 0;
                }
            }
            catch { return null; }
        }

        public static void SetDark(bool dark)
        {
            try
            {
                using (var key = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(Personalize))
                {
                    key.SetValue("AppsUseLightTheme", dark ? 0 : 1, Microsoft.Win32.RegistryValueKind.DWord);
                    key.SetValue("SystemUsesLightTheme", dark ? 0 : 1, Microsoft.Win32.RegistryValueKind.DWord);
                }
                IntPtr result;
                SendMessageTimeout((IntPtr)0xFFFF, 0x001A, IntPtr.Zero, "ImmersiveColorSet", 0x0002, 200, out result);
            }
            catch (Exception ex) { Program.Log(ex); }
        }

        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr SendMessageTimeout(IntPtr window, uint message, IntPtr wParam, string lParam, uint flags, uint timeout, out IntPtr result);

        const uint QDC_ONLY_ACTIVE_PATHS = 2, SDC_APPLY = 0x80, SDC_USE_SUPPLIED_DISPLAY_CONFIG = 0x20, SDC_SAVE_TO_DATABASE = 0x200, SDC_ALLOW_CHANGES = 0x400;
        const uint DISPLAYCONFIG_MODE_INFO_TYPE_SOURCE = 1, DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME = 1;

        [StructLayout(LayoutKind.Explicit, Size = 72)]
        struct DISPLAYCONFIG_PATH_INFO
        {
            [FieldOffset(0)] public uint sourceAdapterLow;
            [FieldOffset(4)] public int sourceAdapterHigh;
            [FieldOffset(8)] public uint sourceId;
            [FieldOffset(12)] public uint sourceModeInfoIdx;
        }

        [StructLayout(LayoutKind.Explicit, Size = 64)]
        struct DISPLAYCONFIG_MODE_INFO
        {
            [FieldOffset(0)] public uint infoType;
            [FieldOffset(28)] public int positionX;
            [FieldOffset(32)] public int positionY;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct DISPLAYCONFIG_SOURCE_DEVICE_NAME
        {
            public uint type, size, adapterLow;
            public int adapterHigh;
            public uint id;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string viewGdiDeviceName;
        }

        [DllImport("user32.dll")] static extern int GetDisplayConfigBufferSizes(uint flags, out uint paths, out uint modes);
        [DllImport("user32.dll")] static extern int QueryDisplayConfig(uint flags, ref uint pathCount, [In, Out] DISPLAYCONFIG_PATH_INFO[] paths, ref uint modeCount, [In, Out] DISPLAYCONFIG_MODE_INFO[] modes, IntPtr topology);
        [DllImport("user32.dll")] static extern int SetDisplayConfig(uint pathCount, [In] DISPLAYCONFIG_PATH_INFO[] paths, uint modeCount, [In] DISPLAYCONFIG_MODE_INFO[] modes, uint flags);
        [DllImport("user32.dll")] static extern int DisplayConfigGetDeviceInfo(ref DISPLAYCONFIG_SOURCE_DEVICE_NAME info);
        [StructLayout(LayoutKind.Sequential, Pack = 1, CharSet = CharSet.Unicode)]
        struct PHYSICAL_MONITOR
        {
            public IntPtr Handle;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string Description;
        }

        [DllImport("user32.dll")] static extern IntPtr MonitorFromPoint(Point point, int flags);
        [DllImport("dxva2.dll")] static extern bool GetNumberOfPhysicalMonitorsFromHMONITOR(IntPtr monitor, out uint count);
        [DllImport("dxva2.dll")] static extern bool GetPhysicalMonitorsFromHMONITOR(IntPtr monitor, uint count, [Out] PHYSICAL_MONITOR[] monitors);
        [DllImport("dxva2.dll")] static extern bool DestroyPhysicalMonitors(uint count, PHYSICAL_MONITOR[] monitors);
        [DllImport("dxva2.dll")] static extern bool GetMonitorBrightness(IntPtr monitor, out uint min, out uint current, out uint max);
        [DllImport("dxva2.dll")] static extern bool SetMonitorBrightness(IntPtr monitor, uint brightness);
        [DllImport("Magnification.dll")] static extern bool MagInitialize();
        [DllImport("Magnification.dll")] static extern bool MagUninitialize();
        [DllImport("Magnification.dll")] static extern bool MagSetFullscreenColorEffect(float[] effect);
    }
}
