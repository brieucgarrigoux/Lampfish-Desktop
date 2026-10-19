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
[assembly: System.Reflection.AssemblyVersion("0.1.0.0")]
[assembly: System.Reflection.AssemblyFileVersion("0.1.0.0")]

namespace Bramble
{
    class Settings
    {
        public string Language = "auto";
        public bool Weather = true;
        public List<Dictionary<string, object>> NetworkTests = new List<Dictionary<string, object>>();
        public string Wallpaper = "bramble.html";
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
        public List<MoodSetting> Moods = new List<MoodSetting>();
        public string CurrentMood;
        public DockSettings Dock = new DockSettings();
        public IconsSettings Icons = new IconsSettings();
        public IconsSettings Folders;
        public ArrangeSettings Arrange = new ArrangeSettings();
        public DiskUsageSettings DiskUsage = new DiskUsageSettings();
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
        static readonly JavaScriptSerializer json = new JavaScriptSerializer();
        static CoreWebView2Environment environment;
        static readonly List<WallpaperForm> screens = new List<WallpaperForm>();
        static SettingsForm settingsWindow;
        static NotifyIcon icon;
        static System.Windows.Forms.Timer rebuild, removalDelay;
        static string removed, removalPath, announcement, requestedView;
        static DateTime nextSlideshow = DateTime.MaxValue;
        static bool onBattery;
        static Action removalUndo;
        static ToolStripMenuItem soundsMenu;
        static SynchronizationContext context;
        static DateTime lastBuild = DateTime.MinValue;
        static int generation;
        static readonly Queue<DateTime> rebuilds = new Queue<DateTime>();
        static string lastReason;
        static bool paused, building, pending, restart, quitting, pageReady;

        [STAThread]
        static void Main(string[] args)
        {
            bool firstInstance;
            using (new Mutex(true, "Bramble.SingleInstance", out firstInstance))
            {
                string requestedFolder = RequestedFolder(args);
                if (!firstInstance)
                {
                    if (requestedFolder != null)
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
                Sounds.Start(args.Contains("--discret"));
                Icons.Start();
                Mouse.Start();
                Arrange.Start();
                DiskUsage.Start();
                Hardware.Start();
                AudioMeter.Set(R.Reactive);
                Moods.Start();
                if (requestedFolder != null) { Icons.Ask(requestedFolder); requestedView = "icons"; }

                int iView = Array.IndexOf(args, "--view");
                if (iView >= 0 && iView + 1 < args.Length) requestedView = args[iView + 1];
                CreateIcon();
                ListenSignal();

                removalDelay = new System.Windows.Forms.Timer { Interval = 8000 };
                removalDelay.Tick += (s, e) => { Discard(); SendState(); };
                Discard();

                rebuild = new System.Windows.Forms.Timer { Interval = 1500 };
                rebuild.Tick += (s, e) => { rebuild.Stop(); Build(); };
                SystemEvents.DisplaySettingsChanged += (s, e) => { RebuildSoon(); Arrange.ScreensChanged(); Moods.ScreensChanged(); };
                var watcher = new Watcher(RebuildSoon);

                var slideshow = new System.Windows.Forms.Timer { Interval = 20000 };
                slideshow.Tick += (s, e) => { if (R.Slideshow > 0 && DateTime.Now >= nextSlideshow) NextWallpaper(); };
                slideshow.Start();
                RestartSlideshow();

                var fullscreen = new System.Windows.Forms.Timer { Interval = 1000 };
                fullscreen.Tick += (s, e) => UpdateVisibility();
                fullscreen.Start();

                Start(!args.Contains("--discret") || requestedFolder != null);
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
                    context.Post(_ => { OpenSettings(); HandleRequest(); }, null);
                }
            }) { IsBackground = true };
            crumbs.Start();
        }

        static string RequestedFolder(string[] args)
        {
            int i = Array.IndexOf(args, "--folder");
            return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
        }

        static void HandleRequest()
        {
            try
            {
                if (!File.Exists(RequestFile)) return;
                string folder = File.ReadAllText(RequestFile).Trim();
                File.Delete(RequestFile);
                Icons.Ask(folder);
                requestedView = "icons";
                SendState();
            }
            catch (Exception ex) { Log(ex); }
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
            var options = new CoreWebView2EnvironmentOptions("--autoplay-policy=no-user-gesture-required");
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
                    f.Show(R);
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
                var dead = screens.FirstOrDefault(f => !f.Alive);
                string reason = !Desktop.Valid() ? "Desktop missing" : dead != null ? dead.Problem : null;
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
                if (paused || cache || battery) f.Suspend(); else f.Resume();
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

        static void Apply() { ForEachWallpaper(f => f.Show(R)); }

        static void Adjust(bool reloadOtherwise) { ForEachWallpaper(f => f.Adjust(R, reloadOtherwise)); }

        static void Effects() { ForEachWallpaper(f => f.Effects(R)); }

        static void RestartSlideshow()
        {
            nextSlideshow = R.Slideshow > 0 ? DateTime.Now.AddMinutes(R.Slideshow) : DateTime.MaxValue;
        }

        static void NextWallpaper()
        {
            var wallpapers = ListWallpapers().ToList();
            RestartSlideshow();
            if (wallpapers.Count < 2) return;
            R.Wallpaper = wallpapers[(wallpapers.IndexOf(R.Wallpaper) + 1) % wallpapers.Count];
            Apply();
            Save();
            SendState();
        }

        static IEnumerable<string> ListWallpapers()
        {
            Directory.CreateDirectory(WallpapersFolder);
            return Directory.GetFiles(WallpapersFolder).Where(f => TypeOf(f) != null)
                .Concat(Directory.GetDirectories(WallpapersFolder).Where(d => File.Exists(Path.Combine(d, "index.html"))))
                .Select(Path.GetFileName)
                .OrderBy(n => n, StringComparer.CurrentCultureIgnoreCase);
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
            string path = Path.Combine(WallpapersFolder, name);
            if (!File.Exists(path) && !Directory.Exists(path)) return;
            bool current = name == R.Wallpaper;
            if (current) { R.Wallpaper = ListWallpapers().FirstOrDefault(n => n != name); Apply(); }
            string title = Directory.Exists(path) ? name : Path.GetFileNameWithoutExtension(name);
            SetAside(path, title, () => { if (current) { R.Wallpaper = name; Apply(); } });
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

        public static void UndoableRemoval(string title, Action undo)
        {
            Discard();
            removed = title;
            removalPath = null;
            removalUndo = undo;
            removalDelay.Start();
        }

        static void UndoRemoval()
        {
            if (removed == null) return;
            removalDelay.Stop();
            string source = Path.Combine(RemovedFolder, Path.GetFileName(removalPath));
            if (removalPath != null && !File.Exists(removalPath) && !Directory.Exists(removalPath))
            {
                if (Directory.Exists(source)) Directory.Move(source, removalPath);
                else if (File.Exists(source)) File.Move(source, removalPath);
            }
            if (removalUndo != null) removalUndo();
            removed = null;
            removalUndo = null;
        }

        static void Discard()
        {
            if (removalDelay != null) removalDelay.Stop();
            removed = null;
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
                settingsWindow = new SettingsForm();
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
                UpdateMenu();
                SendState();
                return;
            }

            if (action.StartsWith("network.")) { Network.Receive(action.Substring(action.IndexOf('.') + 1)); return; }

            if (action.StartsWith("tasks.")) { Tasks.Receive(action.Substring(action.IndexOf('.') + 1), m); return; }

            if (action.StartsWith("moods."))
            {
                if (Moods.Receive(action.Substring(action.IndexOf('.') + 1), m)) { Save(); SendState(); }
                return;
            }

            if (action.StartsWith("home.")) { Weather.Receive(action.Substring(action.IndexOf('.') + 1)); return; }

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
                case "choose": R.Wallpaper = (string)m["name"]; Apply(); RestartSlideshow(); break;
                case "blur": R.Blur = Convert.ToInt32(m["value"]); Effects(); if (live) return; break;
                case "saturation": R.Saturation = Convert.ToInt32(m["value"]); Effects(); if (live) return; break;
                case "dim": R.Dim = Convert.ToInt32(m["value"]); Effects(); if (live) return; break;
                case "fit": R.Fit = (string)m["value"] == "fit" ? "fit" : "fill"; Apply(); break;
                case "slideshow": R.Slideshow = Math.Max(0, Convert.ToInt32(m["value"])); RestartSlideshow(); break;
                case "pauseOnBattery": R.PauseOnBattery = (bool)m["value"]; UpdateVisibility(); break;
                case "light": R.Light = Convert.ToInt32(m["value"]); Adjust(!live); if (live) return; break;
                case "speed": R.Speed = Convert.ToInt32(m["value"]); Adjust(!live); if (live) return; break;
                case "pauseAuto": R.PauseAuto = (bool)m["value"]; UpdateVisibility(); break;
                case "pause": paused = !paused; UpdateVisibility(); break;
                case "startup": ToggleStartup(); break;
                case "weather": R.Weather = !R.Weather; break;
                case "reactive": R.Reactive = (bool)m["value"]; AudioMeter.Set(R.Reactive); break;
                case "language":
                {
                    string l = (string)m["value"];
                    R.Language = l == "en" || l == "fr" ? l : "auto";
                    Language.Choose(R.Language);
                    Save();
                    TranslateMenu();
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
            foreach (var s in screens) s.Audio(text);
            Send(new { type = "audio.level", level = level });
        }

        public static void SendState()
        {
            if (settingsWindow == null) return;
            var state = new
            {
                type = "state",
                wallpapers = ListWallpapers().Select(n => new { name = n, type = WallpaperType(n), url = UrlMedia(n) }).ToArray(),
                current = R.Wallpaper,
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
                reactive = R.Reactive,
                moods = Moods.State(),
                language = R.Language,
                about = new
                {
                    version = Version,
                    compile = File.GetLastWriteTime(Application.ExecutablePath).ToString("yyyy-MM-dd"),
                    folder = Root,
                    errors = File.Exists(Path.Combine(Root, "errors.log")),
                    windows = Environment.OSVersion.Version.Build >= 22000 ? "Windows 11" : "Windows 10",
                },
                screens = screens.Count,
                removed = removed,
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
                else key.SetValue("Bramble", "\"" + Application.ExecutablePath + "\" --discret");
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
                    if (v != null && v.IndexOf(exe, StringComparison.OrdinalIgnoreCase) < 0) key.SetValue("Bramble", "\"" + exe + "\" --discret");
                }
            }
            catch (Exception ex) { Log(ex); }
            try
            {
                string lnk = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Bramble.lnk");
                if (!File.Exists(lnk)) return;
                Type type = Type.GetTypeFromProgID("WScript.Shell");
                object shell = Activator.CreateInstance(type);
                object r = type.InvokeMember("CreateShortcut", System.Reflection.BindingFlags.InvokeMethod, null, shell, new object[] { lnk });
                Type t = r.GetType();
                Func<string, string> read = name => (t.InvokeMember(name, System.Reflection.BindingFlags.GetProperty, null, r, null) as string) ?? "";
                string target = read("TargetPath"), icon = read("IconLocation");
                bool ours = target.EndsWith("Bramble.exe", StringComparison.OrdinalIgnoreCase);
                if (ours && (!target.Equals(exe, StringComparison.OrdinalIgnoreCase) || !icon.StartsWith(exe, StringComparison.OrdinalIgnoreCase)))
                {
                    t.InvokeMember("TargetPath", System.Reflection.BindingFlags.SetProperty, null, r, new object[] { exe });
                    t.InvokeMember("WorkingDirectory", System.Reflection.BindingFlags.SetProperty, null, r, new object[] { Root });
                    t.InvokeMember("IconLocation", System.Reflection.BindingFlags.SetProperty, null, r, new object[] { exe + ",0" });
                    t.InvokeMember("Save", System.Reflection.BindingFlags.InvokeMethod, null, r, null);
                }
                System.Runtime.InteropServices.Marshal.FinalReleaseComObject(r);
                System.Runtime.InteropServices.Marshal.FinalReleaseComObject(shell);
            }
            catch (Exception ex) { Log(ex); }
        }

        static void CreateIcon()
        {
            var menu = new ContextMenuStrip();
            menu.Items.Add("Settings…", null, (s, e) => OpenSettings()).Tag = "Settings…";
            menu.Items.Add("Pause", null, (s, e) => { paused = !paused; UpdateVisibility(); SendState(); }).Tag = "Pause";
            soundsMenu = new ToolStripMenuItem("Sounds", null, (s, e) => { Sounds.Toggle(); Save(); UpdateMenu(); SendState(); }) { Tag = "Sounds" };
            menu.Items.Add(soundsMenu);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Quit", null, (s, e) => Quit()).Tag = "Quit";
            iconMenu = menu;
            TranslateMenu();

            icon = new NotifyIcon { Icon = new Icon(AppIcon, SystemInformation.SmallIconSize), Text = "Bramble", ContextMenuStrip = menu, Visible = true };
            icon.MouseUp += (s, e) => { if (e.Button == MouseButtons.Left) OpenSettings(); };
            UpdateMenu();
        }

        static ContextMenuStrip iconMenu;
        static void TranslateMenu()
        {
            if (iconMenu == null) return;
            foreach (ToolStripItem item in iconMenu.Items)
                if (item.Tag is string) item.Text = Language.T((string)item.Tag);
        }

        public static void UpdateMenu()
        {
            if (soundsMenu != null) soundsMenu.Checked = Sounds.Active;
        }

        public static bool Quitting { get { return quitting; } }

        static void Quit()
        {
            quitting = true;
            icon.Visible = false;
            Sounds.Stop();
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
