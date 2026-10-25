using System;
using System.Collections.Generic;
using System.Drawing;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Bramble
{
    // A small window that shows one page of app\ui, for what lives outside the main window (annotation, the companion).
    class PageForm : Form
    {
        static readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
        readonly WebView2 view;
        readonly string page;
        readonly Action<Dictionary<string, object>> receive;

        public PageForm(string page, Action<Dictionary<string, object>> receive)
        {
            this.page = page;
            this.receive = receive;
            Icon = Program.AppIcon;
            BackColor = Appearance.Back;
            AutoScaleMode = AutoScaleMode.None;
            view = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = BackColor };
            Controls.Add(view);
            Appearance.Changed += Restyle;
        }

        void Restyle()
        {
            BackColor = Appearance.Back;
            view.DefaultBackgroundColor = BackColor;
            if (IsHandleCreated) Native.DarkFrame(Handle, Appearance.Light);
            Send(Appearance.Message());
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing) Appearance.Changed -= Restyle;
            base.Dispose(disposing);
        }

        public async Task Open()
        {
            var environment = Program.WebEnvironment;
            if (environment == null) return;
            await view.EnsureCoreWebView2Async(environment);
            var core = view.CoreWebView2;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            core.Settings.AreBrowserAcceleratorKeysEnabled = false;
            core.IsMuted = true;
            core.SetVirtualHostNameToFolderMapping(WallpaperForm.AppHost, Program.Root, CoreWebView2HostResourceAccessKind.DenyCors);
            core.SetVirtualHostNameToFolderMapping(Shelf.Host, Shelf.Folder, CoreWebView2HostResourceAccessKind.DenyCors);
            core.WebMessageReceived += (s, e) =>
            {
                try { receive(json.Deserialize<Dictionary<string, object>>(e.WebMessageAsJson)); }
                catch (Exception ex) { Program.Log(ex); }
            };
            await core.AddScriptToExecuteOnDocumentCreatedAsync(Language.Script());
            core.Navigate("https://" + WallpaperForm.AppHost + "/app/ui/" + page);
        }

        public void Send(object message)
        {
            if (view.CoreWebView2 != null) view.CoreWebView2.PostWebMessageAsJson(json.Serialize(message));
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            Native.DarkFrame(Handle, Appearance.Light);
        }
    }
}
