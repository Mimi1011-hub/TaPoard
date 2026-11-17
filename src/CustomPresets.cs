using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

sealed class CustomPresetFile
{
    public int version { get; set; }
    public List<CustomPreset> presets { get; set; }
}

sealed class CustomPreset
{
    public string id { get; set; }
    public string name { get; set; }
    public string orientation { get; set; }
    public int columns { get; set; }
    public int rows { get; set; }
    public FaderV3 speaker { get; set; }
    public FaderV3 mic { get; set; }
    public List<DeckItem> items { get; set; }
}

sealed class CustomPresets
{
    internal const int Max = 30;
    readonly string path;
    readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };

    internal CustomPresets(string data) { path = Path.Combine(data, "presets.json"); }

    internal List<CustomPreset> Read()
    {
        try
        {
            if (!File.Exists(path)) return new List<CustomPreset>();
            var file = json.Deserialize<CustomPresetFile>(File.ReadAllText(path, Encoding.UTF8));
            if (file == null || file.version != 1 || file.presets == null || file.presets.Count > Max) return new List<CustomPreset>();
            foreach (var preset in file.presets) ValidateStored(preset);
            return file.presets;
        }
        catch { return new List<CustomPreset>(); }
    }

    internal CustomPreset Save(Settings settings, string name, string orientation, int page)
    {
        name = Name(name);
        bool portrait = orientation == "portrait";
        if (!portrait && orientation != "landscape") throw new Exception(Text.Get("source.pagecontroller.1"));
        OrientationV3 side = portrait ? SettingsMigration.ToV3(settings).deck.portrait : SettingsMigration.ToV3(settings).deck.landscape;
        if (page < 0 || page >= side.pages.Count) throw new Exception(Text.Get("source.deckpresets.200"));
        var values = Read();
        if (values.Count >= Max) throw new Exception(Text.Get("source.custompresets.limit"));
        PageV3 source = side.pages[page];
        var preset = new CustomPreset
        {
            id = Guid.NewGuid().ToString("N"), name = name, orientation = orientation, columns = side.columns, rows = side.rows,
            speaker = Effective(side.faders.speaker, source.faders, false), mic = Effective(side.faders.mic, source.faders, true),
            items = Copy(source.items ?? new List<DeckItem>()),
        };
        values.Add(preset);
        Write(values);
        return preset;
    }

    internal void Rename(string id, string name)
    {
        var values = Read();
        Find(values, id).name = Name(name);
        Write(values);
    }

    internal void Delete(string id)
    {
        var values = Read();
        values.Remove(Find(values, id));
        Write(values);
    }

    internal byte[] Export(List<string> ids)
    {
        var values = Read();
        var selected = new List<CustomPreset>();
        foreach (string id in ids) selected.Add(Find(values, id));
        return PresetFiles.Export(selected);
    }

    internal List<CustomPreset> Import(List<CustomPreset> source, List<int> selected)
    {
        var values = Read();
        var added = new List<CustomPreset>();
        var seen = new HashSet<int>();
        foreach (int index in selected)
        {
            if (!seen.Add(index) || index < 0 || index >= source.Count || values.Count >= Max)
                throw new Exception(Text.Get("source.presetfiles.selection"));
            CustomPreset preset = Copy(source[index]);
            preset.id = Guid.NewGuid().ToString("N");
            preset.name = UniqueName(values, preset.name);
            values.Add(preset);
            added.Add(preset);
        }
        Write(values);
        return added;
    }

    internal object Public(CustomPreset preset)
    {
        object layout = new { columns = preset.columns, rows = preset.rows, speaker = preset.speaker, mic = preset.mic, items = preset.items };
        return new
        {
            id = preset.id, name = preset.name, note = "", setup = "", custom = true, orientation = preset.orientation,
            landscape = preset.orientation == "landscape" ? layout : null,
            portrait = preset.orientation == "portrait" ? layout : null,
        };
    }

    internal int Apply(Settings settings, string id, string orientation, int page, Func<string> newId)
    {
        CustomPreset preset = Find(Read(), id);
        if (preset.orientation != orientation) throw new Exception(Text.Get("source.custompresets.orientation"));
        bool portrait = orientation == "portrait";
        if (page < 0 || page >= DeckLayout.Pages(settings, orientation)) throw new Exception(Text.Get("source.deckpresets.200"));
        Func<AppEntry, bool> onPage = entry => entry.orientation == orientation && DeckLayout.Position(entry, portrait) != null
            && DeckLayout.Position(entry, portrait).page == page;
        settings.apps.RemoveAll(entry => onPage(entry));
        DeckLayout.ControlPages(settings, portrait).RemoveAll(entry => entry == null || entry.page == page);
        if (settings.apps.FindAll(entry => entry.orientation == orientation).Count + preset.items.Count > 40)
            throw new Exception(Text.Get("source.deckpresets.201"));
        Resize(settings, preset, orientation, page, portrait, onPage);
        var controls = new ControlLayout
        {
            speakerSlot = -1, micSlot = -1,
            speakerRow = preset.speaker == null ? 0 : preset.speaker.row,
            speakerColumn = preset.speaker == null ? 0 : preset.speaker.column,
            speakerWidth = preset.speaker == null ? 1 : preset.speaker.width,
            speakerHeight = preset.speaker == null ? 1 : preset.speaker.height,
            micRow = preset.mic == null ? 0 : preset.mic.row,
            micColumn = preset.mic == null ? 0 : preset.mic.column,
            micWidth = preset.mic == null ? 1 : preset.mic.width,
            micHeight = preset.mic == null ? 1 : preset.mic.height,
        };
        DeckLayout.SetPageControls(settings, portrait, page, controls, preset.speaker == null, preset.mic == null);
        foreach (DeckItem item in Copy(preset.items))
        {
            item.id = newId();
            settings.apps.Add(SettingsMigration.ToApp(item, portrait, page));
        }
        PageNames.Resize(settings);
        return preset.items.Count;
    }

    void Resize(Settings settings, CustomPreset preset, string orientation, int page, bool portrait, Func<AppEntry, bool> onPage)
    {
        int oldColumns = DeckLayout.Columns(settings, portrait), oldRows = DeckLayout.Rows(settings, portrait);
        if (oldColumns == preset.columns && oldRows == preset.rows) return;
        if (portrait) { settings.portraitColumns = preset.columns; settings.portraitRows = preset.rows; }
        else
        {
            settings.landscapeColumns = preset.columns; settings.landscapeRows = preset.rows;
            settings.columns = preset.columns; settings.rows = preset.rows;
        }
        DeckLayout.SetPageControls(settings, portrait, page, new ControlLayout(), true, true);
        DeckLayout.Reflow(settings, orientation, oldColumns);
        DeckLayout.ControlPages(settings, portrait).RemoveAll(entry => entry == null || entry.page == page);
        var moved = settings.apps.FindAll(entry => onPage(entry));
        if (moved.Count == 0) return;
        foreach (var entry in moved) { if (portrait) entry.portrait = null; else entry.landscape = null; }
        DeckLayout.PlaceFrom(settings, orientation, moved, Math.Max(page + 1, DeckLayout.RequiredPages(settings, orientation)));
    }

    FaderV3 Effective(FaderV3 shared, PageFadersV3 page, bool mic)
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

    string Name(string name)
    {
        name = (name ?? "").Trim();
        if (name.Length < 1 || name.Length > 40) throw new Exception(Text.Get("source.custompresets.name"));
        return name;
    }

    string UniqueName(List<CustomPreset> values, string name)
    {
        if (!values.Exists(value => String.Equals(value.name, name, StringComparison.OrdinalIgnoreCase))) return name;
        for (int number = 2; number < 1000; number++)
        {
            string suffix = " (" + number + ")";
            string baseName = name.Substring(0, Math.Min(name.Length, 40 - suffix.Length)).TrimEnd();
            string candidate = baseName + suffix;
            if (!values.Exists(value => String.Equals(value.name, candidate, StringComparison.OrdinalIgnoreCase))) return candidate;
        }
        throw new Exception(Text.Get("source.presetfiles.selection"));
    }

    void ValidateStored(CustomPreset preset)
    {
        if (preset == null || !Regex.IsMatch(preset.id ?? "", "^[0-9a-f]{32}$") || Name(preset.name) != preset.name
            || (preset.orientation != "landscape" && preset.orientation != "portrait") || preset.columns < 2 || preset.columns > 8
            || preset.rows < 2 || preset.rows > 8 || preset.items == null || preset.items.Count > 40) throw new Exception();
    }

    CustomPreset Find(List<CustomPreset> values, string id)
    {
        CustomPreset preset = values.Find(value => value.id == id);
        if (preset == null) throw new Exception(Text.Get("source.deckpresets.198"));
        return preset;
    }

    T Copy<T>(T value) { return json.Deserialize<T>(json.Serialize(value)); }

    void Write(List<CustomPreset> values)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path));
        string temp = path + ".tmp";
        File.WriteAllText(temp, json.Serialize(new CustomPresetFile { version = 1, presets = values }), new UTF8Encoding(false));
        if (File.Exists(path)) File.Delete(path);
        File.Move(temp, path);
    }
}
