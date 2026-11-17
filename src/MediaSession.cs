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
