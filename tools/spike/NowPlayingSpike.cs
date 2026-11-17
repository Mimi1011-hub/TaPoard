// Spike for brief 27: can the stock .NET Framework compiler read "now playing" from Windows without extra packages?
// Waits on WinRT async calls by polling Status, so it needs no System.Runtime.WindowsRuntime (AsTask), which wants the
// SDK-only union Windows.winmd.
using System;
using System.Threading;
using Windows.Foundation;
using Windows.Media.Control;
using Windows.Storage.Streams;

static class NowPlayingSpike
{
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

    static int Main()
    {
        try
        {
            GlobalSystemMediaTransportControlsSessionManager manager = Wait(GlobalSystemMediaTransportControlsSessionManager.RequestAsync());
            GlobalSystemMediaTransportControlsSession session = manager.GetCurrentSession();
            if (session == null)
            {
                Console.WriteLine("OK: no session (start a song and run again)");
                return 0;
            }
            GlobalSystemMediaTransportControlsSessionMediaProperties media = Wait(session.TryGetMediaPropertiesAsync());
            var playback = session.GetPlaybackInfo();
            Console.WriteLine("OK: app=" + session.SourceAppUserModelId);
            Console.WriteLine("OK: title=" + media.Title + " / artist=" + media.Artist + " / album=" + media.AlbumTitle);
            Console.WriteLine("OK: status=" + playback.PlaybackStatus + " / canNext=" + playback.Controls.IsNextEnabled);
            if (media.Thumbnail == null)
            {
                Console.WriteLine("OK: no thumbnail");
                return 0;
            }
            IRandomAccessStreamWithContentType stream = Wait(media.Thumbnail.OpenReadAsync());
            var reader = new DataReader(stream);
            uint size = Wait(reader.LoadAsync((uint)Math.Min(stream.Size, 8 * 1024 * 1024)));
            var bytes = new byte[size];
            reader.ReadBytes(bytes);
            Console.WriteLine("OK: thumbnail " + stream.ContentType + " " + bytes.Length + " bytes");
            return 0;
        }
        catch (Exception error)
        {
            Console.WriteLine("FAILED: " + error);
            return 1;
        }
    }
}
