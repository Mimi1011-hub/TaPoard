using System;
using System.IO;
using System.Threading;
using Windows.Foundation;
using Windows.Media.Control;
using Windows.Storage.Streams;

sealed class MediaSessionWinRt : IMediaSession
{
    const int TimeoutMs = 5000;
    readonly object gate = new object();
    GlobalSystemMediaTransportControlsSessionManager manager;
    bool unsupported;
    volatile byte[] art;
    string artVersion = "";
    string mediaKey = "";
    int artTries;

    // Waits by polling Status: AsTask() would need the SDK-only Windows.winmd. A call that never finishes is given up after 5 seconds.
    static T Wait<T>(IAsyncOperation<T> operation)
    {
        WaitStarted(operation);
        return operation.GetResults();
    }

    static uint Wait(DataReaderLoadOperation operation)
    {
        WaitStarted(operation);
        return operation.GetResults();
    }

    static void WaitStarted(IAsyncInfo operation)
    {
        DateTime limit = DateTime.UtcNow.AddMilliseconds(TimeoutMs);
        while (operation.Status == AsyncStatus.Started)
        {
            if (DateTime.UtcNow > limit)
            {
                operation.Cancel();
                throw new TimeoutException("WinRT call timed out");
            }
            Thread.Sleep(10);
        }
        if (operation.Status != AsyncStatus.Completed) throw new Exception("async " + operation.Status);
    }

    // Null when this Windows has no media session API (before Windows 10 1809): the widget then says it is not available.
    GlobalSystemMediaTransportControlsSessionManager Manager()
    {
        lock (gate)
        {
            if (manager != null || unsupported) return manager;
            try { manager = Wait(GlobalSystemMediaTransportControlsSessionManager.RequestAsync()); }
            catch (TimeoutException) { return null; }
            catch (Exception) { unsupported = true; }
            return manager;
        }
    }

    public MediaState Current()
    {
        GlobalSystemMediaTransportControlsSessionManager sessions;
        try { sessions = Manager(); }
        catch { sessions = null; }
        if (sessions == null) return new MediaState { available = false, active = false };
        try
        {
            GlobalSystemMediaTransportControlsSession session = sessions.GetCurrentSession();
            if (session == null) return new MediaState { available = true, active = false };
            GlobalSystemMediaTransportControlsSessionMediaProperties media = Wait(session.TryGetMediaPropertiesAsync());
            GlobalSystemMediaTransportControlsSessionPlaybackInfo playback = session.GetPlaybackInfo();
            GlobalSystemMediaTransportControlsSessionTimelineProperties timeline = session.GetTimelineProperties();
            string key = String.Join("\n", new[] { media.Title, media.Artist, media.AlbumTitle, session.SourceAppUserModelId });
            // Players often send the title first and the picture a moment later, so a missing picture is read again a few times.
            if (key != mediaKey) { mediaKey = key; artTries = 0; art = null; artVersion = ""; }
            if (art == null && media.Thumbnail != null && artTries < 5)
            {
                artTries++;
                try { art = ReadArt(media.Thumbnail); }
                catch { art = null; }
                artVersion = MediaArt.Version(art);
            }
            bool playing = playback.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
            return new MediaState
            {
                available = true,
                active = true,
                title = media.Title ?? "",
                artist = media.Artist ?? "",
                album = media.AlbumTitle ?? "",
                app = MediaApps.Name(session.SourceAppUserModelId),
                playing = playing,
                canPlayPause = playback.Controls.IsPlayPauseToggleEnabled,
                canNext = playback.Controls.IsNextEnabled,
                canPrevious = playback.Controls.IsPreviousEnabled,
                position = Position(timeline, playing),
                duration = timeline == null || timeline.EndTime <= timeline.StartTime ? null : (double?)(timeline.EndTime - timeline.StartTime).TotalSeconds,
                artVersion = artVersion,
            };
        }
        catch
        {
            // The session can close while it is read; that is "nothing playing", not "not available".
            return new MediaState { available = true, active = false };
        }
    }

    // Windows reports the position as of LastUpdatedTime (browsers update it rarely), so move it on by the time since then.
    static double? Position(GlobalSystemMediaTransportControlsSessionTimelineProperties timeline, bool playing)
    {
        if (timeline == null) return null;
        double position = (timeline.Position - timeline.StartTime).TotalSeconds;
        if (playing && timeline.LastUpdatedTime.Year > 2000)
            position += Math.Max(0, (DateTimeOffset.Now - timeline.LastUpdatedTime).TotalSeconds);
        double end = (timeline.EndTime - timeline.StartTime).TotalSeconds;
        if (end > 0) position = Math.Min(position, end);
        return Math.Max(0, position);
    }

    byte[] ReadArt(IRandomAccessStreamReference thumbnail)
    {
        if (thumbnail == null) return null;
        IRandomAccessStreamWithContentType stream = Wait(thumbnail.OpenReadAsync());
        using (var reader = new DataReader(stream))
        {
            uint size = Wait(reader.LoadAsync((uint)Math.Min(stream.Size, 8 * 1024 * 1024)));
            var bytes = new byte[size];
            reader.ReadBytes(bytes);
            return MediaArt.Resize(bytes);
        }
    }

    public byte[] Art() { return art; }

    public void Command(string name)
    {
        string fallback = name == "next" ? "media-next" : name == "previous" ? "media-previous" : "media-playpause";
        try
        {
            GlobalSystemMediaTransportControlsSessionManager sessions = Manager();
            GlobalSystemMediaTransportControlsSession current = sessions == null ? null : sessions.GetCurrentSession();
            if (current == null || !Run(current, name)) ShortcutKeys.Send(fallback);
        }
        catch { ShortcutKeys.Send(fallback); }
    }

    static bool Run(GlobalSystemMediaTransportControlsSession session, string name)
    {
        if (name == "next") return Wait(session.TrySkipNextAsync());
        if (name == "previous") return Wait(session.TrySkipPreviousAsync());
        return Wait(session.TryTogglePlayPauseAsync());
    }
}
