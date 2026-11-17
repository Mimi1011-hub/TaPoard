using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Web.Script.Serialization;

class MediaSessionTests
{
    sealed class FakeMedia : IMediaSession
    {
        internal int reads;
        internal string command;
        internal MediaState state = new MediaState
        {
            available = true, active = true, title = "Song", artist = "Artist", album = "Album", app = "Player",
            playing = true, canPlayPause = true, canNext = true, canPrevious = false, position = 12, duration = 120, artVersion = "art-1",
        };
        public MediaState Current() { reads++; return state; }
        public byte[] Art() { return new byte[] { 1, 2, 3 }; }
        public void Command(string name) { command = name; }
    }

    static void Check(bool value, string message)
    {
        if (!value) throw new Exception("FAIL " + message);
        Console.WriteLine("PASS " + message);
    }

    static void Main()
    {
        var fake = new FakeMedia();
        MediaService.Initialize(fake, delegate { });
        Check(fake.reads == 0 && !MediaService.TimerArmed, "media is not read without a visible widget");
        MediaService.SetActive(true);
        MediaState state = MediaService.PublicSnapshot();
        string json = new JavaScriptSerializer().Serialize(state);
        Check(fake.reads == 1 && json.Contains("\"title\":\"Song\"") && json.Contains("\"position\":12"), "media state has the public shape");
        MediaService.Command("next");
        Check(fake.command == "next", "valid media commands reach the session");
        bool rejected = false;
        try { MediaService.Command("bad"); } catch { rejected = true; }
        Check(rejected, "unknown media commands are rejected");
        MediaService.Stop();

        Check(MediaApps.Name("SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify") == "Spotify" && MediaApps.Name("Chrome") == "Chrome"
            && MediaApps.Name("Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic") == "Media Player"
            && MediaApps.Name(@"C:\Tools\Player.exe") == "Player" && MediaApps.Name("") == "", "app ids become short names");
        var before = new MediaState { available = true, active = true, title = "Song", playing = true, position = 10, duration = 100 };
        var moved = new MediaState { available = true, active = true, title = "Song", playing = true, position = 11, duration = 100 };
        var jumped = new MediaState { available = true, active = true, title = "Song", playing = true, position = 40, duration = 100 };
        Check(MediaService.Same(before, moved, 1) && !MediaService.Same(before, jumped, 1), "playback moving on is not a change, a seek is");
        before.playing = false;
        Check(!MediaService.Same(before, moved, 30), "a paused position that moves is a change");

        byte[] source;
        using (var image = new Bitmap(1000, 500))
        using (var output = new MemoryStream())
        {
            image.Save(output, ImageFormat.Jpeg);
            source = output.ToArray();
        }
        byte[] resized = MediaArt.Resize(source);
        using (var stream = new MemoryStream(resized))
        using (Image image = Image.FromStream(stream))
            Check(image.Width <= 320 && image.Height <= 320, "album art is limited to 320 pixels");
    }
}
