using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using Microsoft.Win32;

namespace Lampfish
{
    // Up to 0.4 the app was called Bramble. This pass moves what those versions left on the PC, so an update asks nothing of the user.
    // Every step can run twice: a step that fails is tried again on the next start.
    static class Migration
    {
        public const string OldExe = "Bramble.exe";
        public const string OldShortcut = "Bramble.lnk";
        public const string OldThemeKey = "bramble";
        public const string OldCursorScheme = "Bramble";
        const string OldName = "Bramble";
        const string OldMenu = @"Software\Classes\Directory\shell\Bramble.Icon";
        const string CursorsKey = @"Control Panel\Cursors";
        const string ApprovedKey = @"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
        const string ThemesFolder = @"\app\cursor-themes\";

        static readonly Dictionary<string, string> Names = new Dictionary<string, string>
        {
            { "bramble-logo.html", "lampfish-logo.html" }, { "bramble-dusk.html", "lampfish-dusk.html" }, { "bramble.html", "lampfish.html" },
            { "Bramble Glass", "Lampfish Glass" }, { "Bramble Night", "Lampfish Night" }, { "Bramble Snow", "Lampfish Snow" }, { "Bramble Berry", "Lampfish Violet" },
        };

        static readonly string[][] WallpaperWords =
        {
            new[] { "m.bramble ===", "m.lampfish ===" }, new[] { "{ bramble: 'ready' }", "{ lampfish: 'ready' }" },
            new[] { "brand/logo/berry-color.png", "brand/logo/sticker-lampfish.png" },
        };

        public static string Renamed(string name)
        {
            string now;
            return name != null && Names.TryGetValue(name, out now) ? now : name;
        }

        public static void Run()
        {
            string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string data = Path.Combine(local, "Lampfish"), done = Path.Combine(data, "renamed");
            if (File.Exists(done)) return;
            string former = FormerRoot(local);
            bool clean = Step(() => MoveData(Path.Combine(local, OldName), data));
            clean &= Step(() => MoveSettings(former));
            clean &= Step(() => MoveFolderIcons(former));
            clean &= Step(MoveWallpapers);
            clean &= Step(() => MoveCursors(former));
            clean &= Step(MoveStartup);
            clean &= Step(MoveMenu);
            if (!clean) return;
            Directory.CreateDirectory(data);
            File.WriteAllText(done, "");
        }

        static bool Step(Action step)
        {
            try { step(); return true; }
            catch (Exception ex) { Program.Log(ex); return false; }
        }

        static string Value(string key, string name)
        {
            using (var k = Registry.CurrentUser.OpenSubKey(key)) return k == null ? null : k.GetValue(name) as string;
        }

        // Nothing records where the app used to be: the paths it wrote in the registry say it, and an install has a known place.
        static string FormerRoot(string local)
        {
            foreach (string text in new[] { Value(CursorsKey, "Arrow"), Value(Program.StartupKey, OldName), Value(OldMenu + @"\command", "") })
            {
                Match m = Regex.Match(text ?? "", @"^""?(.+?)\\(?:" + Regex.Escape(OldExe) + "|" + Regex.Escape(ThemesFolder.Substring(1)) + ")", RegexOptions.IgnoreCase);
                if (m.Success && !m.Groups[1].Value.Equals(Program.Root, StringComparison.OrdinalIgnoreCase)) return m.Groups[1].Value;
            }
            string installed = Path.Combine(local, "Programs", OldName);
            return installed.Equals(Program.Root, StringComparison.OrdinalIgnoreCase) ? null : installed;
        }

        static void MoveData(string from, string to)
        {
            if (!Directory.Exists(from)) return;
            Directory.CreateDirectory(to);
            foreach (string entry in Directory.GetFileSystemEntries(from))
            {
                string target = Path.Combine(to, Path.GetFileName(entry));
                if (File.Exists(target) || Directory.Exists(target)) continue;
                Retry(() =>
                {
                    if (Directory.Exists(entry)) Directory.Move(entry, target);
                    else File.Move(entry, target);
                });
            }
            if (!Directory.EnumerateFileSystemEntries(from).Any()) Directory.Delete(from);
            foreach (string file in Directory.GetFiles(to, "settings.json", SearchOption.TopDirectoryOnly)
                .Concat(Directory.GetDirectories(to).Where(d => Path.GetFileName(d) != "EBWebView").SelectMany(d => Directory.GetFiles(d, "*.json"))))
            {
                string text = File.ReadAllText(file), moved = Rooted(text, from, to);
                if (moved != text) File.WriteAllText(file, moved);
            }
        }

        // The web engine can still hold its folder for a moment after the old version quit.
        static void Retry(Action action)
        {
            for (int i = 0; ; i++)
            {
                try { action(); return; }
                catch (IOException) { if (i >= 20) throw; }
                catch (UnauthorizedAccessException) { if (i >= 20) throw; }
                Thread.Sleep(250);
            }
        }

        static string Quoted(string path)
        {
            return new JavaScriptSerializer().Serialize(path).Trim('"');
        }

        static string Rooted(string text, string from, string to)
        {
            string quoted = Quoted(to);
            return Regex.Replace(text, Regex.Escape(Quoted(from)) + @"(?=\\\\|"")", m => m.Value == m.Value.ToLowerInvariant() ? quoted.ToLowerInvariant() : quoted, RegexOptions.IgnoreCase);
        }

        static void MoveSettings(string former)
        {
            string file = Path.Combine(Program.Root, "settings.json");
            if (!File.Exists(file)) return;
            string text = File.ReadAllText(file), moved = text;
            foreach (var n in Names) moved = moved.Replace("\"" + n.Key + "\"", "\"" + n.Value + "\"");
            if (former != null) moved = Rooted(moved, former, Program.Root);
            if (moved == text) return;
            File.Copy(file, file + ".bak", true);
            string temporary = file + ".tmp";
            File.WriteAllText(temporary, moved);
            File.Replace(temporary, file, null);
        }

        static void MoveFolderIcons(string former)
        {
            string file = Path.Combine(Program.Root, "settings.json");
            if (former == null || !File.Exists(file)) return;
            var settings = new JavaScriptSerializer { MaxJsonLength = int.MaxValue }.Deserialize<Settings>(File.ReadAllText(file));
            var folders = new List<string>(settings.Icons.Customized);
            if (settings.Folders != null) folders.AddRange(settings.Folders.Customized);
            Icons.FollowRoot(folders, former);
        }

        // A wallpaper made in Create is a copy of the template, with the words of the version that made it.
        static void MoveWallpapers()
        {
            if (!Directory.Exists(Program.WallpapersFolder)) return;
            foreach (string file in Directory.GetFiles(Program.WallpapersFolder, "*.*", SearchOption.AllDirectories))
            {
                string kind = Path.GetExtension(file).ToLowerInvariant();
                if (kind != ".html" && kind != ".json") continue;
                string text = File.ReadAllText(file), moved = text;
                foreach (string[] w in WallpaperWords) moved = moved.Replace(w[0], w[1]);
                if (moved != text) File.WriteAllText(file, moved, new UTF8Encoding(false));
            }
        }

        static string MoveCursor(string path, string former)
        {
            int at = path.IndexOf(ThemesFolder, StringComparison.OrdinalIgnoreCase);
            if (at >= 0)
            {
                string rest = path.Substring(at + ThemesFolder.Length);
                int slash = rest.IndexOf('\\');
                if (slash > 0) return Program.Root + ThemesFolder + Renamed(rest.Substring(0, slash)) + rest.Substring(slash);
            }
            if (former != null && path.StartsWith(former + "\\", StringComparison.OrdinalIgnoreCase)) return Program.Root + path.Substring(former.Length);
            return path;
        }

        static void MoveCursors(string former)
        {
            bool changed = false;
            using (var key = Registry.CurrentUser.OpenSubKey(CursorsKey, true))
            {
                if (key == null) return;
                foreach (string name in key.GetValueNames())
                {
                    string value = key.GetValue(name, null, RegistryValueOptions.DoNotExpandEnvironmentNames) as string;
                    if (value == null) continue;
                    string now = name.Length == 0 ? Renamed(value) : MoveCursor(value, former);
                    if (now == value) continue;
                    if (name.Length == 0) key.SetValue(name, now);
                    else key.SetValue(name, now, RegistryValueKind.ExpandString);
                    changed = true;
                }
            }
            using (var schemes = Registry.CurrentUser.OpenSubKey(CursorsKey + @"\Schemes", true))
                if (schemes != null)
                    foreach (string name in schemes.GetValueNames())
                    {
                        string row = schemes.GetValue(name, null, RegistryValueOptions.DoNotExpandEnvironmentNames) as string;
                        if (row == null) continue;
                        string now = string.Join(",", row.Split(',').Select(p => MoveCursor(p, former))), title = Renamed(name);
                        if (now == row && title == name) continue;
                        schemes.SetValue(title, now, RegistryValueKind.ExpandString);
                        if (title != name) schemes.DeleteValue(name, false);
                    }
            if (changed) Mouse.Reload();
        }

        static void MoveStartup()
        {
            // Windows keeps "turned off in Task Manager" under the name of the startup value.
            using (var approved = Registry.CurrentUser.OpenSubKey(ApprovedKey, true))
            {
                object state = approved == null ? null : approved.GetValue(OldName);
                if (state != null)
                {
                    approved.SetValue("Lampfish", state, RegistryValueKind.Binary);
                    approved.DeleteValue(OldName, false);
                }
            }
            using (var key = Registry.CurrentUser.OpenSubKey(Program.StartupKey, true))
            {
                if (key == null || key.GetValue(OldName) == null) return;
                key.SetValue("Lampfish", "\"" + System.Windows.Forms.Application.ExecutablePath + "\" --background");
                key.DeleteValue(OldName, false);
            }
        }

        static void MoveMenu()
        {
            string verb = Value(OldMenu, "MUIVerb");
            if (verb == null) return;
            Icons.WriteMenu(verb.Replace(OldName, "lampfish"));
            Registry.CurrentUser.DeleteSubKeyTree(OldMenu, false);
        }
    }
}
