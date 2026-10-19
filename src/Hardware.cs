using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Management;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.VisualBasic.Devices;

namespace Bramble
{

    static class Hardware
    {

        class Category
        {
            readonly PerformanceCounterCategory category;
            InstanceDataCollectionCollection before, now;

            public Category(string name) { category = new PerformanceCounterCategory(name); }

            public void Read()
            {
                before = now;
                now = category.ReadCategory();
            }

            public Dictionary<string, float> Values(string gauge)
            {
                var r = new Dictionary<string, float>();
                if (before == null || now == null) return r;
                InstanceDataCollection a = before[gauge], b = now[gauge];
                if (a == null || b == null) return r;
                foreach (InstanceData d in b.Values)
                    if (a.Contains(d.InstanceName)) r[d.InstanceName] = CounterSample.Calculate(a[d.InstanceName].Sample, d.Sample);
                return r;
            }
        }

        static Category processor, gpu, gpuMemory, disks, thermal;
        static object inventory;
        static bool ready, measureRunning, inventoryRunning;
        static DateTime lastMeasure;
        static readonly Dictionary<string, long[]> networkBefore = new Dictionary<string, long[]>();
        static readonly ComputerInfo computer = new ComputerInfo();
        static long maxFrequency;

        public static void Start()
        {

            Task.Run(() =>
            {
                try
                {
                    processor = new Category("Processor Information");
                    disks = new Category("PhysicalDisk");
                    gpu = Attempt("GPU Engine");
                    gpuMemory = Attempt("GPU Adapter Memory");
                    thermal = Attempt("Thermal Zone Information");
                    ready = true;
                }
                catch (Exception ex) { Program.Log(ex); }
            });
        }

        static Category Attempt(string name)
        {
            try { return PerformanceCounterCategory.Exists(name) ? new Category(name) : null; }
            catch { return null; }
        }

        static List<ManagementObject> Wmi(string request, string space = @"root\cimv2")
        {
            try
            {
                using (var s = new ManagementObjectSearcher(space, request))
                    return s.Get().Cast<ManagementObject>().ToList();
            }
            catch (Exception ex) { Program.Log(ex); return new List<ManagementObject>(); }
        }

        static string Text(ManagementObject o, string p)
        {
            try { object v = o[p]; return v == null ? null : v.ToString().Trim(); }
            catch { return null; }
        }

        static long Number(ManagementObject o, string p)
        {
            try { object v = o[p]; return v == null ? 0 : Convert.ToInt64(v); }
            catch { return 0; }
        }

        static readonly Dictionary<long, string> MemoryTypes = new Dictionary<long, string>
        {
            { 20, "DDR" }, { 21, "DDR2" }, { 24, "DDR3" }, { 26, "DDR4" }, { 27, "LPDDR" }, { 28, "LPDDR2" },
            { 29, "LPDDR3" }, { 30, "LPDDR4" }, { 34, "DDR5" }, { 35, "LPDDR5" },
        };

        static object ReadInventory()
        {
            var system = Wmi("SELECT Manufacturer, Model FROM Win32_ComputerSystem").FirstOrDefault();
            var os = Wmi("SELECT Caption, Version, LastBootUpTime FROM Win32_OperatingSystem").FirstOrDefault();
            var card = Wmi("SELECT Manufacturer, Product FROM Win32_BaseBoard").FirstOrDefault();
            var cpu = Wmi("SELECT Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed, L2CacheSize, L3CacheSize FROM Win32_Processor");
            maxFrequency = cpu.Count > 0 ? Number(cpu[0], "MaxClockSpeed") : 0;

            string startup = null;
            if (os != null && Text(os, "LastBootUpTime") != null)
                try { startup = ManagementDateTimeConverter.ToDateTime(Text(os, "LastBootUpTime")).ToString("s"); } catch { }

            var modules = Wmi("SELECT DeviceLocator, Capacity, Speed, ConfiguredClockSpeed, SMBIOSMemoryType, Manufacturer, PartNumber FROM Win32_PhysicalMemory")
                .Select(b =>
                {
                    string type;
                    MemoryTypes.TryGetValue(Number(b, "SMBIOSMemoryType"), out type);
                    long speed = Number(b, "ConfiguredClockSpeed");
                    return new
                    {
                        slot = Text(b, "DeviceLocator"),
                        capacity = Number(b, "Capacity"),
                        speed = speed > 0 ? speed : Number(b, "Speed"),
                        type = type,
                        manufacturer = Text(b, "Manufacturer"),
                        reference = Text(b, "PartNumber"),
                    };
                }).ToList();
            var arrays = Wmi("SELECT MemoryDevices, MaxCapacityEx FROM Win32_PhysicalMemoryArray");
            int slots = Math.Max(modules.Count, (int)arrays.Sum(t => Number(t, "MemoryDevices")));

            var graphics = Wmi("SELECT Name, AdapterRAM, DriverVersion, PNPDeviceID FROM Win32_VideoController")
                .Where(g => (Text(g, "PNPDeviceID") ?? "").StartsWith("PCI", StringComparison.OrdinalIgnoreCase))
                .Select(g => new { name = Text(g, "Name"), memory = Number(g, "AdapterRAM"), driver = Text(g, "DriverVersion") }).ToList();

            return new
            {
                type = "hardware.inventory",
                system = new
                {
                    manufacturer = system != null ? Text(system, "Manufacturer") : null,
                    model = system != null ? Text(system, "Model") : Environment.MachineName,
                    windows = os != null ? Text(os, "Caption") : null,
                    version = os != null ? Text(os, "Version") : null,
                    startup = startup,
                    card = card != null ? Text(card, "Manufacturer") + " " + Text(card, "Product") : null,
                },
                processor = cpu.Select(c => new
                {
                    name = Regex.Replace(Text(c, "Name") ?? "", @"\s+", " "),
                    cores = Number(c, "NumberOfCores"),
                    threads = Number(c, "NumberOfLogicalProcessors"),
                    frequency = Number(c, "MaxClockSpeed"),
                    l2 = Number(c, "L2CacheSize"),
                    l3 = Number(c, "L3CacheSize"),
                }).FirstOrDefault(),
                memory = new
                {
                    total = (long)computer.TotalPhysicalMemory,
                    slots = slots,
                    max = arrays.Sum(t => Number(t, "MaxCapacityEx")) * 1024,
                    modules = modules,
                },
                graphics = graphics,
                disks = Disks(),
                networks = Networks().Select(n => new { id = n.Id, name = n.Description, type = n.NetworkInterfaceType == NetworkInterfaceType.Wireless80211 ? "Wi-Fi" : "Ethernet", speed = n.Speed }).ToArray(),
                battery = Wmi("SELECT Name FROM Win32_Battery").Select(b => new { name = Text(b, "Name") }).FirstOrDefault(),
                screens = Screens(),
            };
        }

        static object Disks()
        {
            const string storage = @"root\Microsoft\Windows\Storage";

            var letters = new Dictionary<string, List<string>>();
            foreach (var p in Wmi("SELECT DiskNumber, DriveLetter FROM MSFT_Partition", storage))
            {
                string letter = Text(p, "DriveLetter");
                if (string.IsNullOrEmpty(letter) || letter == "\0") continue;
                string n = Text(p, "DiskNumber");
                if (!letters.ContainsKey(n)) letters[n] = new List<string>();
                letters[n].Add(letter + ":\\");
            }
            return Wmi("SELECT DeviceId, FriendlyName, MediaType, BusType, Size FROM MSFT_PhysicalDisk", storage)
                .OrderBy(d => Number(d, "DeviceId"))
                .Select(d =>
                {
                    long media = Number(d, "MediaType"), bus = Number(d, "BusType");
                    string number = Text(d, "DeviceId");
                    List<string> l;
                    letters.TryGetValue(number, out l);
                    return new
                    {
                        number = number,
                        name = Text(d, "FriendlyName"),
                        type = media == 4 ? "SSD" : media == 3 ? "HDD" : null,
                        bus = bus == 17 ? "NVMe" : bus == 11 ? "SATA" : bus == 7 ? "USB" : bus == 3 ? "ATA" : bus == 10 ? "SAS" : null,
                        size = Number(d, "Size"),
                        volumes = (l ?? new List<string>()).OrderBy(x => x).Select(x => Volume(x)).Where(v => v != null).ToArray(),
                    };
                }).ToArray();
        }

        static object Volume(string letter)
        {
            try
            {
                var v = new System.IO.DriveInfo(letter);
                if (!v.IsReady) return null;
                return new { letter = letter.Substring(0, 2), name = v.VolumeLabel, size = v.TotalSize, free = v.TotalFreeSpace };
            }
            catch { return null; }
        }

        static List<NetworkInterface> Networks()
        {
            return NetworkInterface.GetAllNetworkInterfaces()
                .Where(n => n.OperationalStatus == OperationalStatus.Up
                    && (n.NetworkInterfaceType == NetworkInterfaceType.Wireless80211 || n.NetworkInterfaceType == NetworkInterfaceType.Ethernet || n.NetworkInterfaceType == NetworkInterfaceType.GigabitEthernet)
                    && !Regex.IsMatch(n.Description, "virtual|hyper-v|vpn|tap-|loopback|wan miniport|bluetooth", RegexOptions.IgnoreCase))
                .ToList();
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct DISPLAY_DEVICE
        {
            public int cb;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceString;
            public int StateFlags;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceID;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceKey;
        }
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
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool EnumDisplayDevices(string device, int index, ref DISPLAY_DEVICE d, int options);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool EnumDisplaySettings(string device, int mode, ref DEVMODE d);
        const int ENUM_CURRENT_SETTINGS = -1, EDD_GET_DEVICE_INTERFACE_NAME = 1;

        static readonly Dictionary<string, string> Manufacturers = new Dictionary<string, string>
        {
            { "ACR", "Acer" }, { "AOC", "AOC" }, { "APP", "Apple" }, { "AUO", "AU Optronics" }, { "AUS", "Asus" }, { "ACI", "Asus" },
            { "BNQ", "BenQ" }, { "BOE", "BOE" }, { "CMN", "Innolux" }, { "CSO", "CSOT" }, { "DEL", "Dell" }, { "ENC", "Eizo" },
            { "GBT", "Gigabyte" }, { "GSM", "LG" }, { "HKC", "HKC" }, { "HPN", "HP" }, { "HWP", "HP" }, { "HSD", "HannStar" },
            { "IVM", "iiyama" }, { "IVO", "InfoVision" }, { "LEN", "Lenovo" }, { "LGD", "LG Display" }, { "MEI", "Panasonic" },
            { "MSI", "MSI" }, { "NEC", "NEC" }, { "PHL", "Philips" }, { "SAM", "Samsung" }, { "SDC", "Samsung Display" },
            { "SHP", "Sharp" }, { "SNY", "Sony" }, { "VSC", "ViewSonic" }, { "XMI", "Xiaomi" }, { "KTC", "KTC" }, { "MAX", "Belinea" },
            { "FUS", "Fujitsu" }, { "HEI", "Hyundai" }, { "TCL", "TCL" }, { "HIS", "Hisense" }, { "SKY", "Skyworth" },
        };

        static string Network(long t)
        {
            switch (t)
            {
                case 0: return "VGA";
                case 4: return "DVI";
                case 5: return "HDMI";
                case 10: return "DisplayPort";
                case 6: case 11: case 13: case 0x80000000: return "Built-in";
                case 15: return "Miracast";
                case 16: case 17: return "USB";
                default: return null;
            }
        }

        static string Letters(ManagementObject o, string p)
        {
            try
            {
                var code = (ushort[])o[p];
                string t = code == null ? null : new string(code.TakeWhile(c => c != 0).Select(c => (char)c).ToArray()).Trim();
                return string.IsNullOrEmpty(t) ? null : t;
            }
            catch { return null; }
        }

        [DllImport("user32.dll")] static extern IntPtr MonitorFromPoint(System.Drawing.Point pt, int options);
        [DllImport("shcore.dll")] static extern int GetDpiForMonitor(IntPtr monitor, int type, out uint x, out uint y);

        static int Scale(Screen s)
        {
            try
            {
                uint x, y;
                if (GetDpiForMonitor(MonitorFromPoint(new System.Drawing.Point(s.Bounds.X + 1, s.Bounds.Y + 1), 2), 0, out x, out y) == 0)
                    return (int)Math.Round(x * 100.0 / 96);
            }
            catch { }
            return 0;
        }

        class Monitor { public string Name, Manufacturer, Code; public int Year; public double Inches; public string Port; }

        static object Screens()
        {

            var monitors = new Dictionary<string, Monitor>(StringComparer.OrdinalIgnoreCase);
            Func<ManagementObject, Monitor> monitor = m =>
            {
                string instance = Text(m, "InstanceName");
                if (instance == null) return null;
                string key = Regex.Replace(instance, @"_\d+$", "");
                Monitor r;
                if (!monitors.TryGetValue(key, out r)) monitors[key] = r = new Monitor();
                return r;
            };
            foreach (var m in Wmi("SELECT * FROM WmiMonitorID", @"root\wmi"))
            {
                var r = monitor(m);
                if (r == null) continue;
                r.Name = Letters(m, "UserFriendlyName");
                string code = Letters(m, "ManufacturerName");
                string manufacturer;
                r.Manufacturer = code == null ? null : Manufacturers.TryGetValue(code, out manufacturer) ? manufacturer : code;
                r.Code = Letters(m, "ProductCodeID");
                r.Year = (int)Number(m, "YearOfManufacture");
            }
            foreach (var m in Wmi("SELECT * FROM WmiMonitorBasicDisplayParams", @"root\wmi"))
            {
                var r = monitor(m);
                long l = Number(m, "MaxHorizontalImageSize"), h = Number(m, "MaxVerticalImageSize");
                if (r != null && l > 0 && h > 0) r.Inches = Math.Round(Math.Sqrt(l * l + h * h) / 2.54, 1);
            }
            foreach (var m in Wmi("SELECT * FROM WmiMonitorConnectionParams", @"root\wmi"))
            {
                var r = monitor(m);
                if (r != null) r.Port = Network(Number(m, "VideoOutputTechnology"));
            }
            return Screen.AllScreens.OrderBy(s => s.Bounds.X).ThenBy(s => s.Bounds.Y).Select((s, i) =>
            {
                Monitor r = null;
                var d = new DISPLAY_DEVICE { cb = Marshal.SizeOf(typeof(DISPLAY_DEVICE)) };
                if (EnumDisplayDevices(s.DeviceName, 0, ref d, EDD_GET_DEVICE_INTERFACE_NAME) && d.DeviceID != null)
                {

                    var parts = d.DeviceID.TrimStart('\\', '?').Split('#');
                    if (parts.Length >= 3) monitors.TryGetValue(parts[0] + "\\" + parts[1] + "\\" + parts[2], out r);
                }
                var mode = new DEVMODE { dmSize = (short)Marshal.SizeOf(typeof(DEVMODE)) };
                int hz = EnumDisplaySettings(s.DeviceName, ENUM_CURRENT_SETTINGS, ref mode) ? mode.dmDisplayFrequency : 0;
                if (r == null) r = new Monitor();
                bool builtin = r.Port == "Built-in";

                string name = r.Name ?? (builtin ? Language.T("Built-in screen") : r.Manufacturer != null ? r.Manufacturer + (r.Code != null ? " " + r.Code : "") : null);
                return new
                {
                    n = i + 1, name = name, manufacturer = r.Manufacturer, code = r.Code, year = r.Year,
                    inches = r.Inches, port = r.Port == null ? null : Language.T(r.Port), builtin = builtin,
                    w = s.Bounds.Width, h = s.Bounds.Height, hz = hz, primary = s.Primary,
                    scale = Scale(s),
                };
            }).ToArray();
        }

        static object Measure()
        {
            processor.Read();
            disks.Read();
            if (gpu != null) gpu.Read();
            if (gpuMemory != null) gpuMemory.Read();
            if (thermal != null) thermal.Read();

            var usage = processor.Values("% Processor Utility");
            var frequency = processor.Values("Processor Frequency");
            var performance = processor.Values("% Processor Performance");
            float total;
            usage.TryGetValue("_Total", out total);

            var threads = usage.Where(p => Regex.IsMatch(p.Key, @"^\d+,\d+$"))
                .OrderBy(p => int.Parse(p.Key.Split(',')[0])).ThenBy(p => int.Parse(p.Key.Split(',')[1]))
                .Select(p => Math.Round(Math.Min(100, p.Value), 1)).ToArray();
            float freq, perf;
            frequency.TryGetValue("_Total", out freq);
            performance.TryGetValue("_Total", out perf);

            double gpuUtil = 0;
            long gpuBytes = 0;
            if (gpu != null)
                gpuUtil = gpu.Values("Utilization Percentage").Where(p => p.Key.Contains("engtype_3D"))
                    .GroupBy(p => Regex.Match(p.Key, @"luid_\w+?_phys_\d+").Value)
                    .Select(g => g.Sum(p => p.Value)).DefaultIfEmpty(0).Max();
            if (gpuMemory != null)
                gpuBytes = (long)(gpuMemory.Values("Dedicated Usage").Values.Sum(v => (double)v) + gpuMemory.Values("Shared Usage").Values.Sum(v => (double)v));

            var inactive = disks.Values("% Idle Time");
            var playback = disks.Values("Disk Read Bytes/sec");
            var write = disks.Values("Disk Write Bytes/sec");
            var byDisk = new Dictionary<string, object>();
            foreach (var p in inactive)
            {
                if (p.Key == "_Total") continue;
                string number = p.Key.Split(' ')[0];
                float l, e;
                playback.TryGetValue(p.Key, out l);
                write.TryGetValue(p.Key, out e);
                byDisk[number] = new { activity = Math.Round(Math.Max(0, Math.Min(100, 100 - p.Value)), 1), playback = (long)l, write = (long)e };
            }

            double seconds = lastMeasure == DateTime.MinValue ? 0 : (DateTime.Now - lastMeasure).TotalSeconds;
            lastMeasure = DateTime.Now;
            var byNetwork = new Dictionary<string, object>();
            foreach (var n in Networks())
            {
                try
                {
                    var s = n.GetIPStatistics();
                    long[] before;
                    if (seconds > 0 && networkBefore.TryGetValue(n.Id, out before))
                        byNetwork[n.Id] = new { received = (long)Math.Max(0, (s.BytesReceived - before[0]) / seconds), sent = (long)Math.Max(0, (s.BytesSent - before[1]) / seconds) };
                    networkBefore[n.Id] = new[] { s.BytesReceived, s.BytesSent };
                }
                catch { }
            }

            double? temperature = null;
            if (thermal != null)
            {
                var t = thermal.Values("Temperature").Values.Where(k => k > 200).ToList();
                if (t.Count > 0) temperature = Math.Round(t.Max() - 273.15, 1);
            }

            var power = SystemInformation.PowerStatus;
            bool battery = power.BatteryChargeStatus != BatteryChargeStatus.NoSystemBattery && power.BatteryChargeStatus != BatteryChargeStatus.Unknown;

            return new
            {
                type = "hardware.stats",
                processor = new
                {
                    total = Math.Round(Math.Min(100, total), 1),
                    threads = threads,

                    frequency = Math.Round(freq * perf / 100),
                },
                memory = new { used = (long)(computer.TotalPhysicalMemory - computer.AvailablePhysicalMemory), total = (long)computer.TotalPhysicalMemory },
                graphics = new { usage = Math.Round(Math.Min(100, gpuUtil), 1), memory = gpuBytes },
                disks = byDisk,
                networks = byNetwork,
                battery = battery ? new
                {
                    charge = (int)Math.Round(power.BatteryLifePercent * 100),
                    mains = power.PowerLineStatus == PowerLineStatus.Online,
                    remaining = power.BatteryLifeRemaining,
                } : null,
                temperature = temperature,
            };
        }

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            switch (action)
            {
                case "inventory":
                    if (inventory != null) Program.Send(inventory);
                    if (inventoryRunning) return false;
                    inventoryRunning = true;
                    Task.Run(() => ReadInventory()).ContinueWith(t => Program.OnInterface(() =>
                    {
                        inventoryRunning = false;
                        if (t.IsFaulted) { Program.Log(t.Exception); return; }
                        inventory = t.Result;
                        Program.Send(inventory);
                    }));
                    return false;
                case "stats":
                    if (!ready || measureRunning) return false;
                    measureRunning = true;
                    Task.Run(() => Measure()).ContinueWith(t => Program.OnInterface(() =>
                    {
                        measureRunning = false;
                        if (t.IsFaulted) { Program.Log(t.Exception); return; }
                        Program.Send(t.Result);
                    }));
                    return false;
            }
            return false;
        }
    }
}
