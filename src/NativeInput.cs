using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

// One SendInput implementation shared by shortcuts, volume keys and the 2.0
// pointer widgets. Tests replace Executor so they never touch the real desktop.
sealed class NativeInputEvent
{
    internal string type;
    internal int dx;
    internal int dy;
    internal int delta;
    internal string control;

    internal string Canonical()
    {
        return type + ":" + dx + ":" + dy + ":" + delta + ":" + (control ?? "");
    }
}

static class NativeInput
{
    const uint InputMouse = 0;
    const uint InputKeyboard = 1;
    const uint MouseMove = 0x0001;
    const uint LeftDown = 0x0002;
    const uint LeftUp = 0x0004;
    const uint RightDown = 0x0008;
    const uint RightUp = 0x0010;
    const uint MiddleDown = 0x0020;
    const uint MiddleUp = 0x0040;
    const uint MouseWheel = 0x0800;
    const uint KeyUp = 0x0002;

    static readonly object SendSync = new object();
    internal static Func<NativeInputEvent[], int> Executor = SendWindows;

    internal static void Send(NativeInputEvent[] events)
    {
        if (events == null || events.Length == 0) return;
        int sent;
        lock (SendSync) sent = Executor(events);
        if (sent != events.Length)
            throw new Exception("Windowsへの入力送信が途中で失敗しました（" + sent + "/" + events.Length + "）。");
    }

    internal static void KeyTap(byte key)
    {
        Send(
            new[]
            {
                new NativeInputEvent { type = "keyDown", control = KeyName(key) },
                new NativeInputEvent { type = "keyUp", control = KeyName(key) },
            }
        );
    }

    internal static void KeyCombo(byte[] keys)
    {
        var events = new List<NativeInputEvent>();
        for (int i = 0; i < keys.Length; i++)
            events.Add(new NativeInputEvent { type = "keyDown", control = KeyName(keys[i]) });
        for (int i = keys.Length - 1; i >= 0; i--)
            events.Add(new NativeInputEvent { type = "keyUp", control = KeyName(keys[i]) });
        Send(events.ToArray());
    }

    internal static void Release(IEnumerable<string> keys, IEnumerable<string> buttons)
    {
        var events = new List<NativeInputEvent>();
        foreach (string button in buttons)
            events.Add(new NativeInputEvent { type = "buttonUp", control = button });
        foreach (string key in keys)
            events.Add(new NativeInputEvent { type = "keyUp", control = key });
        if (events.Count == 0) return;
        try { Send(events.ToArray()); }
        catch { }
    }

    static string KeyName(byte key)
    {
        return "vk-" + key.ToString("X2");
    }

    static byte VirtualKey(string control)
    {
        if (control == "ctrl") return 0x11;
        if (control == "shift") return 0x10;
        if (control == "alt") return 0x12;
        if (control != null && control.StartsWith("vk-", StringComparison.Ordinal) && control.Length == 5)
        {
            byte value;
            if (Byte.TryParse(control.Substring(3), System.Globalization.NumberStyles.HexNumber, null, out value))
                return value;
        }
        throw new Exception("対応していないキーです。");
    }

    static uint ButtonFlag(string button, bool down)
    {
        if (button == "left") return down ? LeftDown : LeftUp;
        if (button == "right") return down ? RightDown : RightUp;
        if (button == "middle") return down ? MiddleDown : MiddleUp;
        throw new Exception("対応していないマウスボタンです。");
    }

    static int SendWindows(NativeInputEvent[] events)
    {
        var native = new INPUT[events.Length];
        for (int i = 0; i < events.Length; i++)
        {
            NativeInputEvent item = events[i];
            if (item.type == "move")
            {
                native[i].type = InputMouse;
                native[i].data.mi.dx = item.dx;
                native[i].data.mi.dy = item.dy;
                native[i].data.mi.flags = MouseMove;
            }
            else if (item.type == "wheel")
            {
                native[i].type = InputMouse;
                native[i].data.mi.mouseData = unchecked((uint)item.delta);
                native[i].data.mi.flags = MouseWheel;
            }
            else if (item.type == "buttonDown" || item.type == "buttonUp")
            {
                native[i].type = InputMouse;
                native[i].data.mi.flags = ButtonFlag(item.control, item.type == "buttonDown");
            }
            else if (item.type == "keyDown" || item.type == "keyUp")
            {
                native[i].type = InputKeyboard;
                native[i].data.ki.virtualKey = VirtualKey(item.control);
                native[i].data.ki.flags = item.type == "keyUp" ? KeyUp : 0;
            }
            else
                throw new Exception("対応していない入力です。");
        }
        return (int)SendInput((uint)native.Length, native, Marshal.SizeOf(typeof(INPUT)));
    }

    [StructLayout(LayoutKind.Sequential)]
    struct INPUT
    {
        internal uint type;
        internal InputUnion data;
    }

    [StructLayout(LayoutKind.Explicit)]
    struct InputUnion
    {
        [FieldOffset(0)] internal MOUSEINPUT mi;
        [FieldOffset(0)] internal KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct MOUSEINPUT
    {
        internal int dx;
        internal int dy;
        internal uint mouseData;
        internal uint flags;
        internal uint time;
        internal UIntPtr extraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct KEYBDINPUT
    {
        internal ushort virtualKey;
        internal ushort scanCode;
        internal uint flags;
        internal uint time;
        internal UIntPtr extraInfo;
    }

    [DllImport("user32.dll", SetLastError = true)]
    static extern uint SendInput(uint count, INPUT[] inputs, int size);
}
