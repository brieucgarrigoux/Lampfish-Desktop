using System;
using System.Drawing;
using Microsoft.Win32;

namespace Bramble
{
    // Night or day for the windows of the app. "auto" follows the apps mode of Windows.
    static class Appearance
    {
        static string choice = "dark";

        public static bool Light { get; private set; }
        public static event Action Changed;

        public static Color Back { get { return Light ? Color.FromArgb(212, 218, 219) : Color.FromArgb(9, 12, 13); } }

        public static void Start(string value)
        {
            choice = Clean(value);
            Light = Resolve();
            SystemEvents.UserPreferenceChanged += (s, e) => Program.OnInterface(Update);
        }

        public static string Clean(string value) { return value == "light" || value == "auto" ? value : "dark"; }

        public static void Choose(string value)
        {
            choice = Clean(value);
            Update();
        }

        static bool Resolve()
        {
            if (choice == "light") return true;
            if (choice != "auto") return false;
            try
            {
                using (var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"))
                    return key != null && Convert.ToInt32(key.GetValue("AppsUseLightTheme", 0)) == 1;
            }
            catch { return false; }
        }

        static void Update()
        {
            bool now = Resolve();
            if (now == Light) return;
            Light = now;
            var changed = Changed;
            if (changed != null) changed();
        }

        // Read when a page is created, so that it opens in the right mode without a flash.
        public static string Script() { return "window.LIGHT = " + (Light ? "true" : "false") + ";"; }
        public static object Message() { return new { type = "appearance", light = Light }; }
    }
}
