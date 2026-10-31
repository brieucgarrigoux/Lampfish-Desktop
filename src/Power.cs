using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace Lampfish
{
    static class Power
    {
        static readonly Guid Video = new Guid("7516b95f-f776-4464-8c53-06167f40cc99"), VideoIdle = new Guid("3c0bc021-c8a8-4e07-a973-6b14cbcb2b7e");
        static readonly Guid Sleep = new Guid("238c9fa8-0aad-41ed-83f4-97be242c8f20"), SleepIdle = new Guid("29f6c1db-86da-48c5-9fdb-f2b67b1f44da");
        static readonly Guid Saver = new Guid("de830923-a562-41af-a086-e3a2c6bad2da"), SaverThreshold = new Guid("e69653ca-cf7f-4f05-aa73-cb833fa90ad4");

        static Settings R { get { return Program.R; } }

        static bool Scheme(out Guid scheme)
        {
            scheme = Guid.Empty;
            IntPtr p;
            if (PowerGetActiveScheme(IntPtr.Zero, out p) != 0) return false;
            scheme = (Guid)Marshal.PtrToStructure(p, typeof(Guid));
            LocalFree(p);
            return true;
        }

        static int Read(Guid sub, Guid setting, bool battery)
        {
            Guid scheme;
            uint value;
            if (!Scheme(out scheme)) return -1;
            uint result = battery ? PowerReadDCValueIndex(IntPtr.Zero, ref scheme, ref sub, ref setting, out value)
                : PowerReadACValueIndex(IntPtr.Zero, ref scheme, ref sub, ref setting, out value);
            return result == 0 ? (int)value : -1;
        }

        static bool Write(Guid sub, Guid setting, bool battery, int value)
        {
            Guid scheme;
            if (!Scheme(out scheme)) return false;
            uint result = battery ? PowerWriteDCValueIndex(IntPtr.Zero, ref scheme, ref sub, ref setting, (uint)value)
                : PowerWriteACValueIndex(IntPtr.Zero, ref scheme, ref sub, ref setting, (uint)value);
            return result == 0 && PowerSetActiveScheme(IntPtr.Zero, ref scheme) == 0;
        }

        static bool HasBattery { get { return SystemInformation.PowerStatus.BatteryChargeStatus != BatteryChargeStatus.NoSystemBattery; } }

        static bool SaverOn()
        {
            SYSTEM_POWER_STATUS status;
            return GetSystemPowerStatus(out status) && status.SystemStatusFlag == 1;
        }

        static string Text(Dictionary<string, object> m, string key)
        {
            object v;
            return m.TryGetValue(key, out v) && v != null ? v.ToString() : "";
        }

        static void Change(Guid sub, Guid setting, bool battery, int value, string done)
        {
            int before = Read(sub, setting, battery);
            if (before < 0 || before == value) return;
            if (Write(sub, setting, battery, value)) Program.Undoable(Language.T(done), () => Write(sub, setting, battery, before));
            else Program.Announce("Windows refused the change");
        }

        public static bool Receive(string action, Dictionary<string, object> m)
        {
            bool battery = Text(m, "battery") == "True" || Text(m, "battery") == "true";
            int seconds;
            int.TryParse(Text(m, "value"), out seconds);
            seconds = seconds <= 0 ? 0 : Math.Max(60, Math.Min(5 * 3600, seconds));
            switch (action)
            {
                case "screen": Change(Video, VideoIdle, battery, seconds, "Screen timeout changed"); return true;
                case "sleep": Change(Sleep, SleepIdle, battery, seconds, "Sleep timeout changed"); return true;
                case "saver":
                {
                    bool on = Text(m, "value") == "True" || Text(m, "value") == "true";
                    int now = Read(Saver, SaverThreshold, true);
                    if (now < 0) return false;
                    if (on && now < 100) R.SaverThreshold = now;
                    int wanted = on ? 100 : (R.SaverThreshold > 0 && R.SaverThreshold < 100 ? R.SaverThreshold : 30);
                    Change(Saver, SaverThreshold, true, wanted, on ? "Energy saver always on battery" : "Energy saver back to automatic");
                    return true;
                }
            }
            return false;
        }

        public static object State()
        {
            return new
            {
                battery = HasBattery,
                screenAc = Read(Video, VideoIdle, false), screenDc = Read(Video, VideoIdle, true),
                sleepAc = Read(Sleep, SleepIdle, false), sleepDc = Read(Sleep, SleepIdle, true),
                saver = Read(Saver, SaverThreshold, true) >= 100, saverOn = SaverOn(),
                threshold = R.SaverThreshold,
            };
        }

        [StructLayout(LayoutKind.Sequential)]
        struct SYSTEM_POWER_STATUS { public byte ACLineStatus, BatteryFlag, BatteryLifePercent, SystemStatusFlag; public int BatteryLifeTime, BatteryFullLifeTime; }

        [DllImport("kernel32.dll")] static extern bool GetSystemPowerStatus(out SYSTEM_POWER_STATUS status);
        [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
        [DllImport("powrprof.dll")] static extern uint PowerGetActiveScheme(IntPtr root, out IntPtr scheme);
        [DllImport("powrprof.dll")] static extern uint PowerSetActiveScheme(IntPtr root, ref Guid scheme);
        [DllImport("powrprof.dll")] static extern uint PowerReadACValueIndex(IntPtr root, ref Guid scheme, ref Guid sub, ref Guid setting, out uint value);
        [DllImport("powrprof.dll")] static extern uint PowerReadDCValueIndex(IntPtr root, ref Guid scheme, ref Guid sub, ref Guid setting, out uint value);
        [DllImport("powrprof.dll")] static extern uint PowerWriteACValueIndex(IntPtr root, ref Guid scheme, ref Guid sub, ref Guid setting, uint value);
        [DllImport("powrprof.dll")] static extern uint PowerWriteDCValueIndex(IntPtr root, ref Guid scheme, ref Guid sub, ref Guid setting, uint value);
    }
}
