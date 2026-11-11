using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace Lampfish
{
    // The global shortcuts of lampfish, all on one hidden window. Each feature keeps its own id.
    static class Hotkeys
    {
        public const int AudioOutput = 1, Capture = 2, Note = 3, Companion = 4, Rescue = 5, Trail = 6, Halo = 7, NextTheme = 8;

        class Window : NativeWindow
        {
            public Window() { CreateHandle(new CreateParams()); }

            protected override void WndProc(ref Message m)
            {
                Action pressed;
                if (m.Msg == 0x0312 && actions.TryGetValue(m.WParam.ToInt32(), out pressed))
                    try { pressed(); } catch (Exception ex) { Program.Log(ex); }
                base.WndProc(ref m);
            }
        }

        static Window window;
        static readonly Dictionary<int, Action> actions = new Dictionary<int, Action>();

        // False when another app already holds these keys.
        public static bool Register(int id, int modifiers, int key, Action pressed)
        {
            if (window == null) window = new Window();
            Unregister(id);
            if (!RegisterHotKey(window.Handle, id, (modifiers & 0xF) | 0x4000, key)) return false;
            actions[id] = pressed;
            return true;
        }

        public static void Unregister(int id)
        {
            if (window == null || !actions.ContainsKey(id)) return;
            UnregisterHotKey(window.Handle, id);
            actions.Remove(id);
        }

        public static void Stop()
        {
            foreach (int id in new List<int>(actions.Keys)) Unregister(id);
        }

        [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr hwnd, int id, int modifiers, int key);
        [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr hwnd, int id);
    }
}
