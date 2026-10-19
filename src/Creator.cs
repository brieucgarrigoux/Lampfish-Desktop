using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace Bramble
{
    static class Creator
    {
        static readonly string Template = Path.Combine(Program.Root, "app", "templates", "custom.html");
        static readonly Regex AllowedFile = new Regex(@"^(logo|background)\.(png|jpg|jpeg|webp)$", RegexOptions.IgnoreCase);

        static string Clean(string name)
        {
            name = Regex.Replace(name ?? "", @"[^\p{L}\p{N} _\-]", "").Trim();
            return name.Length > 40 ? name.Substring(0, 40).Trim() : name;
        }

        static string FreeName(string name)
        {
            string result = name;
            for (int i = 2; Directory.Exists(Path.Combine(Program.WallpapersFolder, result)) || File.Exists(Path.Combine(Program.WallpapersFolder, result)); i++)
                result = name + " " + i;
            return result;
        }

        static byte[] Decode(string dataUrl)
        {
            int comma = dataUrl == null ? -1 : dataUrl.IndexOf(',');
            if (comma < 0 || !dataUrl.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase)) return null;
            return Convert.FromBase64String(dataUrl.Substring(comma + 1));
        }

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            if (action != "create" || !File.Exists(Template)) return false;
            string name = Clean(m.ContainsKey("name") ? m["name"] as string : "");
            if (name.Length == 0) name = Language.T("My wallpaper");
            name = FreeName(name);
            string folder = Path.Combine(Program.WallpapersFolder, name);

            try
            {
                Directory.CreateDirectory(folder);
                File.Copy(Template, Path.Combine(folder, "index.html"));
                var serializer = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
                File.WriteAllText(Path.Combine(folder, "config.json"), serializer.Serialize(m["config"]));
                var files = m.ContainsKey("files") ? m["files"] as IEnumerable : null;
                if (files != null)
                    foreach (var item in files.OfType<Dictionary<string, object>>())
                    {
                        string file = item["name"] as string;
                        if (file == null || !AllowedFile.IsMatch(file)) continue;
                        byte[] bytes = Decode(item["data"] as string);
                        if (bytes != null) File.WriteAllBytes(Path.Combine(folder, file.ToLowerInvariant()), bytes);
                    }
            }
            catch (Exception ex)
            {
                Program.Log(ex);
                try { if (Directory.Exists(folder)) Directory.Delete(folder, true); } catch { }
                Program.Announce("The wallpaper could not be created");
                return false;
            }

            Program.R.Wallpaper = name;
            Program.WallpaperChanged();
            Program.Announce("{0} created", name);
            return true;
        }
    }
}
