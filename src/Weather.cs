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
        static bool running, stale;
        static double lat, lon;
        static string city;
        static int searches;

        public static void Receive(string action, Dictionary<string, object> m)
        {
            switch (action)
            {
                case "weather": Fetch(); return;
                case "search": Search(m.ContainsKey("query") ? (m["query"] as string ?? "").Trim() : ""); return;
                case "place":
                    double a = Number(m, "latitude"), b = Number(m, "longitude");
                    string name = m.ContainsKey("name") ? m["name"] as string : null, label = m.ContainsKey("label") ? m["label"] as string : null;
                    if (double.IsNaN(a) || double.IsNaN(b) || Math.Abs(a) > 90 || Math.Abs(b) > 180 || string.IsNullOrWhiteSpace(name)) return;
                    Program.R.WeatherPlace = new WeatherPlace { Name = Cut(name, 80), Label = Cut(label ?? name, 160), Latitude = a, Longitude = b };
                    break;
                case "automatic": Program.R.WeatherPlace = null; break;
                default: return;
            }
            last = null;
            city = null;
            if (running) stale = true;
            Program.Save();
            Program.SendState();
            Fetch();
        }

        static string Cut(string s, int max) { s = s.Trim(); return s.Length > max ? s.Substring(0, max) : s; }

        static void Fetch()
        {
            if (!Program.R.Weather) { Program.Send(new { type = "home.weather", ok = false }); return; }
            if (last != null && (DateTime.Now - when).TotalMinutes < 15) { Program.Send(last); return; }
            if (running) return;
            running = true;
            Task.Run(() => Read()).ContinueWith(t => Program.OnInterface(() =>
            {
                running = false;
                if (stale) { stale = false; city = null; Fetch(); return; }
                if (t.IsFaulted) { Program.Log(t.Exception); Program.Send(new { type = "home.weather", ok = false }); return; }
                last = t.Result;
                when = DateTime.Now;
                Program.Send(last);
            }));
        }

        static void Search(string query)
        {
            int ticket = ++searches;
            if (query.Length < 2) { Program.Send(new { type = "home.places", places = new object[0] }); return; }
            string url = "https://geocoding-api.open-meteo.com/v1/search?count=6&format=json&language=" + Language.Code + "&name=" + Uri.EscapeDataString(Cut(query, 80));
            Task.Run(() =>
            {
                var r = json.Deserialize<Dictionary<string, object>>(Download(url, null));
                var list = r.ContainsKey("results") ? r["results"] as System.Collections.ArrayList : null;
                var places = new List<object>();
                if (list != null)
                    foreach (Dictionary<string, object> p in list)
                    {
                        Func<string, string> text = key => p.ContainsKey(key) && p[key] != null ? p[key].ToString() : "";
                        var parts = new List<string> { text("name") };
                        foreach (string part in new[] { text("admin1"), text("country") })
                            if (part.Length > 0 && !parts.Contains(part)) parts.Add(part);
                        places.Add(new { name = text("name"), label = string.Join(", ", parts), latitude = Number(p, "latitude"), longitude = Number(p, "longitude") });
                    }
                return places;
            }).ContinueWith(t => Program.OnInterface(() =>
            {
                if (ticket != searches) return;
                if (t.IsFaulted) { Program.Log(t.Exception); Program.Send(new { type = "home.places", failed = true, places = new object[0] }); return; }
                Program.Send(new { type = "home.places", places = t.Result });
            }));
        }

        static string Download(string url, string referer)
        {
            var request = (HttpWebRequest)WebRequest.Create(url);
            request.Timeout = 8000;
            request.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) lampfish";
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

        // The Cloudflare endpoint is undocumented, so country.is (open source, free, no key) takes over when it fails.
        static void Locate()
        {
            var chosen = Program.R.WeatherPlace;
            if (chosen != null) { lat = chosen.Latitude; lon = chosen.Longitude; city = chosen.Name; return; }
            try
            {
                var m = json.Deserialize<Dictionary<string, object>>(Download("https://speed.cloudflare.com/meta", "https://speed.cloudflare.com/"));
                lat = Number(m, "latitude");
                lon = Number(m, "longitude");
                if (!double.IsNaN(lat) && !double.IsNaN(lon)) { city = m.ContainsKey("city") && m["city"] != null ? m["city"].ToString() : ""; return; }
            }
            catch (Exception ex) { Program.Log(ex); }
            var c = json.Deserialize<Dictionary<string, object>>(Download("https://api.country.is/?fields=city,location", null));
            var place = c.ContainsKey("location") ? c["location"] as Dictionary<string, object> : null;
            lat = Number(place, "latitude");
            lon = Number(place, "longitude");
            if (double.IsNaN(lat) || double.IsNaN(lon)) throw new Exception("No location found for the weather");
            city = c.ContainsKey("city") && c["city"] != null ? c["city"].ToString() : "";
        }

        static object Read()
        {
            if (city == null) Locate();
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
