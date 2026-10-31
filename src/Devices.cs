using System;
using System.Collections.Generic;
using System.Linq;
using System.Management;
using System.Threading.Tasks;

namespace Lampfish
{
    static class Devices
    {
        static bool running;

        static readonly Dictionary<string, string> Kinds = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            { "Mouse", "Mouse" }, { "Keyboard", "Keyboard" }, { "Camera", "Camera" }, { "Image", "Camera" }, { "Printer", "Printer" },
            { "Bluetooth", "Bluetooth" }, { "AudioEndpoint", "Audio" }, { "WPD", "Phone or player" }, { "Monitor", "Screen" },
        };

        static string Text(ManagementObject o, string property)
        {
            try { object v = o[property]; return v == null ? null : v.ToString().Trim(); }
            catch { return null; }
        }

        static object Read()
        {
            int controllers = 0, usb = 0;
            var items = new List<Dictionary<string, object>>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            try
            {
                using (var s = new ManagementObjectSearcher(@"root\cimv2", "SELECT DeviceID FROM Win32_USBController"))
                    controllers = s.Get().Count;

                using (var s = new ManagementObjectSearcher(@"root\cimv2", "SELECT Name, PNPClass, PNPDeviceID, Manufacturer, Status FROM Win32_PnPEntity"))
                    foreach (ManagementObject o in s.Get())
                    {
                        string id = Text(o, "PNPDeviceID") ?? "", name = Text(o, "Name"), pnp = Text(o, "PNPClass"), status = Text(o, "Status");
                        if (string.IsNullOrEmpty(name) || (status != null && status != "OK")) continue;
                        bool physicalUsb = id.StartsWith("USB\\VID_", StringComparison.OrdinalIgnoreCase) && id.IndexOf("&MI_", StringComparison.OrdinalIgnoreCase) < 0;
                        if (physicalUsb) usb++;

                        string kind;
                        if (pnp != null && Kinds.TryGetValue(pnp, out kind)) { }
                        else if (id.StartsWith("USBSTOR\\", StringComparison.OrdinalIgnoreCase) && pnp == "DiskDrive") kind = "Storage";
                        else if (name.IndexOf("game controller", StringComparison.OrdinalIgnoreCase) >= 0) kind = "Controller";
                        else continue;

                        if (kind == "Bluetooth" && (name.IndexOf("Enumerator", StringComparison.OrdinalIgnoreCase) >= 0 || name.IndexOf("RFCOMM", StringComparison.OrdinalIgnoreCase) >= 0)) continue;
                        if (!seen.Add(kind + "|" + name + "|" + id)) continue;
                        items.Add(new Dictionary<string, object>
                        {
                            { "name", name }, { "kind", kind }, { "vendor", Text(o, "Manufacturer") }, { "usb", id.StartsWith("USB", StringComparison.OrdinalIgnoreCase) },
                        });
                    }
            }
            catch (Exception ex) { Program.Log(ex); }

            return new
            {
                type = "hardware.devices",
                controllers = controllers,
                usb = usb,
                items = items.OrderBy(i => (string)i["kind"]).ThenBy(i => (string)i["name"]).ToArray(),
            };
        }

        public static void Request()
        {
            if (running) return;
            running = true;
            Task.Run(() => Read()).ContinueWith(t => Program.OnInterface(() =>
            {
                running = false;
                if (t.IsFaulted) { Program.Log(t.Exception); return; }
                Program.Send(t.Result);
            }));
        }
    }
}
