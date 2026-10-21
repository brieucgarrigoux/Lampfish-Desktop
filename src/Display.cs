using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace Bramble
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
        // The filter belongs to the process, so it disappears with Bramble.
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

        static bool SetPrimary(string device)
        {
            var screens = Screen.AllScreens;
            var target = screens.FirstOrDefault(s => s.DeviceName == device);
            if (target == null || target.Primary) return false;
            Point offset = target.Bounds.Location;
            foreach (var s in screens)
            {
                var mode = new DEVMODE { dmSize = (short)Marshal.SizeOf(typeof(DEVMODE)) };
                if (!EnumDisplaySettingsEx(s.DeviceName, ENUM_CURRENT_SETTINGS, ref mode, 0)) return false;
                mode.dmPositionX = s.Bounds.X - offset.X;
                mode.dmPositionY = s.Bounds.Y - offset.Y;
                mode.dmFields = DM_POSITION;
                int flags = CDS_UPDATEREGISTRY | CDS_NORESET | (s == target ? CDS_SET_PRIMARY : 0);
                if (ChangeDisplaySettingsEx(s.DeviceName, ref mode, IntPtr.Zero, flags, IntPtr.Zero) != 0) return false;
            }
            return ChangeDisplaySettingsEx(null, IntPtr.Zero, IntPtr.Zero, 0, IntPtr.Zero) == 0;
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
                case "screens":
                    Task.Run(() => Hardware.Screens()).ContinueWith(t => Program.OnInterface(() =>
                    {
                        if (t.IsFaulted) { Program.Log(t.Exception); return; }
                        Program.Send(new { type = "display.screens", screens = t.Result });
                    }));
                    return false;
                case "nightLight":
                    try { System.Diagnostics.Process.Start("ms-settings:nightlight"); } catch (Exception ex) { Program.Log(ex); }
                    return false;
                case "primary":
                {
                    string key = Text(m, "key");
                    var target = Screen.AllScreens.FirstOrDefault(s => Program.ScreenKey(s.Bounds) == key);
                    var before = Screen.PrimaryScreen;
                    if (target == null || target.Primary) return false;
                    string back = before.DeviceName;
                    if (SetPrimary(target.DeviceName)) Program.Undoable(Language.T("Main screen changed"), () => SetPrimary(back));
                    else Program.Announce("Windows refused to change the main screen");
                    return true;
                }
            }
            return false;
        }

        public static object State() { return new { warm = R.Warm, warmOn = R.WarmOn }; }

        const int ENUM_CURRENT_SETTINGS = -1, DM_POSITION = 0x20, CDS_UPDATEREGISTRY = 0x1, CDS_SET_PRIMARY = 0x10, CDS_NORESET = 0x10000000;

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct DEVMODE
        {
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
            public short dmSpecVersion, dmDriverVersion, dmSize, dmDriverExtra;
            public int dmFields, dmPositionX, dmPositionY, dmDisplayOrientation, dmDisplayFixedOutput;
            public short dmColor, dmDuplex, dmYResolution, dmTTOption, dmCollate;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
            public short dmLogPixels;
            public int dmBitsPerPel, dmPelsWidth, dmPelsHeight, dmDisplayFlags, dmDisplayFrequency;
            public int dmICMMethod, dmICMIntent, dmMediaType, dmDitherType, dmReserved1, dmReserved2, dmPanningWidth, dmPanningHeight;
        }

        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool EnumDisplaySettingsEx(string device, int mode, ref DEVMODE devmode, int flags);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int ChangeDisplaySettingsEx(string device, ref DEVMODE devmode, IntPtr window, int flags, IntPtr param);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int ChangeDisplaySettingsEx(string device, IntPtr devmode, IntPtr window, int flags, IntPtr param);
        [DllImport("Magnification.dll")] static extern bool MagInitialize();
        [DllImport("Magnification.dll")] static extern bool MagUninitialize();
        [DllImport("Magnification.dll")] static extern bool MagSetFullscreenColorEffect(float[] effect);
    }
}
