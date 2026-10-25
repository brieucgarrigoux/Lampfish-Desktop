using System;
using System.Collections.Generic;
using System.Collections.Specialized;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Windows.Forms;

namespace Bramble
{
    // A place to keep captures and files at hand. Files are copied in, never moved, so the originals stay where they were.
    static class Shelf
    {
        public const string Host = "shelf.example";
        static readonly string[] Images = { ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp" };
        static readonly Dictionary<string, string> icons = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        public static string Folder { get { string f = Path.Combine(Program.DataFolder("Shelf"), "files"); Directory.CreateDirectory(f); return f; } }

        static string Kind(FileInfo f)
        {
            string ext = f.Extension.ToLowerInvariant();
            if (Images.Contains(ext)) return f.Name.StartsWith("Capture ", StringComparison.Ordinal) && ext == ".png" ? "capture" : "image";
            return ext == ".pdf" ? "pdf" : "other";
        }

        static string IconFor(FileInfo f)
        {
            string icon;
            if (icons.TryGetValue(f.Extension, out icon)) return icon;
            try { icon = Tasks.IconOf(f.FullName); } catch (Exception ex) { Program.Log(ex); icon = null; }
            return icons[f.Extension] = icon;
        }

        public static object[] Items()
        {
            try
            {
                return new DirectoryInfo(Folder).GetFiles().Where(f => (f.Attributes & FileAttributes.Hidden) == 0).OrderByDescending(f => f.LastWriteTimeUtc).Select(f =>
                {
                    string kind = Kind(f);
                    bool image = kind == "capture" || kind == "image";
                    return (object)new
                    {
                        name = f.Name, kind, size = f.Length, when = f.LastWriteTime.ToString("o"),
                        url = image ? "https://" + Host + "/" + Uri.EscapeDataString(f.Name) + "?v=" + f.LastWriteTimeUtc.Ticks : null,
                        icon = image ? null : IconFor(f),
                    };
                }).ToArray();
            }
            catch (Exception ex) { Program.Log(ex); return new object[0]; }
        }

        public static object Summary()
        {
            try
            {
                var files = new DirectoryInfo(Folder).GetFiles();
                return new { count = files.Length, captures = files.Count(f => f.Name.StartsWith("Capture ", StringComparison.Ordinal)) };
            }
            catch { return new { count = 0, captures = 0 }; }
        }

        public static void SendList() { SendList(null); }

        // `added` names the files that just arrived, so the page can bring them into view.
        static void SendList(IEnumerable<string> added) { Program.Send(new { type = "shelf.list", items = Items(), added = added == null ? new string[0] : added.ToArray() }); }

        static string Unique(string name)
        {
            string stem = Path.GetFileNameWithoutExtension(name), ext = Path.GetExtension(name), candidate = name;
            for (int i = 2; File.Exists(Path.Combine(Folder, candidate)); i++) candidate = stem + " " + i + ext;
            return candidate;
        }

        static string PathOf(string name)
        {
            if (string.IsNullOrEmpty(name) || name != Path.GetFileName(name)) return null;
            string path = Path.Combine(Folder, name);
            return File.Exists(path) ? path : null;
        }

        // The list is newest first, so a copy is dated now: an old file would otherwise land at the very end and look like it was never added.
        static List<string> Copy(IEnumerable<string> files)
        {
            var added = new List<string>();
            foreach (string file in files)
                try
                {
                    if (!File.Exists(file)) continue;
                    string name = Unique(Path.GetFileName(file)), path = Path.Combine(Folder, name);
                    File.Copy(file, path);
                    File.SetAttributes(path, File.GetAttributes(path) & ~(FileAttributes.ReadOnly | FileAttributes.Hidden));
                    File.SetLastWriteTimeUtc(path, DateTime.UtcNow);
                    added.Add(name);
                }
                catch (Exception ex) { Program.Log(ex); }
            return added;
        }

        static void Added(List<string> added, int asked)
        {
            if (added.Count > 0) Program.Announce(added.Count == 1 ? "1 file added to the shelf" : "{0} files added to the shelf", added.Count);
            else if (asked > 0) Program.Announce("Nothing could be added to the shelf");
            SendList(added);
        }

        // A capture lands here as a PNG named after the moment it was taken.
        public static string Keep(Bitmap image)
        {
            string path = Path.Combine(Folder, Unique("Capture " + DateTime.Now.ToString("yyyy-MM-dd HH.mm.ss") + ".png"));
            image.Save(path, ImageFormat.Png);
            SendList();
            return path;
        }

        public static bool Receive(string action, Dictionary<string, object> m, List<string> files)
        {
            string name = m.ContainsKey("name") ? Convert.ToString(m["name"]) : null;
            switch (action)
            {
                case "list": SendList(); return false;
                case "drop":
                {
                    var dropped = files ?? new List<string>();
                    var added = Copy(dropped);
                    Added(added, dropped.Count);
                    return added.Count > 0;
                }
                case "add":
                    using (var dialog = new OpenFileDialog { Multiselect = true, Title = Language.T("Add to the shelf") })
                    {
                        if (dialog.ShowDialog(Program.SettingsWindow) != DialogResult.OK) return false;
                        Added(Copy(dialog.FileNames), dialog.FileNames.Length);
                    }
                    return false;
                case "open":
                {
                    string path = PathOf(name);
                    if (path != null) try { System.Diagnostics.Process.Start(path); } catch (Exception ex) { Program.Log(ex); }
                    return false;
                }
                case "reveal":
                {
                    string path = PathOf(name);
                    System.Diagnostics.Process.Start("explorer.exe", path != null ? "/select,\"" + path + "\"" : "\"" + Folder + "\"");
                    return false;
                }
                case "copy":
                {
                    string path = PathOf(name);
                    if (path == null) return false;
                    // The file and, for an image, its pixels: File Explorer and a chat take the file, Word or Paint the picture.
                    var data = new DataObject();
                    data.SetFileDropList(new StringCollection { path });
                    if (Images.Contains(Path.GetExtension(path).ToLowerInvariant()))
                        try { using (var image = Image.FromFile(path)) data.SetImage(new Bitmap(image)); } catch (Exception ex) { Program.Log(ex); }
                    Clipboard.SetDataObject(data, true);
                    Program.Announce("Copied, ready to paste");
                    return true;
                }
                case "dragOut":
                {
                    string path = PathOf(name);
                    // Windows runs the drag while the button is still down; the page is told when it ends, to take drops again.
                    var window = Program.SettingsWindow;
                    if (path == null || window == null) { Program.Send(new { type = "shelf.dragged" }); return false; }
                    window.BeginInvoke((Action)(() =>
                    {
                        if (Control.MouseButtons == MouseButtons.Left)
                            try { window.DoDragDrop(new DataObject(DataFormats.FileDrop, new[] { path }), DragDropEffects.Copy); }
                            catch (Exception ex) { Program.Log(ex); }
                        Program.Send(new { type = "shelf.dragged" });
                    }));
                    return false;
                }
                case "remove":
                {
                    string path = PathOf(name);
                    if (path == null) return false;
                    Program.SetAside(path, name, SendList);
                    SendList();
                    return true;
                }
            }
            return false;
        }
    }
}
