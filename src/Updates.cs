using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Security.Cryptography;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

namespace Bramble
{
    static class Updates
    {
        const string Latest = "https://api.github.com/repos/brieucgarrigoux/Bramble-Desktop/releases/latest";
        static readonly JavaScriptSerializer json = new JavaScriptSerializer();
        const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\{982DBBF8-9DA8-4E70-8C9D-514A38FD61C4}_is1";
        static string status = "never", version, page, setup, digest;
        static bool running;
        static int progress;

        public static void Start()
        {
            var hourly = new Timer { Interval = 60 * 60 * 1000 };
            hourly.Tick += (s, e) => Auto();
            hourly.Start();
            var first = new Timer { Interval = 2 * 60 * 1000 };
            first.Tick += (s, e) => { first.Stop(); first.Dispose(); Auto(); };
            first.Start();
        }

        public static bool Available { get { return status == "available"; } }

        static void Auto()
        {
            if (!Program.R.UpdatesAuto) return;
            DateTime last;
            if (DateTime.TryParse(Program.R.UpdatesLast, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out last) && (DateTime.Now - last).TotalHours < 24) return;
            Check();
        }

        static void Check()
        {
            if (running) return;
            running = true;
            status = "checking";
            Program.SendState();
            Task.Run(() => Fetch()).ContinueWith(t => Program.OnInterface(() =>
            {
                running = false;
                Program.R.UpdatesLast = DateTime.Now.ToString("o", CultureInfo.InvariantCulture);
                if (t.IsFaulted)
                {
                    var web = t.Exception.InnerException as WebException;
                    var response = web == null ? null : web.Response as HttpWebResponse;
                    if (response != null && response.StatusCode == HttpStatusCode.NotFound) status = "none";
                    else { status = "failed"; Program.Log(t.Exception.InnerException ?? t.Exception); }
                }
                else
                {
                    version = t.Result[0];
                    page = t.Result[1];
                    setup = t.Result[2];
                    digest = t.Result[3];
                    status = Newer(version, Program.Version) ? "available" : "latest";
                }
                Program.Save();
                Program.SendState();
            }));
        }

        static string[] Fetch()
        {
            var request = (HttpWebRequest)WebRequest.Create(Latest);
            request.UserAgent = "Bramble/" + Program.Version;
            request.Accept = "application/vnd.github+json";
            request.Timeout = 10000;
            using (var response = request.GetResponse())
            using (var reader = new StreamReader(response.GetResponseStream()))
            {
                var m = json.Deserialize<Dictionary<string, object>>(reader.ReadToEnd());
                object tag, url, assets, download = null, hash = null;
                m.TryGetValue("tag_name", out tag);
                m.TryGetValue("html_url", out url);
                m.TryGetValue("assets", out assets);
                var asset = (assets as System.Collections.ArrayList ?? new System.Collections.ArrayList()).OfType<Dictionary<string, object>>().FirstOrDefault(a =>
                {
                    string name = a.ContainsKey("name") ? a["name"] as string ?? "" : "";
                    return name.StartsWith("Bramble-Setup-", StringComparison.OrdinalIgnoreCase) && name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase);
                });
                if (asset != null) { asset.TryGetValue("browser_download_url", out download); asset.TryGetValue("digest", out hash); }
                return new[] { ((tag as string) ?? "").TrimStart('v', 'V'), url as string, download as string, hash as string };
            }
        }

        static bool Installed()
        {
            using (var key = Registry.CurrentUser.OpenSubKey(UninstallKey))
            {
                string place = key == null ? null : key.GetValue("InstallLocation") as string;
                return place != null && place.TrimEnd('\\').Equals(Program.Root, StringComparison.OrdinalIgnoreCase);
            }
        }

        static bool CanInstall()
        {
            return setup != null && setup.StartsWith("https://github.com/", StringComparison.OrdinalIgnoreCase)
                && digest != null && digest.StartsWith("sha256:", StringComparison.OrdinalIgnoreCase) && Installed();
        }

        // GitHub computes the digest when the file is uploaded, so a file altered on the way never matches it.
        static void Install()
        {
            if (running || status != "available" || !CanInstall()) return;
            running = true;
            status = "downloading";
            progress = 0;
            Program.SendState();
            string file = Path.Combine(Path.GetTempPath(), "Bramble-Setup-" + version + ".exe");
            string expected = digest.Substring("sha256:".Length).ToLowerInvariant();
            Task.Run(() =>
            {
                using (var web = new WebClient())
                {
                    web.Headers[HttpRequestHeader.UserAgent] = "Bramble/" + Program.Version;
                    web.DownloadProgressChanged += (s, e) =>
                    {
                        if (e.ProgressPercentage < progress + 5) return;
                        progress = e.ProgressPercentage;
                        Program.OnInterface(() => Program.SendState());
                    };
                    web.DownloadFileTaskAsync(setup, file).Wait();
                }
                using (var sha = SHA256.Create())
                using (var stream = File.OpenRead(file))
                    return string.Concat(sha.ComputeHash(stream).Select(b => b.ToString("x2"))) == expected;
            }).ContinueWith(t => Program.OnInterface(() =>
            {
                running = false;
                if (t.IsFaulted || !t.Result)
                {
                    if (t.IsFaulted) Program.Log(t.Exception.InnerException ?? t.Exception);
                    try { File.Delete(file); } catch { }
                    status = t.IsFaulted ? "downloadFailed" : "damaged";
                    Program.SendState();
                    return;
                }
                status = "installing";
                Program.SendState();
                Process.Start(new ProcessStartInfo(file, "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART") { UseShellExecute = true });
                Program.Quit();
            }));
        }

        static bool Newer(string candidate, string current)
        {
            Version a, b;
            return Version.TryParse(Clean(candidate), out a) && Version.TryParse(Clean(current), out b) && a > b;
        }

        static string Clean(string v)
        {
            var parts = new List<string>((v ?? "").Split('-', '+')[0].Split('.'));
            while (parts.Count < 3) parts.Add("0");
            return string.Join(".", parts);
        }

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            switch (action)
            {
                case "check": Check(); return false;
                case "auto":
                    Program.R.UpdatesAuto = Convert.ToBoolean(m["value"]);
                    if (Program.R.UpdatesAuto) Auto();
                    return true;
                case "install": Install(); return false;
                case "open":
                    if (page != null && page.StartsWith("https://github.com/", StringComparison.OrdinalIgnoreCase)) Process.Start(page);
                    return false;
            }
            return false;
        }

        public static object State()
        {
            return new { auto = Program.R.UpdatesAuto, status = status, version = version, last = Program.R.UpdatesLast, installable = status == "available" && CanInstall(), progress = progress };
        }
    }
}
