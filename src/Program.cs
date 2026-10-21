using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.VisualBasic.FileIO;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;

[assembly: System.Reflection.AssemblyTitle("Bramble")]
[assembly: System.Reflection.AssemblyProduct("Bramble")]
[assembly: System.Reflection.AssemblyVersion("0.3.0.0")]
[assembly: System.Reflection.AssemblyFileVersion("0.3.0.0")]

namespace Bramble
{
    class ScreenWallpaper { public string Key, Wallpaper; }

    class WindowPlace { public int X, Y, Width, Height; public bool Maximized; }
    class WeatherPlace { public string Name, Label; public double Latitude, Longitude; }

    class Settings
    {
        public string Language = "auto";
        public bool Weather = true;
        public WeatherPlace WeatherPlace;
        public List<Dictionary<string, object>> NetworkTests = new List<Dictionary<string, object>>();
        public string Wallpaper = "bramble-logo.html";
        public List<ScreenWallpaper> ScreenWallpapers = new List<ScreenWallpaper>();
        public bool Shuffle;
        public int FrameRate = 60;
        public int Light = 50;
        public int Speed = 50;
        public bool PauseAuto = true;
        public bool PauseOnBattery = false;
        public int Blur = 0;
        public int Saturation = 50;
        public int Dim = 0;
        public string Fit = "fill";
        public int Slideshow = 0;
        public bool Reactive = false;
        public int Zoom = 100;
        public List<MoodSetting> Moods = new List<MoodSetting>();
        public string CurrentMood;
        public DockSettings Dock = new DockSettings();
        public IconsSettings Icons = new IconsSettings();
        public IconsSettings Folders;
        public ArrangeSettings Arrange = new ArrangeSettings();
        public DiskUsageSettings DiskUsage = new DiskUsageSettings();
        public Mouse.Snapshot CursorsOriginal;
        public WindowPlace Window;
        public bool UpdatesAuto;
        public string UpdatesLast;
        public bool WarmOn;
        public int Warm = 50;
        public int SaverThreshold = 30;
    }

    static class Program
    {
        public static readonly string Root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
        public static readonly string WallpapersFolder = Path.Combine(Root, "wallpapers");
        static readonly string SettingsFile = Path.Combine(Root, "settings.json");

        static readonly string RemovedFolder = Path.Combine(Root, "app", "trash");
        const string StartupKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        const string OpenSignal = "Bramble.OpenSettings";

        static readonly string RequestFile = Path.Combine(Root, "app", "request.txt");

        static readonly Dictionary<string, string> Types = new Dictionary<string, string>
        {
            { ".mp4", "video" }, { ".webm", "video" }, { ".mov", "video" }, { ".m4v", "video" },
            { ".gif", "gif" },
            { ".jpg", "image" }, { ".jpeg", "image" }, { ".png", "image" }, { ".webp", "image" }, { ".bmp", "image" },
            { ".html", "html" }, { ".htm", "html" },
        };

        public static Settings R = new Settings();
        public static Icon AppIcon;
        static readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
        static CoreWebView2Environment environment;
        static readonly List<WallpaperForm> screens = new List<WallpaperForm>();
        static SettingsForm settingsWindow;
        static System.Windows.Forms.Timer rebuild, removalDelay;
        static string removed, undoText, removalPath, announcement, requestedView;
        static DateTime nextSlideshow = DateTime.MaxValue;
        static bool onBattery;
        static Action removalUndo, removalCommit;
        static SynchronizationContext context;
        static readonly Random random = new Random();
        static int missing;
        static bool locked;
        static DateTime lastBuild = DateTime.MinValue;
        static int generation;
        static readonly Queue<DateTime> rebuilds = new Queue<DateTime>();
        static string lastReason;
        static bool paused, building, pending, restart, quitting, pageReady;

        [STAThread]
        static void Main(string[] args)
        {
            if (args.Contains("--uninstall")) { Uninstall(); return; }
            bool firstInstance;
            using (new Mutex(true, "Bramble.SingleInstance", out firstInstance))
            {
                string requestedFolder = RequestedFolder(args);
                if (!firstInstance)
                {
                    if (args.Contains("--quit")) try { File.WriteAllText(RequestFile, "::quit"); } catch { }
                    else if (requestedFolder != null)
                        try { File.WriteAllText(RequestFile, requestedFolder); } catch { }
                    EventWaitHandle signal;
                    if (EventWaitHandle.TryOpenExisting(OpenSignal, out signal)) signal.Set();
                    return;
                }

                Native.SetProcessDpiAwarenessContext(new IntPtr(-4));

                System.Net.ServicePointManager.SecurityProtocol |= System.Net.SecurityProtocolType.Tls12 | (System.Net.SecurityProtocolType)12288 ;
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.ThreadException += (s, e) => Log(e.Exception);
                context = new WindowsFormsSynchronizationContext();
                SynchronizationContext.SetSynchronizationContext(context);

                Load();
                Language.Choose(R.Language);
                FollowFolder();

                using (var stream = typeof(Program).Assembly.GetManifestResourceStream("icon.ico"))
                    AppIcon = new Icon(stream);
                bool background = args.Contains("--background") || args.Contains("--discret");
                Sounds.Start(background);
                Icons.Start();
                Mouse.Start();
                Arrange.Start();
                DiskUsage.Start();
                Hardware.Start();
                AudioMeter.Set(R.Reactive);
                Display.Start();
                Moods.Start();
                if (requestedFolder != null) { Icons.Ask(requestedFolder); requestedView = "icons"; }

                int iView = Array.IndexOf(args, "--view");
                if (iView >= 0 && iView + 1 < args.Length) requestedView = args[iView + 1];
                Tray.Create();
                ListenSignal();
                Updates.Start();

                removalDelay = new System.Windows.Forms.Timer { Interval = 8000 };
                removalDelay.Tick += (s, e) => { Discard(); SendState(); };
                Discard();

                rebuild = new System.Windows.Forms.Timer { Interval = 1500 };
                rebuild.Tick += (s, e) => { rebuild.Stop(); Build(); };
                SystemEvents.DisplaySettingsChanged += (s, e) => { RebuildSoon(); Arrange.ScreensChanged(); Moods.ScreensChanged(); };
                SystemEvents.SessionSwitch += (s, e) =>
                {
                    if (e.Reason == SessionSwitchReason.SessionLock) locked = true;
                    else if (e.Reason == SessionSwitchReason.SessionUnlock) locked = false;
                    else return;
                    UpdateVisibility();
                };
                var watcher = new Watcher(RebuildSoon);

                var slideshow = new System.Windows.Forms.Timer { Interval = 20000 };
                slideshow.Tick += (s, e) => { if (R.Slideshow > 0 && DateTime.Now >= nextSlideshow) NextWallpaper(true); };
                slideshow.Start();
                RestartSlideshow();

                var fullscreen = new System.Windows.Forms.Timer { Interval = 1000 };
                fullscreen.Tick += (s, e) => UpdateVisibility();
                fullscreen.Start();

                Start(!background || requestedFolder != null);
                Application.Run();
                GC.KeepAlive(watcher);
            }
        }

        static void ListenSignal()
        {
            var signal = new EventWaitHandle(false, EventResetMode.AutoReset, OpenSignal);
            var crumbs = new Thread(() =>
            {
                while (true)
                {
                    signal.WaitOne();
                    context.Post(_ => { if (!HandleRequest()) OpenSettings(); }, null);
                }
            }) { IsBackground = true };
            crumbs.Start();
        }

        static string RequestedFolder(string[] args)
        {
            int i = Array.IndexOf(args, "--folder");
            return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
        }

        static bool HandleRequest()
        {
            try
            {
                if (!File.Exists(RequestFile)) return false;
                string folder = File.ReadAllText(RequestFile).Trim();
                File.Delete(RequestFile);
                if (folder == "::quit") { Quit(); return true; }
                Icons.Ask(folder);
                requestedView = "icons";
                SendState();
            }
            catch (Exception ex) { Log(ex); }
            return false;
        }

        public static void OnInterface(Action action)
        {
            context.Post(_ => action(), null);
        }

        public static Form SettingsWindow { get { return settingsWindow; } }

        public static string Version { get { var v = typeof(Program).Assembly.GetName().Version; return v.Major + "." + v.Minor + "." + v.Build; } }

        public static void Announce(string text, params object[] values)
        {
            announcement = Language.T(text, values);
        }

        static async void Start(bool openSettings)
        {
            try
            {
                CoreWebView2Environment.SetLoaderDllFolderPath(Path.Combine(Root, "app", "lib"));
                if (!RuntimeInstalled())
                {
                    if (MessageBox.Show(Language.T("Bramble needs the Microsoft Edge WebView2 Runtime, which is not installed on this PC.") + "\n\n" + Language.T("Open the download page?"), "Bramble", MessageBoxButtons.YesNo, MessageBoxIcon.Information) == DialogResult.Yes)
                        Process.Start("https://developer.microsoft.com/microsoft-edge/webview2/");
                    Application.Exit();
                    return;
                }
                environment = await CreateEnvironment();
                if (openSettings) OpenSettings();
                Build();
            }
            catch (Exception ex)
            {
                Log(ex);
                MessageBox.Show(Language.T("The display engine could not start.") + "\n\n" + ex.Message, "Bramble", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        static bool RuntimeInstalled()
        {
            try { return !string.IsNullOrEmpty(CoreWebView2Environment.GetAvailableBrowserVersionString()); }
            catch { return false; }
        }

        static Task<CoreWebView2Environment> CreateEnvironment()
        {
            string data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Bramble");
            var options = new CoreWebView2EnvironmentOptions("--autoplay-policy=no-user-gesture-required --disable-http-cache");
            return CoreWebView2Environment.CreateAsync(null, data, options);
        }

        public static async void BrowserCrashed()
        {
            if (restart || quitting) return;
            restart = true;
            Log(new Exception("WebView2 browser stopped, restarting"));
            try
            {
                bool reopen = settingsWindow != null && settingsWindow.Visible;
                Destroy();
                if (settingsWindow != null) { var f = settingsWindow; settingsWindow = null; pageReady = false; f.Shutdown(); }
                environment = null;
                await Task.Delay(1500);
                environment = await CreateEnvironment();
                Build();
                if (reopen) OpenSettings();
            }
            catch (Exception ex) { Log(ex); }
            finally { restart = false; }
        }

        static async void Build()
        {
            if (environment == null) return;

            if (building) { pending = true; return; }
            building = true;
            pending = false;
            lastBuild = DateTime.Now;
            int number = ++generation;
            try
            {
                Destroy();
                if (!Desktop.Find())
                {
                    Log(new Exception("Desktop missing (Progman / WorkerW)"));
                    return;
                }
                foreach (Screen screen in Screen.AllScreens)
                {
                    var f = new WallpaperForm(screen.Bounds);
                    screens.Add(f);
                    f.Show();
                    await f.Initialize(environment);
                    if (number != generation) { f.Dispose(); return; }
                    f.Show(R, WallpaperOf(f.Screen), false);
                    await Task.Delay(400);
                    if (number != generation) { f.Dispose(); return; }
                    if (pending || f.IsDisposed) return;
                    Desktop.Attach(f.Handle, screen.Bounds);
                }
                Desktop.ArrangeWallpaperWindows();
                UpdateVisibility();
                SendState();
            }
            catch (Exception ex) { Log(ex); }
            finally
            {
                if (number == generation)
                {
                    building = false;
                    if (pending) { pending = false; RebuildSoon(); }
                }
            }
        }

        static void Destroy()
        {
            foreach (var f in screens) f.Dispose();
            screens.Clear();
        }

        public static void RebuildSoon()
        {
            rebuild.Stop();
            rebuild.Start();
        }

        static void UpdateVisibility()
        {
            if (building && (DateTime.Now - lastBuild).TotalSeconds > 25)
            {
                Log(new Exception("Wallpaper build stuck, restarting"));
                generation++;
                building = false;
                pending = false;
                Destroy();
                RebuildSoon();
                return;
            }
            if (building || restart) return;

            if (screens.Count > 0)
            {
                if (!Desktop.Valid() && Desktop.Recover()) Desktop.ArrangeWallpaperWindows();
                bool lost = !Desktop.Valid();
                missing = lost ? missing + 1 : 0;
                var dead = screens.FirstOrDefault(f => !f.Alive);
                string reason = lost ? (missing >= 3 ? "Desktop missing" : null) : dead != null ? dead.Problem : null;
                if (lost && reason == null) return;
                if (reason != null && rebuild.Enabled) return;
                if (reason != null)
                {
                    while (rebuilds.Count > 0 && (DateTime.Now - rebuilds.Peek()).TotalSeconds > 60) rebuilds.Dequeue();
                    if (rebuilds.Count >= 3)
                    {
                        if (reason != lastReason) Log(new Exception("Wallpaper rebuild throttled (" + reason + ")"));
                        lastReason = reason;
                        return;
                    }
                    rebuilds.Enqueue(DateTime.Now);
                    lastReason = reason;
                    Log(new Exception("Wallpapers rebuilt: " + reason));
                    RebuildSoon();
                    return;
                }
            }

            if (screens.Count == 0 && environment != null && (DateTime.Now - lastBuild).TotalSeconds > 10) { RebuildSoon(); return; }

            Rectangle covered = Rectangle.Empty;
            IntPtr active = Native.GetForegroundWindow();
            if (R.PauseAuto && active != IntPtr.Zero && !Native.IsIconic(active) && !Desktop.IsDesktop(active))
            {
                Native.RECT r;
                if (Native.GetWindowRect(active, out r))
                    covered = Rectangle.FromLTRB(r.Left, r.Top, r.Right, r.Bottom);
            }

            bool battery = R.PauseOnBattery && SystemInformation.PowerStatus.PowerLineStatus == PowerLineStatus.Offline;
            if (battery != onBattery) { onBattery = battery; SendState(); }
            Desktop.CheckOrder(screens.Select(f => f.Handle).ToList());
            foreach (var f in screens)
            {
                bool cache = covered.Contains(Screen.FromRectangle(f.Screen).WorkingArea);
                if (paused || cache || battery || locked) f.Suspend(); else f.Resume();
            }
        }

        public static string TypeOf(string file)
        {
            string type;
            return Types.TryGetValue(Path.GetExtension(file).ToLowerInvariant(), out type) ? type : null;
        }

        static void ForEachWallpaper(Action<WallpaperForm> action)
        {
            bool dead = false;
            foreach (var f in screens.ToList())
            {
                if (!f.Alive) { dead = true; continue; }
                try { action(f); }
                catch (Exception ex) { Log(ex); dead = true; }
            }
            if (dead) RebuildSoon();
        }

        static void Apply(bool fade = true)
        {
            ForEachWallpaper(f => f.Show(R, WallpaperOf(f.Screen), fade));
        }

        // Previous and Next walk the library in the order of the Wallpaper page, so the next one is always the one that comes after in the grid.
        public static void PreviousWallpaper()
        {
            var wallpapers = ListWallpapers().ToList();
            RestartSlideshow();
            if (wallpapers.Count < 2) return;
            int i = wallpapers.IndexOf(R.Wallpaper);
            R.Wallpaper = wallpapers[(i <= 0 ? wallpapers.Count : i) - 1];
            R.ScreenWallpapers.RemoveAll(x => x.Wallpaper == R.Wallpaper);
            Apply();
            Save();
            Tray.Update();
            SendState();
        }

        public static string ScreenKey(Rectangle b) { return b.Width + "x" + b.Height + "@" + b.X + "," + b.Y; }

        // A wallpaper chosen for one screen is known by the screen's place, and changing the main screen moves every screen.
        public static void ScreensMoved(int dx, int dy)
        {
            Action<List<ScreenWallpaper>> shift = list =>
            {
                if (list == null) return;
                foreach (var w in list)
                {
                    var m = System.Text.RegularExpressions.Regex.Match(w.Key ?? "", @"^(\d+x\d+)@(-?\d+),(-?\d+)$");
                    if (m.Success) w.Key = m.Groups[1].Value + "@" + (int.Parse(m.Groups[2].Value) + dx) + "," + (int.Parse(m.Groups[3].Value) + dy);
                }
            };
            shift(R.ScreenWallpapers);
            foreach (var mood in R.Moods) shift(mood.ScreenWallpapers);
            Arrange.Moved(dx, dy);
            Save();
        }

        public static List<Screen> OrderedScreens() { return Screen.AllScreens.OrderBy(s => s.Bounds.X).ThenBy(s => s.Bounds.Y).ToList(); }

        static bool Exists(string name)
        {
            return !string.IsNullOrEmpty(name) && (File.Exists(Path.Combine(WallpapersFolder, name)) || Directory.Exists(Path.Combine(WallpapersFolder, name)));
        }

        public static string WallpaperOf(Rectangle bounds)
        {
            string key = ScreenKey(bounds);
            var x = R.ScreenWallpapers.FirstOrDefault(s => s.Key == key);
            return x != null && Exists(x.Wallpaper) ? x.Wallpaper : R.Wallpaper;
        }

        static void SetScreenWallpaper(string key, string name)
        {
            R.ScreenWallpapers.RemoveAll(s => s.Key == key);
            if (name != R.Wallpaper) R.ScreenWallpapers.Add(new ScreenWallpaper { Key = key, Wallpaper = name });
        }

        public static bool Paused { get { return paused; } }

        public static void TogglePause()
        {
            paused = !paused;
            UpdateVisibility();
            Tray.Update();
            SendState();
        }

        public static int WallpaperCount { get { return ListWallpapers().Count(); } }

        static void Adjust(bool reloadOtherwise) { ForEachWallpaper(f => f.Adjust(R, reloadOtherwise)); }

        static void Effects() { ForEachWallpaper(f => f.Effects(R)); }

        // The look of the wallpaper goes back to default; the slideshow and the sound reaction are choices, not a look, so they stay.
        static void ResetEffects()
        {
            int light = R.Light, speed = R.Speed, blur = R.Blur, saturation = R.Saturation, dim = R.Dim;
            string fit = R.Fit;
            var defaults = new Settings();
            Action set = () => { Adjust(true); Effects(); Apply(false); };
            R.Light = defaults.Light; R.Speed = defaults.Speed; R.Blur = defaults.Blur; R.Saturation = defaults.Saturation; R.Dim = defaults.Dim; R.Fit = defaults.Fit;
            set();
            Undoable(Language.T("Wallpaper settings reset"), () =>
            {
                R.Light = light; R.Speed = speed; R.Blur = blur; R.Saturation = saturation; R.Dim = dim; R.Fit = fit;
                set();
            });
        }

        static void RestartSlideshow()
        {
            nextSlideshow = R.Slideshow > 0 ? DateTime.Now.AddMinutes(R.Slideshow) : DateTime.MaxValue;
        }

        // Only the slideshow shuffles: the buttons and the tray menu follow the order of the library.
        public static void NextWallpaper(bool automatic = false)
        {
            var wallpapers = ListWallpapers().ToList();
            RestartSlideshow();
            if (wallpapers.Count < 2) return;
            var taken = new List<string>();
            Func<string, string> pick = now =>
            {
                var free = wallpapers.Where(n => n != now && !taken.Contains(n)).ToList();
                if (free.Count == 0) free = wallpapers.Where(n => n != now).ToList();
                string chosen = automatic && R.Shuffle ? free[random.Next(free.Count)]
                    : wallpapers.Skip(wallpapers.IndexOf(now) + 1).Concat(wallpapers).First(n => free.Contains(n));
                taken.Add(chosen);
                return chosen;
            };
            R.Wallpaper = pick(R.Wallpaper);
            foreach (var x in R.ScreenWallpapers) x.Wallpaper = pick(x.Wallpaper);
            R.ScreenWallpapers.RemoveAll(x => x.Wallpaper == R.Wallpaper);
            Apply();
            Save();
            Tray.Update();
            SendState();
        }

        static readonly string[] Featured = { "bramble-logo.html", "bramble-dusk.html", "bramble.html", "aurora.html" };

        static IEnumerable<string> ListWallpapers()
        {
            Directory.CreateDirectory(WallpapersFolder);
            return Directory.GetFiles(WallpapersFolder).Where(f => TypeOf(f) != null)
                .Concat(Directory.GetDirectories(WallpapersFolder).Where(d => File.Exists(Path.Combine(d, "index.html"))))
                .Select(Path.GetFileName)
                .OrderBy(n => { int i = Array.IndexOf(Featured, n); return i < 0 ? Featured.Length : i; })
                .ThenBy(n => n, StringComparer.CurrentCultureIgnoreCase);
        }

        static long Stamp(string name)
        {
            string path = Path.Combine(WallpapersFolder, name);
            if (!Directory.Exists(path)) return File.Exists(path) ? File.GetLastWriteTimeUtc(path).Ticks / 10000000 : 0;
            string config = Path.Combine(path, "config.json");
            return (File.Exists(config) ? File.GetLastWriteTimeUtc(config) : Directory.GetLastWriteTimeUtc(path)).Ticks / 10000000;
        }

        public static string UrlMedia(string name)
        {
            bool folder = Directory.Exists(Path.Combine(WallpapersFolder, name));
            return "https://" + WallpaperForm.MediaHost + "/" + Uri.EscapeDataString(name) + (folder ? "/index.html" : "");
        }

        public static string WallpaperType(string name)
        {
            return Directory.Exists(Path.Combine(WallpapersFolder, name)) ? "html" : TypeOf(name);
        }

        static void AddFiles()
        {
            using (var dialog = new OpenFileDialog())
            {
                dialog.Title = Language.T("Add wallpapers");
                dialog.Multiselect = true;
                dialog.Filter = Language.T("Videos, GIFs, images, HTML pages") + "|" + string.Join(";", Types.Keys.Select(e => "*" + e)) + "|" + Language.T("All files") + "|*.*";
                if (dialog.ShowDialog(settingsWindow) != DialogResult.OK) return;
                Copy(dialog.FileNames);
            }
        }

        static void Copy(IEnumerable<string> sources)
        {
            string last = null;
            int ignores = 0;
            foreach (string source in sources)
            {
                bool folder = Directory.Exists(source);
                if (folder ? !File.Exists(Path.Combine(source, "index.html")) : TypeOf(source) == null) { ignores++; continue; }
                if (string.Equals(Path.GetDirectoryName(source), WallpapersFolder, StringComparison.OrdinalIgnoreCase)) { last = Path.GetFileName(source); continue; }
                string name = folder ? Path.GetFileName(source) : Path.GetFileNameWithoutExtension(source);
                string ext = folder ? "" : Path.GetExtension(source);
                string target = Path.Combine(WallpapersFolder, name + ext);
                for (int i = 2; File.Exists(target) || Directory.Exists(target); i++) target = Path.Combine(WallpapersFolder, name + " (" + i + ")" + ext);
                if (folder) FileSystem.CopyDirectory(source, target); else File.Copy(source, target);
                last = Path.GetFileName(target);
            }
            if (last != null) { R.Wallpaper = last; Apply(); }
            if (ignores > 0) announcement = ignores == 1 ? Language.T("Unsupported format") : Language.T("{0} files skipped, unsupported format", ignores);
        }

        static void Remove(string name)
        {
            if (Featured.Contains(name)) return;
            string path = Path.Combine(WallpapersFolder, name);
            if (!File.Exists(path) && !Directory.Exists(path)) return;
            bool current = name == R.Wallpaper;
            var exceptions = R.ScreenWallpapers.Where(s => s.Wallpaper == name).ToList();
            if (current) R.Wallpaper = ListWallpapers().FirstOrDefault(n => n != name);
            R.ScreenWallpapers.RemoveAll(s => s.Wallpaper == name);
            if (current || exceptions.Count > 0) Apply();
            string title = Directory.Exists(path) ? name : Path.GetFileNameWithoutExtension(name);
            SetAside(path, title, () =>
            {
                if (current) R.Wallpaper = name;
                R.ScreenWallpapers.AddRange(exceptions);
                if (current || exceptions.Count > 0) Apply();
            });
        }

        public static void SetAside(string path, string title, Action undo)
        {
            Discard();
            try
            {
                Directory.CreateDirectory(RemovedFolder);
                string target = Path.Combine(RemovedFolder, Path.GetFileName(path));
                if (Directory.Exists(path)) Directory.Move(path, target); else File.Move(path, target);
                removed = title;
                removalPath = path;
                removalUndo = undo;
                removalDelay.Start();
            }
            catch (Exception ex)
            {
                Log(ex);
                if (Directory.Exists(path)) FileSystem.DeleteDirectory(path, UIOption.OnlyErrorDialogs, RecycleOption.SendToRecycleBin);
                else if (File.Exists(path)) FileSystem.DeleteFile(path, UIOption.OnlyErrorDialogs, RecycleOption.SendToRecycleBin);
            }
        }

        // commit runs when the toast closes without Undo, or when Bramble quits.
        public static void UndoableRemoval(string title, Action undo, Action commit = null)
        {
            Discard();
            removed = title;
            removalPath = null;
            removalUndo = undo;
            removalCommit = commit;
            removalDelay.Start();
        }

        public static void Undoable(string text, Action undo)
        {
            Discard();
            undoText = text;
            removalPath = null;
            removalUndo = undo;
            removalDelay.Start();
        }

        static void UndoRemoval()
        {
            if (removed == null && undoText == null) return;
            removalDelay.Stop();
            if (removalPath != null && !File.Exists(removalPath) && !Directory.Exists(removalPath))
            {
                string source = Path.Combine(RemovedFolder, Path.GetFileName(removalPath));
                if (Directory.Exists(source)) Directory.Move(source, removalPath);
                else if (File.Exists(source)) File.Move(source, removalPath);
            }
            var undo = removalUndo;
            removalCommit = null;
            removed = null;
            undoText = null;
            removalUndo = null;
            if (undo != null) undo();
        }

        static void Discard()
        {
            if (removalDelay != null) removalDelay.Stop();
            var commit = removalCommit;
            removalCommit = null;
            if (commit != null) try { commit(); } catch (Exception ex) { Log(ex); }
            removed = null;
            undoText = null;
            removalUndo = null;
            try
            {
                if (!Directory.Exists(RemovedFolder)) return;
                foreach (string d in Directory.GetDirectories(RemovedFolder))
                    FileSystem.DeleteDirectory(d, UIOption.OnlyErrorDialogs, RecycleOption.SendToRecycleBin);
                foreach (string f in Directory.GetFiles(RemovedFolder))
                    FileSystem.DeleteFile(f, UIOption.OnlyErrorDialogs, RecycleOption.SendToRecycleBin);
            }
            catch (Exception ex) { Log(ex); }
        }

        public static async void OpenSettings()
        {
            if (environment == null) return;
            if (settingsWindow == null)
            {
                var form = new SettingsForm();
                settingsWindow = form;
                form.FormClosed += (s, e) => { if (settingsWindow == form) { settingsWindow = null; pageReady = false; } };
                settingsWindow.Show();
                await settingsWindow.Initialize(environment, Receive);
            }
            settingsWindow.Show();
            if (settingsWindow.WindowState == FormWindowState.Minimized) settingsWindow.WindowState = FormWindowState.Normal;
            settingsWindow.Activate();
        }

        static void Receive(string message, List<string> files)
        {
            var m = json.Deserialize<Dictionary<string, object>>(message);
            string action = (string)m["action"];

            if (action.StartsWith("station."))
            {
                if (!Sounds.Receive(action.Substring(action.IndexOf('.') + 1), m)) return;
                Save();
                Tray.Update();
                SendState();
                return;
            }

            if (action.StartsWith("network.")) { Network.Receive(action.Substring(action.IndexOf('.') + 1)); return; }

            if (action.StartsWith("tasks.")) { Tasks.Receive(action.Substring(action.IndexOf('.') + 1), m); return; }

            if (action.StartsWith("creator."))
            {
                if (Creator.Receive(action.Substring(action.IndexOf('.') + 1), m)) { Save(); SendState(); }
                return;
            }

            if (action.StartsWith("moods."))
            {
                if (Moods.Receive(action.Substring(action.IndexOf('.') + 1), m)) { Save(); SendState(); }
                return;
            }

            if (action.StartsWith("health.")) { Health.Receive(action.Substring(action.IndexOf('.') + 1), m); return; }

            if (action.StartsWith("home.")) { Weather.Receive(action.Substring(action.IndexOf('.') + 1), m); return; }

            if (action.StartsWith("display.") || action.StartsWith("power."))
            {
                string sub = action.Substring(action.IndexOf('.') + 1);
                if (action.StartsWith("display.") ? Display.Receive(sub, m) : Power.Receive(sub, m)) { Save(); SendState(); }
                return;
            }

            if (action.StartsWith("updates."))
            {
                if (Updates.Receive(action.Substring(action.IndexOf('.') + 1), m)) { Save(); SendState(); }
                return;
            }

            if (action.StartsWith("mouse."))
            {
                if (Mouse.Receive(action.Substring(action.IndexOf('.') + 1), m, files)) SendState();
                return;
            }
            if (action.StartsWith("icons.") || action.StartsWith("arrange.") || action.StartsWith("files.") || action.StartsWith("hardware."))
            {
                string sub = action.Substring(action.IndexOf('.') + 1);
                bool change = action.StartsWith("icons.") ? Icons.Receive(sub, m, files)
                    : action.StartsWith("arrange.") ? Arrange.Receive(sub, m)
                    : action.StartsWith("files.") ? DiskUsage.Receive(sub, m)
                    : Hardware.Receive(sub, m);
                if (!change) return;
                Save();
                SendState();
                return;
            }

            bool live = m.ContainsKey("live") && (bool)m["live"];
            if (action == "state") pageReady = true;
            switch (action)
            {
                case "choose":
                {
                    string name = (string)m["name"], screen = m.ContainsKey("screen") ? m["screen"] as string : null;
                    if (string.IsNullOrEmpty(screen)) { R.Wallpaper = name; R.ScreenWallpapers.Clear(); }
                    else SetScreenWallpaper(screen, name);
                    Apply();
                    RestartSlideshow();
                    Tray.Update();
                    break;
                }
                case "shuffle": R.Shuffle = (bool)m["value"]; break;
                case "frameRate": R.FrameRate = Convert.ToInt32(m["value"]) >= 60 ? 60 : 30; ForEachWallpaper(f => f.FrameRate(R.FrameRate)); break;
                case "blur": R.Blur = Convert.ToInt32(m["value"]); Effects(); if (live) return; break;
                case "saturation": R.Saturation = Convert.ToInt32(m["value"]); Effects(); if (live) return; break;
                case "dim": R.Dim = Convert.ToInt32(m["value"]); Effects(); if (live) return; break;
                case "fit": R.Fit = (string)m["value"] == "fit" ? "fit" : "fill"; Apply(); break;
                case "slideshow": R.Slideshow = Math.Max(0, Convert.ToInt32(m["value"])); RestartSlideshow(); break;
                case "pauseOnBattery": R.PauseOnBattery = (bool)m["value"]; UpdateVisibility(); break;
                case "light": R.Light = Convert.ToInt32(m["value"]); Adjust(!live); if (live) return; break;
                case "speed": R.Speed = Convert.ToInt32(m["value"]); Adjust(!live); if (live) return; break;
                case "pauseAuto": R.PauseAuto = (bool)m["value"]; UpdateVisibility(); break;
                case "resetEffects": ResetEffects(); break;
                case "pause": TogglePause(); return;
                case "next": NextWallpaper(); return;
                case "previous": PreviousWallpaper(); return;
                case "startup": ToggleStartup(); break;
                case "weather": R.Weather = !R.Weather; break;
                case "zoom": R.Zoom = Math.Max(70, Math.Min(200, Convert.ToInt32(m["value"]))); if (settingsWindow != null) settingsWindow.SetZoom(R.Zoom); break;
                case "reactive": R.Reactive = (bool)m["value"]; AudioMeter.Set(R.Reactive); break;
                case "audioPreview": AudioMeter.Preview((bool)m["value"]); return;
                case "language":
                {
                    string l = (string)m["value"];
                    string chosen = l == "en" || l == "fr" ? l : "auto";
                    if (chosen == R.Language) return;
                    R.Language = chosen;
                    Language.Choose(R.Language);
                    Save();
                    Tray.Update();
                    if (settingsWindow != null) settingsWindow.ChangeLanguage();
                    return;
                }
                case "add": AddFiles(); break;
                case "remove": Remove((string)m["name"]); break;
                case "undo": UndoRemoval(); break;
                case "drop": Copy(files); break;
                case "folder": Process.Start("explorer.exe", "\"" + WallpapersFolder + "\""); break;
                case "quit": Quit(); return;
                case "pageError": Log(new Exception("Page: " + m["text"])); return;
                case "folderBramble": Process.Start("explorer.exe", "\"" + Root + "\""); return;
                case "log":
                {
                    string log = Path.Combine(Root, "errors.log");
                    if (File.Exists(log)) Process.Start("notepad.exe", "\"" + log + "\"");
                    else { Announce("No errors logged"); break; }
                    return;
                }
            }
            Save();
            SendState();
        }

        public static void WallpaperChanged()
        {
            Apply();
            Effects();
            Adjust(false);
            RestartSlideshow();
            UpdateVisibility();
        }

        public static void SendAudio(double level)
        {
            string text = level.ToString("0.##", System.Globalization.CultureInfo.InvariantCulture);
            if (R.Reactive) foreach (var s in screens) s.Audio(text);
            Send(new { type = "audio.level", level = level });
        }

        public static void SendState()
        {
            if (settingsWindow == null) return;
            var state = new
            {
                type = "state",
                wallpapers = ListWallpapers().Select(n => new { name = n, type = WallpaperType(n), url = UrlMedia(n), custom = File.Exists(Path.Combine(WallpapersFolder, n, "config.json")), bundled = Featured.Contains(n), stamp = Stamp(n) }).ToArray(),
                current = R.Wallpaper,
                displays = OrderedScreens().Select((s, i) =>
                {
                    string key = ScreenKey(s.Bounds);
                    var x = R.ScreenWallpapers.FirstOrDefault(w => w.Key == key && Exists(w.Wallpaper));
                    return new { key = key, n = i + 1, primary = s.Primary, w = s.Bounds.Width, h = s.Bounds.Height, scale = Arrange.Scale(s), wallpaper = x == null ? null : x.Wallpaper };
                }).ToArray(),
                shuffle = R.Shuffle,
                frameRate = R.FrameRate,
                updates = Updates.State(),
                light = R.Light,
                speed = R.Speed,
                pauseAuto = R.PauseAuto,
                pauseOnBattery = R.PauseOnBattery,
                onBattery = onBattery,
                blur = R.Blur,
                saturation = R.Saturation,
                dim = R.Dim,
                fit = R.Fit,
                slideshow = R.Slideshow,
                paused = paused,
                startup = StartupEnabled(),
                weather = R.Weather,
                weatherPlace = R.WeatherPlace == null ? null : R.WeatherPlace.Label,
                reactive = R.Reactive,
                zoom = R.Zoom,
                moods = Moods.State(),
                moodModels = Moods.Models(),
                display = Display.State(),
                power = Power.State(),
                language = R.Language,
                about = new
                {
                    version = Version,
                    compile = File.GetLastWriteTime(Application.ExecutablePath).ToString("yyyy-MM-dd"),
                    folder = Root,
                    errors = File.Exists(Path.Combine(Root, "errors.log")),
                    windows = Native.Build >= 22000 ? "Windows 11" : "Windows 10",
                },
                screens = screens.Count,
                removed = removed,
                undoable = undoText,
                announcement = announcement,
                station = Sounds.State(),
                icons = Icons.State(),
                mouse = Mouse.State(),
                arrange = Arrange.State(),
                files = DiskUsage.State(),
                view = requestedView,
            };
            announcement = null;
            if (pageReady) requestedView = null;
            settingsWindow.Send(json.Serialize(state));
        }

        public static void Send(object message)
        {
            if (settingsWindow != null) settingsWindow.Send(json.Serialize(message));
        }

        static void Load()
        {
            try { if (File.Exists(SettingsFile)) R = json.Deserialize<Settings>(File.ReadAllText(SettingsFile)); }
            catch (Exception ex) { Log(ex); }
        }

        public static void Save()
        {
            try
            {
                string temporary = SettingsFile + ".tmp";
                File.WriteAllText(temporary, json.Serialize(R));
                if (File.Exists(SettingsFile)) File.Replace(temporary, SettingsFile, null);
                else File.Move(temporary, SettingsFile);
            }
            catch (Exception ex) { Log(ex); }
        }

        static bool StartupEnabled()
        {
            using (var key = Registry.CurrentUser.OpenSubKey(StartupKey))
                return key != null && key.GetValue("Bramble") != null;
        }

        static void ToggleStartup()
        {
            using (var key = Registry.CurrentUser.CreateSubKey(StartupKey))
            {
                if (StartupEnabled()) key.DeleteValue("Bramble", false);
                else key.SetValue("Bramble", "\"" + Application.ExecutablePath + "\" --background");
            }
        }

        static void FollowFolder()
        {
            string exe = Application.ExecutablePath;
            try
            {
                using (var key = Registry.CurrentUser.OpenSubKey(StartupKey, true))
                {
                    string v = key == null ? null : key.GetValue("Bramble") as string;
                    if (v != null && (v.IndexOf(exe, StringComparison.OrdinalIgnoreCase) < 0 || v.Contains("--discret"))) key.SetValue("Bramble", "\"" + exe + "\" --background");
                }
            }
            catch (Exception ex) { Log(ex); }
            foreach (var folder in new[] { Environment.SpecialFolder.DesktopDirectory, Environment.SpecialFolder.Programs })
                FollowShortcut(Path.Combine(Environment.GetFolderPath(folder), "Bramble.lnk"), exe);
        }

        // Windows moves a shortcut's target along with a renamed folder but leaves its icon path behind.
        static void FollowShortcut(string lnk, string exe)
        {
            try
            {
                if (!File.Exists(lnk)) return;
                Type type = Type.GetTypeFromProgID("WScript.Shell");
                object shell = Activator.CreateInstance(type);
                object r = type.InvokeMember("CreateShortcut", System.Reflection.BindingFlags.InvokeMethod, null, shell, new object[] { lnk });
                Type t = r.GetType();
                Func<string, string> read = name => (t.InvokeMember(name, System.Reflection.BindingFlags.GetProperty, null, r, null) as string) ?? "";
                string target = read("TargetPath"), icon = Environment.ExpandEnvironmentVariables(read("IconLocation").Split(',')[0]);
                bool ours = target.EndsWith("Bramble.exe", StringComparison.OrdinalIgnoreCase);
                bool staleIcon = icon.Length > 0 && !File.Exists(icon);
                if (ours && (!target.Equals(exe, StringComparison.OrdinalIgnoreCase) || staleIcon))
                {
                    t.InvokeMember("TargetPath", System.Reflection.BindingFlags.SetProperty, null, r, new object[] { exe });
                    t.InvokeMember("WorkingDirectory", System.Reflection.BindingFlags.SetProperty, null, r, new object[] { Root });
                    if (staleIcon || icon.EndsWith("Bramble.exe", StringComparison.OrdinalIgnoreCase))
                        t.InvokeMember("IconLocation", System.Reflection.BindingFlags.SetProperty, null, r, new object[] { exe + ",0" });
                    t.InvokeMember("Save", System.Reflection.BindingFlags.InvokeMethod, null, r, null);
                }
                System.Runtime.InteropServices.Marshal.FinalReleaseComObject(r);
                System.Runtime.InteropServices.Marshal.FinalReleaseComObject(shell);
            }
            catch (Exception ex) { Log(ex); }
        }

        static string ShortcutTarget(string lnk)
        {
            try
            {
                Type type = Type.GetTypeFromProgID("WScript.Shell");
                object shell = Activator.CreateInstance(type);
                object r = type.InvokeMember("CreateShortcut", System.Reflection.BindingFlags.InvokeMethod, null, shell, new object[] { lnk });
                string target = r.GetType().InvokeMember("TargetPath", System.Reflection.BindingFlags.GetProperty, null, r, null) as string;
                System.Runtime.InteropServices.Marshal.FinalReleaseComObject(r);
                System.Runtime.InteropServices.Marshal.FinalReleaseComObject(shell);
                return target ?? "";
            }
            catch (Exception ex) { Log(ex); return ""; }
        }

        static void Uninstall()
        {
            string exe = Application.ExecutablePath;
            foreach (var p in Process.GetProcessesByName("Bramble"))
                using (p)
                {
                    string path;
                    try { path = p.MainModule.FileName; } catch { continue; }
                    if (p.Id == Process.GetCurrentProcess().Id || !path.Equals(exe, StringComparison.OrdinalIgnoreCase)) continue;
                    try { File.WriteAllText(RequestFile, "::quit"); } catch { }
                    EventWaitHandle signal;
                    if (EventWaitHandle.TryOpenExisting(OpenSignal, out signal)) signal.Set();
                    if (!p.WaitForExit(15000)) try { p.Kill(); p.WaitForExit(5000); } catch (Exception ex) { Log(ex); }
                }

            Load();
            try { Mouse.Uninstall(); } catch (Exception ex) { Log(ex); }
            try { Icons.Uninstall(); } catch (Exception ex) { Log(ex); }
            try
            {
                using (var key = Registry.CurrentUser.OpenSubKey(StartupKey, true))
                {
                    string v = key == null ? null : key.GetValue("Bramble") as string;
                    if (v != null && v.IndexOf(exe, StringComparison.OrdinalIgnoreCase) >= 0) key.DeleteValue("Bramble", false);
                }
            }
            catch (Exception ex) { Log(ex); }
            foreach (var folder in new[] { Environment.SpecialFolder.DesktopDirectory, Environment.SpecialFolder.Programs })
            {
                string lnk = Path.Combine(Environment.GetFolderPath(folder), "Bramble.lnk");
                if (File.Exists(lnk) && ShortcutTarget(lnk).Equals(exe, StringComparison.OrdinalIgnoreCase))
                    try { File.Delete(lnk); } catch (Exception ex) { Log(ex); }
            }
            Save();
        }

        public static void UpdateMenu() { Tray.Update(); }

        public static bool Quitting { get { return quitting; } }

        public static void Quit()
        {
            quitting = true;
            Tray.Hide();
            Sounds.Stop();
            Display.Stop();
            Discard();
            if (settingsWindow != null) settingsWindow.Shutdown();
            Destroy();
            Application.Exit();
        }

        const long LogMax = 256 * 1024;

        public static void Log(Exception ex)
        {
            try
            {
                string path = Path.Combine(Root, "errors.log");
                if (File.Exists(path) && new FileInfo(path).Length > LogMax)
                {
                    string old = Path.Combine(Root, "errors.old.log");
                    if (File.Exists(old)) File.Delete(old);
                    File.Move(path, old);
                }
                File.AppendAllText(path, DateTime.Now.ToString("s") + "  " + ex + Environment.NewLine + Environment.NewLine);
            }
            catch { }
        }
    }

    class Watcher : NativeWindow
    {
        static readonly int TaskbarCreated = Native.RegisterWindowMessage("TaskbarCreated");
        readonly Action action;

        public Watcher(Action action)
        {
            this.action = action;
            CreateHandle(new CreateParams());
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == TaskbarCreated) action();
            base.WndProc(ref m);
        }
    }
}
