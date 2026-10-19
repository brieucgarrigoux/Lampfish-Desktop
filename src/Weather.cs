using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace Bramble
{
    static class Weather
    {
        static readonly JavaScriptSerializer json = new JavaScriptSerializer();
        static object last;
        static DateTime when = DateTime.MinValue;
        static bool running;
        static double lat, lon;
        static string city;

        public static void Receive(string action)
        {
            if (action != "weather") return;
            if (!Program.R.Weather) { Program.Send(new { type = "home.weather", ok = false }); return; }
            if (last != null && (DateTime.Now - when).TotalMinutes < 15) { Program.Send(last); return; }
            if (running) return;
            running = true;
            Task.Run(() => Read()).ContinueWith(t => Program.OnInterface(() =>
            {
                running = false;
                if (t.IsFaulted) { Program.Log(t.Exception); Program.Send(new { type = "home.weather", ok = false }); return; }
                last = t.Result;
                when = DateTime.Now;
                Program.Send(last);
            }));
        }

        static string Download(string url, string referer)
        {
            var request = (HttpWebRequest)WebRequest.Create(url);
            request.Timeout = 8000;
            request.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Bramble";
            if (referer != null) request.Referer = referer;
            using (var response = request.GetResponse())
            using (var player = new StreamReader(response.GetResponseStream()))
                return player.ReadToEnd();
        }

        static double Number(Dictionary<string, object> d, string key)
        {
            object v;
            return d != null && d.TryGetValue(key, out v) && v != null ? Convert.ToDouble(v, CultureInfo.InvariantCulture) : double.NaN;
        }

        static object Read()
        {
            if (city == null)
            {
                var m = json.Deserialize<Dictionary<string, object>>(Download("https://speed.cloudflare.com/meta", "https://speed.cloudflare.com/"));
                lat = Number(m, "latitude");
                lon = Number(m, "longitude");
                city = m.ContainsKey("city") && m["city"] != null ? m["city"].ToString() : "";
            }
            string url = string.Format(CultureInfo.InvariantCulture,
                "https://api.open-meteo.com/v1/forecast?latitude={0:0.###}&longitude={1:0.###}&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1",
                lat, lon);
            var r = json.Deserialize<Dictionary<string, object>>(Download(url, null));
            var current = r["current"] as Dictionary<string, object>;
            var day = r["daily"] as Dictionary<string, object>;
            Func<string, double> first = key =>
            {
                var list = day != null && day.ContainsKey(key) ? day[key] as System.Collections.ArrayList : null;
                return list != null && list.Count > 0 && list[0] != null ? Convert.ToDouble(list[0], CultureInfo.InvariantCulture) : double.NaN;
            };
            return new
            {
                type = "home.weather", ok = true, city = city,
                temperature = Math.Round(Number(current, "temperature_2m")),
                feels = Math.Round(Number(current, "apparent_temperature")),
                code = (int)Number(current, "weather_code"),
                day = Number(current, "is_day") == 1,
                wind = Math.Round(Number(current, "wind_speed_10m")),
                humidity = Math.Round(Number(current, "relative_humidity_2m")),
                max = Math.Round(first("temperature_2m_max")),
                min = Math.Round(first("temperature_2m_min")),
                rain = first("precipitation_probability_max"),
            };
        }
    }
}
