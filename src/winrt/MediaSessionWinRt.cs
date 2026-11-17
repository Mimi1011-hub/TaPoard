using System;
using System.Threading;
using Windows.Foundation;
using Windows.Media.Control;

sealed class MediaSessionWinRt : IMediaSession
{
    GlobalSystemMediaTransportControlsSessionManager manager;

    static T Wait<T>(IAsyncOperation<T> operation)
    {
        while (operation.Status == AsyncStatus.Started) Thread.Sleep(10);
        if (operation.Status != AsyncStatus.Completed) throw new Exception("async " + operation.Status);
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
            return new MediaState
            {
                available = true,
                active = true,
                title = media.Title ?? "",
                artist = media.Artist ?? "",
                album = media.AlbumTitle ?? "",
                app = session.SourceAppUserModelId ?? "",
            };
        }
        catch
        {
            return new MediaState { available = false, active = false };
        }
    }

    public byte[] Art() { return null; }
    public void Command(string name) { }
}
