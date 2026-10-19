using System;
using System.Collections.Generic;
using System.Drawing;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Bramble
{
    class SettingsForm : Form
    {
        readonly WebView2 view;
        string scriptLanguage;

        public SettingsForm()
        {
            Text = "Bramble";
            Icon = Program.AppIcon;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(10, 10, 15);
            Size = new Size(LogicalToDeviceUnits(1200), LogicalToDeviceUnits(780));
            MinimumSize = new Size(LogicalToDeviceUnits(900), LogicalToDeviceUnits(600));
            view = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = BackColor };
            Controls.Add(view);
        }

        public async Task Initialize(CoreWebView2Environment environment, Action<string, List<string>> receive)
        {
            await view.EnsureCoreWebView2Async(environment);
            var core = view.CoreWebView2;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            core.IsMuted = true;
            core.SetVirtualHostNameToFolderMapping(WallpaperForm.AppHost, Program.Root, CoreWebView2HostResourceAccessKind.DenyCors);
            core.SetVirtualHostNameToFolderMapping(WallpaperForm.MediaHost, Program.WallpapersFolder, CoreWebView2HostResourceAccessKind.Allow);
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

        public async void ChangeLanguage()
        {
            var core = view.CoreWebView2;
            if (core == null) return;
            if (scriptLanguage != null) core.RemoveScriptToExecuteOnDocumentCreated(scriptLanguage);
            scriptLanguage = await core.AddScriptToExecuteOnDocumentCreatedAsync(Language.Script());
            core.Reload();
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
            }
            base.OnFormClosing(e);
        }
    }
}
