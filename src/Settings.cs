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
    public int pageCount { get; set; }
    public int landscapePageCount { get; set; }
    public int portraitPageCount { get; set; }
    public List<PairedDevice> devices { get; set; }
}

class ControlPlacement
{
    public int row { get; set; }
    public int column { get; set; }
    public int width { get; set; }
    public int height { get; set; }
}
