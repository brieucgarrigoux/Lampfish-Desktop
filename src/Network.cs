using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace Lampfish
{
    static class Network
    {
        static bool testRunning;
        static string trafficCard;
        static long[] trafficBefore;
        static DateTime trafficWhen;
        static readonly JavaScriptSerializer json = new JavaScriptSerializer();

        static List<Dictionary<string, object>> History
        {
            get { if (Program.R.NetworkTests == null) Program.R.NetworkTests = new List<Dictionary<string, object>>(); return Program.R.NetworkTests; }
        }

        static NetworkInterface Active()
        {
            return NetworkInterface.GetAllNetworkInterfaces()
                .Where(n => n.OperationalStatus == OperationalStatus.Up && n.NetworkInterfaceType != NetworkInterfaceType.Loopback)
                .Where(n => n.GetIPProperties().GatewayAddresses.Any(g => g.Address.AddressFamily == AddressFamily.InterNetwork && !g.Address.Equals(IPAddress.Any)))
                .OrderBy(n => Regex.IsMatch(n.Description, "virtual|hyper-v|vpn|tap-", RegexOptions.IgnoreCase) ? 1 : 0)
                .FirstOrDefault();
        }

        static IPAddress Gateway(NetworkInterface n)
        {
            var g = n == null ? null : n.GetIPProperties().GatewayAddresses.FirstOrDefault(x => x.Address.AddressFamily == AddressFamily.InterNetwork);
            return g == null ? null : g.Address;
        }

        class Wifi { public string Network, Strip, Standard, Security, Cipher; public int Signal = -1, Channel; public double Received, Sent; }

        static string Profile(NetworkInterface n)
        {
            try
            {
                int index = n.GetIPProperties().GetIPv4Properties().Index;
                using (var s = new System.Management.ManagementObjectSearcher(@"root\StandardCimv2", "SELECT InterfaceIndex, NetworkCategory FROM MSFT_NetConnectionProfile"))
                    foreach (System.Management.ManagementObject o in s.Get())
                        if (Convert.ToInt32(o["InterfaceIndex"]) == index)
                            switch (Convert.ToInt32(o["NetworkCategory"])) { case 0: return "public"; case 1: return "private"; case 2: return "domain"; }
            }
            catch (Exception ex) { Program.Log(ex); }
            return null;
        }

        static string Vpn(NetworkInterface active)
        {
            var v = NetworkInterface.GetAllNetworkInterfaces().FirstOrDefault(n => n.OperationalStatus == OperationalStatus.Up && n.Id != active.Id
                && (n.NetworkInterfaceType == NetworkInterfaceType.Ppp
                    || Regex.IsMatch(n.Description + " " + n.Name, "vpn|wireguard|openvpn|tap-windows|wintun|nordlynx|anyconnect|globalprotect|fortinet|forticlient|proton|mullvad|tailscale|zerotier", RegexOptions.IgnoreCase))
                && n.GetIPProperties().UnicastAddresses.Any(a => a.Address.AddressFamily == AddressFamily.InterNetwork));
            return v == null ? null : v.Name;
        }

        public static object Infos()
        {
            var n = Active();
            if (n == null) return new { type = "network.infos", connected = false, history = History.ToArray() };
            var ip = n.GetIPProperties();
            var v4 = ip.UnicastAddresses.FirstOrDefault(a => a.Address.AddressFamily == AddressFamily.InterNetwork);
            var v6 = ip.UnicastAddresses.FirstOrDefault(a => a.Address.AddressFamily == AddressFamily.InterNetworkV6 && !a.Address.IsIPv6LinkLocal && !a.Address.IsIPv6Teredo);
            bool wireless = n.NetworkInterfaceType == NetworkInterfaceType.Wireless80211;
            var w = wireless ? ReadWifi() : new Wifi();
            string mac = string.Join(":", n.GetPhysicalAddress().GetAddressBytes().Select(b => b.ToString("X2")));
            return new
            {
                type = "network.infos",
                connected = true,
                wifi = wireless,
                card = n.Description,
                network = w.Network,
                signal = w.Signal,
                strip = w.Strip,
                channel = w.Channel,
                standard = w.Standard,
                security = w.Security,
                cipher = w.Cipher,
                profile = Profile(n),
                vpn = Vpn(n),
                received = w.Received,
                sent = w.Sent,
                speed = n.Speed,
                ipv4 = v4 == null ? null : v4.Address.ToString(),
                mask = v4 == null || v4.IPv4Mask == null ? null : v4.IPv4Mask.ToString(),
                ipv6 = v6 == null ? null : v6.Address.ToString(),
                gateway = Gateway(n) == null ? null : Gateway(n).ToString(),
                dns = ip.DnsAddresses.Where(a => a.AddressFamily == AddressFamily.InterNetwork).Select(a => a.ToString()).ToArray(),
                mac = mac.Length > 0 ? mac : null,
                history = History.ToArray(),
            };
        }

        static readonly Dictionary<int, string> Auths = new Dictionary<int, string>
        {
            { 1, "Open" }, { 2, "WEP" }, { 3, "WPA-Enterprise" }, { 4, "WPA-Personal" }, { 6, "WPA2-Enterprise" }, { 7, "WPA2-Personal" },
            { 8, "WPA3-Enterprise" }, { 9, "WPA3-Personal" }, { 10, "OWE" }, { 11, "WPA3-Enterprise" },
        };
        static readonly Dictionary<int, string> Ciphers = new Dictionary<int, string>
        {
            { 0, "None" }, { 1, "WEP" }, { 2, "TKIP" }, { 4, "CCMP" }, { 5, "WEP" }, { 8, "GCMP" }, { 9, "GCMP-256" }, { 10, "CCMP-256" }, { 0x101, "WEP" },
        };
        static readonly Dictionary<int, string> Radios = new Dictionary<int, string> { { 7, "Wi-Fi 4" }, { 8, "Wi-Fi 5" }, { 10, "Wi-Fi 6" }, { 11, "Wi-Fi 7" } };

        // Offsets of WLAN_CONNECTION_ATTRIBUTES and WLAN_BSS_ENTRY (wlanapi.h), read by hand to avoid nested marshaled structs.
        static Wifi ReadWifi()
        {
            var w = new Wifi();
            IntPtr handle = IntPtr.Zero, list = IntPtr.Zero;
            try
            {
                uint negotiated;
                if (WlanOpenHandle(2, IntPtr.Zero, out negotiated, out handle) != 0) return w;
                if (WlanEnumInterfaces(handle, IntPtr.Zero, out list) != 0) return w;
                int count = Marshal.ReadInt32(list);
                for (int k = 0; k < count; k++)
                {
                    IntPtr item = list + 8 + k * 532;
                    if (Marshal.ReadInt32(item + 528) != 1) continue;
                    var id = (Guid)Marshal.PtrToStructure(item, typeof(Guid));

                    IntPtr data; uint size; int kind;
                    if (WlanQueryInterface(handle, ref id, 7, IntPtr.Zero, out size, out data, out kind) != 0) continue;
                    var bssid = new byte[6];
                    try
                    {
                        int length = Math.Min(32, Marshal.ReadInt32(data + 520));
                        var ssid = new byte[length];
                        Marshal.Copy(data + 524, ssid, 0, length);
                        w.Network = System.Text.Encoding.UTF8.GetString(ssid);
                        Marshal.Copy(data + 560, bssid, 0, 6);
                        int phy = Marshal.ReadInt32(data + 568);
                        string radio;
                        w.Standard = Radios.TryGetValue(phy, out radio) ? radio : null;
                        w.Signal = Marshal.ReadInt32(data + 576);
                        w.Received = (uint)Marshal.ReadInt32(data + 580) / 1000.0;
                        w.Sent = (uint)Marshal.ReadInt32(data + 584) / 1000.0;
                        string name;
                        w.Security = Auths.TryGetValue(Marshal.ReadInt32(data + 596), out name) ? name : null;
                        w.Cipher = Ciphers.TryGetValue(Marshal.ReadInt32(data + 600), out name) ? name : null;
                    }
                    finally { WlanFreeMemory(data); }

                    if (WlanQueryInterface(handle, ref id, 8, IntPtr.Zero, out size, out data, out kind) == 0)
                    {
                        w.Channel = Marshal.ReadInt32(data);
                        WlanFreeMemory(data);
                    }

                    IntPtr bss;
                    if (WlanGetNetworkBssList(handle, ref id, IntPtr.Zero, 3, false, IntPtr.Zero, out bss) == 0)
                        try
                        {
                            int entries = Marshal.ReadInt32(bss + 4);
                            for (int b = 0; b < entries; b++)
                            {
                                IntPtr entry = bss + 8 + b * 360;
                                var mac = new byte[6];
                                Marshal.Copy(entry + 40, mac, 0, 6);
                                if (!mac.SequenceEqual(bssid)) continue;
                                int khz = Marshal.ReadInt32(entry + 92);
                                w.Strip = khz >= 5925000 ? "6 GHz" : khz >= 4900000 ? "5 GHz" : khz > 0 ? "2.4 GHz" : null;
                                break;
                            }
                        }
                        finally { WlanFreeMemory(bss); }

                    if (w.Strip == null && w.Channel > 0) w.Strip = w.Channel <= 14 ? "2.4 GHz" : "5 GHz";
                    if (w.Standard == "Wi-Fi 6" && w.Strip == "6 GHz") w.Standard = "Wi-Fi 6E";
                    break;
                }
            }
            catch (Exception ex) { Program.Log(ex); }
            finally
            {
                if (list != IntPtr.Zero) WlanFreeMemory(list);
                if (handle != IntPtr.Zero) WlanCloseHandle(handle, IntPtr.Zero);
            }
            return w;
        }

        [DllImport("wlanapi.dll")] static extern int WlanOpenHandle(uint version, IntPtr reserved, out uint negotiated, out IntPtr handle);
        [DllImport("wlanapi.dll")] static extern int WlanCloseHandle(IntPtr handle, IntPtr reserved);
        [DllImport("wlanapi.dll")] static extern int WlanEnumInterfaces(IntPtr handle, IntPtr reserved, out IntPtr list);
        [DllImport("wlanapi.dll")] static extern int WlanQueryInterface(IntPtr handle, ref Guid id, int opcode, IntPtr reserved, out uint size, out IntPtr data, out int kind);
        [DllImport("wlanapi.dll")] static extern int WlanGetNetworkBssList(IntPtr handle, ref Guid id, IntPtr ssid, int type, bool secure, IntPtr reserved, out IntPtr list);
        [DllImport("wlanapi.dll")] static extern void WlanFreeMemory(IntPtr memory);

        static object Traffic()
        {
            var n = Active();
            if (n == null) return new { type = "network.traffic", received = 0L, sent = 0L };
            var s = n.GetIPStatistics();
            var now = new[] { s.BytesReceived, s.BytesSent };
            long received = 0, sent = 0;
            double seconds = (DateTime.Now - trafficWhen).TotalSeconds;
            if (trafficCard == n.Id && trafficBefore != null && seconds > 0.2)
            {
                received = (long)Math.Max(0, (now[0] - trafficBefore[0]) / seconds);
                sent = (long)Math.Max(0, (now[1] - trafficBefore[1]) / seconds);
            }
            trafficCard = n.Id;
            trafficBefore = now;
            trafficWhen = DateTime.Now;
            return new { type = "network.traffic", received = received, sent = sent };
        }

        public static void Receive(string action)
        {
            switch (action)
            {
                case "infos":

                    Task.Run(() => Infos()).ContinueWith(t => Program.OnInterface(() =>
                    {
                        if (t.IsFaulted) { Program.Log(t.Exception); return; }
                        Program.Send(t.Result);
                    }));
                    break;
                case "traffic": Program.Send(Traffic()); break;
                case "publicip": if (Program.R.PublicIp) PublicIp(); break;
                case "test": if (Program.R.SpeedTest) Test(); break;
                case "settings":
                    try { System.Diagnostics.Process.Start("ms-settings:network-status"); } catch (Exception ex) { Program.Log(ex); }
                    break;
                case "forget":
                {
                    var copy = History.ToList();
                    History.Clear();
                    Program.Save();
                    Program.Send(Infos());
                    Program.Undoable(Language.T("Test history cleared"), () => { History.Clear(); History.AddRange(copy); Program.Save(); Program.Send(Infos()); });
                    Program.SendState();
                    break;
                }
            }
        }

        public static void PublicIp()
        {
            Task.Run(() =>
            {
                try
                {
                    using (var client = new WebClient())
                        return client.DownloadString("https://api.ipify.org").Trim();
                }
                catch { return null; }
            }).ContinueWith(t => Program.OnInterface(() => Program.Send(new { type = "network.publicip", ip = t.Result })));
        }

        public static void Test()
        {
            if (testRunning) return;
            testRunning = true;
            Sounds.Fire("speedtest_start");
            ServicePointManager.DefaultConnectionLimit = Math.Max(ServicePointManager.DefaultConnectionLimit, 16);
            var summary = new Dictionary<string, object> { { "when", DateTime.Now.ToString("s") } };
            Task.Run(() =>
            {
                Step("server", Server());
                var n = Active();
                var gateway = Gateway(n);
                Step("gateway", gateway == null ? Failure("No router") : Ping(gateway.ToString(), 10));
                var internet = Ping("1.1.1.1", 10);
                Step("internet", internet);
                var lookup = Stopwatch.StartNew();
                object resolved = Dns();
                if (lookup.ElapsedMilliseconds < 700) Thread.Sleep(700 - (int)lookup.ElapsedMilliseconds);
                Step("dns", resolved);
                var down = Throughput(false);
                Step("download", down);
                var up = Throughput(true);
                Step("upload", up);

                double idle = Value(internet, "ms");
                double charge = Math.Max(Value(down, "charge"), Value(up, "charge"));
                if (idle > 0 && charge > 0)
                {
                    double added = Math.Max(0, charge - idle);
                    string note = added < 5 ? "A" : added < 30 ? "B" : added < 60 ? "C" : added < 200 ? "D" : "F";
                    Step("charge", new { ok = true, idle = idle, charge = charge, added = Math.Round(added), note = note });
                    summary["note"] = note;
                }
                summary["down"] = Value(down, "mbits");
                summary["up"] = Value(up, "mbits");
                summary["ping"] = idle;
                summary["jitter"] = Value(internet, "jitter");
            }).ContinueWith(t =>
            {
                if (t.IsFaulted) Program.Log(t.Exception);
                Program.OnInterface(() =>
                {
                    testRunning = false;
                    if (Convert.ToDouble(summary.ContainsKey("down") ? summary["down"] : 0) > 0)
                    {
                        History.Insert(0, summary);
                        while (History.Count > 12) History.RemoveAt(History.Count - 1);
                        Program.Save();
                    }
                    Program.Send(new { type = "network.test", step = "end", history = History.ToArray() });
                });
            });
        }

        static double Value(object result, string key)
        {
            if (result == null) return 0;
            var p = result.GetType().GetProperty(key);
            return p == null ? 0 : Convert.ToDouble(p.GetValue(result, null));
        }

        static object Failure(string reason) { return new { ok = false, reason = reason }; }

        static void Step(string step, object result)
        {
            Program.OnInterface(() =>
            {
                Program.Send(new { type = "network.test", step = step, result = result });
                int n = Array.IndexOf(new[] { "gateway", "internet", "dns", "download", "upload" }, step) + 1;
                if (n > 0 && Value(result, "ok") != 0) Sounds.Step(n);
            });
        }

        static readonly Dictionary<int, string> Providers = new Dictionary<int, string>
        {
            { 15557, "SFR" }, { 21502, "SFR" }, { 3215, "Orange" }, { 12322, "Free" }, { 51207, "Free Mobile" }, { 5410, "Bouygues Telecom" },
            { 2856, "BT" }, { 5089, "Virgin Media" }, { 3320, "Deutsche Telekom" }, { 3209, "Vodafone" }, { 12430, "Vodafone" }, { 6830, "Liberty Global" },
            { 3352, "Movistar" }, { 12479, "Orange Espagne" }, { 3269, "TIM" }, { 30722, "Vodafone Italia" }, { 5432, "Proximus" }, { 6848, "Telenet" },
            { 3303, "Swisscom" }, { 6730, "Sunrise" }, { 1136, "KPN" }, { 33915, "Ziggo" }, { 7922, "Comcast Xfinity" }, { 7018, "AT&T" }, { 701, "Verizon" },
            { 20115, "Spectrum" }, { 22773, "Cox" }, { 577, "Bell" }, { 812, "Rogers" }, { 852, "Telus" },
        };

        static object Server()
        {
            try
            {
                var request = (HttpWebRequest)WebRequest.Create("https://speed.cloudflare.com/meta");
                request.Timeout = 6000;
                request.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) lampfish";
                request.Referer = "https://speed.cloudflare.com/";
                using (var response = request.GetResponse())
                using (var player = new StreamReader(response.GetResponseStream()))
                {
                    var m = json.Deserialize<Dictionary<string, object>>(player.ReadToEnd());
                    Func<Dictionary<string, object>, string, string> t = (d, k) => d != null && d.ContainsKey(k) && d[k] != null ? d[k].ToString() : null;
                    var colo = m.ContainsKey("colo") ? m["colo"] as Dictionary<string, object> : null;
                    int asn;
                    string provider;
                    if (!int.TryParse(t(m, "asn"), out asn) || !Providers.TryGetValue(asn, out provider)) provider = t(m, "asOrganization");
                    return new
                    {
                        ok = true, provider = provider, asn = asn,
                        colo = colo != null ? t(colo, "iata") : t(m, "colo"), city = colo != null ? t(colo, "city") : null,
                        client = t(m, "city"), country = t(m, "country"), ip = t(m, "clientIp"),
                    };
                }
            }
            catch (Exception ex) { Program.Log(ex); return Failure("Not found"); }
        }

        static object Ping(string host, int number)
        {
            var time = new List<long>();
            int lost = 0;
            using (var p = new Ping())
                for (int i = 0; i < number; i++)
                {
                    try
                    {
                        var r = p.Send(host, 1500);
                        if (r.Status == IPStatus.Success) time.Add(r.RoundtripTime); else lost++;
                    }
                    catch { lost++; }
                    Thread.Sleep(60);
                }
            if (time.Count == 0) return Failure("No response");
            double jitter = time.Count < 2 ? 0 : time.Zip(time.Skip(1), (a, b) => Math.Abs(a - b)).Average();
            return new { ok = true, ms = Math.Round(time.Average(), 1), jitter = Math.Round(jitter, 1), lost = lost, sent = number };
        }

        static object Dns()
        {
            var chrono = Stopwatch.StartNew();
            try
            {
                System.Net.Dns.GetHostAddresses("lampfish-" + Guid.NewGuid().ToString("N").Substring(0, 10) + ".cloudflare.com");
            }
            catch (SocketException) { }
            catch { return Failure("No response"); }
            chrono.Stop();
            try { System.Net.Dns.GetHostAddresses("cloudflare.com"); }
            catch { return Failure("Lookup failed"); }
            return new { ok = true, ms = chrono.ElapsedMilliseconds };
        }

        static object Throughput(bool upload)
        {
            if (upload) return Measure(true, "Cloudflare");
            object r = Measure(false, "Cloudflare");
            if (Value(r, "mbits") > 0) return r;
            object fallback = Measure(false, "OVH");
            return Value(fallback, "mbits") > 0 ? fallback : r;
        }

        static object Measure(bool upload, string server)
        {
            const int Stream = 4, Duration = 8000;
            long cap = upload ? 60L * 1000 * 1000 : 200L * 1000 * 1000;
            long bytes = 0;
            bool done = false;
            var chrono = Stopwatch.StartNew();
            var errors = new List<Exception>();
            Func<bool> enough = () => done || chrono.ElapsedMilliseconds >= Duration || Interlocked.Read(ref bytes) >= cap;
            string urlDown = server == "OVH" ? "https://proof.ovh.net/files/1Gb.dat" : "https://speed.cloudflare.com/__down?bytes=" + 100 * 1000 * 1000;
            var work = Enumerable.Range(0, Stream).Select(i => Task.Run(() =>
            {
                var buffer = new byte[64 * 1024];
                if (upload) new Random(i).NextBytes(buffer);
                while (!enough())
                {
                    HttpWebRequest request = null;
                    try
                    {
                        if (upload)
                        {
                            const int Chunk = 10 * 1000 * 1000;
                            request = (HttpWebRequest)WebRequest.Create("https://speed.cloudflare.com/__up");
                            request.Method = "POST";
                            request.ContentType = "application/octet-stream";
                            request.AllowWriteStreamBuffering = false;
                            request.ContentLength = Chunk;
                        }
                        else request = (HttpWebRequest)WebRequest.Create(urlDown);
                        request.Timeout = 15000;
                        request.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) lampfish";
                        request.Referer = "https://speed.cloudflare.com/";
                        if (upload)
                        {
                            using (var stream = request.GetRequestStream())
                                for (int sent = 0; sent < request.ContentLength;)
                                {
                                    if (enough()) { request.Abort(); break; }
                                    int k = (int)Math.Min(buffer.Length, request.ContentLength - sent);
                                    stream.Write(buffer, 0, k);
                                    sent += k;
                                    Interlocked.Add(ref bytes, k);
                                }
                            if (!enough()) using (request.GetResponse()) { }
                        }
                        else
                        {
                            using (var response = request.GetResponse())
                            using (var stream = response.GetResponseStream())
                            {
                                int k;
                                while ((k = stream.Read(buffer, 0, buffer.Length)) > 0)
                                {
                                    Interlocked.Add(ref bytes, k);
                                    if (enough()) { request.Abort(); break; }
                                }
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        if (!enough()) { lock (errors) errors.Add(ex); }

                        if (IsRefusal(ex) || errors.Count > 6) break;
                    }
                }
            })).ToArray();

            var pings = new List<long>();
            var probe = Task.Run(() =>
            {
                using (var p = new Ping())
                    while (!done)
                    {
                        try { var r = p.Send("1.1.1.1", 1500); if (r.Status == IPStatus.Success && chrono.ElapsedMilliseconds > 1000) lock (pings) pings.Add(r.RoundtripTime); }
                        catch { }
                        Thread.Sleep(250);
                    }
            });

            long before = 0;
            double smooth = 0, previousElapsed = 0;
            while (work.Any(t => !t.IsCompleted) && chrono.ElapsedMilliseconds < Duration + 1500)
            {
                Thread.Sleep(200);
                double elapsed = chrono.Elapsed.TotalSeconds;
                long now = Interlocked.Read(ref bytes);
                double instant = (now - before) * 8 / Math.Max(0.05, elapsed - previousElapsed) / 1e6;
                before = now; previousElapsed = elapsed;
                smooth = smooth == 0 ? instant : smooth * 0.7 + instant * 0.3;
                double l = smooth, progress = Math.Min(1, Math.Max(elapsed * 1000 / Duration, now / (double)cap));
                if (now > 0)
                    Program.OnInterface(() => Program.Send(new { type = "network.direct", phase = upload ? "upload" : "download", mbits = Math.Round(l, 1), progress = Math.Round(progress, 3) }));
            }
            double seconds = Math.Max(0.05, chrono.Elapsed.TotalSeconds);
            done = true;
            Task.WaitAll(work, 4000);
            probe.Wait(2000);
            long total = Interlocked.Read(ref bytes);
            if (total < 256 * 1024)
            {
                if (errors.Count > 0) Program.Log(errors[0]);
                return Failure(errors.Any(IsRefusal) ? "Too many tests in a row: try again in a minute" : "Measurement failed");
            }
            double charge = 0;
            lock (pings) if (pings.Count > 0) { var sort = pings.OrderBy(x => x).ToList(); charge = sort[sort.Count / 2]; }
            return new { ok = true, mbits = Math.Round(total * 8 / seconds / 1e6, 1), charge = charge, bytes = total, server = server };
        }

        static bool IsRefusal(Exception e)
        {
            var w = e as WebException;
            var r = w == null ? null : w.Response as HttpWebResponse;
            return r != null && ((int)r.StatusCode == 429 || (int)r.StatusCode == 403);
        }
    }
}
