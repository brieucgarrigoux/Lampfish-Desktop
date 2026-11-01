using System;
using System.Runtime.InteropServices;
using System.Text;

namespace Lampfish
{
    static class Native
    {
        public const int GWL_STYLE = -16, GWL_EXSTYLE = -20;
        public const int WS_CHILD = 0x40000000, WS_POPUP = unchecked((int)0x80000000), WS_CAPTION = 0x00C00000, WS_THICKFRAME = 0x00040000;
        public const int WS_EX_LAYERED = 0x80000, WS_EX_TOOLWINDOW = 0x80, WS_EX_NOACTIVATE = 0x08000000, WS_EX_NOREDIRECTIONBITMAP = 0x200000;
        public const uint LWA_ALPHA = 0x2;
        public const uint SWP_NOSIZE = 0x1, SWP_NOMOVE = 0x2, SWP_NOACTIVATE = 0x10, SWP_FRAMECHANGED = 0x20, SWP_SHOWWINDOW = 0x40;
        public const int SW_HIDE = 0, SW_SHOWNOACTIVATE = 4;
        public static readonly IntPtr HWND_TOP = IntPtr.Zero, HWND_BOTTOM = new IntPtr(1), HWND_TOPMOST = new IntPtr(-1);

        [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
        [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
        public delegate bool EnumProc(IntPtr hwnd, IntPtr param);

        [DllImport("user32.dll")] public static extern IntPtr SetProcessDpiAwarenessContext(IntPtr value);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string name);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string name);
        [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);
        [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc proc, IntPtr param);
        [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hwnd, int index);
        [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr hwnd, int index, int value);
        [DllImport("user32.dll")] public static extern IntPtr SetParent(IntPtr child, IntPtr parent);
        [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int w, int h, uint flags);
        [DllImport("user32.dll")] public static extern bool SetLayeredWindowAttributes(IntPtr hwnd, uint key, byte alpha, uint flags);
        [DllImport("user32.dll")] public static extern bool ScreenToClient(IntPtr hwnd, ref POINT p);
        [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd, int cmd);
        [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hwnd);
        [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr window);
        [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr window, uint relation);
        [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
        [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT r);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd, StringBuilder s, int n);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int RegisterWindowMessage(string name);
        [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr icon);
        [DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

        public static readonly int Build = ReadBuild();

        static int ReadBuild()
        {
            try
            {
                using (var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion"))
                {
                    int n;
                    return key != null && int.TryParse(key.GetValue("CurrentBuildNumber") as string, out n) ? n : 0;
                }
            }
            catch { return 0; }
        }

        public static void DarkFrame(IntPtr hwnd, bool light = false)
        {
            int on = light ? 0 : 1;
            if (DwmSetWindowAttribute(hwnd, 20, ref on, 4) != 0) DwmSetWindowAttribute(hwnd, 19, ref on, 4);
            if (Build < 22000) return;
            int caption = light ? 0xCBCAC3 : 0x0D0C09, text = light ? 0x15130D : 0xFFFFFF, border = light ? 0xB0AEA5 : 0x2F2E27;
            DwmSetWindowAttribute(hwnd, 35, ref caption, 4);
            DwmSetWindowAttribute(hwnd, 36, ref text, 4);
            DwmSetWindowAttribute(hwnd, 34, ref border, 4);
        }

        public static void Rounded(IntPtr hwnd)
        {
            if (Build < 22000) return;
            int round = 2;
            DwmSetWindowAttribute(hwnd, 33, ref round, 4);
        }

        public const uint SND_ASYNC = 0x0001, SND_NODEFAULT = 0x0002, SND_MEMORY = 0x0004;
        [DllImport("winmm.dll", SetLastError = true)] public static extern bool PlaySound(IntPtr sound, IntPtr module, uint options);

        public const int WM_DEVICECHANGE = 0x0219, DBT_DEVTYP_DEVICEINTERFACE = 5;
        public const int DEVICE_NOTIFY_WINDOW_HANDLE = 0, DEVICE_NOTIFY_ALL_INTERFACE_CLASSES = 4;
        [StructLayout(LayoutKind.Sequential)]
        public struct DEV_BROADCAST_DEVICEINTERFACE { public int dbcc_size, dbcc_devicetype, dbcc_reserved; public Guid dbcc_classguid; public short dbcc_name; }
        [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr RegisterDeviceNotification(IntPtr destinataire, ref DEV_BROADCAST_DEVICEINTERFACE filter, int options);

        public const int DIGCF_PRESENT = 0x2, DIGCF_ALLCLASSES = 0x4;
        public static readonly IntPtr INVALID_HANDLE_VALUE = new IntPtr(-1);
        [StructLayout(LayoutKind.Sequential)]
        public struct SP_DEVINFO_DATA { public int cbSize; public Guid ClassGuid; public int DevInst; public IntPtr Reserved; }
        [DllImport("setupapi.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern IntPtr SetupDiGetClassDevs(IntPtr kind, string enumerator, IntPtr parent, int options);
        [DllImport("setupapi.dll", SetLastError = true)] public static extern bool SetupDiEnumDeviceInfo(IntPtr list, int index, ref SP_DEVINFO_DATA info);
        [DllImport("setupapi.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool SetupDiGetDeviceInstanceId(IntPtr list, ref SP_DEVINFO_DATA info, StringBuilder id, int size, out int required);
        [DllImport("setupapi.dll")] public static extern bool SetupDiDestroyDeviceInfoList(IntPtr list);
        [DllImport("setupapi.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool SetupDiGetDeviceRegistryProperty(IntPtr list, ref SP_DEVINFO_DATA info, int property, out int type, byte[] buffer, int size, out int required);

        public static string Kind(IntPtr hwnd)
        {
            var s = new StringBuilder(256);
            GetClassName(hwnd, s, s.Capacity);
            return s.ToString();
        }
    }
}
