using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace Lampfish
{
    public class WorkshopVariant { public string Variant, Style, A, B; }
    public class WorkshopFamily { public string Key, Name; public List<WorkshopVariant> Variants = new List<WorkshopVariant>(); }

    // The Workshop (C67): cursor families made from a style and two colours. Only those values are kept; the page draws
    // the cursors with cursor-engine.js and Mouse.cs writes them the first time a colour is applied, like any family.
    static class Workshop
    {
        static readonly string[] Styles = { "flat", "glass", "neon", "metal", "photophore", "depth", "nacre" };
        static readonly Regex Name = new Regex(@"^[\p{L}\p{N}][\p{L}\p{N} '-]{0,29}$");
        static readonly Regex Colour = new Regex("^#[0-9a-fA-F]{6}$");

        // ---------- Packs from files (W2) ----------
        // A pack is read, never run: the install.inf of a pack can write anywhere in Windows, so only its list of files
        // is read, to know which cursor goes to which role. Without one, the names of the files tell the roles.
        class Pack { public string Name, Folder; public string[] Files; }
        static Pack pack;
        const long MaxBytes = 30L * 1024 * 1024;

        static void Forget()
        {
            if (pack != null) try { Directory.Delete(pack.Folder, true); } catch { }
            pack = null;
        }

        static void SendPack()
        {
            var roles = Mouse.RoleIds;
            Program.Send(new
            {
                type = "workshop.pack",
                pack = pack == null ? null : new { name = pack.Name, roles = roles.Select((id, i) => new { id, name = Mouse.RoleNames[i], file = pack.Files[i] == null ? null : Path.GetFileName(pack.Files[i]), preview = pack.Files[i] == null ? null : Mouse.PreviewOf(pack.Files[i]) }) },
            });
        }

        static void Load(List<string> files)
        {
            Forget();
            string folder = Path.Combine(Path.GetTempPath(), "lampfish-pack-" + Guid.NewGuid().ToString("N").Substring(0, 8));
            Directory.CreateDirectory(folder);
            string name = null;
            long total = 0;
            try
            {
                foreach (string f in files.Where(File.Exists))
                {
                    string ext = Path.GetExtension(f).ToLowerInvariant();
                    if (ext == ".zip")
                    {
                        name = name ?? Path.GetFileNameWithoutExtension(f);
                        using (var zip = ZipFile.OpenRead(f))
                            foreach (var entry in zip.Entries.Take(400))
                            {
                                string e = Path.GetExtension(entry.Name).ToLowerInvariant();
                                if (entry.Name.Length == 0 || (e != ".cur" && e != ".ani" && e != ".inf")) continue;
                                total += entry.Length;
                                if (total > MaxBytes) break;
                                // Only the file name is kept: a path with ".." in a zip can never reach outside the folder.
                                string target = Path.Combine(folder, Unique(folder, Path.GetFileName(entry.Name)));
                                entry.ExtractToFile(target);
                            }
                    }
                    else if (ext == ".inf" || ext == ".cur" || ext == ".ani")
                    {
                        if (ext == ".inf")
                        {
                            name = name ?? Path.GetFileName(Path.GetDirectoryName(f));
                            // The cursors of an install.inf sit next to it, or in its subfolders.
                            foreach (string c in Directory.GetFiles(Path.GetDirectoryName(f), "*.*", SearchOption.AllDirectories).Where(x => x.EndsWith(".cur", StringComparison.OrdinalIgnoreCase) || x.EndsWith(".ani", StringComparison.OrdinalIgnoreCase)).Take(400))
                            {
                                total += new FileInfo(c).Length;
                                if (total > MaxBytes) break;
                                File.Copy(c, Path.Combine(folder, Unique(folder, Path.GetFileName(c))));
                            }
                        }
                        File.Copy(f, Path.Combine(folder, Unique(folder, Path.GetFileName(f))));
                    }
                }
                var cursors = Directory.GetFiles(folder).Where(x => (x.EndsWith(".cur", StringComparison.OrdinalIgnoreCase) || x.EndsWith(".ani", StringComparison.OrdinalIgnoreCase)) && Mouse.IsCursor(x)).ToList();
                if (cursors.Count == 0) { Directory.Delete(folder, true); Program.Announce("No cursor could be read in these files"); SendPack(); return; }
                var result = new string[Mouse.RoleIds.Length];
                string inf = Directory.GetFiles(folder, "*.inf").FirstOrDefault();
                string schemeName = null;
                if (inf != null) ReadInf(inf, cursors, result, out schemeName);
                Guess(cursors, result);
                pack = new Pack { Name = Clean(schemeName ?? name ?? Language.T("My pack")), Folder = folder, Files = result };
            }
            catch (Exception ex) { Program.Log(ex); try { Directory.Delete(folder, true); } catch { } Program.Announce("These files could not be read as a cursor pack"); }
            SendPack();
        }

        static string Unique(string folder, string file)
        {
            string name = file;
            for (int i = 2; File.Exists(Path.Combine(folder, name)); i++) name = Path.GetFileNameWithoutExtension(file) + " (" + i + ")" + Path.GetExtension(file);
            return name;
        }

        static string Clean(string name)
        {
            name = Regex.Replace(name ?? "", @"[^\p{L}\p{N} '-]", " ").Trim();
            name = Regex.Replace(name, @"\s+", " ");
            return name.Length > 30 ? name.Substring(0, 30).Trim() : name.Length == 0 ? Language.T("My pack") : name;
        }

        // The scheme line of an install.inf lists the files in the order of the roles of Windows, with %names% from [Strings].
        static void ReadInf(string inf, List<string> cursors, string[] result, out string schemeName)
        {
            schemeName = null;
            byte[] raw = File.ReadAllBytes(inf);
            string text = raw.Length > 1 && raw[0] == 0xFF && raw[1] == 0xFE ? Encoding.Unicode.GetString(raw) : Encoding.Default.GetString(raw);
            var strings = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            bool inStrings = false;
            foreach (string line in text.Split('\n').Select(l => l.Trim()))
            {
                if (line.StartsWith("[")) { inStrings = line.Equals("[Strings]", StringComparison.OrdinalIgnoreCase); continue; }
                if (!inStrings) continue;
                int eq = line.IndexOf('=');
                if (eq > 0) strings[line.Substring(0, eq).Trim()] = line.Substring(eq + 1).Trim().Trim('"');
            }
            Func<string, string> expand = v => Regex.Replace(v, "%([^%]+)%", x => { string r; return strings.TryGetValue(x.Groups[1].Value, out r) ? r : x.Value; });
            string scheme = text.Split('\n').FirstOrDefault(l => l.IndexOf(@"Control Panel\Cursors\Schemes", StringComparison.OrdinalIgnoreCase) >= 0);
            if (scheme == null) return;
            var quoted = Regex.Matches(scheme, "\"([^\"]*)\"").Cast<Match>().Select(x => x.Groups[1].Value).ToList();
            if (quoted.Count < 2) return;
            schemeName = expand(quoted[quoted.Count - 2]);
            var list = expand(quoted[quoted.Count - 1]).Split(',');
            for (int i = 0; i < list.Length && i < result.Length; i++)
            {
                string file = Path.GetFileName(list[i].Trim().Replace('/', '\\'));
                if (file.Length == 0) continue;
                result[i] = cursors.FirstOrDefault(c => string.Equals(Path.GetFileName(c), file, StringComparison.OrdinalIgnoreCase));
            }
        }

        // Words that name a role in the files of packs, tried in this order (handwriting before hand, link before hand).
        static readonly string[][] Words =
        {
            new[] { "Arrow", "normal", "arrow", "pointer", "select" }, new[] { "Help", "help", "question" }, new[] { "AppStarting", "working", "appstart", "background", "progress" },
            new[] { "Wait", "busy", "wait", "loading", "hourglass" }, new[] { "Crosshair", "precision", "cross" }, new[] { "IBeam", "text", "beam" },
            new[] { "NWPen", "handwriting", "pen", "writing" }, new[] { "No", "unavailable", "forbidden", "not", "no" }, new[] { "SizeNS", "vert", "sizens", "ns" },
            new[] { "SizeWE", "horz", "horiz", "sizewe", "we" }, new[] { "SizeNWSE", "dgn1", "diag1", "nwse" }, new[] { "SizeNESW", "dgn2", "diag2", "nesw" },
            new[] { "SizeAll", "move", "sizeall" }, new[] { "UpArrow", "alternate", "alt", "up" }, new[] { "Hand", "link", "hand" },
            new[] { "Pin", "location", "pin" }, new[] { "Person", "person" },
        };

        static void Guess(List<string> cursors, string[] result)
        {
            var free = cursors.Where(c => !result.Contains(c)).ToList();
            foreach (int pass in new[] { 0, 1 })
                for (int i = 0; i < result.Length; i++)
                {
                    if (result[i] != null) continue;
                    var words = Words.First(w => w[0] == Mouse.RoleIds[i]).Skip(1);
                    // First pass: a whole word of the name; second: anywhere in the name.
                    string found = free.FirstOrDefault(c =>
                    {
                        string n = Path.GetFileNameWithoutExtension(c).ToLowerInvariant();
                        return words.Any(w => pass == 0 ? Regex.IsMatch(n, "(^|[^a-z])" + w + "($|[^a-z])") : n.Contains(w) && w.Length > 2);
                    });
                    if (found != null) { result[i] = found; free.Remove(found); }
                }
        }

        static List<WorkshopFamily> All { get { return Program.R.Workshop ?? (Program.R.Workshop = new List<WorkshopFamily>()); } }

        // The settings keep the C# names; the page reads lower case, like every other state.
        public static object State()
        {
            return new { accent = Accent(), families = All.Select(f => new { key = f.Key, name = f.Name, variants = f.Variants.Select(v => new { variant = v.Variant, style = v.Style, a = v.A, b = v.B }) }) };
        }

        static string Accent()
        {
            uint colour; bool opaque;
            try { if (DwmGetColorizationColor(out colour, out opaque) == 0) return "#" + (colour & 0xFFFFFF).ToString("x6"); } catch (Exception ex) { Program.Log(ex); }
            return null;
        }

        [System.Runtime.InteropServices.DllImport("dwmapi.dll")] static extern int DwmGetColorizationColor(out uint colour, out bool opaque);

        static string Text(Dictionary<string, object> m, string key)
        {
            object v;
            return m != null && m.TryGetValue(key, out v) && v != null ? v.ToString().Trim() : null;
        }

        public static bool Receive(string action, Dictionary<string, object> m, List<string> files = null)
        {
            switch (action)
            {
                case "drop": Load(files ?? new List<string>()); return false;
                case "pick":
                {
                    using (var dialog = new System.Windows.Forms.OpenFileDialog { Multiselect = true, Title = Language.T("A cursor pack"), Filter = Language.T("Cursor packs") + "|*.zip;*.inf;*.cur;*.ani" })
                        if (dialog.ShowDialog(Program.SettingsWindow) == System.Windows.Forms.DialogResult.OK) Load(dialog.FileNames.ToList());
                    return false;
                }
                case "slot":
                {
                    int i = Array.IndexOf(Mouse.RoleIds, Text(m, "role"));
                    if (pack == null || i < 0) return false;
                    using (var dialog = new System.Windows.Forms.OpenFileDialog { Title = Mouse.RoleNames[i], Filter = Language.T("Cursors") + "|*.cur;*.ani" })
                        if (dialog.ShowDialog(Program.SettingsWindow) == System.Windows.Forms.DialogResult.OK && Mouse.IsCursor(dialog.FileName)) pack.Files[i] = dialog.FileName;
                    SendPack();
                    return false;
                }
                case "clear":
                {
                    int i = Array.IndexOf(Mouse.RoleIds, Text(m, "role"));
                    if (pack == null || i < 0) return false;
                    pack.Files[i] = null;
                    SendPack();
                    return false;
                }
                case "packSave":
                {
                    if (pack == null || pack.Files.All(string.IsNullOrEmpty)) return false;
                    string wanted = Text(m, "name");
                    string name = Mouse.AddPack(string.IsNullOrEmpty(wanted) ? pack.Name : wanted, pack.Files);
                    Forget();
                    SendPack();
                    Program.Announce("“{0}” is in Mouse, under My themes", name);
                    return true;
                }
                case "packReset": Forget(); SendPack(); return false;
                case "save":
                {
                    object raw;
                    var family = m.TryGetValue("family", out raw) ? raw as Dictionary<string, object> : null;
                    string name = Text(family, "name"), key = Text(family, "key");
                    var variants = family != null && family.TryGetValue("variants", out raw) ? raw as ArrayList : null;
                    if (name == null || !Name.IsMatch(name) || variants == null || variants.Count == 0 || variants.Count > 12) return false;
                    var made = new WorkshopFamily { Key = string.IsNullOrEmpty(key) ? "workshop-" + Guid.NewGuid().ToString("N").Substring(0, 8) : key, Name = name };
                    foreach (var item in variants.OfType<Dictionary<string, object>>())
                    {
                        var v = new WorkshopVariant { Variant = Text(item, "variant"), Style = Text(item, "style"), A = Text(item, "a"), B = Text(item, "b") };
                        if (v.Variant == null || !Name.IsMatch(v.Variant) || !Styles.Contains(v.Style) || v.A == null || !Colour.IsMatch(v.A) || v.B == null || !Colour.IsMatch(v.B)) return false;
                        if (made.Variants.Any(x => x.Variant == v.Variant)) return false;
                        made.Variants.Add(v);
                    }
                    // A name is one family: two families of the same name would write into the same folders.
                    if (All.Any(f => f.Key != made.Key && string.Equals(f.Name, name, StringComparison.OrdinalIgnoreCase))) return false;
                    int at = All.FindIndex(f => f.Key == made.Key);
                    if (at >= 0) All[at] = made; else All.Add(made);
                    Program.Announce("“{0}” is in Mouse, under My families", name);
                    return true;
                }
                case "remove":
                {
                    string key = Text(m, "key");
                    int at = All.FindIndex(f => f.Key == key);
                    if (at < 0) return false;
                    var gone = All[at];
                    All.RemoveAt(at);
                    Program.UndoableRemoval(gone.Name, () => { All.Insert(Math.Min(at, All.Count), gone); Program.Save(); Program.SendState(); });
                    return true;
                }
            }
            return false;
        }
    }
}
