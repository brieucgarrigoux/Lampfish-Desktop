using System;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Lampfish
{
    class WallpaperForm : Form
    {
        public const string AppHost = "app.example", MediaHost = "media.example";

        readonly WebView2 view;
        public Rectangle Screen { get; private set; }
        Settings last;
        string shown;
        int ticket;
        bool loaded;
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
                loaded = true;
                if (Suspended) Freeze(true);
                if (last != null) Effects(last);
                FrameRate(Program.R.FrameRate);
                Run(DesktopGrid.ScriptFor(Screen));
            };
            view.CoreWebView2.ProcessFailed += (s, e) =>
            {
                if (e.ProcessFailedKind == CoreWebView2ProcessFailedKind.BrowserProcessExited) Program.BrowserCrashed();
                else if (IsRender(e.ProcessFailedKind)) { Program.Log(new Exception("Wallpaper renderer stopped (" + e.ProcessFailedKind + "), reloaded")); BeginInvoke(new Action(() => { if (!IsDisposed && view.CoreWebView2 != null) view.CoreWebView2.Reload(); })); }
            };
        }

        public static bool IsRender(CoreWebView2ProcessFailedKind k)
        {
            return k == CoreWebView2ProcessFailedKind.RenderProcessExited || k == CoreWebView2ProcessFailedKind.RenderProcessUnresponsive
                || k == CoreWebView2ProcessFailedKind.FrameRenderProcessExited || k == CoreWebView2ProcessFailedKind.GpuProcessExited;
        }

        const string ScriptPause = @"(() => {
  const raf = window.requestAnimationFrame.bind(window);
  let frozen = false, waiting = [], fps = 60, allowed = -1, due = 0;
  const gate = cb => function step(t) {
    if (t !== allowed) {
      if (t + 1 < due) { raf(step); return; }
      allowed = t;
      const interval = 1000 / fps;
      due = t - due > interval ? t + interval : due + interval;
    }
    cb(t);
  };
  window.requestAnimationFrame = cb => frozen ? (waiting.push(cb), 0) : raf(gate(cb));
  window.__fps = f => { fps = Math.max(10, Math.min(240, f)); due = 0; };
  new MutationObserver((list, o) => {
    if (!document.documentElement) return;
    o.disconnect();
    const s = document.createElement('style');
    s.textContent = 'html::after{content:"""";position:fixed;inset:0;z-index:2147483647;background:#000;pointer-events:none;transition:opacity .5s ease-out}html.__lampfish-shown::after{opacity:0}html.__lampfish-hiding::after{opacity:1;transition:opacity .25s ease-in}';
    document.documentElement.appendChild(s);
  }).observe(document, { childList: true });
  const show = () => raf(() => raf(() => document.documentElement && document.documentElement.classList.add('__lampfish-shown')));
  addEventListener('load', show, { once: true });
  setTimeout(show, 2500);
  window.__veil = () => document.documentElement.classList.add('__lampfish-hiding');
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
      const l = waiting; waiting = []; l.forEach(cb => raf(gate(cb)));
    }
  };
  window.__effects = (blur, saturation, dim) => {
    let v = document.getElementById('__lampfish_effects');
    if (blur == 0 && saturation == 50 && dim == 0) { if (v) v.remove(); return; }
    if (!v) {
      v = document.createElement('div');
      v.id = '__lampfish_effects';
      v.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none';
      document.documentElement.appendChild(v);
    }
    const filters = [];
    if (blur > 0) filters.push('blur(' + (blur * 0.3) + 'px)');
    if (saturation != 50) filters.push('saturate(' + saturation / 50 + ')');
    v.style.backdropFilter = filters.join(' ') || 'none';
    v.style.background = 'rgba(0,0,0,' + (dim / 100 * 0.75) + ')';
  };
  window.__grid = (cells, width, height) => {
    let g = document.getElementById('__lampfish_grid');
    if (!cells) { if (g) g.remove(); return; }
    if (!g) {
      g = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      g.id = '__lampfish_grid';
      g.setAttribute('preserveAspectRatio', 'none');
      g.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:none';
      g.innerHTML = `<path fill='none' stroke='rgba(0,0,0,.24)' stroke-width='3'/><path fill='rgba(255,255,255,.07)' stroke='rgba(255,255,255,.27)' stroke-width='1.5'/><rect fill='rgba(30,187,170,.28)' stroke='#1EBBAA' stroke-width='2' visibility='hidden'/>`;
      document.documentElement.appendChild(g);
    }
    g.setAttribute('viewBox', `0 0 ${width} ${height}`);
    g.__cells = cells;
    const d = cells.map(([x, y, w, h]) => {
      const r = Math.max(6, w / 7);
      return `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${2 * r - w}a${r} ${r} 0 0 1 ${-r} ${-r}v${2 * r - h}a${r} ${r} 0 0 1 ${r} ${-r}z`;
    }).join('');
    g.children[0].setAttribute('d', d);
    g.children[1].setAttribute('d', d);
  };
  window.__gridAim = i => {
    const g = document.getElementById('__lampfish_grid');
    if (!g) return;
    const box = g.children[2], c = g.__cells[i];
    box.setAttribute('visibility', c ? 'visible' : 'hidden');
    if (!c) return;
    box.setAttribute('x', c[0]); box.setAttribute('y', c[1]); box.setAttribute('width', c[2]); box.setAttribute('height', c[3]); box.setAttribute('rx', Math.max(6, c[2] / 7));
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

        public async void Show(Settings r, string wallpaper, bool fade)
        {
            var core = view.CoreWebView2;
            if (core == null) return;
            last = r;
            shown = wallpaper;
            int mine = ++ticket;
            if (fade && loaded)
            {
                try { await core.ExecuteScriptAsync("window.__veil && window.__veil()"); } catch { }
                await Task.Delay(280);
                if (mine != ticket || IsDisposed || view.CoreWebView2 == null) return;
            }
            Navigate(view.CoreWebView2, r, wallpaper);
        }

        public string ShownWallpaper { get { return shown; } }

        // A still of what this screen shows, for the picture Windows keeps behind the live wallpaper.
        public async Task<bool> Snapshot(string path)
        {
            var core = view.CoreWebView2;
            if (core == null || !loaded) return false;
            try
            {
                using (var file = File.Create(path))
                    await core.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Jpeg, file);
                return new FileInfo(path).Length > 0;
            }
            catch (Exception ex) { Program.Log(ex); return false; }
        }

        void Navigate(CoreWebView2 core, Settings r, string wallpaper)
        {
            string path = string.IsNullOrEmpty(wallpaper) ? null : Path.Combine(Program.WallpapersFolder, wallpaper);
            if (path == null || !(File.Exists(path) || Directory.Exists(path)))
            {
                core.Navigate("https://" + AppHost + "/app/player/player.html?type=empty");
                return;
            }

            string settings = "light=" + r.Light + "&speed=" + r.Speed + "&fit=" + r.Fit;
            string url = Program.UrlMedia(wallpaper);
            string type = Program.WallpaperType(wallpaper);
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
                if (done != "1" && reloadOtherwise) Show(r, shown, true);
            }
            catch (Exception ex) { Program.Log(ex); }
        }

        public void Audio(string level)
        {
            var core = view.CoreWebView2;
            if (core != null) core.ExecuteScriptAsync("window.__audio && window.__audio(" + level + ")");
        }

        public void Run(string script)
        {
            var core = view.CoreWebView2;
            if (core != null && script != null) core.ExecuteScriptAsync(script);
        }

        public void FrameRate(int fps)
        {
            var core = view.CoreWebView2;
            if (core != null) core.ExecuteScriptAsync("window.__fps && window.__fps(" + fps + ")");
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
