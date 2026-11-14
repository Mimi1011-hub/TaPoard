using System.Collections.Generic;

interface IKeySender
{
    bool Exists(string action);
    bool IsAudio(string action);
    bool RequiresDiscordFocus(string action);
    string[] Actions();
    void Send(string action);
    void Send(string action, string custom);
    void ValidateOverride(string action, string value);
}

interface IPointerInput
{
    void Send(NativeInputEvent[] events);
    void KeyTap(byte key);
    void KeyCombo(byte[] keys);
    void Release(IEnumerable<string> keys, IEnumerable<string> buttons);
}

interface IAudioService
{
    AudioState Read();
    AudioState SetVolume(string target, int value);
    AudioState AdjustVolume(string target, int delta);
    AudioState ToggleMute(string target);
}

interface IAudioDevices
{
    List<AudioDeviceInfo> List();
    AudioDeviceInfo Validate(string target, string id);
    void Switch(string target, string id);
}

interface IShellActions
{
    void OpenUrl(string url);
    void CopyText(string text);
    bool IsStartApp(string path);
    void StartApp(string path);
    void StartProcess(string path, string args);
}
