using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace Bramble
{
    class NotesSettings
    {
        public string Folder;
    }

    // Plain Markdown files in one folder: Bramble's own, or a folder of an Obsidian vault so that the notes land there as they are written.
    static class Notes
    {
        public const string Host = "notes.example";
        static readonly JavaScriptSerializer json = new JavaScriptSerializer();
        static NotesSettings S = new NotesSettings();
        static FileSystemWatcher watcher;
        static Timer changed;
        static readonly UTF8Encoding Utf8 = new UTF8Encoding(false);

        static string SettingsFile { get { return Path.Combine(Program.DataFolder("Notes"), "settings.json"); } }
        public static string DefaultFolder { get { return Path.Combine(Program.DataFolder("Notes"), "notes"); } }

        public static string Folder
        {
            get
            {
                string folder = !string.IsNullOrEmpty(S.Folder) && Directory.Exists(S.Folder) ? S.Folder : DefaultFolder;
                Directory.CreateDirectory(folder);
                return folder;
            }
        }

        public static void Start()
        {
            try { if (File.Exists(SettingsFile)) S = json.Deserialize<NotesSettings>(File.ReadAllText(SettingsFile)) ?? new NotesSettings(); }
            catch (Exception ex) { Program.Log(ex); }
            changed = new Timer { Interval = 400 };
            changed.Tick += (s, e) => { changed.Stop(); SendList(); };
            Watch();
        }

        static void Save()
        {
            try { File.WriteAllText(SettingsFile, json.Serialize(S)); }
            catch (Exception ex) { Program.Log(ex); }
        }

        // Edits made in Obsidian or File Explorer show up in Bramble.
        static void Watch()
        {
            if (watcher != null) { watcher.EnableRaisingEvents = false; watcher.Dispose(); watcher = null; }
            try
            {
                watcher = new FileSystemWatcher(Folder, "*.md") { NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite, IncludeSubdirectories = false };
                FileSystemEventHandler any = (s, e) => Program.OnInterface(() => { if (changed != null) { changed.Stop(); changed.Start(); } });
                watcher.Changed += any; watcher.Created += any; watcher.Deleted += any;
                watcher.Renamed += (s, e) => any(s, null);
                watcher.EnableRaisingEvents = true;
            }
            catch (Exception ex) { Program.Log(ex); }
        }

        // A file name from a title: no folder, no character Windows refuses, never a reserved device name.
        public static string Clean(string title)
        {
            string name = new string((title ?? "").Where(c => !Path.GetInvalidFileNameChars().Contains(c) && c >= ' ').ToArray()).Trim().TrimEnd('.').Trim();
            if (name.Length > 120) name = name.Substring(0, 120).Trim();
            if (name.Length == 0) name = Language.T("Untitled");
            if (Regex.IsMatch(name, @"^(con|prn|aux|nul|com\d|lpt\d)$", RegexOptions.IgnoreCase)) name = "_" + name;
            return name;
        }

        static string PathOf(string name)
        {
            string path = Path.GetFullPath(Path.Combine(Folder, Clean(name) + ".md"));
            return Path.GetDirectoryName(path).Equals(Path.GetFullPath(Folder).TrimEnd('\\'), StringComparison.OrdinalIgnoreCase) ? path : null;
        }

        static string Unique(string name)
        {
            string clean = Clean(name), candidate = clean;
            for (int i = 2; File.Exists(Path.Combine(Folder, candidate + ".md")); i++) candidate = clean + " " + i;
            return candidate;
        }

        static long Stamp(string path) { return File.GetLastWriteTimeUtc(path).Ticks; }

        static string Preview(string path)
        {
            try
            {
                using (var reader = new StreamReader(path, Encoding.UTF8))
                {
                    string line;
                    int read = 0;
                    while ((line = reader.ReadLine()) != null && read++ < 40)
                    {
                        string text = Regex.Replace(line, @"^\s*(#+|[-*+]\s+\[[ xX]\]|[-*+>]|\d+\.)\s*", "").Replace("**", "").Replace("`", "").Trim();
                        if (text.Length > 0 && text != "---") return text.Length > 140 ? text.Substring(0, 140) : text;
                    }
                }
            }
            catch { }
            return "";
        }

        public static object[] Items()
        {
            try
            {
                return new DirectoryInfo(Folder).GetFiles("*.md").OrderByDescending(f => f.LastWriteTimeUtc)
                    .Select(f => (object)new { name = Path.GetFileNameWithoutExtension(f.Name), modified = f.LastWriteTimeUtc.Ticks.ToString(), when = f.LastWriteTime.ToString("o"), preview = Preview(f.FullName) }).ToArray();
            }
            catch (Exception ex) { Program.Log(ex); return new object[0]; }
        }

        // Vaults Obsidian knows, read from its own list; nothing is written there.
        static object[] Vaults()
        {
            try
            {
                string file = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "obsidian", "obsidian.json");
                if (!File.Exists(file)) return new object[0];
                var data = json.Deserialize<Dictionary<string, object>>(File.ReadAllText(file));
                var vaults = data.ContainsKey("vaults") ? data["vaults"] as IDictionary : null;
                if (vaults == null) return new object[0];
                return vaults.Values.OfType<Dictionary<string, object>>().Select(v => v.ContainsKey("path") ? Convert.ToString(v["path"]) : null)
                    .Where(p => !string.IsNullOrEmpty(p) && Directory.Exists(p)).Distinct(StringComparer.OrdinalIgnoreCase)
                    .Select(p => (object)new { name = Path.GetFileName(p.TrimEnd('\\')), path = p }).ToArray();
            }
            catch (Exception ex) { Program.Log(ex); return new object[0]; }
        }

        // For the card of Home: a count and the last note, without reading every file.
        public static object Summary()
        {
            try
            {
                var files = new DirectoryInfo(Folder).GetFiles("*.md");
                var last = files.OrderByDescending(f => f.LastWriteTimeUtc).FirstOrDefault();
                return new { count = files.Length, last = last == null ? null : Path.GetFileNameWithoutExtension(last.Name) };
            }
            catch { return new { count = 0, last = (string)null }; }
        }

        public static void SendList()
        {
            string folder = Folder;
            Program.Send(new { type = "notes.list", folder, isDefault = folder.Equals(DefaultFolder, StringComparison.OrdinalIgnoreCase), vaults = Vaults(), items = Items() });
        }

        static string Text(Dictionary<string, object> m, string key) { return m.ContainsKey(key) && m[key] != null ? Convert.ToString(m[key]) : ""; }

        // Writes through a temporary file, so a crash never leaves half a note.
        static void Write(string path, string text)
        {
            string temp = path + ".tmp";
            File.WriteAllText(temp, text, Utf8);
            if (File.Exists(path)) File.Replace(temp, path, null); else File.Move(temp, path);
        }

        public static string Add(string title, string text)
        {
            string name = Unique(string.IsNullOrWhiteSpace(title) ? Language.T("Note {0}", DateTime.Now.ToString("yyyy-MM-dd HH.mm")) : title);
            Write(Path.Combine(Folder, name + ".md"), text ?? "");
            return name;
        }

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            switch (action)
            {
                case "list": SendList(); return false;
                case "read":
                {
                    string path = PathOf(Text(m, "name"));
                    if (path == null || !File.Exists(path)) { SendList(); return false; }
                    Program.Send(new { type = "notes.note", name = Path.GetFileNameWithoutExtension(path), text = File.ReadAllText(path, Encoding.UTF8), modified = Stamp(path).ToString() });
                    return false;
                }
                case "save":
                {
                    string path = PathOf(Text(m, "name"));
                    if (path == null) return false;
                    long known = m.ContainsKey("modified") ? Convert.ToInt64(m["modified"]) : 0;
                    // Changed in another app since it was opened here: nothing is overwritten, the page asks.
                    if (known != 0 && File.Exists(path) && Stamp(path) != known && !(m.ContainsKey("force") && Convert.ToBoolean(m["force"])))
                    {
                        Program.Send(new { type = "notes.conflict", name = Path.GetFileNameWithoutExtension(path) });
                        return false;
                    }
                    try { Write(path, Text(m, "text")); }
                    catch (Exception ex) { Program.Log(ex); Program.Send(new { type = "notes.error", name = Path.GetFileNameWithoutExtension(path) }); return false; }
                    Program.Send(new { type = "notes.saved", name = Path.GetFileNameWithoutExtension(path), modified = Stamp(path).ToString() });
                    return false;
                }
                case "create":
                {
                    string name = Add(Text(m, "title"), Text(m, "text"));
                    Program.Send(new { type = "notes.created", name });
                    SendList();
                    return false;
                }
                case "rename":
                {
                    string from = PathOf(Text(m, "name")), to = Clean(Text(m, "to"));
                    if (from == null || !File.Exists(from)) return false;
                    string target = PathOf(to);
                    if (target == null || target.Equals(from, StringComparison.OrdinalIgnoreCase)) return false;
                    if (File.Exists(target)) { Program.Send(new { type = "notes.renamed", name = Path.GetFileNameWithoutExtension(from), taken = true }); return false; }
                    File.Move(from, target);
                    Program.Send(new { type = "notes.renamed", name = to });
                    SendList();
                    return false;
                }
                case "remove":
                {
                    string path = PathOf(Text(m, "name"));
                    if (path == null || !File.Exists(path)) return false;
                    Program.SetAside(path, Path.GetFileNameWithoutExtension(path), SendList);
                    SendList();
                    return true;
                }
                case "folder":
                {
                    string next = Text(m, "path");
                    if (next == "pick")
                    {
                        using (var dialog = new FolderBrowserDialog { Description = Language.T("Folder for the notes"), ShowNewFolderButton = true })
                        {
                            if (dialog.ShowDialog(Program.SettingsWindow) != DialogResult.OK) return false;
                            next = dialog.SelectedPath;
                        }
                    }
                    // A vault gets the notes in its own Bramble folder, next to the user's notes, never mixed with them.
                    if (m.ContainsKey("vault") && Convert.ToBoolean(m["vault"])) next = Path.Combine(next, "Bramble");
                    string before = Folder;
                    try { if (!string.IsNullOrEmpty(next)) Directory.CreateDirectory(next); }
                    catch (Exception ex) { Program.Log(ex); Program.Announce("This folder cannot be used for the notes"); return true; }
                    S.Folder = string.IsNullOrEmpty(next) ? null : next;
                    int moved = 0;
                    if (m.ContainsKey("move") && Convert.ToBoolean(m["move"]) && !before.Equals(Folder, StringComparison.OrdinalIgnoreCase))
                        foreach (string file in Directory.GetFiles(before, "*.md"))
                        {
                            string target = Path.Combine(Folder, Path.GetFileName(file));
                            if (File.Exists(target)) continue;
                            try { File.Move(file, target); moved++; } catch (Exception ex) { Program.Log(ex); }
                        }
                    Save();
                    Watch();
                    Program.MapNotes();
                    if (moved > 0) Program.Announce(moved == 1 ? "1 note moved" : "{0} notes moved", moved);
                    SendList();
                    return true;
                }
                case "reveal":
                    System.Diagnostics.Process.Start("explorer.exe", "\"" + Folder + "\"");
                    return false;
                case "link":
                {
                    Uri uri;
                    if (Uri.TryCreate(Text(m, "url"), UriKind.Absolute, out uri) && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps))
                        try { System.Diagnostics.Process.Start(uri.AbsoluteUri); } catch (Exception ex) { Program.Log(ex); }
                    return false;
                }
            }
            return false;
        }
    }
}
