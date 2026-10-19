using System;
using System.Drawing;
using System.Threading;

namespace Bramble
{

    static class Desktop
    {
        static IntPtr parent, icons, workerW;
        static bool raised;

        public static bool Find()
        {
            IntPtr progman = Native.FindWindow("Progman", null);
            if (progman == IntPtr.Zero) return false;

            IntPtr ignore;
            Native.SendMessageTimeout(progman, 0x052C, new IntPtr(0xD), new IntPtr(1), 0, 1000, out ignore);

            raised = (Native.GetWindowLong(progman, Native.GWL_EXSTYLE) & Native.WS_EX_NOREDIRECTIONBITMAP) != 0
                || Native.FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero;

            for (int attempt = 0; attempt < 20; attempt++)
            {
                if (raised)
                {
                    icons = Native.FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
                    workerW = Native.FindWindowEx(progman, IntPtr.Zero, "WorkerW", null);
                    parent = progman;
                    if (icons != IntPtr.Zero && workerW != IntPtr.Zero) return true;
                }
                else
                {
                    IntPtr found = IntPtr.Zero;
                    Native.EnumWindows((h, l) =>
                    {
                        if (Native.FindWindowEx(h, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero)
                            found = Native.FindWindowEx(IntPtr.Zero, h, "WorkerW", null);
                        return true;
                    }, IntPtr.Zero);
                    workerW = parent = found;
                    if (parent != IntPtr.Zero) return true;
                }
                Thread.Sleep(100);
            }
            return false;
        }

        public static IntPtr Parent { get { return parent; } }

        const uint Async = 0x4000;
        static readonly System.Collections.Generic.Queue<DateTime> corrections = new System.Collections.Generic.Queue<DateTime>();
        static DateTime pauseCorrections = DateTime.MinValue;

        static bool CanFix()
        {
            if (DateTime.Now < pauseCorrections) return false;
            while (corrections.Count > 0 && (DateTime.Now - corrections.Peek()).TotalSeconds > 60) corrections.Dequeue();
            if (corrections.Count >= 6)
            {
                pauseCorrections = DateTime.Now.AddMinutes(5);
                corrections.Clear();
                Program.Log(new Exception("File Explorer keeps restoring its window order: corrections paused for 5 min"));
                return false;
            }
            corrections.Enqueue(DateTime.Now);
            return true;
        }

        public static void CheckOrder(System.Collections.Generic.ICollection<IntPtr> wallpapers)
        {
            if (!raised || icons == IntPtr.Zero || wallpapers.Count == 0) return;
            bool seenIcons = false;
            int seen = 0;
            for (IntPtr h = Native.GetWindow(parent, 5); h != IntPtr.Zero; h = Native.GetWindow(h, 2))
            {
                if (h == icons) { seenIcons = true; continue; }
                if (wallpapers.Contains(h))
                {
                    if (!seenIcons && CanFix()) Native.SetWindowPos(h, icons, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE | Async);
                    seen++;
                    continue;
                }
                if (h == workerW && seen < wallpapers.Count)
                {

                    if (CanFix()) Native.SetWindowPos(workerW, Native.HWND_BOTTOM, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE | Async);
                    return;
                }
            }
        }

        public static bool Valid()
        {
            return parent != IntPtr.Zero && Native.IsWindow(parent) && Native.IsWindow(workerW);
        }

        public static void Attach(IntPtr window, Rectangle screen)
        {
            Native.SetParent(window, parent);
            int style = Native.GetWindowLong(window, Native.GWL_STYLE);
            style = (style & ~(Native.WS_POPUP | Native.WS_CAPTION | Native.WS_THICKFRAME)) | Native.WS_CHILD;
            Native.SetWindowLong(window, Native.GWL_STYLE, style);

            var p = new Native.POINT { X = screen.Left, Y = screen.Top };
            Native.ScreenToClient(parent, ref p);
            Native.SetWindowPos(window, raised ? icons : Native.HWND_TOP, p.X, p.Y, screen.Width, screen.Height,
                Native.SWP_NOACTIVATE | Native.SWP_FRAMECHANGED | Native.SWP_SHOWWINDOW);
            Native.SetLayeredWindowAttributes(window, 0, 255, Native.LWA_ALPHA);
        }

        public static void ArrangeWallpaperWindows()
        {
            if (raised)
                Native.SetWindowPos(workerW, Native.HWND_BOTTOM, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE | Async);
        }

        public static bool IsDesktop(IntPtr window)
        {
            string c = Native.Kind(window);
            return c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd" || c == "Shell_SecondaryTrayWnd";
        }
    }
}
