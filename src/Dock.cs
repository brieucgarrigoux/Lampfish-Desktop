using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;

namespace Bramble
{
    class Dock : NativeWindow
    {
        class Device { public string Name; public Guid Kind; }

        readonly Action<bool> change, device;
        readonly Timer check, poll;
        string pattern;
        Dictionary<string, Device> known;
        DateTime quietUntil = DateTime.MinValue, detectionUntil = DateTime.MinValue;
        Action<string, string> found;

        public bool Present { get; private set; }

        public Dock(string pattern, Action<bool> change, Action<bool> device)
        {
            this.pattern = (pattern ?? "").ToUpperInvariant();
            this.change = change;
            this.device = device;
            CreateHandle(new CreateParams());

            var filter = new Native.DEV_BROADCAST_DEVICEINTERFACE { dbcc_devicetype = Native.DBT_DEVTYP_DEVICEINTERFACE };
            filter.dbcc_size = Marshal.SizeOf(filter);
            Native.RegisterDeviceNotification(Handle, ref filter, Native.DEVICE_NOTIFY_WINDOW_HANDLE | Native.DEVICE_NOTIFY_ALL_INTERFACE_CLASSES);

            known = List();
            Present = known != null && known.Keys.Any(IsStation);

            check = new Timer { Interval = 150 };
            check.Tick += (s, e) => { check.Stop(); Check(); };
            poll = new Timer { Interval = 5000 };
            poll.Tick += (s, e) => Check();
            poll.Start();
        }

        public void ChangePattern(string fresh)
        {
            pattern = (fresh ?? "").ToUpperInvariant();
            Present = known != null && known.Keys.Any(IsStation);
        }

        public void Detect(Action<string, string> found)
        {
            this.found = found;
            detectionUntil = DateTime.Now.AddSeconds(30);
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == Native.WM_DEVICECHANGE && check != null && !check.Enabled) check.Start();
            base.WndProc(ref m);
        }

        bool IsStation(string id) { return pattern.Length > 0 && id.Contains(pattern); }

        static bool IsDevice(string id) { return !id.Contains("&MI_") && !id.Contains("ROOT_HUB"); }

        void Check()
        {
            var ids = List();
            if (ids == null) return;
            var before = known;
            known = ids;

            if (found != null)
            {
                var fresh = ids.Where(p => IsDevice(p.Key) && (before == null || !before.ContainsKey(p.Key)))
                    .Select(p => new { id = p.Key, p.Value.Name, p.Value.Kind, pattern = Pattern(p.Key) })
                    .Where(x => x.pattern != null).ToList();
                var callback = found;
                if (fresh.Count > 0)
                {
                    var choice = fresh.OrderByDescending(x => Note(x.pattern, x.Name)).First();
                    found = null;
                    quietUntil = DateTime.Now.AddSeconds(8);
                    callback(choice.pattern, choice.Name);
                    return;
                }
                if (DateTime.Now > detectionUntil) { found = null; callback(null, null); }
            }

            bool present = ids.Keys.Any(IsStation);
            if (present != Present)
            {
                Present = present;

                quietUntil = DateTime.Now.AddSeconds(8);
                change(present);
                return;
            }
            if (before == null || DateTime.Now < quietUntil) return;
            bool arrive = ids.Keys.Any(i => IsDevice(i) && !IsStation(i) && !before.ContainsKey(i));
            bool part = before.Keys.Any(i => IsDevice(i) && !IsStation(i) && !ids.ContainsKey(i));
            if (arrive) device(true);
            else if (part) device(false);
        }

        static readonly string[] Chips = { "VID_2109", "VID_05E3", "VID_0BDA", "VID_1DA0", "VID_174C", "VID_1A40", "VID_0451", "VID_04B4", "VID_1D5C", "VID_0424" };

        static int Note(string pattern, string name)
        {
            int note = 0;
            if (!Chips.Any(pattern.StartsWith)) note += 4;
            string n = (name ?? "").ToLowerInvariant();
            if (n.Length > 0 && !Regex.IsMatch(n, "g[ée]n[ée]ri|generic|billboard|composite|concentrateur|hub usb|usb hub")) note += 2;
            if (n.Contains("dock") || n.Contains("station") || n.Contains("hub")) note += 1;
            return note;
        }

        static string Pattern(string id)
        {
            var m = Regex.Match(id, @"VID_[0-9A-F]{4}&PID_[0-9A-F]{4}");
            return m.Success ? m.Value : null;
        }

        static Dictionary<string, Device> List()
        {
            IntPtr list = Native.SetupDiGetClassDevs(IntPtr.Zero, "USB", IntPtr.Zero, Native.DIGCF_PRESENT | Native.DIGCF_ALLCLASSES);
            if (list == Native.INVALID_HANDLE_VALUE) return null;
            try
            {
                var devices = new Dictionary<string, Device>();
                var info = new Native.SP_DEVINFO_DATA();
                info.cbSize = Marshal.SizeOf(info);
                var id = new StringBuilder(512);
                for (int i = 0; Native.SetupDiEnumDeviceInfo(list, i, ref info); i++)
                {
                    int required;
                    if (!Native.SetupDiGetDeviceInstanceId(list, ref info, id, id.Capacity, out required)) continue;
                    devices[id.ToString().ToUpperInvariant()] = new Device { Name = Name(list, ref info), Kind = info.ClassGuid };
                }
                return devices;
            }
            finally { Native.SetupDiDestroyDeviceInfoList(list); }
        }

        static string Name(IntPtr list, ref Native.SP_DEVINFO_DATA info)
        {
            var buffer = new byte[512];
            int type, required;
            foreach (int property in new[] { 0xC , 0x0  })
                if (Native.SetupDiGetDeviceRegistryProperty(list, ref info, property, out type, buffer, buffer.Length, out required))
                {
                    string name = Encoding.Unicode.GetString(buffer, 0, Math.Max(0, Math.Min(required, buffer.Length))).TrimEnd('\0');
                    if (name.Length > 0) return name;
                }
            return null;
        }
    }
}
