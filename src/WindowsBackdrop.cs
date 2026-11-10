using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace Lampfish
{
    // Mica takes its color from the picture set in Windows, never from the live wallpaper drawn over it: with a red picture hidden
    // behind a teal wallpaper, the window turned red. While lampfish runs, Windows keeps a still of the live wallpaper instead,
    // and gets back its own picture or slideshow when lampfish quits or the setting is turned off.
    static class WindowsBackdrop
    {
        class Before
        {
            public Dictionary<string, string> Pictures = new Dictionary<string, string>();
            public int Position;
            public bool Slideshow;
            public string SlideshowFolder;
            public int SlideshowOptions;
            public uint SlideshowTick;
            public string Applied;
        }

        static readonly JavaScriptSerializer json = new JavaScriptSerializer();
        static System.Windows.Forms.Timer soon;
        static bool busy;
        static int turn;

        static string Folder { get { return Program.DataFolder("Wallpaper"); } }
        static string StateFile { get { return Path.Combine(Folder, "windows-backdrop.json"); } }
        static bool Mine(string path) { return !string.IsNullOrEmpty(path) && Path.GetFileName(path).StartsWith("windows-backdrop-", StringComparison.OrdinalIgnoreCase); }

        // Mica exists from Windows 11 22H2: before it, Windows' picture shows nowhere in lampfish and is left alone.
        public static bool Wanted { get { return Program.R.MicaFollows && Native.Build >= 22621; } }

        static Before Load()
        {
            try { return File.Exists(StateFile) ? json.Deserialize<Before>(File.ReadAllText(StateFile)) : null; }
            catch (Exception ex) { Program.Log(ex); return null; }
        }

        static void Save(Before b)
        {
            try { File.WriteAllText(StateFile, json.Serialize(b)); } catch (Exception ex) { Program.Log(ex); }
        }

        // Waits for the new wallpaper to be painted, and lets several changes in a row end in one picture.
        public static void Soon()
        {
            if (!Wanted) return;
            if (soon == null)
            {
                soon = new System.Windows.Forms.Timer { Interval = 2500 };
                soon.Tick += async (s, e) => { soon.Stop(); await Apply(); };
            }
            soon.Stop();
            soon.Start();
        }

        static string Signature()
        {
            var r = Program.R;
            var parts = new List<string>();
            Program.ForEachWallpaper(f => parts.Add(f.Screen + "=" + f.ShownWallpaper));
            parts.Sort(StringComparer.Ordinal);
            return string.Join("|", parts) + "|" + r.Light + "," + r.Dim + "," + r.Blur + "," + r.Saturation + "," + r.Fit;
        }

        static async Task Apply()
        {
            if (busy || !Wanted) return;
            busy = true;
            try
            {
                var before = Load();
                string signature = Signature();
                // Setting the picture makes Explorer redraw the desktop: never twice for the same wallpaper.
                if (before != null && before.Applied == signature) return;

                var wallpaper = WindowsSlideshow.Open();
                try
                {
                    var monitors = new List<KeyValuePair<string, Native.RECT>>();
                    for (uint i = 0; i < wallpaper.GetMonitorDevicePathCount(); i++)
                    {
                        string id = wallpaper.GetMonitorDevicePathAt(i);
                        Native.RECT rect;
                        try { wallpaper.GetMonitorRECT(id, out rect); } catch { continue; }
                        monitors.Add(new KeyValuePair<string, Native.RECT>(id, rect));
                    }
                    if (before == null) before = Remember(wallpaper, monitors);
                    if (before == null) return;

                    turn++;
                    var shots = new Dictionary<string, string>();
                    var forms = new List<WallpaperForm>();
                    Program.ForEachWallpaper(f => forms.Add(f));
                    foreach (var m in monitors)
                    {
                        // Windows gives monitors in physical pixels; the nearest screen still matches under another scale.
                        var form = forms.OrderBy(f => Math.Abs(f.Screen.X - m.Value.Left) + Math.Abs(f.Screen.Y - m.Value.Top)).FirstOrDefault();
                        if (form == null) continue;
                        // A new name each time: Windows keeps the old picture when the path does not change.
                        string path = Path.Combine(Folder, "windows-backdrop-" + monitors.IndexOf(m) + "-" + (turn % 2) + ".jpg");
                        byte[] jpg = await form.Snapshot();
                        if (jpg == null) continue;
                        File.WriteAllBytes(path, jpg);
                        shots[m.Key] = path;
                    }
                    if (shots.Count == 0) return;
                    wallpaper.SetPosition(4);
                    // A running slideshow puts its next picture back at once: it gets the still as its only picture instead.
                    if (before.Slideshow) { SetSlideshowItem(wallpaper, shots.Values.First()); wallpaper.AdvanceSlideshow(null, 0); }
                    else foreach (var shot in shots) wallpaper.SetWallpaper(shot.Key, shot.Value);
                    before.Applied = signature;
                    Save(before);
                }
                finally { Marshal.ReleaseComObject(wallpaper); }
            }
            catch (Exception ex) { Program.Log(ex); }
            finally { busy = false; }
        }

        // What Windows showed before lampfish, so that Restore puts back exactly that.
        static Before Remember(WindowsSlideshow.IDesktopWallpaper wallpaper, List<KeyValuePair<string, Native.RECT>> monitors)
        {
            var b = new Before { Position = wallpaper.GetPosition() };
            if ((wallpaper.GetStatus() & 2) != 0)
            {
                b.Slideshow = true;
                b.SlideshowFolder = SlideshowFolder(wallpaper);
                wallpaper.GetSlideshowOptions(out b.SlideshowOptions, out b.SlideshowTick);
            }
            foreach (var m in monitors)
            {
                string path = null;
                try { path = wallpaper.GetWallpaper(m.Key); } catch { }
                // Still showing an earlier still of lampfish: nothing of the user's to remember for this screen.
                b.Pictures[m.Key] = Mine(path) ? "" : path ?? "";
            }
            Save(b);
            return b;
        }

        public static void Restore()
        {
            if (soon != null) soon.Stop();
            var b = Load();
            if (b == null) return;
            try
            {
                var wallpaper = WindowsSlideshow.Open();
                try
                {
                    if (b.Slideshow && !string.IsNullOrEmpty(b.SlideshowFolder) && Directory.Exists(b.SlideshowFolder))
                    {
                        SetSlideshowItem(wallpaper, b.SlideshowFolder);
                        wallpaper.SetSlideshowOptions(b.SlideshowOptions, b.SlideshowTick);
                        // Otherwise the still stays on screen until the next turn of the slideshow.
                        try { wallpaper.AdvanceSlideshow(null, 0); } catch (Exception ex) { Program.Log(ex); }
                    }
                    else
                        foreach (var p in b.Pictures.Where(p => p.Value != ""))
                            try { wallpaper.SetWallpaper(p.Key, p.Value); } catch (Exception ex) { Program.Log(ex); }
                    wallpaper.SetPosition(b.Position);
                }
                finally { Marshal.ReleaseComObject(wallpaper); }
                File.Delete(StateFile);
                foreach (string f in Directory.GetFiles(Folder, "windows-backdrop-*.jpg")) try { File.Delete(f); } catch { }
            }
            catch (Exception ex) { Program.Log(ex); }
        }

        // At start: follow the setting, and put back what an earlier run left if the setting is off.
        public static void Start()
        {
            if (!Wanted) Restore();
        }

        public static void Changed()
        {
            if (Wanted) { var b = Load(); if (b != null) { b.Applied = null; Save(b); } Soon(); }
            else Restore();
        }

        [ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IShellItem
        {
            void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
            void GetParent(out IShellItem ppsi);
            void GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
            void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
            void Compare(IShellItem psi, uint hint, out int piOrder);
        }

        [ComImport, Guid("b63ea76d-1f85-456f-a19c-48159efa858b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IShellItemArray
        {
            void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppvOut);
            void GetPropertyStore(int flags, ref Guid riid, out IntPtr ppv);
            void GetPropertyDescriptionList(IntPtr keyType, ref Guid riid, out IntPtr ppv);
            void GetAttributes(int attribFlags, uint sfgaoMask, out uint psfgaoAttribs);
            void GetCount(out uint pdwNumItems);
            void GetItemAt(uint dwIndex, out IShellItem ppsi);
            void EnumItems(out IntPtr ppenumShellItems);
        }

        [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
        static extern void SHCreateItemFromParsingName(string path, IntPtr pbc, ref Guid riid, out IShellItem item);
        [DllImport("shell32.dll", PreserveSig = false)]
        static extern void SHCreateShellItemArrayFromShellItem(IShellItem item, ref Guid riid, out IntPtr array);

        const uint SIGDN_FILESYSPATH = 0x80058000;

        static string SlideshowFolder(WindowsSlideshow.IDesktopWallpaper wallpaper)
        {
            try
            {
                IntPtr p = wallpaper.GetSlideshow();
                if (p == IntPtr.Zero) return null;
                var items = (IShellItemArray)Marshal.GetObjectForIUnknown(p);
                Marshal.Release(p);
                uint count; items.GetCount(out count);
                if (count == 0) return null;
                IShellItem item; items.GetItemAt(0, out item);
                string path; item.GetDisplayName(SIGDN_FILESYSPATH, out path);
                // Windows lists the pictures of the slideshow; the folder they come from is what it was given.
                return File.Exists(path) ? Path.GetDirectoryName(path) : path;
            }
            catch (Exception ex) { Program.Log(ex); return null; }
        }

        static void SetSlideshowItem(WindowsSlideshow.IDesktopWallpaper wallpaper, string folder)
        {
            var itemId = typeof(IShellItem).GUID;
            var arrayId = typeof(IShellItemArray).GUID;
            IShellItem item;
            SHCreateItemFromParsingName(folder, IntPtr.Zero, ref itemId, out item);
            IntPtr array;
            SHCreateShellItemArrayFromShellItem(item, ref arrayId, out array);
            try { wallpaper.SetSlideshow(array); }
            finally { Marshal.Release(array); }
        }
    }
}
