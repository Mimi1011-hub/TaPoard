using System;
using System.Collections.Generic;

sealed class FakeKeySender : IKeySender
{
    internal readonly List<string> Calls = new List<string>();
    internal bool AudioAction;

    public bool Exists(string action) { return true; }
    public bool IsAudio(string action) { return AudioAction; }
    public bool RequiresDiscordFocus(string action) { return false; }
    public string[] Actions() { return new string[0]; }
    public void Send(string action) { Calls.Add("Send:" + action); }
    public void Send(string action, string custom) { Calls.Add("Send:" + action + ":" + custom); }
    public void ValidateOverride(string action, string value) { Calls.Add("ValidateOverride:" + action + ":" + value); }
}

sealed class FakePointerInput : IPointerInput
{
    internal readonly List<string> Calls = new List<string>();

    public void Send(NativeInputEvent[] events) { Calls.Add("Send:" + events.Length); }
    public void KeyTap(byte key) { Calls.Add("KeyTap:" + key); }
    public void KeyCombo(byte[] keys) { Calls.Add("KeyCombo:" + keys.Length); }
    public void Release(IEnumerable<string> keys, IEnumerable<string> buttons) { Calls.Add("Release"); }
}

sealed class FakeAudioService : IAudioService
{
    internal readonly List<string> Calls = new List<string>();

    public AudioState Read() { Calls.Add("Read"); return new AudioState(); }
    public AudioState SetVolume(string target, int value) { Calls.Add("SetVolume:" + target + ":" + value); return new AudioState(); }
    public AudioState AdjustVolume(string target, int delta) { Calls.Add("AdjustVolume:" + target + ":" + delta); return new AudioState(); }
    public AudioState ToggleMute(string target) { Calls.Add("ToggleMute:" + target); return new AudioState(); }
}

sealed class FakeAudioDevices : IAudioDevices
{
    internal readonly List<string> Calls = new List<string>();

    public List<AudioDeviceInfo> List() { Calls.Add("List"); return new List<AudioDeviceInfo>(); }
    public AudioDeviceInfo Validate(string target, string id) { Calls.Add("Validate:" + target + ":" + id); return new AudioDeviceInfo(); }
    public void Switch(string target, string id) { Calls.Add("Switch:" + target + ":" + id); }
}

sealed class FakeShellActions : IShellActions
{
    internal readonly List<string> Calls = new List<string>();

    public void OpenUrl(string url) { Calls.Add("OpenUrl:" + url); }
    public void CopyText(string text) { Calls.Add("CopyText:" + text); }
    public bool IsStartApp(string path)
    {
        Calls.Add("IsStartApp:" + path);
        return path != null && path.StartsWith("shell:AppsFolder\\");
    }
    public void StartApp(string path) { Calls.Add("StartApp:" + path); }
    public void StartProcess(string path, string args) { Calls.Add("StartProcess:" + path + ":" + args); }
}

sealed class FakeSettingsStore : ISettingsStore
{
    internal Settings Current;
    internal Settings Saved;
    internal object Backups = new object();
    internal Settings Backup;
    internal readonly List<string> Calls = new List<string>();

    public Settings Load(Func<Settings> createDefaults)
    {
        Calls.Add("Load");
        return Current ?? createDefaults();
    }

    public void Save(Settings settings)
    {
        Calls.Add("Save");
        Saved = settings;
    }

    public object ListBackups()
    {
        Calls.Add("ListBackups");
        return Backups;
    }

    public Settings ReadBackup(string id)
    {
        Calls.Add("ReadBackup:" + id);
        return Backup;
    }
}

sealed class FakeDesktop : IDesktop
{
    internal readonly List<string> Calls = new List<string>();
    public object PcWindowView() { Calls.Add("PcWindowView"); return new { open = false }; }
    public void SavePcWindow(Dictionary<string, object> input) { Calls.Add("SavePcWindow"); }
    public void OpenPcWindow(bool fullscreen) { Calls.Add("OpenPcWindow:" + fullscreen); }
    public string StartImport() { Calls.Add("StartImport"); return "ticket"; }
}
