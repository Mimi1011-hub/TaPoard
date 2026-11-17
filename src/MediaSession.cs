using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Security.Cryptography;
using System.Threading;

sealed class MediaState
{
    public bool available { get; set; }
    public bool active { get; set; }
    public string title { get; set; }
    public string artist { get; set; }
    public string album { get; set; }
    public string app { get; set; }
    public bool playing { get; set; }
    public bool canPlayPause { get; set; }
    public bool canNext { get; set; }
    public bool canPrevious { get; set; }
    public double? position { get; set; }
    public double? duration { get; set; }
    public string artVersion { get; set; }
}

interface IMediaSession
{
    MediaState Current();
    byte[] Art();
    void Command(string name);
}

sealed class UnavailableMediaSession : IMediaSession
{
    public MediaState Current() { return new MediaState { available = false, active = false }; }
    public byte[] Art() { return null; }
    public void Command(string name) { }
}

static class MediaArt
{
    internal static byte[] Resize(byte[] source)
    {
        if (source == null || source.Length == 0) return null;
        using (var input = new MemoryStream(source))
        using (Image image = Image.FromStream(input))
        {
            double scale = Math.Min(1, 320.0 / Math.Max(image.Width, image.Height));
            int width = Math.Max(1, (int)Math.Round(image.Width * scale));
            int height = Math.Max(1, (int)Math.Round(image.Height * scale));
            using (var resized = new Bitmap(width, height, PixelFormat.Format32bppArgb))
            using (Graphics graphics = Graphics.FromImage(resized))
            using (var output = new MemoryStream())
            {
                graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                graphics.DrawImage(image, 0, 0, width, height);
                resized.Save(output, ImageFormat.Png);
                return output.ToArray();
            }
        }
    }

    internal static string Version(byte[] value)
    {
        if (value == null) return "";
        using (var hash = SHA256.Create())
            return BitConverter.ToString(hash.ComputeHash(value), 0, 8).Replace("-", "").ToLowerInvariant();
    }
}

static class MediaService
{
    const int Interval = 1000;
    static readonly object Sync = new object();
    static readonly Timer Timer = new Timer(OnTimer, null, Timeout.Infinite, Timeout.Infinite);
    static IMediaSession session = new UnavailableMediaSession();
    static Action changed;
    static bool running;
    static bool timerArmed;
    static MediaState latest = Empty();

    internal static void Initialize(IMediaSession value, Action onChanged)
    {
        SetActive(false);
        lock (Sync)
        {
            session = value ?? new UnavailableMediaSession();
            changed = onChanged;
            latest = Empty();
        }
    }

    internal static void SetActive(bool active)
    {
        lock (Sync)
        {
            if (active == running) return;
            running = active;
            timerArmed = false;
            Timer.Change(Timeout.Infinite, Timeout.Infinite);
            if (!active) latest = Empty();
        }
        if (active) Sample();
    }

    internal static MediaState PublicSnapshot()
    {
        lock (Sync) return Copy(latest);
    }

    internal static byte[] Art() { return session.Art(); }

    internal static void Command(string name)
    {
        if (name != "playPause" && name != "next" && name != "previous") throw new Exception(Text.Get("source.media.1"));
        session.Command(name);
    }

    internal static bool TimerArmed { get { lock (Sync) return timerArmed; } }

    internal static void SampleForTest() { Sample(); }

    internal static void Stop()
    {
        SetActive(false);
        lock (Sync)
        {
            session = new UnavailableMediaSession();
            changed = null;
        }
    }

    static void OnTimer(object state)
    {
        lock (Sync) timerArmed = false;
        Sample();
    }

    static void Sample()
    {
        MediaState next;
        try { next = session.Current() ?? Empty(); }
        catch { next = Empty(); }
        Action notify = null;
        lock (Sync)
        {
            if (!running) return;
            if (!Same(latest, next)) notify = changed;
            latest = Copy(next);
            timerArmed = true;
            Timer.Change(Interval, Timeout.Infinite);
        }
        if (notify != null) notify();
    }

    static bool Same(MediaState a, MediaState b)
    {
        return a.available == b.available && a.active == b.active && a.title == b.title && a.artist == b.artist && a.album == b.album
            && a.app == b.app && a.playing == b.playing && a.canPlayPause == b.canPlayPause && a.canNext == b.canNext
            && a.canPrevious == b.canPrevious && a.position == b.position && a.duration == b.duration && a.artVersion == b.artVersion;
    }

    static MediaState Empty() { return new MediaState { available = false, active = false, artVersion = "" }; }

    static MediaState Copy(MediaState value)
    {
        return new MediaState
        {
            available = value.available, active = value.active, title = value.title ?? "", artist = value.artist ?? "", album = value.album ?? "",
            app = value.app ?? "", playing = value.playing, canPlayPause = value.canPlayPause, canNext = value.canNext,
            canPrevious = value.canPrevious, position = value.position, duration = value.duration, artVersion = value.artVersion ?? "",
        };
    }
}
