using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;

namespace Lampfish
{
    // The special edition. Its cursors come in a pack kept out of the public repository (app/vip), opened by a short code.
    // The pack holds only the hashes of the codes, so neither the repository nor the pack gives a code away.
    static class Vip
    {
        static readonly string Folder = Path.Combine(Program.Root, "app", "vip");
        static readonly string[] Prefixes = { "lampfish Lure ", "lampfish Gold " };

        public static bool Pack { get { return File.Exists(Path.Combine(Folder, "vip-cursors.js")) && File.Exists(Path.Combine(Folder, "codes.json")); } }

        public static bool Unlocked { get { return Program.R.Vip; } }

        public static bool IsVipTheme(string name)
        {
            return name != null && Prefixes.Any(p => name.StartsWith(p, StringComparison.Ordinal));
        }

        public static object State()
        {
            return new { pack = Pack, unlocked = Unlocked };
        }

        // Codes use the letters of Crockford's base 32: the ones easy to mistake are read as the digits they look like.
        static string Normalize(string code)
        {
            string s = new string((code ?? "").ToUpperInvariant().Where(char.IsLetterOrDigit).ToArray());
            if (s.StartsWith("LAMP", StringComparison.Ordinal)) s = s.Substring(4);
            return s.Replace('O', '0').Replace('I', '1').Replace('L', '1');
        }

        static string Hash(string salt, string code)
        {
            using (var sha = SHA256.Create())
                return string.Concat(sha.ComputeHash(Encoding.UTF8.GetBytes(salt + "|" + code)).Select(b => b.ToString("x2")));
        }

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            if (action != "unlock" || !Pack) return false;
            object raw;
            string code = Normalize(m.TryGetValue("code", out raw) ? raw as string : null);
            bool ok = false;
            try
            {
                var data = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(Path.Combine(Folder, "codes.json")));
                string salt = data["salt"] as string;
                var hashes = new HashSet<string>(((ArrayList)data["hashes"]).Cast<object>().Select(h => h as string));
                string hash = Hash(salt, code);
                if (code.Length >= 8 && hashes.Contains(hash))
                {
                    Program.R.Vip = true;
                    Program.R.VipCode = hash;
                    ok = true;
                }
            }
            catch (Exception ex) { Program.Log(ex); }
            Program.Send(new { type = "vip.result", ok = ok });
            if (ok) { Program.Announce("The special edition is open"); Trail.Apply(); }
            return ok;
        }
    }
}
