using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Lampfish
{
    class SettingsForm : Form
    {
        readonly WebView2 view;
        string scriptLanguage;

        public SettingsForm()
        {
            Text = "lampfish";
            Icon = Program.AppIcon;
            BackColor = Appearance.Back;
            MinimumSize = new Size(LogicalToDeviceUnits(720), LogicalToDeviceUnits(560));
            var w = Program.R.Window;
            var saved = w == null ? Rectangle.Empty : new Rectangle(w.X, w.Y, w.Width, w.Height);
            if (w != null && Screen.AllScreens.Any(s => { var v = Rectangle.Intersect(s.WorkingArea, saved); return v.Width >= 240 && v.Height >= 160; }))
            {
                StartPosition = FormStartPosition.Manual;
                Bounds = saved;
                if (w.Maximized) WindowState = FormWindowState.Maximized;
            }
            else
            {
                StartPosition = FormStartPosition.CenterScreen;
                Size = new Size(LogicalToDeviceUnits(1200), LogicalToDeviceUnits(780));
            }
            view = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = BackColor };
            Controls.Add(view);
            Appearance.Changed += Restyle;
        }

        void Restyle()
        {
            BackColor = Appearance.Back;
            view.DefaultBackgroundColor = BackColor;
            if (IsHandleCreated) Native.DarkFrame(Handle, Appearance.Light);
            Send(new System.Web.Script.Serialization.JavaScriptSerializer().Serialize(Appearance.Message()));
        }

        public async Task Initialize(CoreWebView2Environment environment, Action<string, List<string>> receive)
        {
            await view.EnsureCoreWebView2Async(environment);
            var core = view.CoreWebView2;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            core.Settings.AreBrowserAcceleratorKeysEnabled = false;
            core.Settings.IsPinchZoomEnabled = false;
            core.Settings.IsSwipeNavigationEnabled = false;
            core.IsMuted = true;
            view.ZoomFactor = Program.R.Zoom / 100.0;
            core.SetVirtualHostNameToFolderMapping(WallpaperForm.AppHost, Program.Root, CoreWebView2HostResourceAccessKind.DenyCors);
            core.SetVirtualHostNameToFolderMapping(WallpaperForm.MediaHost, Program.WallpapersFolder, CoreWebView2HostResourceAccessKind.Allow);
            Map(Notes.Host, Notes.Folder);
            Map(Shelf.Host, Shelf.Folder);
            core.WebMessageReceived += (s, e) =>
            {
                var files = new List<string>();
                if (e.AdditionalObjects != null)
                    foreach (object o in e.AdditionalObjects)
                    {
                        var f = o as CoreWebView2File;
                        if (f != null) files.Add(f.Path);
                    }
                try { receive(e.WebMessageAsJson, files); }
                catch (Exception ex) { Program.Log(ex); }
            };
            core.ProcessFailed += (s, e) =>
            {
                if (e.ProcessFailedKind == CoreWebView2ProcessFailedKind.BrowserProcessExited) Program.BrowserCrashed();
                else if (WallpaperForm.IsRender(e.ProcessFailedKind)) BeginInvoke(new Action(() => { if (!IsDisposed && view.CoreWebView2 != null) view.CoreWebView2.Reload(); }));
            };
            scriptLanguage = await core.AddScriptToExecuteOnDocumentCreatedAsync(Language.Script());
            core.Navigate("https://" + WallpaperForm.AppHost + "/app/ui/index.html");
        }

        // Images of the notes and of the shelf, read from their folders; the page can show them but not fetch them from elsewhere.
        public void Map(string host, string folder)
        {
            var core = view.CoreWebView2;
            if (core == null) return;
            try { core.ClearVirtualHostNameToFolderMapping(host); } catch { }
            core.SetVirtualHostNameToFolderMapping(host, folder, CoreWebView2HostResourceAccessKind.DenyCors);
        }

        public void SetZoom(int percent) { view.ZoomFactor = percent / 100.0; }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            Native.DarkFrame(Handle, Appearance.Light);
        }

        FormWindowState shape = FormWindowState.Normal;

        protected override void OnResizeEnd(EventArgs e)
        {
            base.OnResizeEnd(e);
            Remember();
        }

        protected override void OnSizeChanged(EventArgs e)
        {
            base.OnSizeChanged(e);
            if (WindowState == shape || !Visible) return;
            shape = WindowState;
            Remember();
        }

        void Remember()
        {
            if (WindowState == FormWindowState.Minimized || !IsHandleCreated) return;
            var b = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
            Program.R.Window = new WindowPlace { X = b.X, Y = b.Y, Width = b.Width, Height = b.Height, Maximized = WindowState == FormWindowState.Maximized };
            Program.Save();
        }

        bool changing, changeAgain;

        public async void ChangeLanguage()
        {
            var core = view.CoreWebView2;
            if (core == null) return;
            if (changing) { changeAgain = true; return; }
            changing = true;
            try
            {
                do
                {
                    changeAgain = false;
                    if (scriptLanguage != null) core.RemoveScriptToExecuteOnDocumentCreated(scriptLanguage);
                    scriptLanguage = await core.AddScriptToExecuteOnDocumentCreatedAsync(Language.Script());
                    core.Reload();
                    await System.Threading.Tasks.Task.Delay(600);
                } while (changeAgain);
            }
            catch (Exception ex) { Program.Log(ex); }
            finally { changing = false; }
        }

        public void Shutdown()
        {
            close = true;
            Close();
            Dispose();
        }
        bool close;

        public void Send(string json)
        {
            if (view.CoreWebView2 != null) view.CoreWebView2.PostWebMessageAsJson(json);
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (!close && !Program.Quitting && e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                Hide();
                Send("{\"type\":\"window.closed\"}");
            }
            base.OnFormClosing(e);
        }
    }
}
