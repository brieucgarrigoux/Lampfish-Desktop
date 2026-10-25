using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace Bramble
{
    // An empty list keeps the order lampfish ships with, so a service added later still finds its place.
    class CustomizeSettings
    {
        public List<string> Bar, Groups, Blocks, HiddenBlocks, Tiles;
    }

    // The order of the bar and the cards of Home. Which services the bar hides stays in settings.json (HiddenViews).
    static class Customize
    {
        static readonly JavaScriptSerializer json = new JavaScriptSerializer();
        static CustomizeSettings S = new CustomizeSettings();
        static readonly Regex Id = new Regex("^[a-z]{1,24}$");

        static string File { get { return Path.Combine(Program.DataFolder("Layout"), "layout.json"); } }

        public static void Load()
        {
            try { if (System.IO.File.Exists(File)) S = json.Deserialize<CustomizeSettings>(System.IO.File.ReadAllText(File)) ?? new CustomizeSettings(); }
            catch (Exception ex) { Program.Log(ex); }
        }

        static void Save()
        {
            try { System.IO.File.WriteAllText(File, json.Serialize(S)); }
            catch (Exception ex) { Program.Log(ex); }
        }

        public static object State() { return S; }

        static List<string> Ids(Dictionary<string, object> m, string key)
        {
            var list = m.ContainsKey(key) ? m[key] as IEnumerable : null;
            if (list == null) return null;
            return list.OfType<object>().Select(Convert.ToString).Where(x => x != null && Id.IsMatch(x)).Distinct().Take(40).ToList();
        }

        static CustomizeSettings Copy(CustomizeSettings s)
        {
            Func<List<string>, List<string>> copy = l => l == null ? null : new List<string>(l);
            return new CustomizeSettings { Bar = copy(s.Bar), Groups = copy(s.Groups), Blocks = copy(s.Blocks), HiddenBlocks = copy(s.HiddenBlocks), Tiles = copy(s.Tiles) };
        }

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            switch (action)
            {
                case "bar":
                    if (m.ContainsKey("order")) S.Bar = Ids(m, "order");
                    if (m.ContainsKey("groups")) S.Groups = Ids(m, "groups");
                    Save();
                    return true;
                case "home":
                    if (m.ContainsKey("blocks")) S.Blocks = Ids(m, "blocks");
                    if (m.ContainsKey("hiddenBlocks")) S.HiddenBlocks = Ids(m, "hiddenBlocks");
                    if (m.ContainsKey("tiles")) S.Tiles = Ids(m, "tiles");
                    Save();
                    return true;
                case "reset":
                {
                    var before = Copy(S);
                    if (Convert.ToString(m["what"]) == "bar")
                    {
                        var hidden = new List<string>(Program.R.HiddenViews);
                        S.Bar = S.Groups = null;
                        Program.R.HiddenViews.Clear();
                        Program.Undoable(Language.T("Bar reset"), () => { S = before; Save(); Program.R.HiddenViews.Clear(); Program.R.HiddenViews.AddRange(hidden); Program.Save(); });
                    }
                    else
                    {
                        S.Blocks = S.HiddenBlocks = S.Tiles = null;
                        Program.Undoable(Language.T("Home reset"), () => { S = before; Save(); });
                    }
                    Save();
                    return true;
                }
            }
            return false;
        }
    }
}
