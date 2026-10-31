using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Win32;

namespace Lampfish
{
    // The values the privacy pages of the Windows settings write for the current user. Policies are only read: when one is set, the organization decides.
    static class Privacy
    {
        class Value
        {
            public string Key, Name;
            public int? Off, On;
            public bool MissingOn = true, Shown = true;
        }

        class Setting
        {
            public string Id;
            public Value[] Values;
            public string[] Policies;
        }

        class Saved
        {
            public object Data;
            public RegistryValueKind Kind;
        }

        const string Cdm = @"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager";
        const string Advanced = @"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced";
        const string Siuf = @"HKEY_CURRENT_USER\Software\Microsoft\Siuf\Rules";

        // A null Off or On deletes the value. A value not Shown is written but never read to tell the state.
        static Value V(string key, string name, int? off = 0, int? on = 1, bool missingOn = true, bool shown = true) { return new Value { Key = key, Name = name, Off = off, On = on, MissingOn = missingOn, Shown = shown }; }

        static readonly Setting[] Settings =
        {
            new Setting { Id = "ads", Values = new[] { V(@"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\AdvertisingInfo", "Enabled") },
                Policies = new[] { @"HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\Windows\AdvertisingInfo|DisabledByGroupPolicy" } },
            new Setting { Id = "tailored", Values = new[] { V(@"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Privacy", "TailoredExperiencesWithDiagnosticDataEnabled") },
                Policies = new[] { @"HKEY_CURRENT_USER\SOFTWARE\Policies\Microsoft\Windows\CloudContent|DisableTailoredExperiencesWithDiagnosticData" } },
            new Setting { Id = "suggestions", Values = new[]
                {
                    V(Cdm, "SubscribedContent-338388Enabled"), V(Cdm, "SubscribedContent-338389Enabled"), V(Cdm, "SubscribedContent-353694Enabled"),
                    V(Cdm, "SubscribedContent-353696Enabled"), V(Cdm, "SubscribedContent-338393Enabled"), V(Cdm, "SubscribedContent-310093Enabled"),
                    V(Cdm, "SubscribedContent-338387Enabled"), V(Cdm, "SystemPaneSuggestionsEnabled"), V(Cdm, "SoftLandingEnabled"), V(Cdm, "RotatingLockScreenOverlayEnabled"),
                    V(Advanced, "Start_IrisRecommendations"),
                    V(@"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\UserProfileEngagement", "ScoobeSystemSettingEnabled"),
                },
                Policies = new[] { @"HKEY_CURRENT_USER\SOFTWARE\Policies\Microsoft\Windows\CloudContent|DisableWindowsSpotlightFeatures", @"HKEY_CURRENT_USER\SOFTWARE\Policies\Microsoft\Windows\CloudContent|DisableSoftLanding", @"HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\Windows\CloudContent|DisableWindowsConsumerFeatures" } },
            new Setting { Id = "typing", Values = new[] { V(@"HKEY_CURRENT_USER\Software\Microsoft\Input\TIPC", "Enabled", missingOn: false) },
                Policies = new[] { @"HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\Windows\TextInput|AllowLinguisticDataCollection" } },
            new Setting { Id = "languages", Values = new[] { V(@"HKEY_CURRENT_USER\Control Panel\International\User Profile", "HttpAcceptLanguageOptOut", off: 1, on: 0) }, Policies = new string[0] },
            new Setting { Id = "launches", Values = new[] { V(Advanced, "Start_TrackProgs") }, Policies = new string[0] },
            new Setting { Id = "speech", Values = new[] { V(@"HKEY_CURRENT_USER\Software\Microsoft\Speech_OneCore\Settings\OnlineSpeechPrivacy", "HasAccepted", missingOn: false) },
                Policies = new[] { @"HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\InputPersonalization|AllowInputPersonalization" } },
            // "Never" in the settings is 0 asks in the period and no period; "Automatically" is neither value.
            new Setting { Id = "feedback", Values = new[] { V(Siuf, "NumberOfSIUFInPeriod", on: null), V(Siuf, "PeriodInNanoSeconds", off: null, on: null, shown: false) },
                Policies = new[] { @"HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\Windows\DataCollection|DoNotShowFeedbackNotifications" } },
            new Setting { Id = "cloudSearch", Values = new[] { V(@"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\SearchSettings", "IsMSACloudSearchEnabled"), V(@"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\SearchSettings", "IsAADCloudSearchEnabled") },
                Policies = new[] { @"HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\Windows\Windows Search|AllowCloudSearch" } },
        };

        static object Read(string key, string name)
        {
            try { return Registry.GetValue(key, name, null); } catch { return null; }
        }

        static bool IsOn(Value v)
        {
            object x = Read(v.Key, v.Name);
            if (x == null) return v.MissingOn;
            if (v.Off == null) return true;
            try { return Convert.ToInt32(x) != v.Off; } catch { return v.MissingOn; }
        }

        public static object State()
        {
            return Settings.Select(s => new
            {
                id = s.Id,
                on = s.Values.Where(v => v.Shown).Any(IsOn),
                managed = s.Policies.Any(p => { var part = p.Split('|'); return Read(part[0], part[1]) != null; }),
            }).ToArray();
        }

        static string PathOf(Value v) { return v.Key.Substring(v.Key.IndexOf('\\') + 1); }

        static Saved Snapshot(Value v)
        {
            try
            {
                using (var key = Registry.CurrentUser.OpenSubKey(PathOf(v)))
                {
                    object data = key == null ? null : key.GetValue(v.Name, null, RegistryValueOptions.DoNotExpandEnvironmentNames);
                    return data == null ? null : new Saved { Data = data, Kind = key.GetValueKind(v.Name) };
                }
            }
            catch { return null; }
        }

        static void Write(Value v, int? value)
        {
            using (var key = Registry.CurrentUser.CreateSubKey(PathOf(v)))
            {
                if (value == null) key.DeleteValue(v.Name, false);
                else key.SetValue(v.Name, value.Value, RegistryValueKind.DWord);
            }
        }

        static void Restore(Value v, Saved saved)
        {
            using (var key = Registry.CurrentUser.CreateSubKey(PathOf(v)))
            {
                if (saved == null) key.DeleteValue(v.Name, false);
                else key.SetValue(v.Name, saved.Data, saved.Kind);
            }
        }

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            if (action == "privacy") { Program.Send(new { type = "health.privacy", items = State() }); return false; }
            if (action != "privacySet") return false;
            var setting = Settings.FirstOrDefault(s => s.Id == (m.ContainsKey("id") ? m["id"] as string : null));
            if (setting == null) return false;
            bool on = Convert.ToBoolean(m["on"]);
            var before = setting.Values.Select(Snapshot).ToArray();
            var created = setting.Values.Select(PathOf).Distinct().Where(p => { using (var key = Registry.CurrentUser.OpenSubKey(p)) return key == null; }).ToArray();
            try { foreach (var v in setting.Values) Write(v, on ? v.On : v.Off); }
            catch (Exception ex) { Program.Log(ex); }
            string title = m.ContainsKey("title") ? Convert.ToString(m["title"]) : "";
            Program.Undoable(Language.T(on ? "{0}: on" : "{0}: off", title), () =>
            {
                try
                {
                    for (int i = 0; i < setting.Values.Length; i++) Restore(setting.Values[i], before[i]);
                    // A key the switch created goes away with it, when nothing else was written in it since.
                    foreach (string path in created)
                        using (var key = Registry.CurrentUser.OpenSubKey(path))
                            if (key != null && key.ValueCount == 0 && key.SubKeyCount == 0) { key.Close(); Registry.CurrentUser.DeleteSubKey(path, false); }
                }
                catch (Exception ex) { Program.Log(ex); }
                Program.Send(new { type = "health.privacy", items = State() });
            });
            Program.Send(new { type = "health.privacy", items = State() });
            Program.SendState();
            return false;
        }
    }
}
