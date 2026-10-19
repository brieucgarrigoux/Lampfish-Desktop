using System;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Bramble
{
    class WallpaperForm : Form
    {
        public const string AppHost = "app.example", MediaHost = "media.example";

        readonly WebView2 view;
        public Rectangle Screen { get; private set; }
        Settings last;
        public bool Suspended { get; private set; }

        public WallpaperForm(Rectangle screen)
        {
            Screen = screen;
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            Bounds = screen;
            BackColor = Color.Black;
            view = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.Black };
            Controls.Add(view);
        }

        protected override bool ShowWithoutActivation { get { return true; } }

        protected override CreateParams CreateParams
        {
            get
            {
                var cp = base.CreateParams;
                cp.ExStyle |= Native.WS_EX_LAYERED | Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE;
                return cp;
            }
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);

            Native.SetLayeredWindowAttributes(Handle, 0, 0, Native.LWA_ALPHA);
        }

        public async Task Initialize(CoreWebView2Environment environment)
        {
            await view.EnsureCoreWebView2Async(environment);
            var settings = view.CoreWebView2.Settings;
            settings.AreDefaultContextMenusEnabled = false;
            settings.AreDevToolsEnabled = false;
            settings.IsStatusBarEnabled = false;
            settings.IsZoomControlEnabled = false;
            settings.AreBrowserAcceleratorKeysEnabled = false;
            view.CoreWebView2.IsMuted = true;
            view.CoreWebView2.SetVirtualHostNameToFolderMapping(AppHost, Program.Root, CoreWebView2HostResourceAccessKind.DenyCors);
            view.CoreWebView2.SetVirtualHostNameToFolderMapping(MediaHost, Program.WallpapersFolder, CoreWebView2HostResourceAccessKind.Allow);
            await view.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(ScriptPause);
            view.CoreWebView2.NavigationCompleted += (s, e) =>
            {
                if (Suspended) Freeze(true);
                if (last != null) Effects(last);
            };
            view.CoreWebView2.ProcessFailed += (s, e) =>
            {
                if (e.ProcessFailedKind == CoreWebView2ProcessFailedKind.BrowserProcessExited) Program.BrowserCrashed();
                else if (IsRender(e.ProcessFailedKind)) BeginInvoke(new Action(() => { if (!IsDisposed && view.CoreWebView2 != null) view.CoreWebView2.Reload(); }));
            };
        }

        public static bool IsRender(CoreWebView2ProcessFailedKind k)
        {
            return k == CoreWebView2ProcessFailedKind.RenderProcessExited || k == CoreWebView2ProcessFailedKind.RenderProcessUnresponsive
                || k == CoreWebView2ProcessFailedKind.FrameRenderProcessExited || k == CoreWebView2ProcessFailedKind.GpuProcessExited;
        }

        const string ScriptPause = @"(() => {
  const raf = window.requestAnimationFrame.bind(window);
  let frozen = false, waiting = [];
  window.requestAnimationFrame = cb => frozen ? (waiting.push(cb), 0) : raf(cb);
  window.__freeze = f => {
    if (f === frozen) return;
    frozen = f;
    for (const a of document.getAnimations()) f ? a.pause() : a.play();
    for (const v of document.querySelectorAll('video')) f ? v.pause() : v.play();
    for (const img of document.querySelectorAll('img')) {
      if (!/\.gif($|\?)/i.test(img.src)) continue;
      if (f) {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        c.className = img.className; c.dataset.frozen = '1';
        img.after(c); img.style.visibility = 'hidden';
      } else img.style.visibility = '';
    }
    if (!f) {
      document.querySelectorAll('canvas[data-frozen]').forEach(c => c.remove());
      const l = waiting; waiting = []; l.forEach(cb => raf(cb));
    }
  };
  window.__effects = (blur, saturation, dim) => {
    let v = document.getElementById('__bramble_effects');
    if (blur == 0 && saturation == 50 && dim == 0) { if (v) v.remove(); return; }
    if (!v) {
      v = document.createElement('div');
      v.id = '__bramble_effects';
      v.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none';
      document.documentElement.appendChild(v);
    }
    const filters = [];
    if (blur > 0) filters.push('blur(' + (blur * 0.3) + 'px)');
    if (saturation != 50) filters.push('saturate(' + saturation / 50 + ')');
    v.style.backdropFilter = filters.join(' ') || 'none';
    v.style.background = 'rgba(0,0,0,' + (dim / 100 * 0.75) + ')';
  };
})();";

        public string Problem
        {
            get
            {
                try
                {
                    if (IsDisposed || view.IsDisposed) return "window destroyed";
                    if (!IsHandleCreated || !Native.IsWindow(Handle)) return "window gone";
                    if (Native.GetParent(Handle) != Desktop.Parent) return "detached from the desktop";
                    if (view.CoreWebView2 == null) return "page stopped";
                    return null;
                }
                catch (Exception ex) { return ex.GetType().Name; }
            }
        }

        public bool Alive
        {
            get
            {
                try
                {
                    return !IsDisposed && !view.IsDisposed && IsHandleCreated && Native.IsWindow(Handle)
                        && Native.GetParent(Handle) == Desktop.Parent && view.CoreWebView2 != null;
                }
                catch { return false; }
            }
        }

        void Freeze(bool f)
        {
            var core = view.CoreWebView2;
            if (core != null) core.ExecuteScriptAsync("window.__freeze && window.__freeze(" + (f ? "true" : "false") + ")");
        }

        public void Show(Settings r)
        {
            var core = view.CoreWebView2;
            if (core == null) return;
            last = r;

            string path = string.IsNullOrEmpty(r.Wallpaper) ? null : Path.Combine(Program.WallpapersFolder, r.Wallpaper);
            if (path == null || !(File.Exists(path) || Directory.Exists(path)))
            {
                core.Navigate("https://" + AppHost + "/app/player/player.html?type=empty");
                return;
            }

            string settings = "light=" + r.Light + "&speed=" + r.Speed + "&fit=" + r.Fit;
            string url = Program.UrlMedia(r.Wallpaper);
            string type = Program.WallpaperType(r.Wallpaper);
            if (type == "html")
                core.Navigate(url + "?" + settings);
            else
                core.Navigate("https://" + AppHost + "/app/player/player.html?type=" + type + "&src=" + Uri.EscapeDataString(url) + "&" + settings);
        }

        public async void Adjust(Settings r, bool reloadOtherwise)
        {
            var core = view.CoreWebView2;
            if (core == null) return;
            try
            {
                string done = await core.ExecuteScriptAsync("typeof window.__adjust === 'function' ? (window.__adjust(" + r.Light + ", " + r.Speed + "), 1) : 0");
                if (done != "1" && reloadOtherwise) Show(r);
            }
            catch (Exception ex) { Program.Log(ex); }
        }

        public void Audio(string level)
        {
            var core = view.CoreWebView2;
            if (core != null) core.ExecuteScriptAsync("window.__audio && window.__audio(" + level + ")");
        }

        public void Effects(Settings r)
        {
            last = r;
            var core = view.CoreWebView2;
            if (core != null) core.ExecuteScriptAsync("window.__effects && window.__effects(" + r.Blur + ", " + r.Saturation + ", " + r.Dim + ")");
        }

        public void Suspend()
        {
            if (Suspended) return;
            Suspended = true;
            Freeze(true);
        }

        public void Resume()
        {
            if (!Suspended) return;
            Suspended = false;
            Freeze(false);
        }
    }
}
