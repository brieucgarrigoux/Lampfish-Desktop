using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Threading;
using System.Web.Script.Serialization;

namespace Bramble
{
    class ClaudeSettings
    {
        public bool On;
    }

    // How much of a Claude plan is used, read the way Claude Code reads it for /usage: with the sign-in Claude Code keeps on this PC.
    // Off until the user turns it on. The sign-in file is only read, never written or refreshed, and the token never reaches the log.
    // The call is not documented by Anthropic, so any unexpected answer is shown as such instead of a wrong number.
    static class ClaudeUsage
    {
        const string Address = "https://api.anthropic.com/api/oauth/usage";
        static readonly JavaScriptSerializer json = new JavaScriptSerializer();
        static ClaudeSettings S = new ClaudeSettings();
        static System.Windows.Forms.Timer timer;
        static object last;
        static string status = "off";
        static bool reading;

        static string SettingsFile { get { return Path.Combine(Program.DataFolder("Claude"), "settings.json"); } }
        static string Home { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".claude"); } }

        public static void Start()
        {
            try { if (File.Exists(SettingsFile)) S = json.Deserialize<ClaudeSettings>(File.ReadAllText(SettingsFile)) ?? new ClaudeSettings(); }
            catch (Exception ex) { Program.Log(ex); }
            timer = new System.Windows.Forms.Timer { Interval = 3 * 60 * 1000 };
            timer.Tick += (s, e) => Read();
            if (S.On) { timer.Start(); Read(); }
        }

        public static object State()
        {
            return new { on = S.On, status = S.On ? status : "off", usage = S.On ? last : null };
        }

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            if (action == "toggle")
            {
                S.On = Convert.ToBoolean(m["on"]);
                try { File.WriteAllText(SettingsFile, json.Serialize(S)); } catch (Exception ex) { Program.Log(ex); }
                if (S.On) { timer.Start(); Read(); } else { timer.Stop(); last = null; status = "off"; }
                return true;
            }
            if (action == "refresh" && S.On) Read();
            return false;
        }

        static Dictionary<string, object> Object(object o) { return o as Dictionary<string, object>; }

        static void Read()
        {
            if (reading) return;
            string file = Path.Combine(Home, ".credentials.json");
            if (!File.Exists(file)) { status = "missing"; Program.SendState(); return; }
            string token, plan = null;
            try
            {
                var oauth = Object(Object(json.DeserializeObject(File.ReadAllText(file)))["claudeAiOauth"]);
                token = Convert.ToString(oauth["accessToken"]);
                plan = oauth.ContainsKey("subscriptionType") ? Convert.ToString(oauth["subscriptionType"]) : null;
                long expires = oauth.ContainsKey("expiresAt") ? Convert.ToInt64(oauth["expiresAt"]) : 0;
                if (expires > 0 && DateTimeOffset.FromUnixTimeMilliseconds(expires) < DateTimeOffset.UtcNow) { status = "expired"; Program.SendState(); return; }
            }
            catch { status = "missing"; Program.SendState(); return; }
            reading = true;
            string model = Model();
            new Thread(() =>
            {
                string next; object usage = null;
                try
                {
                    var request = (HttpWebRequest)WebRequest.Create(Address);
                    request.Headers["Authorization"] = "Bearer " + token;
                    request.Headers["anthropic-beta"] = "oauth-2025-04-20";
                    request.UserAgent = "Bramble/" + Program.Version;
                    request.Timeout = 15000;
                    using (var response = (HttpWebResponse)request.GetResponse())
                    using (var reader = new StreamReader(response.GetResponseStream()))
                        usage = Parse(reader.ReadToEnd(), plan, model);
                    next = usage == null ? "unknown" : "ok";
                }
                catch (WebException ex)
                {
                    var r = ex.Response as HttpWebResponse;
                    next = r != null && (r.StatusCode == HttpStatusCode.Unauthorized || r.StatusCode == HttpStatusCode.Forbidden) ? "expired" : "offline";
                }
                catch (Exception) { next = "unknown"; }
                Program.OnInterface(() =>
                {
                    reading = false;
                    if (!S.On) return;
                    status = next;
                    if (usage != null) last = usage;
                    Program.SendState();
                });
            }) { IsBackground = true }.Start();
        }

        // The model Claude Code is set to, from its own settings; the answer about usage does not say it.
        static string Model()
        {
            try
            {
                string file = Path.Combine(Home, "settings.json");
                if (!File.Exists(file)) return null;
                var settings = Object(json.DeserializeObject(File.ReadAllText(file)));
                return settings != null && settings.ContainsKey("model") ? Convert.ToString(settings["model"]) : null;
            }
            catch { return null; }
        }

        static object Parse(string text, string plan, string model)
        {
            var data = Object(json.DeserializeObject(text));
            if (data == null) return null;
            Func<string, object> window = key =>
            {
                var w = data.ContainsKey(key) ? Object(data[key]) : null;
                if (w == null || w["utilization"] == null) return null;
                return new { percent = Math.Round(Convert.ToDouble(w["utilization"])), resets = Convert.ToString(w["resets_at"]) };
            };
            var limits = (data.ContainsKey("limits") ? data["limits"] as IEnumerable : null) ?? new object[0];
            var scoped = limits.OfType<Dictionary<string, object>>().Where(l => l["scope"] != null)
                .Select(l => new { name = Convert.ToString(l["scope"]), percent = Convert.ToDouble(l["percent"]), resets = Convert.ToString(l["resets_at"]) }).ToArray();
            var breakdown = data.ContainsKey("seven_day_breakdown") ? Object(data["seven_day_breakdown"]) : null;
            var rows = breakdown != null && breakdown.ContainsKey("rows") ? (breakdown["rows"] as IEnumerable ?? new object[0]).OfType<Dictionary<string, object>>()
                .Select(r => new { name = Convert.ToString(r["display_name"]), percent = Convert.ToDouble(r["percent"]) }).Where(r => r.percent > 0).ToArray() : null;
            object session = window("five_hour"), week = window("seven_day");
            if (session == null && week == null) return null;
            return new
            {
                session, week, opus = window("seven_day_opus"), sonnet = window("seven_day_sonnet"), scoped, rows,
                plan, model, at = DateTime.Now.ToString("o"),
            };
        }
    }
}
