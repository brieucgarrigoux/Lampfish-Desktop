using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using Microsoft.Win32;

namespace Lampfish
{
    // The settings of the taskbar that Windows itself keeps for the current user, and its automatic hiding. Nothing is injected into Explorer:
    // the position at the top or on a side, the size and the transparency have no setting in Windows 11, so they are not here.
    static class Taskbar
    {
        class Setting
        {
            public string Id, Key, Name;
            // The value Windows uses while the registry has none.
            public int Default;
            // First Windows 11 build that has it (0: every build).
            public int Since;
            // A second value that goes with it (the taskbars of the other screens).
            public string Key2, Name2;
        }

        const string Advanced = @"Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced";
        const string Search = @"Software\Microsoft\Windows\CurrentVersion\Search";
        const int Windows11 = 22000;

        static readonly Setting[] Settings =
        {
            new Setting { Id = "align", Key = Advanced, Name = "TaskbarAl", Default = 1, Since = Windows11 },
            new Setting { Id = "search", Key = Search, Name = "SearchboxTaskbarMode", Default = 2 },
            new Setting { Id = "taskView", Key = Advanced, Name = "ShowTaskViewButton", Default = 1 },
            new Setting { Id = "widgets", Key = Advanced, Name = "TaskbarDa", Default = 1, Since = Windows11 },
            new Setting { Id = "corner", Key = Advanced, Name = "TaskbarSd", Default = 0, Since = Windows11 },
            new Setting { Id = "seconds", Key = Advanced, Name = "ShowSecondsInSystemClock", Default = 0 },
            new Setting { Id = "combine", Key = Advanced, Name = "TaskbarGlomLevel", Default = 0, Key2 = Advanced, Name2 = "MMTaskbarGlomLevel" },
            new Setting { Id = "allScreens", Key = Advanced, Name = "MMTaskbarEnabled", Default = 0 },
        };

        static readonly JavaScriptSerializer json = new JavaScriptSerializer();

        // What each value was before lampfish first changed it, so the page can put everything back. A -1 is a value that was not there.
        static string OriginalFile { get { return Path.Combine(Program.DataFolder("Taskbar"), "original.json"); } }

        static bool Supports(Setting s) { return s.Since == 0 || Native.Build >= s.Since; }

        static int? Read(string key, string name)
        {
            try
            {
                using (var k = Registry.CurrentUser.OpenSubKey(key))
                {
                    object v = k == null ? null : k.GetValue(name, null);
                    return v == null ? (int?)null : Convert.ToInt32(v);
                }
            }
            catch { return null; }
        }

        // Windows 11 builds that protect a value refuse the write: the setting is then left to Windows Settings.
        static bool Write(string key, string name, int? value)
        {
            try
            {
                using (var k = Registry.CurrentUser.CreateSubKey(key))
                {
                    if (value == null) k.DeleteValue(name, false);
                    else k.SetValue(name, value.Value, RegistryValueKind.DWord);
                }
                return true;
            }
            catch (UnauthorizedAccessException) { return false; }
            catch (System.Security.SecurityException) { return false; }
        }

        static readonly HashSet<string> refused = new HashSet<string>();

        // Windows 11 guards the Widgets value with its User Choice Protection driver (UCPD): only the Settings app may change it,
        // and any other program is refused, even when it writes the value already there. While the driver is on, the switch says
        // so from the start and the page offers the Taskbar page of Windows Settings, instead of a switch that does nothing.
        static bool Guarded(Setting s)
        {
            if (s.Id != "widgets") return false;
            try
            {
                using (var k = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Services\UCPD"))
                {
                    if (k == null) return false;
                    object start = k.GetValue("Start");
                    return start == null || Convert.ToInt32(start) != 4;
                }
            }
            catch { return false; }
        }

        [StructLayout(LayoutKind.Sequential)]
        struct APPBARDATA { public int cbSize; public IntPtr hWnd; public uint uCallbackMessage, uEdge; public Native.RECT rc; public IntPtr lParam; }
        [DllImport("shell32.dll")] static extern UIntPtr SHAppBarMessage(uint message, ref APPBARDATA data);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindow(string cls, string title);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint msg, IntPtr w, string l, uint flags, uint timeout, out IntPtr result);

        static APPBARDATA Bar() { return new APPBARDATA { cbSize = Marshal.SizeOf(typeof(APPBARDATA)), hWnd = FindWindow("Shell_TrayWnd", null) }; }

        static bool AutoHide()
        {
            var data = Bar();
            return ((int)(long)SHAppBarMessage(4, ref data) & 1) != 0;
        }

        static void AutoHide(bool on)
        {
            var data = Bar();
            data.lParam = (IntPtr)(on ? 1 : 0);
            SHAppBarMessage(10, ref data);
        }

        // Explorer reads these values again when it is told that its tray settings changed.
        static void Notify()
        {
            IntPtr result;
            SendMessageTimeout(new IntPtr(0xFFFF), 0x1A, IntPtr.Zero, "TraySettings", 2, 1500, out result);
        }

        public static object State()
        {
            var original = ReadOriginal();
            return new
            {
                type = "taskbar.state",
                windows11 = Native.Build >= Windows11,
                autoHide = AutoHide(),
                items = Settings.Where(Supports).Select(s => new { id = s.Id, value = Read(s.Key, s.Name), fallback = s.Default, locked = refused.Contains(s.Id) || Guarded(s) }).ToArray(),
                changed = original.Count > 0,
            };
        }

        static Dictionary<string, int> ReadOriginal()
        {
            try
            {
                if (File.Exists(OriginalFile)) return json.Deserialize<Dictionary<string, int>>(File.ReadAllText(OriginalFile)) ?? new Dictionary<string, int>();
            }
            catch (Exception ex) { Program.Log(ex); }
            return new Dictionary<string, int>();
        }

        static void WriteOriginal(Dictionary<string, int> saved)
        {
            try
            {
                if (saved.Count == 0) { if (File.Exists(OriginalFile)) File.Delete(OriginalFile); }
                else File.WriteAllText(OriginalFile, json.Serialize(saved));
            }
            catch (Exception ex) { Program.Log(ex); }
        }

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            switch (action)
            {
                case "state": Program.Send(State()); return false;
                case "set":
                {
                    string id = m.ContainsKey("id") ? m["id"] as string : null;
                    string title = m.ContainsKey("title") ? Convert.ToString(m["title"]) : "";
                    if (id == "autoHide")
                    {
                        bool before = AutoHide(), on = Convert.ToBoolean(m["value"]);
                        Remember("autoHide", before ? 1 : 0);
                        AutoHide(on);
                        Program.Undoable(Language.T(on ? "{0}: on" : "{0}: off", title), () => { AutoHide(before); Program.Send(State()); });
                        Program.Send(State());
                        return false;
                    }
                    var s = Settings.FirstOrDefault(x => x.Id == id);
                    if (s == null || !Supports(s)) return false;
                    int value = Math.Max(0, Math.Min(3, Convert.ToInt32(m["value"])));
                    int? before1 = Read(s.Key, s.Name), before2 = s.Name2 == null ? null : Read(s.Key2, s.Name2);
                    bool wrote;
                    try
                    {
                        wrote = Write(s.Key, s.Name, value);
                        if (wrote && s.Name2 != null) Write(s.Key2, s.Name2, value);
                    }
                    catch (Exception ex) { Program.Log(ex); wrote = false; }
                    if (!wrote)
                    {
                        refused.Add(s.Id);
                        Program.Send(State());
                        Program.Send(new { type = "taskbar.refused", id = s.Id });
                        return false;
                    }
                    Remember(s.Id, before1);
                    if (s.Name2 != null) Remember(s.Id + "2", before2);
                    Notify();
                    Program.Undoable(Language.T("{0}: changed", title), () =>
                    {
                        try
                        {
                            Write(s.Key, s.Name, before1);
                            if (s.Name2 != null) Write(s.Key2, s.Name2, before2);
                        }
                        catch (Exception ex) { Program.Log(ex); }
                        Notify();
                        Program.Send(State());
                    });
                    Program.Send(State());
                    return false;
                }
                case "open":
                    try { System.Diagnostics.Process.Start("ms-settings:taskbar"); } catch (Exception ex) { Program.Log(ex); }
                    return false;
                case "reset":
                {
                    var saved = ReadOriginal();
                    foreach (var s in Settings)
                    {
                        int v;
                        try
                        {
                            if (saved.TryGetValue(s.Id, out v)) Write(s.Key, s.Name, v < 0 ? (int?)null : v);
                            if (s.Name2 != null && saved.TryGetValue(s.Id + "2", out v)) Write(s.Key2, s.Name2, v < 0 ? (int?)null : v);
                        }
                        catch (Exception ex) { Program.Log(ex); }
                    }
                    int hide;
                    if (saved.TryGetValue("autoHide", out hide)) AutoHide(hide == 1);
                    WriteOriginal(new Dictionary<string, int>());
                    Notify();
                    Program.Send(State());
                    return false;
                }
            }
            return false;
        }

        // The first change of a setting keeps what was there before it; later changes keep that first value.
        static void Remember(string id, int? before)
        {
            var saved = ReadOriginal();
            if (saved.ContainsKey(id)) return;
            saved[id] = before ?? -1;
            WriteOriginal(saved);
        }
    }
}
