using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

static class ShortcutKeys
{
    static readonly Dictionary<string, byte[]> keys = new Dictionary<string, byte[]>(StringComparer.OrdinalIgnoreCase)
    {
        { "common-copy", new byte[] { 0x11, 0x43 } },
        { "common-paste", new byte[] { 0x11, 0x56 } },
        { "common-cut", new byte[] { 0x11, 0x58 } },
        { "common-undo", new byte[] { 0x11, 0x5A } },
        { "common-redo", new byte[] { 0x11, 0x59 } },
        { "common-save", new byte[] { 0x11, 0x53 } },
        { "common-selectall", new byte[] { 0x11, 0x41 } },
        { "common-find", new byte[] { 0x11, 0x46 } },
        { "common-open", new byte[] { 0x11, 0x4F } },
        { "common-new", new byte[] { 0x11, 0x4E } },
        { "discord-mute", new byte[] { 0x11, 0x10, 0x4D } },
        { "discord-deafen", new byte[] { 0x11, 0x10, 0x44 } },
        { "discord-voice", new byte[] { 0x11, 0x12, 0x41 } },
        { "discord-search", new byte[] { 0x11, 0x4B } },
        { "discord-emoji", new byte[] { 0x11, 0x45 } },
        { "discord-members", new byte[] { 0x11, 0x55 } },
        { "discord-pins", new byte[] { 0x11, 0x50 } },
        { "discord-mentions", new byte[] { 0x11, 0x49 } },
        { "discord-soundboard-overlay", new byte[] { 0x11, 0xC0 } },
        { "windows-desktop", new byte[] { 0x5B, 0x44 } },
        { "windows-explorer", new byte[] { 0x5B, 0x45 } },
        { "windows-settings", new byte[] { 0x5B, 0x49 } },
        { "windows-search", new byte[] { 0x5B, 0x53 } },
        { "windows-clipboard", new byte[] { 0x5B, 0x56 } },
        { "windows-screenshot", new byte[] { 0x5B, 0x10, 0x53 } },
        { "windows-taskview", new byte[] { 0x5B, 0x09 } },
        { "windows-printscreen", new byte[] { 0x2C } },
        { "windows-lock", new byte[] { 0x5B, 0x4C } },
        { "windows-run", new byte[] { 0x5B, 0x52 } },
        { "windows-taskmanager", new byte[] { 0x11, 0x10, 0x1B } },
        { "windows-close", new byte[] { 0x12, 0x73 } },
        { "windows-emoji", new byte[] { 0x5B, 0xBE } },
        { "windows-quicksettings", new byte[] { 0x5B, 0x41 } },
        { "windows-project", new byte[] { 0x5B, 0x50 } },
        { "windows-alttab", new byte[] { 0x12, 0x09 } },
        { "windows-maximize", new byte[] { 0x5B, 0x26 } },
        { "windows-minimize", new byte[] { 0x5B, 0x28 } },
        { "windows-snapleft", new byte[] { 0x5B, 0x25 } },
        { "windows-snapright", new byte[] { 0x5B, 0x27 } },
        { "windows-quicklink", new byte[] { 0x5B, 0x58 } },
        { "media-playpause", new byte[] { 0xB3 } },
        { "media-previous", new byte[] { 0xB1 } },
        { "media-next", new byte[] { 0xB0 } },
        { "media-stop", new byte[] { 0xB2 } },
        { "browser-newtab", new byte[] { 0x11, 0x54 } },
        { "browser-closetab", new byte[] { 0x11, 0x57 } },
        { "browser-refresh", new byte[] { 0x11, 0x52 } },
        { "browser-back", new byte[] { 0x12, 0x25 } },
        { "browser-forward", new byte[] { 0x12, 0x27 } },
        { "browser-reopen", new byte[] { 0x11, 0x10, 0x54 } },
        { "browser-address", new byte[] { 0x11, 0x4C } },
        { "browser-fullscreen", new byte[] { 0x7A } },
        { "clip-undo", new byte[] { 0x11, 0x5A } },
        { "clip-redo", new byte[] { 0x11, 0x59 } },
        { "clip-new", new byte[] { 0x11, 0x4E } },
        { "clip-open", new byte[] { 0x11, 0x4F } },
        { "clip-close", new byte[] { 0x11, 0x57 } },
        { "clip-save", new byte[] { 0x11, 0x53 } },
        { "clip-saveas", new byte[] { 0x11, 0x10, 0x53 } },
        { "clip-cut", new byte[] { 0x11, 0x58 } },
        { "clip-copy", new byte[] { 0x11, 0x43 } },
        { "clip-paste", new byte[] { 0x11, 0x56 } },
        { "clip-erase", new byte[] { 0x2E } },
        { "clip-brush", new byte[] { 0x42 } },
        { "clip-pen", new byte[] { 0x50 } },
        { "clip-eraser", new byte[] { 0x45 } },
        { "clip-fill", new byte[] { 0x47 } },
        { "clip-transform", new byte[] { 0x11, 0x54 } },
        { "clip-free-transform", new byte[] { 0x11, 0x10, 0x54 } },
        { "clip-selectall", new byte[] { 0x11, 0x41 } },
        { "clip-deselect", new byte[] { 0x11, 0x44 } },
        { "clip-reselect", new byte[] { 0x11, 0x10, 0x44 } },
        { "clip-invert-selection", new byte[] { 0x11, 0x10, 0x49 } },
        { "clip-new-raster", new byte[] { 0x11, 0x10, 0x4E } },
        { "clip-layer-folder", new byte[] { 0x11, 0x47 } },
        { "clip-ungroup", new byte[] { 0x11, 0x10, 0x47 } },
        { "clip-clip-below", new byte[] { 0x11, 0x12, 0x47 } },
        { "clip-merge-below", new byte[] { 0x11, 0x45 } },
        { "clip-merge-visible", new byte[] { 0x11, 0x10, 0x45 } },
        { "clip-layer-above", new byte[] { 0x12, 0xDD } },
        { "clip-layer-below", new byte[] { 0x12, 0xDB } },
        { "clip-fit", new byte[] { 0x11, 0x30 } },
        { "clip-ruler", new byte[] { 0x11, 0x52 } },
        { "clip-snap-ruler", new byte[] { 0x11, 0x31 } },
        { "clip-snap-special", new byte[] { 0x11, 0x32 } },
        { "clip-snap-grid", new byte[] { 0x11, 0x33 } },
        { "clip-next-canvas", new byte[] { 0x11, 0x09 } },
        { "clip-prev-canvas", new byte[] { 0x11, 0x10, 0x09 } },
        { "clip-palettes", new byte[] { 0x09 } },
        { "clip-hide-ui", new byte[] { 0x10, 0x09 } },
        { "clip-zoom-tool", new byte[] { 0xBF } },
        { "clip-hand", new byte[] { 0x48 } },
        { "clip-rotate", new byte[] { 0x52 } },
        { "clip-object", new byte[] { 0x4F } },
        { "clip-select-layer", new byte[] { 0x44 } },
        { "clip-move-layer", new byte[] { 0x4B } },
        { "clip-selection", new byte[] { 0x4D } },
        { "clip-auto-select", new byte[] { 0x57 } },
        { "clip-eyedropper", new byte[] { 0x49 } },
        { "clip-blend", new byte[] { 0x4A } },
        { "clip-figure", new byte[] { 0x55 } },
        { "clip-text", new byte[] { 0x54 } },
        { "clip-correct-line", new byte[] { 0x59 } },
    };
    static readonly HashSet<string> audioActions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "audio-speaker-mute",
        "audio-speaker-up",
        "audio-speaker-down",
        "audio-mic-mute",
        "audio-mic-up",
        "audio-mic-down",
    };
    static readonly object sendGate = new object();

    internal static bool Exists(string action)
    {
        return !String.IsNullOrEmpty(action) && (keys.ContainsKey(action) || audioActions.Contains(action));
    }

    internal static bool IsAudio(string action)
    {
        return !String.IsNullOrEmpty(action) && audioActions.Contains(action);
    }

    internal static bool RequiresDiscordFocus(string action)
    {
        return !String.IsNullOrEmpty(action)
            && action.StartsWith("discord-", StringComparison.OrdinalIgnoreCase)
            && !String.Equals(action, "discord-soundboard-overlay", StringComparison.OrdinalIgnoreCase);
    }

    internal static string[] Actions()
    {
        var result = new string[keys.Count + audioActions.Count];
        keys.Keys.CopyTo(result, 0);
        audioActions.CopyTo(result, keys.Count);
        return result;
    }

    internal static void Send(string action)
    {
        Send(action, null);
    }

    internal static void Send(string action, string custom)
    {
        lock (sendGate)
        {
            if (IsAudio(action))
            {
                SendAudio(action);
                return;
            }
            byte[] combo;
            if (!keys.TryGetValue(action, out combo))
                throw new Exception("登録されていないショートカットです。");
            if (!String.IsNullOrEmpty(custom))
                combo = ParseCombo(custom);
            if (String.Equals(action, "discord-soundboard-overlay", StringComparison.OrdinalIgnoreCase))
                SendDiscordOverlay(combo);
            else if (RequiresDiscordFocus(action))
                SendToDiscord(combo);
            else
                SendCombo(combo);
        }
    }

    internal static void ValidateOverride(string action, string value)
    {
        if (String.IsNullOrEmpty(value))
            return;
        if (IsAudio(action))
            throw new Exception("この操作はキー変更に対応していません。");
        ParseCombo(value);
    }

    internal static byte[] ParseCombo(string value)
    {
        if (value == null || value.Length > 80)
            throw new Exception("キーの指定が正しくありません。");
        var result = new List<byte>();
        var seen = new HashSet<byte>();
        bool main = false;
        foreach (string part in value.Split('+'))
        {
            string key = part.Trim();
            byte code;
            bool modifier = true;
            switch (key)
            {
                case "Ctrl":
                    code = 0x11;
                    break;
                case "Shift":
                    code = 0x10;
                    break;
                case "Alt":
                    code = 0x12;
                    break;
                case "Win":
                    code = 0x5B;
                    break;
                default:
                    modifier = false;
                    code = KeyCode(key);
                    break;
            }
            if (!seen.Add(code) || main)
                throw new Exception("修飾キーの後にキーを1つ指定してください。");
            if (!modifier)
                main = true;
            result.Add(code);
        }
        if (!main)
            throw new Exception("通常キーを1つ選んでください。");
        if (seen.Contains(0x11) && seen.Contains(0x12) && seen.Contains(0x2E))
            throw new Exception("Ctrl+Alt+Deleteは送信できません。");
        return result.ToArray();
    }

    static byte KeyCode(string key)
    {
        if (key.Length == 1 && ((key[0] >= 'A' && key[0] <= 'Z') || (key[0] >= '0' && key[0] <= '9')))
            return (byte)key[0];
        int f;
        if (key.StartsWith("F") && int.TryParse(key.Substring(1), out f) && f >= 1 && f <= 24)
            return (byte)(0x6F + f);
        switch (key)
        {
            case "Enter":
                return 0x0D;
            case "Tab":
                return 9;
            case "Escape":
                return 0x1B;
            case "Space":
                return 0x20;
            case "Backspace":
                return 8;
            case "Delete":
                return 0x2E;
            case "Insert":
                return 0x2D;
            case "Home":
                return 0x24;
            case "End":
                return 0x23;
            case "PageUp":
                return 0x21;
            case "PageDown":
                return 0x22;
            case "ArrowLeft":
                return 0x25;
            case "ArrowUp":
                return 0x26;
            case "ArrowRight":
                return 0x27;
            case "ArrowDown":
                return 0x28;
            case "PrintScreen":
                return 0x2C;
            case "Pause":
                return 0x13;
            case "CapsLock":
                return 0x14;
            case "Semicolon":
                return 0xBA;
            case "Equal":
                return 0xBB;
            case "Comma":
                return 0xBC;
            case "Minus":
                return 0xBD;
            case "Period":
                return 0xBE;
            case "Slash":
                return 0xBF;
            case "Backquote":
                return 0xC0;
            case "BracketLeft":
                return 0xDB;
            case "Backslash":
                return 0xDC;
            case "BracketRight":
                return 0xDD;
            case "Quote":
                return 0xDE;
            case "MediaPlayPause":
                return 0xB3;
            case "MediaTrackNext":
                return 0xB0;
            case "MediaTrackPrevious":
                return 0xB1;
            case "MediaStop":
                return 0xB2;
            default:
                throw new Exception("対応していないキーです。");
        }
    }

    static void SendAudio(string action)
    {
        string target = action.StartsWith("audio-mic", StringComparison.OrdinalIgnoreCase) ? "mic" : "speaker";
        if (action.EndsWith("-mute", StringComparison.OrdinalIgnoreCase))
        {
            AudioControl.ToggleMute(target);
            return;
        }
        AudioState state = AudioControl.Read();
        bool available = target == "mic" ? state.micAvailable : state.speakerAvailable;
        if (!available)
            throw new Exception(
                target == "mic" ? "既定のマイクが見つかりません。" : "既定のスピーカーが見つかりません。"
            );
        int current = target == "mic" ? state.micVolume : state.speakerVolume,
            change = action.EndsWith("-up", StringComparison.OrdinalIgnoreCase) ? 5 : -5;
        AudioControl.SetVolume(target, Math.Max(0, Math.Min(100, current + change)));
    }

    static void SendCombo(byte[] combo)
    {
        for (int i = 0; i < combo.Length; i++)
            keybd_event(combo[i], 0, 0, UIntPtr.Zero);
        for (int i = combo.Length - 1; i >= 0; i--)
            keybd_event(combo[i], 0, 2, UIntPtr.Zero);
    }

    static void SendDiscordOverlay(byte[] combo)
    {
        Process[] processes = Process.GetProcessesByName("Discord");
        try
        {
            if (processes.Length == 0)
                throw new Exception("Discordデスクトップ版を起動してください。");
        }
        finally
        {
            foreach (Process process in processes)
                process.Dispose();
        }
        SendCombo(combo);
    }

    static void SendToDiscord(byte[] combo)
    {
        IntPtr discord = FindDiscordWindow();
        if (discord == IntPtr.Zero)
            throw new Exception("Discordデスクトップ版を起動してください。");
        IntPtr previous = GetForegroundWindow();
        if (previous == discord)
        {
            SendCombo(combo);
            return;
        }
        bool wasMinimized = IsIconic(discord),
            wasHidden = !IsWindowVisible(discord);
        if (wasMinimized || wasHidden)
            ShowWindowAsync(discord, 9);
        if (!Activate(discord))
        {
            if (wasMinimized)
                ShowWindowAsync(discord, 6);
            else if (wasHidden)
                ShowWindowAsync(discord, 0);
            throw new Exception("Discordを一時的に操作対象へ切り替えられませんでした。");
        }
        Thread.Sleep(70);
        SendCombo(combo);
        Thread.Sleep(45);
        if (previous != IntPtr.Zero && previous != discord)
            Activate(previous);
        if (wasMinimized)
            ShowWindowAsync(discord, 6);
        else if (wasHidden)
            ShowWindowAsync(discord, 0);
    }

    static IntPtr FindDiscordWindow()
    {
        var processIds = new HashSet<uint>();
        foreach (Process process in Process.GetProcessesByName("Discord"))
        {
            try
            {
                processIds.Add((uint)process.Id);
                process.Refresh();
                if (process.MainWindowHandle != IntPtr.Zero)
                    return process.MainWindowHandle;
            }
            catch { }
            finally
            {
                process.Dispose();
            }
        }
        IntPtr result = IntPtr.Zero;
        EnumWindows(
            delegate(IntPtr window, IntPtr parameter)
            {
                uint processId;
                GetWindowThreadProcessId(window, out processId);
                if (processIds.Contains(processId) && GetWindowTextLength(window) > 0)
                {
                    result = window;
                    return false;
                }
                return true;
            },
            IntPtr.Zero
        );
        return result;
    }

    static bool Activate(IntPtr window)
    {
        IntPtr foreground = GetForegroundWindow();
        uint currentThread = GetCurrentThreadId(),
            foregroundThread = foreground == IntPtr.Zero ? 0 : GetWindowThreadProcessId(foreground, IntPtr.Zero);
        bool attached =
            foregroundThread != 0
            && foregroundThread != currentThread
            && AttachThreadInput(currentThread, foregroundThread, true);
        try
        {
            BringWindowToTop(window);
            SetForegroundWindow(window);
            return GetForegroundWindow() == window;
        }
        finally
        {
            if (attached)
                AttachThreadInput(currentThread, foregroundThread, false);
        }
    }

    [DllImport("user32.dll")]
    static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);

    [DllImport("user32.dll")]
    static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    static extern bool SetForegroundWindow(IntPtr window);

    [DllImport("user32.dll")]
    static extern bool BringWindowToTop(IntPtr window);

    [DllImport("user32.dll")]
    static extern bool IsIconic(IntPtr window);

    [DllImport("user32.dll")]
    static extern bool IsWindowVisible(IntPtr window);

    [DllImport("user32.dll")]
    static extern bool ShowWindowAsync(IntPtr window, int command);

    [DllImport("user32.dll")]
    static extern uint GetWindowThreadProcessId(IntPtr window, IntPtr processId);

    [DllImport("user32.dll")]
    static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);

    [DllImport("user32.dll")]
    static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);

    [DllImport("user32.dll")]
    static extern int GetWindowTextLength(IntPtr window);

    [DllImport("kernel32.dll")]
    static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    static extern bool AttachThreadInput(uint attach, uint attachTo, bool value);
}
