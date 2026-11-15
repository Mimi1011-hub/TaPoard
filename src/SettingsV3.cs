using System.Collections.Generic;

// Persisted in data\settings-v3.json. Property names are part of the file format.
class SettingsV3
{
    public int schemaVersion { get; set; }
    public SecurityV3 security { get; set; }
    public DeckV3 deck { get; set; }
    public WeatherV3 weather { get; set; }
    public PcWindowOptions pcWindow { get; set; }
}

class SecurityV3
{
    public string token { get; set; }
    public List<PairedDevice> devices { get; set; }
}

class DeckV3
{
    public bool keepAwake { get; set; }
    public DeckBackground background { get; set; }
    public OrientationV3 landscape { get; set; }
    public OrientationV3 portrait { get; set; }
}

class OrientationV3
{
    public int columns { get; set; }
    public int rows { get; set; }
    public FadersV3 faders { get; set; }
    public List<PageV3> pages { get; set; }
}

class FadersV3
{
    public FaderV3 speaker { get; set; }
    public FaderV3 mic { get; set; }
}

class FaderV3
{
    public int row { get; set; }
    public int column { get; set; }
    public int width { get; set; }
    public int height { get; set; }
    public bool off { get; set; }
}

class PageV3
{
    public PageFadersV3 faders { get; set; }
    public List<DeckItem> items { get; set; }
}

class PageFadersV3
{
    public ControlPlacement speaker { get; set; }
    public ControlPlacement mic { get; set; }
    public bool speakerHidden { get; set; }
    public bool micHidden { get; set; }
}

class DeckItem
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
    public string iconPack { get; set; }
    public string iconPackItem { get; set; }
    public string type { get; set; }
    public string action { get; set; }
    public string category { get; set; }
    public string deviceId { get; set; }
    public string deviceTarget { get; set; }
    public string deviceName { get; set; }
    public int row { get; set; }
    public int column { get; set; }
    public int width { get; set; }
    public int height { get; set; }
    public int fontSize { get; set; }
    public int iconScale { get; set; }
    public int? labelOpacity { get; set; }
    public int? keyClear { get; set; }
    public bool hideLabel { get; set; }
    public string hotkey { get; set; }
    public Dictionary<string, object> options { get; set; }
}

class WeatherV3
{
    public string name { get; set; }
    public double latitude { get; set; }
    public double longitude { get; set; }
    public string timezone { get; set; }
}
