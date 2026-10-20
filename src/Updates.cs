using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Net;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace Bramble
{
    static class Updates
    {
        const string Latest = "https://api.github.com/repos/brieucgarrigoux/Bramble-Desktop/releases/latest";
        static readonly JavaScriptSerializer json = new JavaScriptSerializer();
        static string status = "never", version, page;
        static bool running;

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
                object tag, url;
                m.TryGetValue("tag_name", out tag);
                m.TryGetValue("html_url", out url);
                return new[] { ((tag as string) ?? "").TrimStart('v', 'V'), url as string };
            }
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
                case "open":
                    if (page != null && page.StartsWith("https://github.com/", StringComparison.OrdinalIgnoreCase)) Process.Start(page);
                    return false;
            }
            return false;
        }

        public static object State()
        {
            return new { auto = Program.R.UpdatesAuto, status = status, version = version, last = Program.R.UpdatesLast };
        }
    }
}
