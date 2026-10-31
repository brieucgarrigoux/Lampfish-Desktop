using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Web.Script.Serialization;

namespace Lampfish
{
    class WelcomeSettings
    {
        public bool Welcomed, StepsHidden, CompanionNoted;
        public List<string> Seen = new List<string>();
    }

    // The welcome shows once, on a PC where lampfish has never run; the first steps then stay on Home until done or hidden.
    static class Welcome
    {
        static readonly JavaScriptSerializer json = new JavaScriptSerializer();
        static readonly string[] Views = { "wallpaper", "health", "arrange" };
        static WelcomeSettings S = new WelcomeSettings();

        static string File { get { return Path.Combine(Program.DataFolder("Welcome"), "state.json"); } }

        // firstRun: no settings.json was there before this start. Someone who already used lampfish gets neither the welcome nor the steps.
        public static void Start(bool firstRun)
        {
            try
            {
                if (System.IO.File.Exists(File)) { S = json.Deserialize<WelcomeSettings>(System.IO.File.ReadAllText(File)) ?? new WelcomeSettings(); return; }
            }
            catch (Exception ex) { Program.Log(ex); return; }
            S = new WelcomeSettings { Welcomed = !firstRun, StepsHidden = !firstRun, CompanionNoted = firstRun };
            Save();
        }

        static void Save()
        {
            try { System.IO.File.WriteAllText(File, json.Serialize(S)); }
            catch (Exception ex) { Program.Log(ex); }
        }

        public static object State() { return new { show = !S.Welcomed, steps = !S.StepsHidden, seen = S.Seen, companionNote = !S.CompanionNoted && S.Welcomed }; }

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            switch (action)
            {
                case "done":
                    S.Welcomed = true;
                    Save();
                    return true;
                case "seen":
                {
                    string view = m.ContainsKey("view") ? Convert.ToString(m["view"]) : "";
                    if (!Views.Contains(view) || S.Seen.Contains(view)) return false;
                    S.Seen.Add(view);
                    Save();
                    return true;
                }
                case "note":
                    S.CompanionNoted = true;
                    Save();
                    return true;
                case "hide":
                    S.StepsHidden = true;
                    Save();
                    if (!(m.ContainsKey("quiet") && Convert.ToBoolean(m["quiet"])))
                        Program.Undoable(Language.T("First steps hidden"), () => { S.StepsHidden = false; Save(); });
                    return true;
            }
            return false;
        }
    }
}
