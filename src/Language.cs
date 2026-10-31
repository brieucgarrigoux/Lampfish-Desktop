using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Web.Script.Serialization;

namespace Lampfish
{
    static class Language
    {
        static readonly string LocalesFolder = Path.Combine(Program.Root, "app", "ui", "locales");
        static readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
        static Dictionary<string, string> strings = new Dictionary<string, string>();

        public static string Code { get; private set; }

        public static void Choose(string setting)
        {
            if (setting == "en" || setting == "fr") Code = setting;
            else Code = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "fr" ? "fr" : "en";
            strings = new Dictionary<string, string>();
            if (Code == "en") return;
            string path = Path.Combine(LocalesFolder, Code + ".json");
            try { if (File.Exists(path)) strings = json.Deserialize<Dictionary<string, string>>(File.ReadAllText(path)); }
            catch (Exception ex) { Program.Log(ex); }
        }

        public static string T(string english, params object[] values)
        {
            string text;
            if (english == null || !strings.TryGetValue(english, out text)) text = english;
            return values.Length == 0 ? text : string.Format(CultureInfo.CurrentCulture, text, values);
        }

        public static string Script()
        {
            return "window.LANGUAGE = " + json.Serialize(Code) + "; window.TRANSLATION = " + json.Serialize(strings) + ";" + Appearance.Script();
        }
    }
}
