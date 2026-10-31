using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;

namespace Lampfish
{
    // The slideshow of Windows itself. Each time it changes the picture, Windows rebuilds the desktop window and a live wallpaper blinks for a moment:
    // the interval can be made very long and put back, through the documented desktop wallpaper interface.
    static class WindowsSlideshow
    {
        [ComImport, Guid("B92B56A9-8B55-4E14-9A89-0199BBB6F93B"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IDesktopWallpaper
        {
            void SetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitorId, [MarshalAs(UnmanagedType.LPWStr)] string wallpaper);
            [return: MarshalAs(UnmanagedType.LPWStr)] string GetWallpaper([MarshalAs(UnmanagedType.LPWStr)] string monitorId);
            [return: MarshalAs(UnmanagedType.LPWStr)] string GetMonitorDevicePathAt(uint index);
            uint GetMonitorDevicePathCount();
            void GetMonitorRECT([MarshalAs(UnmanagedType.LPWStr)] string monitorId, out Native.RECT rect);
            void SetBackgroundColor(uint color);
            uint GetBackgroundColor();
            void SetPosition(int position);
            int GetPosition();
            void SetSlideshow(IntPtr items);
            IntPtr GetSlideshow();
            void SetSlideshowOptions(int options, uint tick);
            void GetSlideshowOptions(out int options, out uint tick);
            void AdvanceSlideshow([MarshalAs(UnmanagedType.LPWStr)] string monitorId, int direction);
            int GetStatus();
            void Enable([MarshalAs(UnmanagedType.Bool)] bool enable);
        }

        static readonly JavaScriptSerializer json = new JavaScriptSerializer();
        const uint Slow = 0x7FFFFFFF;
        static object cached;
        static DateTime cachedAt = DateTime.MinValue;

        static string File_ { get { return Path.Combine(Program.DataFolder("Wallpaper"), "windows-slideshow.json"); } }

        static IDesktopWallpaper Open()
        {
            return (IDesktopWallpaper)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("C2CF3110-460E-4FC1-B9D0-8A1C0C9CC4BD")));
        }

        // The interval Windows had before lampfish slowed it down, so that it can be put back exactly.
        static uint? Saved()
        {
            try
            {
                if (!File.Exists(File_)) return null;
                var saved = json.Deserialize<Dictionary<string, uint>>(File.ReadAllText(File_));
                uint v;
                return saved != null && saved.TryGetValue("Interval", out v) ? (uint?)v : null;
            }
            catch { return null; }
        }

        public static object State()
        {
            if (cached != null && (DateTime.Now - cachedAt).TotalSeconds < 20) return cached;
            object state = new { active = false, minutes = 0, slowed = false };
            try
            {
                var wallpaper = Open();
                int options; uint tick;
                // Bit 2 of the status: a slideshow is what the desktop shows now.
                if ((wallpaper.GetStatus() & 2) != 0)
                {
                    wallpaper.GetSlideshowOptions(out options, out tick);
                    state = new { active = true, minutes = (int)Math.Min(int.MaxValue, tick / 60000), slowed = tick >= 24u * 60 * 60 * 1000 };
                }
                Marshal.ReleaseComObject(wallpaper);
            }
            catch (Exception ex) { Program.Log(ex); }
            cached = state;
            cachedAt = DateTime.Now;
            return state;
        }

        static bool Set(uint tick)
        {
            try
            {
                var wallpaper = Open();
                int options; uint was;
                wallpaper.GetSlideshowOptions(out options, out was);
                wallpaper.SetSlideshowOptions(options, tick);
                Marshal.ReleaseComObject(wallpaper);
                cached = null;
                return true;
            }
            catch (Exception ex) { Program.Log(ex); return false; }
        }

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            if (action != "slow") return false;
            uint before = 0;
            try
            {
                var wallpaper = Open();
                int options;
                wallpaper.GetSlideshowOptions(out options, out before);
                Marshal.ReleaseComObject(wallpaper);
            }
            catch (Exception ex) { Program.Log(ex); return false; }
            if (before == 0 || before >= Slow) return false;
            try { File.WriteAllText(File_, json.Serialize(new Dictionary<string, uint> { { "Interval", before } })); }
            catch (Exception ex) { Program.Log(ex); }
            if (!Set(Slow)) return false;
            Program.Undoable(Language.T("Windows slideshow slowed down"), () =>
            {
                Set(Saved() ?? before);
                try { if (File.Exists(File_)) File.Delete(File_); } catch { }
                Program.SendState();
            });
            return true;
        }

        // Puts the interval back when it is lampfish that slowed it down.
        public static bool Restore()
        {
            uint? saved = Saved();
            if (saved == null) return false;
            bool ok = Set(saved.Value);
            try { File.Delete(File_); } catch { }
            return ok;
        }
    }
}
