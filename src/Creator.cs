using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace Lampfish
{
    static class Creator
    {
        static readonly string Template = Path.Combine(Program.Root, "app", "templates", "custom.html");
        static readonly Regex AllowedFile = new Regex(@"^(logo|background)\.(png|jpg|jpeg|webp)$", RegexOptions.IgnoreCase);
        static readonly JavaScriptSerializer Serializer = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };

        static string Clean(string name)
        {
            name = Regex.Replace(name ?? "", @"[^\p{L}\p{N} _\-]", "").Trim();
            return name.Length > 40 ? name.Substring(0, 40).Trim() : name;
        }

        static string Text(Dictionary<string, object> m, string key)
        {
            object v;
            return m.TryGetValue(key, out v) && v != null ? v.ToString() : "";
        }

        static string FreeName(string name)
        {
            string result = name;
            for (int i = 2; Directory.Exists(Path.Combine(Program.WallpapersFolder, result)) || File.Exists(Path.Combine(Program.WallpapersFolder, result)); i++)
                result = name + " " + i;
            return result;
        }

        static bool IsCustom(string name)
        {
            return !string.IsNullOrEmpty(name) && name.IndexOfAny(new[] { '\\', '/', ':' }) < 0 && name != ".." && name != "."
                && File.Exists(Path.Combine(Program.WallpapersFolder, name, "config.json"));
        }

        static byte[] Decode(string dataUrl)
        {
            int comma = dataUrl == null ? -1 : dataUrl.IndexOf(',');
            if (comma < 0 || !dataUrl.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase)) return null;
            return Convert.FromBase64String(dataUrl.Substring(comma + 1));
        }

        static string Encode(string path)
        {
            string ext = Path.GetExtension(path).TrimStart('.').ToLowerInvariant();
            string mime = ext == "jpg" ? "jpeg" : ext;
            return "data:image/" + mime + ";base64," + Convert.ToBase64String(File.ReadAllBytes(path));
        }

        static void Open(string name)
        {
            if (!IsCustom(name)) return;
            string folder = Path.Combine(Program.WallpapersFolder, name);
            object config = null;
            try { config = Serializer.DeserializeObject(File.ReadAllText(Path.Combine(folder, "config.json"))); }
            catch (Exception ex) { Program.Log(ex); return; }
            Func<string, string> find = prefix =>
            {
                var file = Directory.GetFiles(folder).FirstOrDefault(f => AllowedFile.IsMatch(Path.GetFileName(f)) && Path.GetFileName(f).StartsWith(prefix, StringComparison.OrdinalIgnoreCase));
                return file == null ? null : Encode(file);
            };
            Program.Send(new { type = "creator.opened", name = name, config = config, logo = find("logo"), background = find("background") });
        }

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            if (action == "open") { Open(Text(m, "name")); return false; }
            if (action != "create" || !File.Exists(Template)) return false;

            string replace = Text(m, "replace");
            bool overwrite = IsCustom(replace);
            string name = overwrite ? replace : Clean(Text(m, "name"));
            if (name.Length == 0) name = Language.T("My wallpaper");
            if (!overwrite) name = FreeName(name);
            string folder = Path.Combine(Program.WallpapersFolder, name);

            try
            {
                Directory.CreateDirectory(folder);
                File.Copy(Template, Path.Combine(folder, "index.html"), true);
                File.WriteAllText(Path.Combine(folder, "config.json"), Serializer.Serialize(m["config"]));
                if (overwrite)
                    foreach (var old in Directory.GetFiles(folder).Where(f => AllowedFile.IsMatch(Path.GetFileName(f))))
                        File.Delete(old);
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
                if (!overwrite) try { if (Directory.Exists(folder)) Directory.Delete(folder, true); } catch { }
                Program.Announce("The wallpaper could not be created");
                return false;
            }

            Program.R.Wallpaper = name;
            Program.WallpaperChanged();
            Program.Announce(overwrite ? "{0} saved" : "{0} created", name);
            return true;
        }
    }
}
