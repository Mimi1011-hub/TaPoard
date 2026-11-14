sealed class AppHost
{
    internal readonly IKeySender Keys;
    internal readonly IPointerInput Pointer;
    internal readonly IAudioService Audio;
    internal readonly IAudioDevices AudioDevices;
    internal readonly IShellActions Shell;

    internal AppHost(IKeySender keys, IPointerInput pointer, IAudioService audio, IAudioDevices audioDevices, IShellActions shell)
    {
        Keys = keys;
        Pointer = pointer;
        Audio = audio;
        AudioDevices = audioDevices;
        Shell = shell;
    }

    internal static AppHost CreateWindows()
    {
        return new AppHost(
            new WindowsKeySender(),
            new WindowsPointerInput(),
            new WindowsAudioService(),
            new WindowsAudioDevices(),
            new WindowsShellActions()
        );
    }
}
