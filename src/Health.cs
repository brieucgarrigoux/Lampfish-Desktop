using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Management;
using System.Runtime.InteropServices;
using System.Threading;
using Microsoft.Win32;

namespace Bramble
{
    static class Health
    {
        class Check { public string Id, Level = "unknown", Value, Detail, Action; }
        class Finding { public string Level, Title, Detail, Action, Icon, Verdict, Cause; }

        static bool running, stale;
        static object last;
        // The program that used the processor the most at the last reading, for the companion.
        public static string Busiest;
        static DateTime when = DateTime.MinValue;

        static readonly Dictionary<string, string> Targets = new Dictionary<string, string>
        {
            { "defender", "windowsdefender:" },
            { "firewall", "windowsdefender://network/" },
            { "updates", "ms-settings:windowsupdate" },
            { "startup", "ms-settings:startupapps" },
            { "privacy", "ms-settings:privacy" },
            { "saver", "ms-settings:batterysaver" },
            { "encryption", "control.exe /name Microsoft.BitLockerDriveEncryption" },
            { "uac", "UserAccountControlSettings.exe" },
            { "power", "ms-settings:powersleep" },
        };

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            switch (action)
            {
                case "scan":
                    bool again = m.ContainsKey("again") && Convert.ToBoolean(m["again"]);
                    if (!again && last != null && (DateTime.Now - when).TotalSeconds < 60) { Program.Send(last); return false; }
                    Scan();
                    return false;
                case "startup":
                {
                    string id = m.ContainsKey("id") ? m["id"] as string : null;
                    bool on = m.ContainsKey("on") && Convert.ToBoolean(m["on"]);
                    if (!SetStartup(id, on)) return false;
                    string name = (StartupItems().FirstOrDefault(i => i.Id == id) ?? new StartupItem { Name = "" }).Name;
                    Program.Undoable(Language.T(on ? "{0} starts with Windows again" : "{0} no longer starts with Windows", name), () => { SetStartup(id, !on); Scan(); });
                    Scan();
                    return false;
                }
                case "privacy":
                case "privacySet":
                    return Privacy.Receive(action, m);
                case "open":
                    string target;
                    if (!Targets.TryGetValue(m.ContainsKey("target") ? m["target"] as string ?? "" : "", out target)) return false;
                    try
                    {
                        int space = target.IndexOf(' ');
                        if (space > 0) Process.Start(target.Substring(0, space), target.Substring(space + 1));
                        else Process.Start(target);
                    }
                    catch (Exception ex) { Program.Log(ex); }
                    return false;
            }
            return false;
        }

        // Shell.Application (BitLocker state) and the Windows Update agent are COM objects that expect a single-threaded apartment.
        static void Scan()
        {
            if (running) { stale = true; return; }
            running = true;
            stale = false;
            Program.Send(new { type = "health.scanning" });
            var thread = new Thread(() =>
            {
                object report;
                try { report = Report(); }
                catch (Exception ex) { Program.Log(ex); report = new { type = "health.report", failed = true }; }
                Program.OnInterface(() =>
                {
                    running = false;
                    // A switch changed while Windows was being read: this report already shows the old state.
                    if (stale) { Scan(); return; }
                    last = report;
                    when = DateTime.Now;
                    Program.Send(report);
                });
            }) { IsBackground = true };
            thread.SetApartmentState(ApartmentState.STA);
            thread.Start();
        }

        static Check Safe(string id, Func<Check> read)
        {
            try { var c = read(); c.Id = id; return c; }
            catch (Exception ex) { Program.Log(ex); return new Check { Id = id, Value = Language.T("Not readable") }; }
        }

        static object Report()
        {
            var items = StartupItems();
            var startup = items.Where(i => i.Enabled).Select(i => i.Name).ToList();
            string system = Path.GetPathRoot(Environment.SystemDirectory);
            var drive = new DriveInfo(system);
            double free = drive.TotalSize > 0 ? 100.0 * drive.AvailableFreeSpace / drive.TotalSize : 100;

            var checks = new List<Check>
            {
                Safe("antivirus", Antivirus),
                Safe("firewall", Firewall),
                Safe("updates", Updates),
                Safe("restart", Restart),
                Safe("encryption", () => Encryption(system)),
                Safe("secureBoot", SecureBoot),
                Safe("uac", Uac),
                Safe("space", () => new Check
                {
                    Level = free >= 15 ? "ok" : free >= 5 ? "warn" : "bad",
                    Value = Language.T("{0} % free", Math.Round(free)),
                    Detail = Language.T("{0} free of {1} on {2}", Size(drive.AvailableFreeSpace), Size(drive.TotalSize), system.TrimEnd('\\')),
                    Action = free < 15 ? "view:files" : null,
                }),
                Safe("startup", () => new Check
                {
                    Level = startup.Count <= 10 ? "ok" : "warn",
                    Value = Language.T(startup.Count == 1 ? "1 program" : "{0} programs", startup.Count),
                    Detail = startup.Count == 0 ? Language.T("Nothing starts with Windows") : string.Join(", ", startup.Take(4)) + (startup.Count > 4 ? "…" : ""),
                    Action = "startup",
                }),
            };

            var measures = new List<object>();
            return new
            {
                type = "health.report",
                when = DateTime.Now.ToString("HH:mm"),
                checks = checks.Select(c => new { id = c.Id, level = c.Level, value = c.Value, detail = c.Detail, action = c.Action }).ToArray(),
                slow = Slow(startup.Count, free, measures).Select(f => new { level = f.Level, title = f.Title, detail = f.Detail, action = f.Action, icon = f.Icon, verdict = f.Verdict, cause = f.Cause }).ToArray(),
                measures = measures.ToArray(),
                startup = items.Select(i => new { id = i.Id, name = i.Name, publisher = i.Publisher, icon = i.Icon, enabled = i.Enabled, machine = i.Machine }).ToArray(),
            };
        }

        static string Size(long bytes)
        {
            double gb = bytes / 1073741824.0;
            return gb >= 1000 ? Language.T("{0} TB", Math.Round(gb / 1024, 1)) : Language.T("{0} GB", Math.Round(gb, gb >= 100 ? 0 : 1));
        }

        static ManagementObject[] Query(string scope, string query)
        {
            using (var searcher = new ManagementObjectSearcher(scope, query))
                return searcher.Get().Cast<ManagementObject>().ToArray();
        }

        // productState packs the product type, its activity (0x10 on, 0x11 on and reporting) and whether its definitions are up to date (0x00).
        static Check Antivirus()
        {
            var products = Query(@"root\SecurityCenter2", "SELECT displayName, productState FROM AntiVirusProduct")
                .Select(p => new { name = p["displayName"] as string, state = Convert.ToInt32(p["productState"]) })
                .Select(p => new { p.name, on = ((p.state >> 8) & 0xFF) == 0x10 || ((p.state >> 8) & 0xFF) == 0x11, current = (p.state & 0xFF) == 0 })
                .ToList();
            var active = products.Where(p => p.on).ToList();
            if (active.Count == 0)
                return new Check { Level = "bad", Value = Language.T("No antivirus on"), Detail = Language.T("Windows Security can turn Microsoft Defender back on"), Action = "defender" };
            var stale = active.FirstOrDefault(p => !p.current);
            if (stale != null && active.All(p => !p.current))
                return new Check { Level = "warn", Value = Language.T("{0}, out of date", stale.name), Detail = Language.T("Its definitions are not up to date"), Action = "defender" };
            return new Check { Level = "ok", Value = Language.T("{0}, up to date", active.First(p => p.current).name), Detail = Language.T("Protection on"), Action = "defender" };
        }

        static object Call(object target, string method, params object[] args) { return target.GetType().InvokeMember(method, System.Reflection.BindingFlags.InvokeMethod, null, target, args); }
        static object Get(object target, string property, params object[] args) { return target.GetType().InvokeMember(property, System.Reflection.BindingFlags.GetProperty, null, target, args); }

        static Check Firewall()
        {
            var policy = Activator.CreateInstance(Type.GetTypeFromProgID("HNetCfg.FwPolicy2"));
            try
            {
                int current = Convert.ToInt32(Get(policy, "CurrentProfileTypes"));
                bool on = true;
                foreach (int profile in new[] { 1, 2, 4 })
                    if ((current & profile) != 0 && !Convert.ToBoolean(Get(policy, "FirewallEnabled", profile))) on = false;
                if (on) return new Check { Level = "ok", Value = Language.T("On"), Detail = Language.T("Windows firewall, on this network"), Action = "firewall" };
            }
            finally { Marshal.FinalReleaseComObject(policy); }
            var other = Query(@"root\SecurityCenter2", "SELECT displayName, productState FROM FirewallProduct")
                .Select(p => new { name = p["displayName"] as string, state = Convert.ToInt32(p["productState"]) })
                .FirstOrDefault(p => ((p.state >> 8) & 0xFF) == 0x10 || ((p.state >> 8) & 0xFF) == 0x11);
            if (other != null) return new Check { Level = "ok", Value = Language.T("On"), Detail = other.name, Action = "firewall" };
            return new Check { Level = "bad", Value = Language.T("Off"), Detail = Language.T("Nothing filters what comes in from this network"), Action = "firewall" };
        }

        // The Defender definitions and platform update several times a day and would hide a Windows that has stopped updating.
        static Check Updates()
        {
            var session = Activator.CreateInstance(Type.GetTypeFromProgID("Microsoft.Update.Session"));
            object searcher = null, history = null;
            try
            {
                searcher = Call(session, "CreateUpdateSearcher");
                int total = Convert.ToInt32(Call(searcher, "GetTotalHistoryCount"));
                if (total == 0) return new Check { Level = "warn", Value = Language.T("No update installed yet"), Detail = Language.T("Windows Update has nothing in its history"), Action = "updates" };
                history = Call(searcher, "QueryHistory", 0, Math.Min(total, 100));
                int count = Convert.ToInt32(Get(history, "Count"));
                DateTime? latest = null;
                for (int i = 0; i < count; i++)
                {
                    object entry = Get(history, "Item", i);
                    string title = Get(entry, "Title") as string ?? "";
                    int result = Convert.ToInt32(Get(entry, "ResultCode"));
                    DateTime date = Convert.ToDateTime(Get(entry, "Date")).ToLocalTime();
                    Marshal.FinalReleaseComObject(entry);
                    if ((result != 2 && result != 3) || title.Contains("2267602") || title.Contains("4052623")) continue;
                    if (latest == null || date > latest) latest = date;
                }
                if (latest == null) return new Check { Level = "warn", Value = Language.T("No update installed yet"), Detail = Language.T("Windows Update has nothing in its history"), Action = "updates" };
                int days = (int)(DateTime.Now - latest.Value).TotalDays;
                return new Check
                {
                    Level = days < 35 ? "ok" : days < 60 ? "warn" : "bad",
                    Value = days == 0 ? Language.T("Last one today") : days == 1 ? Language.T("Last one yesterday") : Language.T("Last one {0} days ago", days),
                    Detail = days < 35 ? Language.T("Windows installs its fixes every month") : Language.T("Windows has missed its monthly fixes"),
                    Action = "updates",
                };
            }
            finally
            {
                if (history != null) Marshal.FinalReleaseComObject(history);
                if (searcher != null) Marshal.FinalReleaseComObject(searcher);
                Marshal.FinalReleaseComObject(session);
            }
        }

        static bool Exists(string path)
        {
            using (var key = Registry.LocalMachine.OpenSubKey(path)) return key != null;
        }

        static Check Restart()
        {
            bool pending = Exists(@"SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired")
                || Exists(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending");
            return pending
                ? new Check { Level = "warn", Value = Language.T("Restart needed"), Detail = Language.T("An update waits for a restart to finish"), Action = "updates" }
                : new Check { Level = "ok", Value = Language.T("None pending"), Detail = Language.T("Every update is finished") };
        }

        static Check Encryption(string root)
        {
            var shell = Activator.CreateInstance(Type.GetTypeFromProgID("Shell.Application"));
            object folder = null, item = null;
            try
            {
                folder = Call(shell, "NameSpace", 17);
                item = Call(folder, "ParseName", root);
                object value = item == null ? null : Call(item, "ExtendedProperty", "System.Volume.BitLockerProtection");
                int state = value == null ? 0 : Convert.ToInt32(value);
                switch (state)
                {
                    case 1: case 6: return new Check { Level = "ok", Value = Language.T("On"), Detail = Language.T("BitLocker protects the system drive") };
                    case 3: case 7: return new Check { Level = "ok", Value = Language.T("Encrypting"), Detail = Language.T("BitLocker protects the system drive") };
                    case 2: return new Check { Level = "warn", Value = Language.T("Off"), Detail = Language.T("Anyone holding this PC can read its drive"), Action = "encryption" };
                    case 4: case 5: case 8: return new Check { Level = "warn", Value = Language.T("Suspended"), Detail = Language.T("BitLocker is paused on the system drive"), Action = "encryption" };
                    default: return new Check { Level = "unknown", Value = Language.T("Not reported"), Detail = Language.T("This edition of Windows does not say") };
                }
            }
            finally
            {
                if (item != null) Marshal.FinalReleaseComObject(item);
                if (folder != null) Marshal.FinalReleaseComObject(folder);
                Marshal.FinalReleaseComObject(shell);
            }
        }

        static Check SecureBoot()
        {
            using (var key = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Control\SecureBoot\State"))
            {
                object v = key == null ? null : key.GetValue("UEFISecureBootEnabled");
                if (v == null) return new Check { Level = "unknown", Value = Language.T("Not reported"), Detail = Language.T("This PC starts without UEFI") };
                return Convert.ToInt32(v) == 1
                    ? new Check { Level = "ok", Value = Language.T("On"), Detail = Language.T("Only signed systems can start") }
                    : new Check { Level = "warn", Value = Language.T("Off"), Detail = Language.T("Turned on in the firmware settings of the PC") };
            }
        }

        static Check Uac()
        {
            using (var key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System"))
            {
                object lua = key == null ? null : key.GetValue("EnableLUA"), prompt = key == null ? null : key.GetValue("ConsentPromptBehaviorAdmin");
                if (lua != null && Convert.ToInt32(lua) == 0)
                    return new Check { Level = "bad", Value = Language.T("Off"), Detail = Language.T("Any program can change Windows without asking"), Action = "uac" };
                if (prompt != null && Convert.ToInt32(prompt) == 0)
                    return new Check { Level = "warn", Value = Language.T("Never notifies"), Detail = Language.T("Programs get administrator rights silently"), Action = "uac" };
                return new Check { Level = "ok", Value = Language.T("On"), Detail = Language.T("Windows asks before a program changes it") };
            }
        }

        static readonly string[][] RunKeys =
        {
            new[] { "user", @"Software\Microsoft\Windows\CurrentVersion\Run", "Run" },
            new[] { "machine", @"Software\Microsoft\Windows\CurrentVersion\Run", "Run" },
            new[] { "machine", @"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run", "Run32" },
        };

        // Task Manager hides an entry by setting the first byte of its value under StartupApproved to an odd number.
        static bool Approved(RegistryKey root, string list, string name)
        {
            using (var key = root.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\" + list))
            {
                var data = key == null ? null : key.GetValue(name) as byte[];
                return data == null || data.Length == 0 || (data[0] & 1) == 0;
            }
        }

        class StartupItem { public string Id, Name, Publisher, Icon, List, Value; public bool Enabled, Machine; }

        // Every program that starts with Windows, on or off, as the startup apps of Windows list them.
        static List<StartupItem> StartupItems()
        {
            var items = new List<StartupItem>();
            try
            {
                foreach (var k in RunKeys)
                {
                    var root = k[0] == "user" ? Registry.CurrentUser : Registry.LocalMachine;
                    using (var key = root.OpenSubKey(k[1]))
                        if (key != null)
                            foreach (string value in key.GetValueNames())
                                if (value.Length > 0) items.Add(Item(value, ExePath(key.GetValue(value) as string), k[2], value, Approved(root, k[2], value), k[0] == "machine"));
                }
                foreach (var place in new[] { new { root = Registry.CurrentUser, folder = Environment.GetFolderPath(Environment.SpecialFolder.Startup), machine = false }, new { root = Registry.LocalMachine, folder = Environment.GetFolderPath(Environment.SpecialFolder.CommonStartup), machine = true } })
                    if (Directory.Exists(place.folder))
                        foreach (string file in Directory.GetFiles(place.folder))
                        {
                            string name = Path.GetFileName(file);
                            if (name.Equals("desktop.ini", StringComparison.OrdinalIgnoreCase)) continue;
                            string target = name.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase) ? Tasks.Target(file) : file;
                            items.Add(Item(Path.GetFileNameWithoutExtension(name), target, "StartupFolder", name, Approved(place.root, "StartupFolder", name), place.machine));
                        }
            }
            catch (Exception ex) { Program.Log(ex); }
            return items.GroupBy(i => i.Id, StringComparer.OrdinalIgnoreCase).Select(g => g.First()).OrderBy(i => !i.Enabled).ThenBy(i => i.Name, StringComparer.CurrentCultureIgnoreCase).ToList();
        }

        static StartupItem Item(string fallback, string path, string list, string value, bool enabled, bool machine)
        {
            var item = new StartupItem { Id = (machine ? "machine|" : "user|") + list + "|" + value, Name = fallback, List = list, Value = value, Enabled = enabled, Machine = machine };
            try
            {
                if (!string.IsNullOrEmpty(path) && File.Exists(path))
                {
                    var info = FileVersionInfo.GetVersionInfo(path);
                    if (!string.IsNullOrWhiteSpace(info.FileDescription) && info.FileDescription.Length <= 40) item.Name = info.FileDescription.Trim();
                    item.Publisher = string.IsNullOrWhiteSpace(info.CompanyName) ? null : info.CompanyName.Trim();
                    item.Icon = Tasks.IconOf(path);
                }
            }
            catch { }
            return item;
        }

        static string ExePath(string command)
        {
            command = Environment.ExpandEnvironmentVariables(command ?? "").Trim();
            if (command.StartsWith("\""))
            {
                int end = command.IndexOf('"', 1);
                return end > 1 ? command.Substring(1, end - 1) : null;
            }
            int exe = command.IndexOf(".exe", StringComparison.OrdinalIgnoreCase);
            return exe > 0 ? command.Substring(0, exe + 4) : command.Split(' ')[0];
        }

        // The startup apps page of Windows keeps its own switch: first byte 2 for on, 3 for off, then when it was turned off.
        // Only the current user's list can be written without administrator rights.
        static bool SetStartup(string id, bool on)
        {
            var parts = (id ?? "").Split(new[] { '|' }, 3);
            if (parts.Length != 3 || parts[0] != "user" || (parts[1] != "Run" && parts[1] != "StartupFolder")) return false;
            var item = StartupItems().FirstOrDefault(i => i.Id == id);
            if (item == null) return false;
            using (var key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\" + parts[1]))
            {
                var data = new byte[12];
                data[0] = (byte)(on ? 2 : 3);
                if (!on) BitConverter.GetBytes(DateTime.UtcNow.ToFileTimeUtc()).CopyTo(data, 4);
                key.SetValue(parts[2], data, RegistryValueKind.Binary);
            }
            last = null;
            return true;
        }

        static string Level(double value, double warn, double bad) { return value >= bad ? "bad" : value >= warn ? "warn" : "ok"; }

        static List<Finding> Slow(int startup, double free, List<object> measures)
        {
            var list = new List<Finding>();
            var cpu = new PerformanceCounter("Processor Information", "% Processor Utility", "_Total");
            var idle = new PerformanceCounter("PhysicalDisk", "% Idle Time", "_Total");
            var before = Times();
            cpu.NextValue();
            idle.NextValue();
            Thread.Sleep(1500);
            double processor = Math.Min(100, cpu.NextValue()), disk = Math.Max(0, 100 - idle.NextValue());
            var after = Times();
            cpu.Dispose();
            idle.Dispose();

            int self;
            using (var current = Process.GetCurrentProcess()) self = current.Id;
            var owners = Owners(after);
            var busiest = after.Where(p => before.ContainsKey(p.Key) && owners[p.Key] != self)
                .GroupBy(p => after[owners[p.Key]].Item1, StringComparer.OrdinalIgnoreCase)
                .Select(g => new { id = owners[g.First().Key], name = g.Key, share = g.Sum(p => (p.Value.Item2 - before[p.Key].Item2) / (15.0 * Environment.ProcessorCount)) })
                .OrderByDescending(p => p.share).FirstOrDefault();
            string top = busiest != null ? Tasks.NameOf(busiest.id, busiest.name) : null;
            Busiest = top;
            if (processor >= 80)
            {
                list.Add(new Finding { Icon = "processor", Level = processor >= 95 ? "bad" : "warn", Title = top == null ? Language.T("Processor {0} % busy", Math.Round(processor)) : Language.T("Processor {0} % busy, mostly {1}", Math.Round(processor), top), Detail = Language.T("Every other program waits its turn"), Action = "view:tasks",
                    Verdict = Language.T("The processor is overloaded"), Cause = Language.T("the processor") });
            }

            var info = new Microsoft.VisualBasic.Devices.ComputerInfo();
            double memory = 100.0 * (info.TotalPhysicalMemory - info.AvailablePhysicalMemory) / info.TotalPhysicalMemory;
            if (memory >= 75)
                list.Add(new Finding { Icon = "memory", Level = memory >= 85 ? "bad" : "warn", Title = Language.T("Memory {0} % in use", Math.Round(memory)), Detail = Language.T("Windows moves memory to the disk, so programs lag"), Action = "free",
                    Verdict = Language.T("Memory is almost full"), Cause = Language.T("memory") });

            double days = GetTickCount64() / 86400000.0;
            measures.Add(new { id = "processor", value = Math.Round(processor) + " %", level = Level(processor, 80, 95), top, topShare = busiest != null ? Math.Max(0, Math.Round(busiest.share)) : 0 });
            measures.Add(new { id = "memory", value = Math.Round(memory) + " %", level = Level(memory, 75, 85) });
            measures.Add(new { id = "disk", value = Math.Round(disk) + " %", level = Level(disk, 90, 101) });
            measures.Add(new { id = "uptime", value = days >= 1 ? Language.T("{0} d", (int)days) : Language.T("{0} h", (int)(days * 24)), level = Level(days, 7, double.MaxValue) });
            measures.Add(new { id = "startup", value = startup.ToString(), level = startup > 10 ? "warn" : "ok" });
            measures.Add(new { id = "free", value = Math.Round(free) + " %", level = free < 5 ? "bad" : free < 10 ? "warn" : "ok" });

            if (disk >= 90)
                list.Add(new Finding { Icon = "disk", Level = "warn", Title = Language.T("Disk {0} % busy", Math.Round(disk)), Detail = Language.T("Programs wait for their files"), Action = "view:hardware",
                    Verdict = Language.T("The disk is overloaded"), Cause = Language.T("the disk") });

            if (days >= 7)
                list.Add(new Finding { Icon = "uptime", Level = "warn", Title = Language.T("Not restarted for {0} days", (int)days), Detail = Language.T("Memory is never fully cleared and updates wait: shutting down does not count, only a restart"),
                    Verdict = Language.T("No restart for {0} days", (int)days), Cause = Language.T("no restart") });

            if (startup > 10)
                list.Add(new Finding { Icon = "startup", Level = "warn", Title = Language.T("{0} programs start with Windows", startup), Detail = Language.T("Windows takes longer to be ready, and they stay in memory afterwards"), Action = "startup",
                    Verdict = Language.T("{0} programs slow the start", startup), Cause = Language.T("startup") });

            if (free < 10)
                list.Add(new Finding { Icon = "free", Level = free < 5 ? "bad" : "warn", Title = Language.T("Only {0} % of the system drive free", Math.Round(free)), Detail = Language.T("Windows lacks room for updates and for memory moved to the disk"), Action = "view:files",
                    Verdict = Language.T("The system drive is almost full"), Cause = Language.T("free space") });

            SYSTEM_POWER_STATUS power;
            if (GetSystemPowerStatus(out power) && power.SystemStatusFlag == 1)
                list.Add(new Finding { Icon = "free", Level = "warn", Title = Language.T("Energy saver is on"), Detail = Language.T("Windows slows the processor to save the battery: fine for light use, slower for heavy work"), Action = "saver",
                    Verdict = Language.T("Energy saver slows the processor"), Cause = Language.T("energy saver") });

            try
            {
                if (PerformanceCounterCategory.Exists("Thermal Zone Information"))
                {
                    var zones = new PerformanceCounterCategory("Thermal Zone Information");
                    double hottest = zones.GetInstanceNames().Select(n => { using (var c = new PerformanceCounter("Thermal Zone Information", "Temperature", n)) return (double)c.NextValue(); }).Where(k => k > 200).DefaultIfEmpty(0).Max() - 273.15;
                    if (hottest > 0) measures.Add(new { id = "heat", value = Math.Round(hottest) + " °C", level = Level(hottest, 90, 95) });
                    if (hottest >= 90)
                        list.Add(new Finding { Icon = "heat", Level = hottest >= 95 ? "bad" : "warn", Title = Language.T("{0} °C inside the PC", Math.Round(hottest)), Detail = Language.T("The processor slows down to cool off: check that the vents are clear"),
                    Verdict = Language.T("The PC is too hot"), Cause = Language.T("heat") });
                }
            }
            catch (Exception ex) { Program.Log(ex); }

            var heat = list.FirstOrDefault(f => f.Icon == "heat");
            if (heat != null)
            {
                bool program = busiest != null && busiest.share >= 15;
                heat.Detail = program ? Language.T("{0} uses the processor the most: closing it cools the PC down", top) : Language.T("A quieter power mode cools the PC down, and its vents need room");
                heat.Action = program ? "view:tasks" : "power";
            }

            return list;
        }

        static Dictionary<int, Tuple<string, double>> Times()
        {
            var times = new Dictionary<int, Tuple<string, double>>();
            foreach (var p in Process.GetProcesses())
                using (p)
                    try { if (p.Id > 4) times[p.Id] = Tuple.Create(p.ProcessName, p.TotalProcessorTime.TotalMilliseconds); }
                    catch { }
            return times;
        }

        // A WebView2 page runs in msedgewebview2 processes started by the app that shows it: their time goes to that app, Bramble's own included.
        static Dictionary<int, int> Owners(Dictionary<int, Tuple<string, double>> times)
        {
            var parents = new Dictionary<int, int>();
            IntPtr snapshot = CreateToolhelp32Snapshot(2, 0);
            if (snapshot != new IntPtr(-1))
                try
                {
                    var entry = new PROCESSENTRY32 { dwSize = Marshal.SizeOf(typeof(PROCESSENTRY32)) };
                    for (bool more = Process32FirstW(snapshot, ref entry); more; more = Process32NextW(snapshot, ref entry))
                        parents[entry.th32ProcessID] = entry.th32ParentProcessID;
                }
                finally { CloseHandle(snapshot); }
            var owners = new Dictionary<int, int>();
            foreach (int id in times.Keys)
            {
                int owner = id, parent;
                for (int depth = 0; depth < 8 && string.Equals(times[owner].Item1, "msedgewebview2", StringComparison.OrdinalIgnoreCase)
                    && parents.TryGetValue(owner, out parent) && times.ContainsKey(parent); depth++)
                    owner = parent;
                owners[id] = owner;
            }
            return owners;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct PROCESSENTRY32
        {
            public int dwSize, cntUsage, th32ProcessID;
            public IntPtr th32DefaultHeapID;
            public int th32ModuleID, cntThreads, th32ParentProcessID, pcPriClassBase, dwFlags;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szExeFile;
        }

        [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateToolhelp32Snapshot(int flags, int process);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32FirstW(IntPtr snapshot, ref PROCESSENTRY32 entry);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32NextW(IntPtr snapshot, ref PROCESSENTRY32 entry);
        [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);

        [StructLayout(LayoutKind.Sequential)]
        struct SYSTEM_POWER_STATUS { public byte ACLineStatus, BatteryFlag, BatteryLifePercent, SystemStatusFlag; public int BatteryLifeTime, BatteryFullLifeTime; }

        [DllImport("kernel32.dll")] static extern bool GetSystemPowerStatus(out SYSTEM_POWER_STATUS status);
        [DllImport("kernel32.dll")] static extern ulong GetTickCount64();
    }
}
