using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;

sealed class PresetTransferFile
{
    public string format { get; set; }
    public int version { get; set; }
    public List<PresetTransfer> presets { get; set; }
}

sealed class PresetTransfer
{
    public string name { get; set; }
    public string orientation { get; set; }
    public int columns { get; set; }
    public int rows { get; set; }
    public FaderV3 speaker { get; set; }
    public FaderV3 mic { get; set; }
    public List<DeckItem> items { get; set; }
}

sealed class PresetSafety
{
    public int apps { get; set; }
    public int urls { get; set; }
    public int texts { get; set; }
    public List<string> paths { get; set; }
}

sealed class PresetImport
{
    public List<CustomPreset> presets { get; set; }
    public PresetSafety safety { get; set; }
}

static class PresetFiles
{
    internal const int MaxBytes = 2 * 1024 * 1024;
    internal const int MaxPresets = 40;
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = MaxBytes + 1024 };

    internal static byte[] Export(IEnumerable<CustomPreset> source)
    {
        var presets = new List<object>();
        foreach (CustomPreset value in source)
        {
            CustomPreset preset = Copy(value);
            Clean(preset.items);
            presets.Add(new Dictionary<string, object>
            {
                { "name", preset.name }, { "orientation", preset.orientation },
                { "columns", preset.columns }, { "rows", preset.rows },
                { "speaker", preset.speaker }, { "mic", preset.mic },
                { "items", FileItems(preset.items) },
            });
        }
        if (presets.Count > MaxPresets) throw new Exception(Text.Get("source.presetfiles.count"));
        string jsonText = Json.Serialize(new Dictionary<string, object>
        {
            { "format", "tapoard-preset" }, { "version", 1 }, { "presets", presets },
        });
        byte[] bytes = new UTF8Encoding(false).GetBytes(jsonText);
        if (bytes.Length > MaxBytes) throw new Exception(Text.Get("source.presetfiles.size"));
        return bytes;
    }

    internal static PresetImport Read(byte[] bytes, DeckController controller)
    {
        if (bytes == null || bytes.Length > MaxBytes) throw new Exception(Text.Get("source.presetfiles.size"));
        PresetTransferFile file;
        try { file = Json.Deserialize<PresetTransferFile>(Encoding.UTF8.GetString(bytes)); }
        catch { throw new Exception(Text.Get("source.presetfiles.invalid")); }
        if (file == null || file.format != "tapoard-preset" || file.version != 1 || file.presets == null)
            throw new Exception(Text.Get("source.presetfiles.format"));
        if (file.presets.Count > MaxPresets) throw new Exception(Text.Get("source.presetfiles.count"));
        var result = new List<CustomPreset>();
        foreach (PresetTransfer value in file.presets)
        {
            CustomPreset preset = ToPreset(value);
            Clean(preset.items);
            Validate(preset, controller);
            result.Add(preset);
        }
        return new PresetImport { presets = result, safety = Safety(result) };
    }

    internal static PresetSafety Safety(IEnumerable<CustomPreset> presets)
    {
        var result = new PresetSafety { paths = new List<string>() };
        foreach (CustomPreset preset in presets)
            foreach (DeckItem item in preset.items ?? new List<DeckItem>())
            {
                Count(item.type, item.path, result);
                foreach (ActionStep step in item.steps ?? new List<ActionStep>()) Count(step.type, step.path, result);
            }
        return result;
    }

    internal static List<CustomPreset> FromDeck(Settings settings, string name)
    {
        if (settings == null) throw new Exception(Text.Get("source.presetfiles.invalid"));
        DeckV3 deck = SettingsMigration.ToV3(settings).deck;
        var result = new List<CustomPreset>();
        AddPages(result, deck.landscape, "landscape", name, "source.presetfiles.landscapeName");
        AddPages(result, deck.portrait, "portrait", name, "source.presetfiles.portraitName");
        return result;
    }

    static void AddPages(List<CustomPreset> result, OrientationV3 side, string orientation, string name, string nameKey)
    {
        for (int index = 0; index < side.pages.Count; index++)
        {
            PageV3 page = side.pages[index];
            FaderV3 speaker = Effective(side.faders.speaker, page.faders, false);
            FaderV3 mic = Effective(side.faders.mic, page.faders, true);
            if ((page.items == null || page.items.Count == 0) && speaker == null && mic == null) continue;
            result.Add(new CustomPreset
            {
                name = Text.Get(nameKey, name, index + 1), orientation = orientation,
                columns = side.columns, rows = side.rows, speaker = speaker, mic = mic,
                items = Copy(page.items ?? new List<DeckItem>()),
            });
        }
    }

    static FaderV3 Effective(FaderV3 shared, PageFadersV3 page, bool mic)
    {
        if (page == null) return shared.off ? null : Copy(shared);
        if (mic ? page.micHidden : page.speakerHidden) return null;
        ControlPlacement own = mic ? page.mic : page.speaker;
        if (own == null) return shared.off ? null : Copy(shared);
        return new FaderV3
        {
            row = own.row, column = own.column, width = own.width, height = own.height,
            backgroundOpacity = own.backgroundOpacity, hideValue = own.hideValue, iconColor = own.iconColor,
        };
    }

    static void Count(string type, string path, PresetSafety result)
    {
        if (String.Equals(type, "app", StringComparison.OrdinalIgnoreCase))
        {
            result.apps++;
            if (!String.IsNullOrWhiteSpace(path)) result.paths.Add(path);
        }
        else if (String.Equals(type, "url", StringComparison.OrdinalIgnoreCase)) result.urls++;
        else if (String.Equals(type, "clipboard", StringComparison.OrdinalIgnoreCase)) result.texts++;
    }

    static CustomPreset ToPreset(PresetTransfer source)
    {
        if (source == null) throw new Exception(Text.Get("source.presetfiles.invalid"));
        return new CustomPreset
        {
            id = Guid.NewGuid().ToString("N"), name = source.name, orientation = source.orientation,
            columns = source.columns, rows = source.rows, speaker = source.speaker, mic = source.mic,
            items = source.items,
        };
    }

    static void Validate(CustomPreset preset, DeckController controller)
    {
        string name = (preset.name ?? "").Trim();
        if (name.Length < 1 || name.Length > 40 || name != preset.name
            || (preset.orientation != "landscape" && preset.orientation != "portrait")
            || preset.columns < 2 || preset.columns > 8 || preset.rows < 2 || preset.rows > 8
            || preset.items == null || preset.items.Count > 40)
            throw new Exception(Text.Get("source.presetfiles.invalid"));
        bool[,] used = new bool[preset.rows, preset.columns];
        Mark(used, preset.speaker, preset.columns, preset.rows);
        Mark(used, preset.mic, preset.columns, preset.rows);
        foreach (DeckItem item in preset.items)
        {
            if (item == null) throw new Exception(Text.Get("source.presetfiles.invalid"));
            AppEntry entry = SettingsMigration.ToApp(item, preset.orientation == "portrait", 0);
            controller.ValidateEntry(entry);
            if (item.row < 0 || item.column < 0 || item.row + item.height > preset.rows
                || item.column + item.width > preset.columns)
                throw new Exception(Text.Get("source.presetfiles.invalid"));
            for (int row = item.row; row < item.row + item.height; row++)
                for (int column = item.column; column < item.column + item.width; column++)
                {
                    if (used[row, column]) throw new Exception(Text.Get("source.presetfiles.invalid"));
                    used[row, column] = true;
                }
        }
    }

    static void Mark(bool[,] used, FaderV3 value, int columns, int rows)
    {
        if (value == null) return;
        var placement = new ControlPlacement
        {
            row = value.row, column = value.column, width = value.width, height = value.height,
            backgroundOpacity = value.backgroundOpacity, hideValue = value.hideValue, iconColor = value.iconColor,
        };
        if (!DeckLayout.ControlFits(placement, columns, rows)
            || (value.backgroundOpacity.HasValue && (value.backgroundOpacity.Value < 0 || value.backgroundOpacity.Value > 100))
            || (!String.IsNullOrEmpty(value.iconColor) && !IconPresets.ValidColor(value.iconColor)))
            throw new Exception(Text.Get("source.presetfiles.invalid"));
        for (int row = value.row; row < value.row + value.height; row++)
            for (int column = value.column; column < value.column + value.width; column++)
            {
                if (used[row, column]) throw new Exception(Text.Get("source.presetfiles.invalid"));
                used[row, column] = true;
            }
    }

    static List<object> FileItems(List<DeckItem> items)
    {
        var result = new List<object>();
        foreach (DeckItem item in items ?? new List<DeckItem>())
        {
            var value = Json.Deserialize<Dictionary<string, object>>(Json.Serialize(item));
            foreach (string key in new[] { "id", "customIcon", "iconPack", "iconPackItem", "deviceId", "deviceTarget", "deviceName" })
                value.Remove(key);
            result.Add(value);
        }
        return result;
    }

    static void Clean(List<DeckItem> items)
    {
        foreach (DeckItem item in items ?? new List<DeckItem>())
        {
            item.id = null;
            item.customIcon = null;
            item.iconPack = null;
            item.iconPackItem = null;
            item.deviceId = null;
            item.deviceTarget = null;
            item.deviceName = null;
            foreach (ActionStep step in item.steps ?? new List<ActionStep>())
            {
                step.deviceId = null;
                step.deviceTarget = null;
            }
        }
    }

    static T Copy<T>(T value) { return Json.Deserialize<T>(Json.Serialize(value)); }
}
