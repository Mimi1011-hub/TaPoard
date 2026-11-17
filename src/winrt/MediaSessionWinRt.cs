using System;
using System.IO;
using System.Threading;
using Windows.Foundation;
using Windows.Media.Control;
using Windows.Storage.Streams;

sealed class MediaSessionWinRt : IMediaSession
{
    GlobalSystemMediaTransportControlsSessionManager manager;
    byte[] art;
    string artVersion = "";
    string mediaKey = "";

    static T Wait<T>(IAsyncOperation<T> operation)
    {
        while (operation.Status == AsyncStatus.Started) Thread.Sleep(10);
        if (operation.Status != AsyncStatus.Completed) throw new Exception("async " + operation.Status);
        return operation.GetResults();
    }

    static uint Wait(DataReaderLoadOperation operation)
    {
        while (operation.Status == AsyncStatus.Started) Thread.Sleep(10);
        if (operation.Status != AsyncStatus.Completed) throw new Exception("load " + operation.Status);
        return operation.GetResults();
    }

    public MediaState Current()
    {
        try
        {
            if (manager == null) manager = Wait(GlobalSystemMediaTransportControlsSessionManager.RequestAsync());
            GlobalSystemMediaTransportControlsSession session = manager.GetCurrentSession();
            if (session == null) return new MediaState { available = true, active = false };
            GlobalSystemMediaTransportControlsSessionMediaProperties media = Wait(session.TryGetMediaPropertiesAsync());
            GlobalSystemMediaTransportControlsSessionPlaybackInfo playback = session.GetPlaybackInfo();
            GlobalSystemMediaTransportControlsSessionTimelineProperties timeline = session.GetTimelineProperties();
            string key = String.Join("\n", new[] { media.Title, media.Artist, media.AlbumTitle, session.SourceAppUserModelId });
            if (key != mediaKey)
            {
                mediaKey = key;
                art = ReadArt(media.Thumbnail);
                artVersion = MediaArt.Version(art);
            }
            return new MediaState
            {
                available = true,
                active = true,
                title = media.Title ?? "",
                artist = media.Artist ?? "",
                album = media.AlbumTitle ?? "",
                app = session.SourceAppUserModelId ?? "",
                playing = playback.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing,
                canPlayPause = playback.Controls.IsPlayPauseToggleEnabled,
                canNext = playback.Controls.IsNextEnabled,
                canPrevious = playback.Controls.IsPreviousEnabled,
                position = timeline == null ? null : (double?)timeline.Position.TotalSeconds,
                duration = timeline == null || timeline.EndTime <= timeline.StartTime ? null : (double?)(timeline.EndTime - timeline.StartTime).TotalSeconds,
                artVersion = artVersion,
            };
        }
        catch
        {
            return new MediaState { available = false, active = false };
        }
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
            if (manager == null) manager = Wait(GlobalSystemMediaTransportControlsSessionManager.RequestAsync());
            GlobalSystemMediaTransportControlsSession current = manager.GetCurrentSession();
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
