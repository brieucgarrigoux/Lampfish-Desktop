using System;
using System.Collections.Generic;
using System.Drawing;
using System.Runtime.InteropServices;

namespace Bramble
{
    static class DesktopIcons
    {
        public class Element
        {
            public string Id;
            public string Name;
            public string Type;
            public uint Attributes;
            public Point Position;
            public Icon Icon;
        }

        public const uint FWF_AUTOARRANGE = 0x1, FWF_SNAPTOGRID = 0x4, FWF_NOICONS = 0x1000;
        public const uint SFGAO_LINK = 0x10000, SFGAO_STREAM = 0x400000, SFGAO_FOLDER = 0x20000000, SFGAO_FILESYSTEM = 0x40000000;

        static IFolderView2 View()
        {
            var windows = (IShellWindows)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("9BA05972-F6A8-11CF-A442-00A0C90A8F39")));
            object place = 0, root = null;
            int hwnd;
            object disp = windows.FindWindowSW(ref place, ref root, 8 , out hwnd, 1 );
            var provider = (IServiceProvider)disp;
            Guid sid = new Guid("4C96BE40-915C-11CF-99D3-00AA004AE837"), iid = typeof(IShellBrowser).GUID;
            object o;
            provider.QueryService(ref sid, ref iid, out o);
            object view;
            ((IShellBrowser)o).QueryActiveShellView(out view);
            return (IFolderView2)view;
        }

        static Point Origin()
        {
            IntPtr list = ListWindow();
            Native.RECT r;
            if (list != IntPtr.Zero && Native.GetWindowRect(list, out r)) return new Point(r.Left, r.Top);
            return System.Windows.Forms.SystemInformation.VirtualScreen.Location;
        }

        static IntPtr ListWindow()
        {
            IntPtr found = IntPtr.Zero;
            Native.EnumWindows((h, l) =>
            {
                IntPtr view = Native.FindWindowEx(h, IntPtr.Zero, "SHELLDLL_DefView", null);
                if (view != IntPtr.Zero) { found = Native.FindWindowEx(view, IntPtr.Zero, "SysListView32", null); return false; }
                return true;
            }, IntPtr.Zero);
            return found;
        }

        public static List<Element> List(bool icons)
        {
            var view = View();
            var list = new List<Element>();
            Point origin = Origin();
            int n;
            view.ItemCount(2 , out n);
            for (int i = 0; i < n; i++)
            {
                IntPtr pidl;
                view.Item(i, out pidl);
                try
                {
                    var e = new Element();
                    string s;
                    if (SHGetNameFromIDList(pidl, 0x80028000 , out s) == 0) e.Id = s;
                    if (SHGetNameFromIDList(pidl, 0 , out s) == 0) e.Name = s;
                    var info = new SHFILEINFO();
                    uint options = SHGFI_PIDL | SHGFI_ATTRIBUTES | SHGFI_TYPENAME | (icons ? SHGFI_ICON | SHGFI_LARGEICON : 0);
                    if (SHGetFileInfo(pidl, 0, ref info, (uint)Marshal.SizeOf(info), options) != IntPtr.Zero)
                    {
                        e.Type = info.szTypeName;
                        e.Attributes = info.dwAttributes;
                        if (info.hIcon != IntPtr.Zero) { e.Icon = (Icon)Icon.FromHandle(info.hIcon).Clone(); Native.DestroyIcon(info.hIcon); }
                    }
                    Native.POINT p;
                    view.GetItemPosition(pidl, out p);
                    e.Position = new Point(p.X + origin.X, p.Y + origin.Y);
                    if (e.Id != null) list.Add(e);
                }
                finally { Marshal.FreeCoTaskMem(pidl); }
            }
            return list;
        }

        // Where each icon is, without anything else about it: light enough to be read every few seconds.
        public static List<KeyValuePair<string, Point>> Positions()
        {
            var view = View();
            var list = new List<KeyValuePair<string, Point>>();
            Point origin = Origin();
            int n;
            view.ItemCount(2, out n);
            for (int i = 0; i < n; i++)
            {
                IntPtr pidl;
                view.Item(i, out pidl);
                try
                {
                    string id;
                    Native.POINT p;
                    if (SHGetNameFromIDList(pidl, 0x80028000, out id) != 0 || id == null) continue;
                    view.GetItemPosition(pidl, out p);
                    list.Add(new KeyValuePair<string, Point>(id, new Point(p.X + origin.X, p.Y + origin.Y)));
                }
                finally { Marshal.FreeCoTaskMem(pidl); }
            }
            return list;
        }

        public static Size Case()
        {
            var p = new Native.POINT();
            View().GetSpacing(ref p);
            return new Size(p.X, p.Y);
        }

        public static int IconSize()
        {
            int mode, size;
            View().GetViewModeAndIconSize(out mode, out size);
            return size;
        }

        public static void SetIconSize(int size)
        {
            var view = View();
            int mode, current;
            view.GetViewModeAndIconSize(out mode, out current);
            view.SetViewModeAndIconSize(mode, Math.Max(16, Math.Min(256, size)));
        }

        public static int Place(Dictionary<string, Point> positions)
        {
            var view = View();
            Point origin = Origin();
            var pidls = new List<IntPtr>();
            var points = new List<Native.POINT>();
            int n;
            view.ItemCount(2, out n);
            try
            {
                for (int i = 0; i < n; i++)
                {
                    IntPtr pidl;
                    view.Item(i, out pidl);
                    string id;
                    Point target;
                    if (SHGetNameFromIDList(pidl, 0x80028000, out id) == 0 && id != null && positions.TryGetValue(id, out target))
                    {
                        pidls.Add(pidl);
                        points.Add(new Native.POINT { X = target.X - origin.X, Y = target.Y - origin.Y });
                    }
                    else Marshal.FreeCoTaskMem(pidl);
                }
                if (pidls.Count > 0)
                    view.SelectAndPositionItems((uint)pidls.Count, pidls.ToArray(), points.ToArray(), 0x80 );
                return pidls.Count;
            }
            finally { foreach (IntPtr p in pidls) Marshal.FreeCoTaskMem(p); }
        }

        public static uint Flags()
        {
            uint f;
            View().GetCurrentFolderFlags(out f);
            return f;
        }

        public static void Flag(uint mask, bool active)
        {
            View().SetCurrentFolderFlags(mask, active ? mask : 0);
        }

        const uint SHGFI_ICON = 0x100, SHGFI_LARGEICON = 0x0, SHGFI_TYPENAME = 0x400, SHGFI_ATTRIBUTES = 0x800, SHGFI_PIDL = 0x8;

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct SHFILEINFO
        {
            public IntPtr hIcon;
            public int iIcon;
            public uint dwAttributes;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szDisplayName;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)] public string szTypeName;
        }

        [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern IntPtr SHGetFileInfo(IntPtr pidl, uint attributes, ref SHFILEINFO info, uint size, uint options);
        [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern int SHGetNameFromIDList(IntPtr pidl, uint sigdn, [MarshalAs(UnmanagedType.LPWStr)] out string name);

        [ComImport, Guid("85CB6900-4D95-11CF-960C-0080C7F4EE85"), InterfaceType(ComInterfaceType.InterfaceIsDual)]
        interface IShellWindows
        {
            void get_Count();
            void Item();
            void _NewEnum();
            void Register();
            void RegisterPending();
            void Revoke();
            void OnNavigate();
            void OnActivated();
            [return: MarshalAs(UnmanagedType.IDispatch)]
            object FindWindowSW([MarshalAs(UnmanagedType.Struct)] ref object place, [MarshalAs(UnmanagedType.Struct)] ref object root, int kind, out int hwnd, int options);
        }

        [ComImport, Guid("6D5140C1-7436-11CE-8034-00AA006009FA"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IServiceProvider
        {
            void QueryService(ref Guid service, ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object obj);
        }

        [ComImport, Guid("000214E2-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IShellBrowser
        {
            void GetWindow();
            void ContextSensitiveHelp();
            void InsertMenusSB();
            void SetMenuSB();
            void RemoveMenusSB();
            void SetStatusTextSB();
            void EnableModelessSB();
            void TranslateAcceleratorSB();
            void BrowseObject();
            void GetViewStateStream();
            void GetControlWindow();
            void SendControlMsg();
            void QueryActiveShellView([MarshalAs(UnmanagedType.IUnknown)] out object view);
        }

        [ComImport, Guid("1af3a467-214f-4298-908e-06b03e0b39f9"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IFolderView2
        {
            void GetCurrentViewMode(out uint mode);
            void SetCurrentViewMode(uint mode);
            void GetFolder(ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object folder);
            void Item(int index, out IntPtr pidl);
            void ItemCount(uint options, out int number);
            void Items();
            void GetSelectionMarkedItem(out int index);
            void GetFocusedItem(out int index);
            void GetItemPosition(IntPtr pidl, out Native.POINT position);
            void GetSpacing(ref Native.POINT spacing);
            void GetDefaultSpacing(out Native.POINT spacing);
            [PreserveSig] int GetAutoArrange();
            void SelectItem(int index, uint options);
            void SelectAndPositionItems(uint number, [MarshalAs(UnmanagedType.LPArray)] IntPtr[] pidls, [MarshalAs(UnmanagedType.LPArray)] Native.POINT[] positions, uint options);

            void SetGroupBy();
            void GetGroupBy();
            void SetViewProperty();
            void GetViewProperty();
            void SetTileViewProperties();
            void SetExtendedTileViewProperties();
            void SetText();
            void SetCurrentFolderFlags(uint mask, uint flags);
            void GetCurrentFolderFlags(out uint flags);
            void GetSortColumnCount();
            void SetSortColumns();
            void GetSortColumns();
            void GetItem();
            void GetVisibleItem();
            void GetSelectedItem();
            void GetSelection();
            void GetSelectionState();
            void InvokeVerbOnSelection();
            void SetViewModeAndIconSize(int mode, int iconSize);
            void GetViewModeAndIconSize(out int mode, out int iconSize);
        }
    }
}
