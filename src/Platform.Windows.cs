using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;

sealed class WindowsKeySender : IKeySender
{
    public bool Exists(string action) { return ShortcutKeys.Exists(action); }
    public bool IsAudio(string action) { return ShortcutKeys.IsAudio(action); }
    public bool RequiresDiscordFocus(string action) { return ShortcutKeys.RequiresDiscordFocus(action); }
    public string[] Actions() { return ShortcutKeys.Actions(); }
    public void Send(string action) { ShortcutKeys.Send(action); }
    public void Send(string action, string custom) { ShortcutKeys.Send(action, custom); }
    public void ValidateOverride(string action, string value) { ShortcutKeys.ValidateOverride(action, value); }
}

sealed class WindowsPointerInput : IPointerInput
{
    public void Send(NativeInputEvent[] events) { NativeInput.Send(events); }
    public void KeyTap(byte key) { NativeInput.KeyTap(key); }
    public void KeyCombo(byte[] keys) { NativeInput.KeyCombo(keys); }
    public void Release(IEnumerable<string> keys, IEnumerable<string> buttons) { NativeInput.Release(keys, buttons); }
}

sealed class WindowsAudioService : IAudioService
{
    public AudioState Read() { return AudioControl.Read(); }
    public AudioState SetVolume(string target, int value) { return AudioControl.SetVolume(target, value); }
    public AudioState AdjustVolume(string target, int delta) { return AudioControl.AdjustVolume(target, delta); }
    public AudioState ToggleMute(string target) { return AudioControl.ToggleMute(target); }
}

sealed class WindowsAudioDevices : IAudioDevices
{
    public List<AudioDeviceInfo> List() { return AudioDevices.List(); }
    public AudioDeviceInfo Validate(string target, string id) { return AudioDevices.Validate(target, id); }
    public void Switch(string target, string id) { AudioDevices.Switch(target, id); }
}

sealed class WindowsShellActions : IShellActions
{
    public void OpenUrl(string url) { CustomActions.OpenUrl(url); }
    public void CopyText(string text) { CustomActions.CopyText(text); }
    public bool IsStartApp(string path) { return StartApps.IsStartApp(path); }
    public void StartApp(string path) { StartApps.Start(path); }

    public void StartProcess(string path, string args)
    {
        Process.Start(
            new ProcessStartInfo(path, args ?? "")
            {
                UseShellExecute = path.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase),
                WorkingDirectory = Path.GetDirectoryName(path),
            }
        );
    }
}
