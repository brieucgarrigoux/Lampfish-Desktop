using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Threading.Tasks;
using System.Windows.Forms;
using PdfSharp.Drawing;
using PdfSharp.Drawing.Layout;
using PdfSharp.Pdf;
using PdfSharp.Pdf.IO;

namespace Lampfish
{
    // Converts the files a user hands over, on this PC and nowhere else. A result is kept in the Shelf, next to what was already there.
    static class Converter
    {
        static readonly string[] Images = { ".png", ".jpg", ".jpeg", ".bmp", ".gif", ".tif", ".tiff", ".ico", ".webp", ".heic", ".heif" };
        static readonly string[] Texts = { ".txt", ".log", ".csv", ".md" };
        static readonly string[] Words = { ".doc", ".docx", ".rtf", ".odt" }, Sheets = { ".xls", ".xlsx", ".ods" }, Slides = { ".ppt", ".pptx", ".odp" };
        const long Limit = 600L * 1024 * 1024;

        // Only the files the user picked or dropped are touched: the page names them, and a name that was never handed over is ignored.
        static readonly Dictionary<string, FileInfo> allowed = new Dictionary<string, FileInfo>(StringComparer.OrdinalIgnoreCase);
        static volatile bool busy, cancel;

        static string Kind(string ext)
        {
            ext = ext.ToLowerInvariant();
            if (Images.Contains(ext)) return "image";
            if (ext == ".pdf") return "pdf";
            if (Texts.Contains(ext)) return "text";
            if (Words.Contains(ext)) return "word";
            if (Sheets.Contains(ext)) return "sheet";
            if (Slides.Contains(ext)) return "slides";
            return "other";
        }

        static bool Installed(string progId)
        {
            try { return Type.GetTypeFromProgID(progId) != null; } catch { return false; }
        }

        static void Post(object message)
        {
            var window = Program.SettingsWindow;
            if (window == null || window.IsDisposed) return;
            try { window.BeginInvoke((Action)(() => Program.Send(message))); } catch { }
        }

        static object Describe(IEnumerable<string> paths, string tool = null)
        {
            var list = new List<object>();
            foreach (string path in paths)
            {
                try
                {
                    var info = new FileInfo(path);
                    if (!info.Exists || (info.Attributes & FileAttributes.Directory) != 0) continue;
                    allowed[info.FullName] = info;
                    list.Add(new { path = info.FullName, name = info.Name, size = info.Length, kind = Kind(info.Extension) });
                }
                catch (Exception ex) { Program.Log(ex); }
            }
            return new { type = "convert.files", tool, files = list.ToArray(), word = Installed("Word.Application"), sheet = Installed("Excel.Application"), slides = Installed("PowerPoint.Application") };
        }

        // The file dialog of each job offers the files that job can take first.
        static string Filter(string tool)
        {
            string all = "|" + Language.T("All files") + "|*.*";
            switch (tool)
            {
                case "image": case "images-pdf": return Language.T("Images") + "|" + string.Join(";", Images.Select(e => "*" + e)) + all;
                case "pdf-images": case "merge": case "pages": case "rotate": return "PDF|*.pdf" + all;
                case "text": return Language.T("Text") + "|" + string.Join(";", Texts.Select(e => "*" + e)) + all;
                case "office": return Language.T("Office documents") + "|" + string.Join(";", Words.Concat(Sheets).Concat(Slides).Select(e => "*" + e)) + all;
                default: return Language.T("Files that can be converted") + "|" + string.Join(";", Images.Concat(new[] { ".pdf" }).Concat(Texts).Concat(Words).Concat(Sheets).Concat(Slides).Select(e => "*" + e)) + all;
            }
        }

        // What was made lately and still sits in the Shelf, newest first.
        class Made { public string Name, From; public long When; }
        static string RecentFile { get { return Path.Combine(Program.DataFolder("Convert"), "recent.json"); } }
        static readonly JavaScriptSerializer json = new JavaScriptSerializer();

        static List<Made> Recent()
        {
            try { if (File.Exists(RecentFile)) return (json.Deserialize<List<Made>>(File.ReadAllText(RecentFile)) ?? new List<Made>()).Where(r => r.Name != null && File.Exists(Path.Combine(Shelf.Folder, Path.GetFileName(r.Name)))).ToList(); }
            catch (Exception ex) { Program.Log(ex); }
            return new List<Made>();
        }

        static void Remember(Job job, List<object> outputs, List<string> names)
        {
            if (names.Count == 0) return;
            try
            {
                var list = Recent();
                string from = job.Files[0].Name + (job.Files.Count > 1 ? " +" + (job.Files.Count - 1) : "");
                long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                list.InsertRange(0, names.Select(n => new Made { Name = n, From = from, When = now }));
                File.WriteAllText(RecentFile, json.Serialize(list.Take(8).ToList()));
            }
            catch (Exception ex) { Program.Log(ex); }
        }

        static object Caps()
        {
            var recent = Enumerable.ToArray(Recent().Select(r => { var info = new FileInfo(Path.Combine(Shelf.Folder, Path.GetFileName(r.Name))); return new { name = info.Name, size = info.Length, from = r.From }; }));
            return new { type = "convert.caps", word = Installed("Word.Application"), sheet = Installed("Excel.Application"), slides = Installed("PowerPoint.Application"), recent };
        }

        public static bool Receive(string action, Dictionary<string, object> m, List<string> dropped)
        {
            switch (action)
            {
                case "caps": Program.Send(Caps()); return false;
                case "pick":
                {
                    string tool = m != null && m.ContainsKey("tool") ? Convert.ToString(m["tool"]) : null;
                    using (var dialog = new OpenFileDialog { Multiselect = true, Title = Language.T("Choose files to convert"), Filter = Filter(tool) })
                    {
                        if (dialog.ShowDialog(Program.SettingsWindow) != DialogResult.OK) return false;
                        Program.Send(Describe(dialog.FileNames, tool));
                    }
                    return false;
                }
                case "drop":
                    if (dropped != null && dropped.Count > 0) Program.Send(Describe(dropped));
                    return false;
                // A file of the Shelf is handed over from its card.
                case "shelf":
                {
                    string path = Path.Combine(Shelf.Folder, Path.GetFileName(m.ContainsKey("name") ? Convert.ToString(m["name"]) : ""));
                    if (!File.Exists(path)) return false;
                    Program.OpenView("convert");
                    var window = Program.SettingsWindow;
                    if (window != null) window.BeginInvoke((Action)(() => Program.Send(Describe(new[] { path }))));
                    return false;
                }
                case "cancel": cancel = true; return false;
                case "run": Run(m); return false;
                case "save":
                {
                    string name = m.ContainsKey("name") ? Path.GetFileName(Convert.ToString(m["name"])) : "";
                    string source = Path.Combine(Shelf.Folder, name);
                    if (name.Length == 0 || !File.Exists(source)) return false;
                    using (var dialog = new SaveFileDialog { FileName = name, Title = Language.T("Save as") })
                        if (dialog.ShowDialog(Program.SettingsWindow) == DialogResult.OK)
                            try { File.Copy(source, dialog.FileName, true); Program.Announce("Saved"); }
                            catch (Exception ex) { Program.Log(ex); Program.Announce("Could not save the file"); }
                    return false;
                }
            }
            return false;
        }

        class Job
        {
            public List<FileInfo> Files = new List<FileInfo>();
            public string Target, Pages = "", Format = "png";
            public int MaxSide, Quality = 85, Angle = 90, Scale = 2;
        }

        static string Text(Dictionary<string, object> m, string key) { return m.ContainsKey(key) && m[key] != null ? Convert.ToString(m[key]) : ""; }
        static int Number(Dictionary<string, object> m, string key, int fallback) { int n; return m.ContainsKey(key) && m[key] != null && int.TryParse(Convert.ToString(m[key]), out n) ? n : fallback; }

        static void Run(Dictionary<string, object> m)
        {
            if (busy) return;
            var job = new Job
            {
                Target = Text(m, "target"), Pages = Text(m, "pages"), Format = Text(m, "format"),
                MaxSide = Math.Max(0, Math.Min(20000, Number(m, "maxSide", 0))), Quality = Math.Max(10, Math.Min(100, Number(m, "quality", 85))),
                Angle = Number(m, "angle", 90), Scale = Math.Max(1, Math.Min(4, Number(m, "scale", 2))),
            };
            var names = m.ContainsKey("files") ? m["files"] as System.Collections.IEnumerable : null;
            if (names != null)
                foreach (object n in names)
                {
                    FileInfo info;
                    if (allowed.TryGetValue(Convert.ToString(n) ?? "", out info) && info.Exists && info.Length <= Limit) job.Files.Add(info);
                }
            if (job.Files.Count == 0) { Post(new { type = "convert.done", outputs = new object[0], errors = new[] { Language.T("Nothing to convert") } }); return; }
            busy = true;
            cancel = false;
            // Office wants a thread of its own that waits for it; the rest does not need the window.
            var thread = new Thread(() => Work(job)) { IsBackground = true };
            thread.SetApartmentState(ApartmentState.STA);
            thread.Start();
        }

        static void Work(Job job)
        {
            var outputs = new List<object>();
            var errors = new List<string>();
            var made = new List<string>();
            try
            {
                Action<string> keep = path => { var info = new FileInfo(path); outputs.Add(new { name = info.Name, size = info.Length }); made.Add(info.Name); };
                switch (job.Target)
                {
                    case "pdf-from-images": keep(ImagesToPdf(job)); break;
                    case "merge": keep(Merge(job)); break;
                    case "image": foreach (var f in Each(job, errors)) try { keep(ConvertImage(f, job)); } catch (Exception ex) { Fail(errors, f, ex); } break;
                    case "pdf-to-images": foreach (var f in Each(job, errors)) try { foreach (string p in PdfToImages(f, job)) keep(p); } catch (Exception ex) { Fail(errors, f, ex); } break;
                    case "pages": foreach (var f in Each(job, errors)) try { keep(ExtractPages(f, job)); } catch (Exception ex) { Fail(errors, f, ex); } break;
                    case "rotate": foreach (var f in Each(job, errors)) try { keep(Rotate(f, job)); } catch (Exception ex) { Fail(errors, f, ex); } break;
                    case "text-to-pdf": foreach (var f in Each(job, errors)) try { keep(TextToPdf(f)); } catch (Exception ex) { Fail(errors, f, ex); } break;
                    case "office-to-pdf": foreach (var f in Each(job, errors)) try { keep(OfficeToPdf(f)); } catch (Exception ex) { Fail(errors, f, ex); } break;
                    default: errors.Add(Language.T("This conversion does not exist")); break;
                }
            }
            catch (Exception ex) { Program.Log(ex); errors.Add(Message(ex)); }
            finally { busy = false; }
            Remember(job, outputs, made);
            Post(new { type = "convert.done", outputs = outputs.ToArray(), errors = errors.ToArray(), cancelled = cancel });
            var window = Program.SettingsWindow;
            if (window != null && !window.IsDisposed) try { window.BeginInvoke((Action)Shelf.SendList); } catch { }
            Post(Caps());
        }

        // Walks the files one by one, telling the page where it is, and stops when asked to.
        static IEnumerable<FileInfo> Each(Job job, List<string> errors)
        {
            for (int i = 0; i < job.Files.Count; i++)
            {
                if (cancel) yield break;
                Post(new { type = "convert.progress", index = i + 1, count = job.Files.Count, name = job.Files[i].Name });
                yield return job.Files[i];
            }
        }

        static void Fail(List<string> errors, FileInfo file, Exception ex)
        {
            Program.Log(ex);
            errors.Add(file.Name + ": " + Message(ex));
        }

        static string Message(Exception ex)
        {
            string text = ex.Message ?? "";
            if (ex is IOException && text.Contains("being used")) return Language.T("The file is open in another program");
            if (text.ToLowerInvariant().Contains("password")) return Language.T("The file is protected by a password");
            if (ex is OutOfMemoryException || ex is ArgumentException && ex.Source == "System.Drawing") return Language.T("This file is not an image Windows can read");
            return text.Length > 140 ? text.Substring(0, 140) : text;
        }

        // The result goes next to the files already in the Shelf, with a name that is not taken.
        static string Target(FileInfo source, string ext, string suffix = "")
        {
            string stem = Path.GetFileNameWithoutExtension(source.Name) + suffix, name = stem + ext;
            for (int i = 2; File.Exists(Path.Combine(Shelf.Folder, name)); i++) name = stem + " " + i + ext;
            Directory.CreateDirectory(Shelf.Folder);
            return Path.Combine(Shelf.Folder, name);
        }

        // ---- images ----

        static Image Load(FileInfo file)
        {
            string ext = file.Extension.ToLowerInvariant();
            if (ext == ".webp" || ext == ".heic" || ext == ".heif")
            {
                // The codec comes with Windows (a store extension for these two): the decoder says when it is not there.
                var decoder = System.Windows.Media.Imaging.BitmapDecoder.Create(new Uri(file.FullName), System.Windows.Media.Imaging.BitmapCreateOptions.PreservePixelFormat, System.Windows.Media.Imaging.BitmapCacheOption.OnLoad);
                var encoder = new System.Windows.Media.Imaging.PngBitmapEncoder();
                encoder.Frames.Add(decoder.Frames[0]);
                var memory = new MemoryStream();
                encoder.Save(memory);
                memory.Position = 0;
                return Image.FromStream(memory);
            }
            // Read through a copy, so the file stays free.
            var copy = new MemoryStream(File.ReadAllBytes(file.FullName));
            var image = Image.FromStream(copy);
            TurnUpright(image);
            return image;
        }

        static void TurnUpright(Image image)
        {
            try
            {
                if (!image.PropertyIdList.Contains(0x0112)) return;
                int o = BitConverter.ToUInt16(image.GetPropertyItem(0x0112).Value, 0);
                var flip = o == 3 ? RotateFlipType.Rotate180FlipNone : o == 6 ? RotateFlipType.Rotate90FlipNone : o == 8 ? RotateFlipType.Rotate270FlipNone : RotateFlipType.RotateNoneFlipNone;
                if (flip != RotateFlipType.RotateNoneFlipNone) image.RotateFlip(flip);
            }
            catch { }
        }

        static Bitmap Fit(Image source, int maxSide, bool opaque)
        {
            int w = source.Width, h = source.Height;
            if (maxSide > 0 && Math.Max(w, h) > maxSide) { double k = maxSide / (double)Math.Max(w, h); w = Math.Max(1, (int)Math.Round(w * k)); h = Math.Max(1, (int)Math.Round(h * k)); }
            var bitmap = new Bitmap(w, h, PixelFormat.Format32bppArgb);
            bitmap.SetResolution(source.HorizontalResolution > 0 ? source.HorizontalResolution : 96, source.VerticalResolution > 0 ? source.VerticalResolution : 96);
            using (var g = Graphics.FromImage(bitmap))
            {
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.SmoothingMode = SmoothingMode.HighQuality;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                if (opaque) g.Clear(Color.White);
                g.DrawImage(source, 0, 0, w, h);
            }
            return bitmap;
        }

        static string ConvertImage(FileInfo file, Job job)
        {
            string format = job.Format;
            string ext = format == "jpg" ? ".jpg" : format == "bmp" ? ".bmp" : format == "gif" ? ".gif" : format == "tiff" ? ".tiff" : format == "ico" ? ".ico" : ".png";
            using (var source = Load(file))
            using (var bitmap = Fit(source, format == "ico" ? 256 : job.MaxSide, format == "jpg" || format == "bmp"))
            {
                string path = Target(file, ext);
                if (format == "jpg") SaveJpeg(bitmap, path, job.Quality);
                else if (format == "ico") SaveIcon(bitmap, path);
                else bitmap.Save(path, format == "bmp" ? ImageFormat.Bmp : format == "gif" ? ImageFormat.Gif : format == "tiff" ? ImageFormat.Tiff : ImageFormat.Png);
                return path;
            }
        }

        static void SaveJpeg(Bitmap bitmap, string path, int quality)
        {
            var codec = ImageCodecInfo.GetImageEncoders().First(c => c.FormatID == ImageFormat.Jpeg.Guid);
            using (var parameters = new EncoderParameters(1))
            {
                parameters.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, (long)quality);
                bitmap.Save(path, codec, parameters);
            }
        }

        // An icon file that holds one picture, as a PNG, which Windows reads from Vista on.
        static void SaveIcon(Bitmap bitmap, string path)
        {
            byte[] png;
            using (var memory = new MemoryStream()) { bitmap.Save(memory, ImageFormat.Png); png = memory.ToArray(); }
            using (var stream = File.Create(path))
            using (var w = new BinaryWriter(stream))
            {
                w.Write((short)0); w.Write((short)1); w.Write((short)1);
                w.Write((byte)(bitmap.Width >= 256 ? 0 : bitmap.Width)); w.Write((byte)(bitmap.Height >= 256 ? 0 : bitmap.Height));
                w.Write((byte)0); w.Write((byte)0); w.Write((short)1); w.Write((short)32); w.Write(png.Length); w.Write(22);
                w.Write(png);
            }
        }

        static string ImagesToPdf(Job job)
        {
            using (var pdf = new PdfDocument())
            {
                int i = 0;
                foreach (var file in Each(job, new List<string>()))
                {
                    i++;
                    using (var source = Load(file))
                    using (var bitmap = Fit(source, job.MaxSide, true))
                    using (var data = new MemoryStream())
                    {
                        // A photograph stays a JPEG in the PDF; anything else is kept as it is drawn.
                        string ext = file.Extension.ToLowerInvariant();
                        if (ext == ".jpg" || ext == ".jpeg") { var codec = ImageCodecInfo.GetImageEncoders().First(c => c.FormatID == ImageFormat.Jpeg.Guid); using (var p = new EncoderParameters(1)) { p.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 92L); bitmap.Save(data, codec, p); } }
                        else bitmap.Save(data, ImageFormat.Png);
                        data.Position = 0;
                        double dpi = Math.Max(72, Math.Min(300, bitmap.HorizontalResolution));
                        var page = pdf.AddPage();
                        page.Width = XUnit.FromPoint(bitmap.Width * 72 / dpi);
                        page.Height = XUnit.FromPoint(bitmap.Height * 72 / dpi);
                        using (var gfx = XGraphics.FromPdfPage(page))
                        using (var image = XImage.FromStream(data))
                            gfx.DrawImage(image, 0, 0, page.Width, page.Height);
                    }
                }
                if (pdf.PageCount == 0) throw new InvalidOperationException(Language.T("Nothing to convert"));
                string path = Target(job.Files[0], ".pdf", job.Files.Count > 1 ? " and " + (job.Files.Count - 1) + " more" : "");
                pdf.Save(path);
                return path;
            }
        }

        // ---- PDF ----

        static PdfDocument Open(FileInfo file, PdfDocumentOpenMode mode)
        {
            try { return PdfReader.Open(file.FullName, mode); }
            catch (Exception ex) { if ((ex.Message ?? "").ToLowerInvariant().Contains("password")) throw new InvalidOperationException("password"); throw; }
        }

        static string Merge(Job job)
        {
            using (var output = new PdfDocument())
            {
                foreach (var file in Each(job, new List<string>()))
                    using (var input = Open(file, PdfDocumentOpenMode.Import))
                        foreach (PdfPage page in input.Pages) output.AddPage(page);
                string path = Target(job.Files[0], ".pdf", " merged");
                output.Save(path);
                return path;
            }
        }

        // "1-3, 5" gives pages 1, 2, 3 and 5 (counted from 1). A page that does not exist is skipped.
        static List<int> Range(string text, int count)
        {
            var pages = new List<int>();
            foreach (string part in (text ?? "").Split(new[] { ',', ';', ' ' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var bounds = part.Split('-');
                int a, b;
                if (!int.TryParse(bounds[0], out a)) continue;
                b = bounds.Length > 1 && int.TryParse(bounds[1], out b) ? b : a;
                if (bounds.Length > 1 && bounds[1].Length == 0) b = count;
                for (int p = Math.Min(a, b); p <= Math.Max(a, b); p++) if (p >= 1 && p <= count && !pages.Contains(p)) pages.Add(p);
            }
            return pages;
        }

        static string ExtractPages(FileInfo file, Job job)
        {
            using (var input = Open(file, PdfDocumentOpenMode.Import))
            using (var output = new PdfDocument())
            {
                var pages = Range(job.Pages, input.PageCount);
                if (pages.Count == 0) throw new InvalidOperationException(Language.T("No page in this range"));
                foreach (int p in pages) output.AddPage(input.Pages[p - 1]);
                string path = Target(file, ".pdf", " pages");
                output.Save(path);
                return path;
            }
        }

        static string Rotate(FileInfo file, Job job)
        {
            using (var doc = Open(file, PdfDocumentOpenMode.Modify))
            {
                int angle = ((job.Angle % 360) + 360) % 360;
                foreach (PdfPage page in doc.Pages) page.Rotate = (page.Rotate + angle) % 360;
                string path = Target(file, ".pdf", " rotated");
                doc.Save(path);
                return path;
            }
        }

        // The pages are drawn by the PDF reader of Windows, reached by name so that nothing of the Windows SDK is needed to build.
        static Type Rt(string name) { return Type.GetType(name + ", Windows, ContentType=WindowsRuntime"); }

        static readonly MethodInfo[] Extensions = typeof(WindowsRuntimeSystemExtensions).GetMethods(BindingFlags.Public | BindingFlags.Static);

        static object Result(object operation, Type resultType)
        {
            var asTask = Extensions.First(m => m.Name == "AsTask" && m.IsGenericMethodDefinition && m.GetGenericArguments().Length == 1 && m.GetParameters().Length == 1 && m.GetParameters()[0].ParameterType.Name.StartsWith("IAsyncOperation`1")).MakeGenericMethod(resultType);
            var task = (Task)asTask.Invoke(null, new[] { operation });
            task.Wait();
            return task.GetType().GetProperty("Result").GetValue(task);
        }

        static void Wait(object action)
        {
            var asTask = Extensions.First(m => m.Name == "AsTask" && !m.IsGenericMethodDefinition && m.GetParameters().Length == 1 && m.GetParameters()[0].ParameterType.Name == "IAsyncAction");
            ((Task)asTask.Invoke(null, new[] { action })).Wait();
        }

        static IEnumerable<string> PdfToImages(FileInfo file, Job job)
        {
            var storageFile = Rt("Windows.Storage.StorageFile");
            var pdfDocument = Rt("Windows.Data.Pdf.PdfDocument");
            var pdfPage = Rt("Windows.Data.Pdf.PdfPage");
            var options = Rt("Windows.Data.Pdf.PdfPageRenderOptions");
            var memory = Rt("Windows.Storage.Streams.InMemoryRandomAccessStream");
            var randomAccess = Rt("Windows.Storage.Streams.IRandomAccessStream");
            if (storageFile == null || pdfDocument == null) throw new InvalidOperationException(Language.T("This version of Windows cannot draw PDF pages"));
            object stored = Result(storageFile.GetMethod("GetFileFromPathAsync").Invoke(null, new object[] { file.FullName }), storageFile);
            object doc;
            try { doc = Result(pdfDocument.GetMethod("LoadFromFileAsync", new[] { storageFile }).Invoke(null, new[] { stored }), pdfDocument); }
            catch (AggregateException) { throw new InvalidOperationException(Language.T("The file is protected by a password or is not a PDF")); }
            int count = (int)(uint)pdfDocument.GetProperty("PageCount").GetValue(doc);
            var read = typeof(WindowsRuntimeStreamExtensions).GetMethods(BindingFlags.Public | BindingFlags.Static).First(m => m.Name == "AsStreamForRead" && m.GetParameters().Length == 1 && m.GetParameters()[0].ParameterType.Name == "IInputStream");
            var chosen = job.Pages.Trim().Length > 0 ? Range(job.Pages, count) : Enumerable.Range(1, count).ToList();
            var written = new List<string>();
            int done = 0;
            foreach (int number in chosen)
            {
                if (cancel) break;
                object page = pdfDocument.GetMethod("GetPage").Invoke(doc, new object[] { (uint)(number - 1) });
                try
                {
                    var size = pdfPage.GetProperty("Size").GetValue(page);
                    double w = (double)size.GetType().GetProperty("Width").GetValue(size), h = (double)size.GetType().GetProperty("Height").GetValue(size);
                    double k = job.Scale * 96.0 / 72.0;
                    object render = Activator.CreateInstance(options);
                    options.GetProperty("DestinationWidth").SetValue(render, (uint)Math.Max(1, Math.Round(w * k)));
                    options.GetProperty("DestinationHeight").SetValue(render, (uint)Math.Max(1, Math.Round(h * k)));
                    object stream = Activator.CreateInstance(memory);
                    Wait(pdfPage.GetMethod("RenderToStreamAsync", new[] { randomAccess, options }).Invoke(page, new[] { stream, render }));
                    randomAccess.GetMethod("Seek").Invoke(stream, new object[] { 0UL });
                    string ext = job.Format == "jpg" ? ".jpg" : ".png";
                    string path = Target(file, ext, " page " + number.ToString().PadLeft(count.ToString().Length, '0'));
                    using (var input = (Stream)read.Invoke(null, new[] { stream }))
                    using (var image = Image.FromStream(input))
                    using (var bitmap = Fit(image, 0, job.Format == "jpg"))
                    {
                        if (job.Format == "jpg") SaveJpeg(bitmap, path, job.Quality); else bitmap.Save(path, ImageFormat.Png);
                    }
                    written.Add(path);
                }
                finally { var closable = page as IDisposable; if (closable != null) closable.Dispose(); }
                Post(new { type = "convert.progress", index = ++done, count = chosen.Count, name = file.Name });
            }
            return written;
        }

        // ---- text ----

        static string TextToPdf(FileInfo file)
        {
            string text = File.ReadAllText(file.FullName);
            if (text.Length > 4000000) throw new InvalidOperationException(Language.T("This text is too long"));
            text = text.Replace("\r\n", "\n").Replace('\r', '\n').Replace("\t", "    ");
            using (var pdf = new PdfDocument())
            {
                var font = new XFont("Segoe UI", 10.5, XFontStyle.Regular);
                const double margin = 56, lineHeight = 15.5;
                double width = 595 - margin * 2, height = 842 - margin * 2;
                int perPage = (int)(height / lineHeight);
                var lines = new List<string>();
                using (var measure = XGraphics.CreateMeasureContext(new XSize(595, 842), XGraphicsUnit.Point, XPageDirection.Downwards))
                    foreach (string paragraph in text.Split('\n'))
                    {
                        if (paragraph.Length == 0) { lines.Add(""); continue; }
                        string current = "";
                        foreach (string word in paragraph.Split(' '))
                        {
                            string trial = current.Length == 0 ? word : current + " " + word;
                            if (measure.MeasureString(trial, font).Width <= width || current.Length == 0) current = trial;
                            else { lines.Add(current); current = word; }
                        }
                        lines.Add(current);
                    }
                for (int start = 0; start < Math.Max(1, lines.Count); start += perPage)
                {
                    var page = pdf.AddPage();
                    page.Size = PdfSharp.PageSize.A4;
                    using (var gfx = XGraphics.FromPdfPage(page))
                        for (int i = start; i < Math.Min(lines.Count, start + perPage); i++)
                            gfx.DrawString(lines[i], font, XBrushes.Black, new XRect(margin, margin + (i - start) * lineHeight, width, lineHeight), XStringFormats.TopLeft);
                }
                string path = Target(file, ".pdf");
                pdf.Save(path);
                return path;
            }
        }

        // ---- Office ----

        static string OfficeToPdf(FileInfo file)
        {
            string ext = file.Extension.ToLowerInvariant(), path = Target(file, ".pdf");
            string progId = Words.Contains(ext) ? "Word.Application" : Sheets.Contains(ext) ? "Excel.Application" : "PowerPoint.Application";
            var type = Type.GetTypeFromProgID(progId);
            if (type == null) throw new InvalidOperationException(Language.T("Office is not installed on this PC"));
            dynamic app = Activator.CreateInstance(type);
            try
            {
                if (progId == "Word.Application")
                {
                    app.Visible = false;
                    dynamic doc = app.Documents.Open(file.FullName, false, true);
                    try { doc.ExportAsFixedFormat(path, 17); } finally { doc.Close(false); }
                }
                else if (progId == "Excel.Application")
                {
                    app.Visible = false;
                    app.DisplayAlerts = false;
                    dynamic book = app.Workbooks.Open(file.FullName, 0, true);
                    try { book.ExportAsFixedFormat(0, path); } finally { book.Close(false); }
                }
                else
                {
                    dynamic show = app.Presentations.Open(file.FullName, true, false, false);
                    try { show.SaveAs(path, 32); } finally { show.Close(); }
                }
            }
            finally { try { app.Quit(); } catch { } }
            if (!File.Exists(path)) throw new InvalidOperationException(Language.T("Office could not make the PDF"));
            return path;
        }
    }
}
