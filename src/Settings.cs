using System.Collections.Generic;

// Persisted in data\settings-v2.json. Property names are part of the file and API format.
class AppEntry
{
    public string id { get; set; }
    public string name { get; set; }
    public string path { get; set; }
    public string args { get; set; }
    public string url { get; set; }
    public string text { get; set; }
    public string icon { get; set; }
    public string iconKey { get; set; }
    public string iconColor { get; set; }
    public string customIcon { get; set; }
    // 3.1: the icon pack (and picture in it) that customIcon was copied from.
    public string iconPack { get; set; }
    public string iconPackItem { get; set; }
    public string type { get; set; }
    public string action { get; set; }
    public string category { get; set; }
    public string deviceId { get; set; }
    public string deviceTarget { get; set; }
    public string deviceName { get; set; }
    public string orientation { get; set; }
    public TilePosition landscape { get; set; }
    public TilePosition portrait { get; set; }
    public int size { get; set; }
    public int width { get; set; }
    public int height { get; set; }
    public int fontSize { get; set; }
    public int iconScale { get; set; }
    public int? labelOpacity { get; set; }
    public bool hideLabel { get; set; }
    public string hotkey { get; set; }
    public Dictionary<string, object> options { get; set; }
}

class Settings
{
    public int schemaVersion { get; set; }
    public string token { get; set; }
    public string pairingKey { get; set; }
    public List<AppEntry> apps { get; set; }
    public int columns { get; set; }
    public int rows { get; set; }
    public int landscapeColumns { get; set; }
    public int landscapeRows { get; set; }
    public int portraitColumns { get; set; }
    public int portraitRows { get; set; }
    public bool keepAwake { get; set; }
    public int speakerSlot { get; set; }
    public int micSlot { get; set; }
    public int speakerSize { get; set; }
    public int micSize { get; set; }
    public int landscapeSpeakerSlot { get; set; }
    public int landscapeMicSlot { get; set; }
    public int landscapeSpeakerSize { get; set; }
    public int landscapeMicSize { get; set; }
    public int portraitSpeakerSlot { get; set; }
    public int portraitMicSlot { get; set; }
    public int portraitSpeakerSize { get; set; }
    public int portraitMicSize { get; set; }
    public ControlPlacement landscapeSpeaker { get; set; }
    public ControlPlacement landscapeMic { get; set; }
    public ControlPlacement portraitSpeaker { get; set; }
    public ControlPlacement portraitMic { get; set; }
    // Pages listed here override the fader placement above; other pages use it unchanged.
    public List<ControlPage> landscapeControlPages { get; set; }
    public List<ControlPage> portraitControlPages { get; set; }
    // 3.1: a fader removed from every page of one orientation (a page can still show it on its own).
    public bool landscapeSpeakerOff { get; set; }
    public bool landscapeMicOff { get; set; }
    public bool portraitSpeakerOff { get; set; }
    public bool portraitMicOff { get; set; }
    public int pageCount { get; set; }
    public int landscapePageCount { get; set; }
    public int portraitPageCount { get; set; }
    public List<PairedDevice> devices { get; set; }
    public string weatherName { get; set; }
    public double weatherLatitude { get; set; }
    public double weatherLongitude { get; set; }
    public string weatherTimezone { get; set; }
    public PcWindowOptions pcWindow { get; set; }
    public DeckBackground background { get; set; }
}

class ControlPage
{
    public int page { get; set; }
    public ControlPlacement speaker { get; set; }
    public ControlPlacement mic { get; set; }
    public bool speakerHidden { get; set; }
    public bool micHidden { get; set; }
}

class ControlPlacement
{
    public int row { get; set; }
    public int column { get; set; }
    public int width { get; set; }
    public int height { get; set; }
}
