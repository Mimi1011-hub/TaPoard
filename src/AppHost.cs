sealed class AppHost
{
    internal readonly IKeySender Keys;
    internal readonly IPointerInput Pointer;
    internal readonly IAudioService Audio;
    internal readonly IAudioDevices AudioDevices;
    internal readonly IShellActions Shell;
    internal readonly IMediaSession MediaSession;

    internal AppHost(IKeySender keys, IPointerInput pointer, IAudioService audio, IAudioDevices audioDevices, IShellActions shell)
        : this(keys, pointer, audio, audioDevices, shell, new UnavailableMediaSession())
    {
    }

    internal AppHost(IKeySender keys, IPointerInput pointer, IAudioService audio, IAudioDevices audioDevices, IShellActions shell, IMediaSession mediaSession)
    {
        Keys = keys;
        Pointer = pointer;
        Audio = audio;
        AudioDevices = audioDevices;
        Shell = shell;
        MediaSession = mediaSession;
    }

    internal static AppHost CreateWindows()
    {
        return new AppHost(
            new WindowsKeySender(),
            new WindowsPointerInput(),
            new WindowsAudioService(),
            new WindowsAudioDevices(),
            new WindowsShellActions(),
#if WINRT_MEDIA
            new MediaSessionWinRt()
#else
            new UnavailableMediaSession()
#endif
        );
    }
}
