using System;
using System.Collections.Generic;

// 3.1 purpose presets: a ready-made page for each orientation, with its own grid size, faders and
// widgets. Applying one overwrites the page being shown. "key-custom" buttons send the key in their
// note; the user registers the same key in the app they use.
class PresetItem
{
    internal string name, type, action, icon, hotkey;
    internal int row, column, width = 1, height = 1;
    internal Dictionary<string, object> options;
}

class PresetLayout
{
    internal int columns, rows;
    internal ControlPlacement speaker, mic;
    internal PresetItem[] items;
}

class DeckPreset
{
    internal string id, name, note, setup;
    internal PresetLayout landscape, portrait;
}

static class DeckPresets
{
    static PresetItem B(string name, string action, string icon, int row, int column, string hotkey = null)
    {
        return new PresetItem { name = name, type = "hotkey", action = action, icon = icon, hotkey = hotkey, row = row, column = column };
    }

    static PresetItem Clock(string style, int row, int column)
    {
        bool analog = style == "analog", wide = style == "wide";
        return new PresetItem
        {
            name = analog ? Text.Get("source.deckpresets.1") : Text.Get("source.deckpresets.2"), type = "clock", row = row, column = column, width = 2,
                height = wide ? 1 : 2,
            options = new Dictionary<string,
                object> { { "style", analog ? "analog" : "digital" }, { "showSeconds", !wide }, { "showDate", true }, { "showWeekday", true }, { "hour12", false
                } },
        };
    }

    static PresetItem Weather(bool days, int row, int column)
    {
        return new PresetItem
        {
            name = days ? Text.Get("source.deckpresets.3") : Text.Get("source.deckpresets.4"), type = "weather", row = row, column = column, width = days ? 2
                : 1, height = days ? 2 : 1,
            options = new Dictionary<string, object> { { "forecastMode", days ? "days" : "hours" } },
        };
    }

    static PresetItem Metric(string primary, int row, int column)
    {
        bool overview = primary == "overview";
        string name = overview ? Text.Get("source.deckpresets.5") : primary == "memory" ? Text.Get("source.deckpresets.6") : primary == "gpu"
            ? Text.Get("source.deckpresets.7") : Text.Get("source.deckpresets.8");
        return new PresetItem
        {
            name = name, type = "metrics", row = row, column = column, width = overview ? 2 : 1, height = overview ? 2 : 1,
            options = new Dictionary<string, object> { { "primary", overview ? "cpu" : primary }, { "cycle", false }, { "gpuId", "" }, { "gpuName", "" } },
        };
    }

    static ControlPlacement F(int row, int column, int width, int height)
    {
        return new ControlPlacement { row = row, column = column, width = width, height = height };
    }

    static PresetLayout L(int columns, int rows, ControlPlacement speaker, ControlPlacement mic, params PresetItem[] items)
    {
        return new PresetLayout { columns = columns, rows = rows, speaker = speaker, mic = mic, items = items };
    }

    static readonly object Gate = new object();
    static string builtLanguage;
    static DeckPreset[] all;
    static Dictionary<string, string[]> help;

    // The tables hold display text, so they are rebuilt when the language changes.
    static void Build()
    {
        lock (Gate)
        {
            if (builtLanguage == Text.Language && all != null) return;
            all = BuildAll();
            help = BuildHelp();
            builtLanguage = Text.Language;
        }
    }

    internal static DeckPreset[] All
    {
        get
        {
            Build();
            return all;
        }
    }

    static Dictionary<string, string[]> Help
    {
        get
        {
            Build();
            return help;
        }
    }

    static DeckPreset[] BuildAll()
    {
        return new DeckPreset[]
        {
            new DeckPreset
            {
                id = "streamer", name = Text.Get("source.deckpresets.9"), note = Text.Get("source.deckpresets.10"),
                setup = Text.Get("source.deckpresets.11"),
                landscape = L(6, 3, F(1, 0, 3, 1), F(2, 0, 3, 1),
                    B(Text.Get("source.deckpresets.12"), "key-custom", "video", 0, 0, "Ctrl+Shift+F1"),
                    B(Text.Get("source.deckpresets.13"), "key-custom", "camera", 0, 1, "Ctrl+Shift+F2"),
                    B(Text.Get("source.deckpresets.14"), "key-custom", "monitor", 0, 2, "Ctrl+Shift+F3"),
                    B(Text.Get("source.deckpresets.15"), "key-custom", "timer", 0, 3, "Ctrl+Shift+F4"),
                    B(Text.Get("source.deckpresets.16"), "key-custom", "radio", 0, 4, "Ctrl+Shift+F5"),
                    B(Text.Get("source.deckpresets.17"), "key-custom", "record", 0, 5, "Ctrl+Shift+F6"),
                    B(Text.Get("source.deckpresets.18"), "audio-mic-mute", "microphone", 1, 3),
                    B(Text.Get("source.deckpresets.19"), "discord-mute", "headset", 1, 4),
                    B(Text.Get("source.deckpresets.20"), "windows-screenshot", "screenshot", 1, 5),
                    Clock("wide", 2, 3),
                    B(Text.Get("source.deckpresets.21"), "audio-speaker-mute", "mute", 2, 5)),
                portrait = L(3, 6, F(2, 0, 3, 1), F(3, 0, 3, 1),
                    B(Text.Get("source.deckpresets.22"), "key-custom", "video", 0, 0, "Ctrl+Shift+F1"),
                    B(Text.Get("source.deckpresets.23"), "key-custom", "camera", 0, 1, "Ctrl+Shift+F2"),
                    B(Text.Get("source.deckpresets.24"), "key-custom", "monitor", 0, 2, "Ctrl+Shift+F3"),
                    B(Text.Get("source.deckpresets.25"), "key-custom", "timer", 1, 0, "Ctrl+Shift+F4"),
                    B(Text.Get("source.deckpresets.26"), "key-custom", "radio", 1, 1, "Ctrl+Shift+F5"),
                    B(Text.Get("source.deckpresets.27"), "key-custom", "record", 1, 2, "Ctrl+Shift+F6"),
                    B(Text.Get("source.deckpresets.28"), "audio-mic-mute", "microphone", 4, 0),
                    B(Text.Get("source.deckpresets.29"), "audio-speaker-mute", "mute", 4, 1),
                    B(Text.Get("source.deckpresets.30"), "discord-mute", "headset", 4, 2),
                    B(Text.Get("source.deckpresets.31"), "windows-screenshot", "screenshot", 5, 0),
                    Clock("wide", 5, 1)),
            },
            new DeckPreset
            {
                id = "game", name = Text.Get("source.deckpresets.32"), note = Text.Get("source.deckpresets.33"),
                setup = Text.Get("source.deckpresets.34"),
                landscape = L(6, 3, F(1, 0, 3, 1), F(2, 0, 3, 1),
                    B(Text.Get("source.deckpresets.35"), "discord-mute", "microphone", 0, 0),
                    B(Text.Get("source.deckpresets.36"), "discord-deafen", "headphones", 0, 1),
                    B(Text.Get("source.deckpresets.37"), "discord-soundboard-overlay", "music", 0, 2),
                    B("Game Bar", "key-custom", "gamepad", 0, 3, "Win+G"),
                    B(Text.Get("source.deckpresets.38"), "key-custom", "record", 0, 4, "Win+Alt+R"),
                    B(Text.Get("source.deckpresets.39"), "key-custom", "video", 0, 5, "Win+Alt+G"),
                    Metric("cpu", 1, 3),
                    Metric("gpu", 1, 4),
                    B(Text.Get("source.deckpresets.40"), "windows-printscreen", "screenshot", 1, 5),
                    B(Text.Get("source.deckpresets.41"), "windows-alttab", "grid", 2, 3),
                    Clock("wide", 2, 4)),
                portrait = L(3, 6, F(2, 0, 3, 1), F(3, 0, 3, 1),
                    B(Text.Get("source.deckpresets.42"), "discord-mute", "microphone", 0, 0),
                    B(Text.Get("source.deckpresets.43"), "discord-deafen", "headphones", 0, 1),
                    B(Text.Get("source.deckpresets.44"), "discord-soundboard-overlay", "music", 0, 2),
                    B("Game Bar", "key-custom", "gamepad", 1, 0, "Win+G"),
                    B(Text.Get("source.deckpresets.45"), "key-custom", "record", 1, 1, "Win+Alt+R"),
                    B(Text.Get("source.deckpresets.46"), "key-custom", "video", 1, 2, "Win+Alt+G"),
                    Metric("cpu", 4, 0),
                    Metric("gpu", 4, 1),
                    B(Text.Get("source.deckpresets.47"), "windows-printscreen", "screenshot", 4, 2),
                    B(Text.Get("source.deckpresets.48"), "windows-alttab", "grid", 5, 0),
                    Clock("wide", 5, 1)),
            },
            new DeckPreset
            {
                id = "work", name = Text.Get("source.deckpresets.49"), note = Text.Get("source.deckpresets.50"),
                setup = Text.Get("source.deckpresets.51"),
                landscape = L(6, 3, F(2, 0, 3, 1), F(2, 3, 3, 1),
                    Clock("digital", 0, 0),
                    B(Text.Get("source.deckpresets.52"), "audio-mic-mute", "microphone", 0, 2),
                    B(Text.Get("source.deckpresets.53"), "audio-speaker-mute", "mute", 0, 3),
                    Weather(false, 0, 4),
                    B(Text.Get("source.deckpresets.54"), "windows-lock", "lock", 0, 5),
                    B(Text.Get("source.deckpresets.55"), "windows-desktop", "desktop", 1, 2),
                    B(Text.Get("source.deckpresets.56"), "windows-snapleft", "arrow-left", 1, 3),
                    B(Text.Get("source.deckpresets.57"), "windows-snapright", "arrow-right", 1, 4),
                    B(Text.Get("source.deckpresets.58"), "windows-screenshot", "screenshot", 1, 5)),
                portrait = L(3, 6, F(2, 0, 3, 1), F(3, 0, 3, 1),
                    Clock("digital", 0, 0),
                    B(Text.Get("source.deckpresets.59"), "audio-mic-mute", "microphone", 0, 2),
                    B(Text.Get("source.deckpresets.60"), "audio-speaker-mute", "mute", 1, 2),
                    Weather(false, 4, 0),
                    B(Text.Get("source.deckpresets.61"), "windows-lock", "lock", 4, 1),
                    B(Text.Get("source.deckpresets.62"), "windows-desktop", "desktop", 4, 2),
                    B(Text.Get("source.deckpresets.63"), "windows-snapleft", "arrow-left", 5, 0),
                    B(Text.Get("source.deckpresets.64"), "windows-snapright", "arrow-right", 5, 1),
                    B(Text.Get("source.deckpresets.65"), "windows-screenshot", "screenshot", 5, 2)),
            },
            new DeckPreset
            {
                id = "editing", name = Text.Get("source.deckpresets.66"), note = Text.Get("source.deckpresets.67"),
                setup = Text.Get("source.deckpresets.68"),
                landscape = L(6, 3, F(2, 0, 3, 1), null,
                    B(Text.Get("source.deckpresets.69"), "key-custom", "back", 0, 0, "J"),
                    B(Text.Get("source.deckpresets.70"), "key-custom", "pause", 0, 1, "K"),
                    B(Text.Get("source.deckpresets.71"), "key-custom", "forward", 0, 2, "L"),
                    B(Text.Get("source.deckpresets.72"), "key-custom", "play", 0, 3, "Space"),
                    B(Text.Get("source.deckpresets.73"), "key-custom", "arrow-left", 0, 4, "I"),
                    B(Text.Get("source.deckpresets.74"), "key-custom", "arrow-right", 0, 5, "O"),
                    B(Text.Get("source.deckpresets.75"), "common-undo", "back", 1, 0),
                    B(Text.Get("source.deckpresets.76"), "common-redo", "forward", 1, 1),
                    B(Text.Get("source.deckpresets.77"), "common-save", "save", 1, 2),
                    B(Text.Get("source.deckpresets.78"), "common-copy", "copy", 1, 3),
                    B(Text.Get("source.deckpresets.79"), "common-paste", "paste", 1, 4),
                    B(Text.Get("source.deckpresets.80"), "windows-screenshot", "screenshot", 1, 5),
                    B(Text.Get("source.deckpresets.81"), "common-cut", "eraser", 2, 3),
                    B(Text.Get("source.deckpresets.82"), "common-selectall", "grid", 2, 4),
                    Metric("cpu", 2, 5)),
                portrait = L(3, 6, F(4, 0, 3, 1), null,
                    B(Text.Get("source.deckpresets.83"), "key-custom", "back", 0, 0, "J"),
                    B(Text.Get("source.deckpresets.84"), "key-custom", "pause", 0, 1, "K"),
                    B(Text.Get("source.deckpresets.85"), "key-custom", "forward", 0, 2, "L"),
                    B(Text.Get("source.deckpresets.86"), "key-custom", "play", 1, 0, "Space"),
                    B(Text.Get("source.deckpresets.87"), "key-custom", "arrow-left", 1, 1, "I"),
                    B(Text.Get("source.deckpresets.88"), "key-custom", "arrow-right", 1, 2, "O"),
                    B(Text.Get("source.deckpresets.89"), "common-undo", "back", 2, 0),
                    B(Text.Get("source.deckpresets.90"), "common-redo", "forward", 2, 1),
                    B(Text.Get("source.deckpresets.91"), "common-save", "save", 2, 2),
                    B(Text.Get("source.deckpresets.92"), "common-copy", "copy", 3, 0),
                    B(Text.Get("source.deckpresets.93"), "common-paste", "paste", 3, 1),
                    B(Text.Get("source.deckpresets.94"), "common-cut", "eraser", 3, 2),
                    B(Text.Get("source.deckpresets.95"), "common-selectall", "grid", 5, 0),
                    B(Text.Get("source.deckpresets.96"), "windows-screenshot", "screenshot", 5, 1),
                    Metric("cpu", 5, 2)),
            },
            new DeckPreset
            {
                id = "media", name = Text.Get("source.deckpresets.97"), note = Text.Get("source.deckpresets.98"),
                setup = Text.Get("source.deckpresets.99"),
                landscape = L(5, 3, F(2, 0, 4, 1), null,
                    B(Text.Get("source.deckpresets.100"), "media-previous", "previous", 0, 0),
                    B(Text.Get("source.deckpresets.101"), "media-playpause", "play", 0, 1),
                    B(Text.Get("source.deckpresets.102"), "media-next", "next", 0, 2),
                    Clock("analog", 0, 3),
                    B(Text.Get("source.deckpresets.103"), "media-stop", "stop", 1, 0),
                    B(Text.Get("source.deckpresets.104"), "audio-speaker-mute", "mute", 1, 1),
                    B(Text.Get("source.deckpresets.105"), "browser-fullscreen", "fullscreen", 1, 2),
                    Weather(false, 2, 4)),
                portrait = L(3, 5, F(3, 0, 3, 1), null,
                    Clock("analog", 0, 0),
                    Weather(false, 0, 2),
                    B(Text.Get("source.deckpresets.106"), "browser-fullscreen", "fullscreen", 1, 2),
                    B(Text.Get("source.deckpresets.107"), "media-previous", "previous", 2, 0),
                    B(Text.Get("source.deckpresets.108"), "media-playpause", "play", 2, 1),
                    B(Text.Get("source.deckpresets.109"), "media-next", "next", 2, 2),
                    B(Text.Get("source.deckpresets.110"), "media-stop", "stop", 4, 0),
                    B(Text.Get("source.deckpresets.111"), "audio-speaker-mute", "mute", 4, 1),
                    B(Text.Get("source.deckpresets.112"), "windows-alttab", "grid", 4, 2)),
            },
            new DeckPreset
            {
                id = "programming", name = Text.Get("source.deckpresets.113"), note = Text.Get("source.deckpresets.114"),
                setup = Text.Get("source.deckpresets.115"),
                landscape = L(6, 3, F(2, 0, 3, 1), null,
                    B(Text.Get("source.deckpresets.116"), "common-save", "save", 0, 0),
                    B(Text.Get("source.deckpresets.117"), "common-find", "search", 0, 1),
                    B(Text.Get("source.deckpresets.118"), "key-custom", "menu", 0, 2, "Ctrl+Shift+P"),
                    B(Text.Get("source.deckpresets.119"), "key-custom", "play", 0, 3, "F5"),
                    B(Text.Get("source.deckpresets.120"), "key-custom", "stop", 0, 4, "Shift+F5"),
                    B(Text.Get("source.deckpresets.121"), "key-custom", "target", 0, 5, "F12"),
                    B(Text.Get("source.deckpresets.122"), "key-custom", "keyboard", 1, 0, "Ctrl+Backquote"),
                    B(Text.Get("source.deckpresets.123"), "key-custom", "pen", 1, 1, "Ctrl+Slash"),
                    B(Text.Get("source.deckpresets.124"), "common-undo", "back", 1, 2),
                    B(Text.Get("source.deckpresets.125"), "common-redo", "forward", 1, 3),
                    B(Text.Get("source.deckpresets.126"), "common-copy", "copy", 1, 4),
                    B(Text.Get("source.deckpresets.127"), "common-paste", "paste", 1, 5),
                    Metric("cpu", 2, 3),
                    Clock("wide", 2, 4)),
                portrait = L(3, 6, F(4, 0, 3, 1), null,
                    B(Text.Get("source.deckpresets.128"), "common-save", "save", 0, 0),
                    B(Text.Get("source.deckpresets.129"), "common-find", "search", 0, 1),
                    B(Text.Get("source.deckpresets.130"), "key-custom", "menu", 0, 2, "Ctrl+Shift+P"),
                    B(Text.Get("source.deckpresets.131"), "key-custom", "play", 1, 0, "F5"),
                    B(Text.Get("source.deckpresets.132"), "key-custom", "stop", 1, 1, "Shift+F5"),
                    B(Text.Get("source.deckpresets.133"), "key-custom", "target", 1, 2, "F12"),
                    B(Text.Get("source.deckpresets.134"), "key-custom", "keyboard", 2, 0, "Ctrl+Backquote"),
                    B(Text.Get("source.deckpresets.135"), "key-custom", "pen", 2, 1, "Ctrl+Slash"),
                    B(Text.Get("source.deckpresets.136"), "common-undo", "back", 2, 2),
                    B(Text.Get("source.deckpresets.137"), "common-redo", "forward", 3, 0),
                    B(Text.Get("source.deckpresets.138"), "common-copy", "copy", 3, 1),
                    B(Text.Get("source.deckpresets.139"), "common-paste", "paste", 3, 2),
                    Metric("cpu", 5, 0),
                    Clock("wide", 5, 1)),
            },
    
        };
    }

    // What each preset button does and which key it sends, for the preset screen's explanation list.
    static Dictionary<string, string[]> BuildHelp()
    {
        return new Dictionary<string, string[]>
        {
            { "audio-mic-mute", new[] { Text.Get("source.deckpresets.140"), Text.Get("source.deckpresets.141") } },
            { "audio-speaker-mute", new[] { Text.Get("source.deckpresets.142"), Text.Get("source.deckpresets.143") } },
            { "discord-mute", new[] { Text.Get("source.deckpresets.144"), "Ctrl + Shift + M" } },
            { "discord-deafen", new[] { Text.Get("source.deckpresets.145"), "Ctrl + Shift + D" } },
            { "discord-soundboard-overlay", new[] { Text.Get("source.deckpresets.146"), Text.Get("source.deckpresets.147") } },
            { "windows-screenshot", new[] { Text.Get("source.deckpresets.148"), "Win + Shift + S" } },
            { "windows-printscreen", new[] { Text.Get("source.deckpresets.149"), "PrintScreen" } },
            { "windows-alttab", new[] { Text.Get("source.deckpresets.150"), "Alt + Tab" } },
            { "windows-lock", new[] { Text.Get("source.deckpresets.151"), "Win + L" } },
            { "windows-desktop", new[] { Text.Get("source.deckpresets.152"), "Win + D" } },
            { "windows-snapleft", new[] { Text.Get("source.deckpresets.153"), "Win + ←" } },
            { "windows-snapright", new[] { Text.Get("source.deckpresets.154"), "Win + →" } },
            { "media-playpause", new[] { Text.Get("source.deckpresets.155"), Text.Get("source.deckpresets.156") } },
            { "media-previous", new[] { Text.Get("source.deckpresets.157"), Text.Get("source.deckpresets.158") } },
            { "media-next", new[] { Text.Get("source.deckpresets.159"), Text.Get("source.deckpresets.160") } },
            { "media-stop", new[] { Text.Get("source.deckpresets.161"), Text.Get("source.deckpresets.162") } },
            { "browser-fullscreen", new[] { Text.Get("source.deckpresets.163"), "F11" } },
            { "common-undo", new[] { Text.Get("source.deckpresets.164"), "Ctrl + Z" } },
            { "common-redo", new[] { Text.Get("source.deckpresets.165"), "Ctrl + Y" } },
            { "common-save", new[] { Text.Get("source.deckpresets.166"), "Ctrl + S" } },
            { "common-copy", new[] { Text.Get("source.deckpresets.167"), "Ctrl + C" } },
            { "common-paste", new[] { Text.Get("source.deckpresets.168"), "Ctrl + V" } },
            { "common-cut", new[] { Text.Get("source.deckpresets.169"), "Ctrl + X" } },
            { "common-selectall", new[] { Text.Get("source.deckpresets.170"), "Ctrl + A" } },
            { "common-find", new[] { Text.Get("source.deckpresets.171"), "Ctrl + F" } },
            { "key:Ctrl+Shift+F1", new[] { Text.Get("source.deckpresets.172"), "Ctrl + Shift + F1" } },
            { "key:Ctrl+Shift+F2", new[] { Text.Get("source.deckpresets.173"), "Ctrl + Shift + F2" } },
            { "key:Ctrl+Shift+F3", new[] { Text.Get("source.deckpresets.174"), "Ctrl + Shift + F3" } },
            { "key:Ctrl+Shift+F4", new[] { Text.Get("source.deckpresets.175"), "Ctrl + Shift + F4" } },
            { "key:Ctrl+Shift+F5", new[] { Text.Get("source.deckpresets.176"), "Ctrl + Shift + F5" } },
            { "key:Ctrl+Shift+F6", new[] { Text.Get("source.deckpresets.177"), "Ctrl + Shift + F6" } },
            { "key:Win+G", new[] { Text.Get("source.deckpresets.178"), "Win + G" } },
            { "key:Win+Alt+R", new[] { Text.Get("source.deckpresets.179"), "Win + Alt + R" } },
            { "key:Win+Alt+G", new[] { Text.Get("source.deckpresets.180"), "Win + Alt + G" } },
            { "key:J", new[] { Text.Get("source.deckpresets.181"), "J" } },
            { "key:K", new[] { Text.Get("source.deckpresets.182"), "K" } },
            { "key:L", new[] { Text.Get("source.deckpresets.183"), "L" } },
            { "key:Space", new[] { Text.Get("source.deckpresets.184"), "Space" } },
            { "key:I", new[] { Text.Get("source.deckpresets.185"), "I" } },
            { "key:O", new[] { Text.Get("source.deckpresets.186"), "O" } },
            { "key:Ctrl+Shift+P", new[] { Text.Get("source.deckpresets.187"), "Ctrl + Shift + P" } },
            { "key:F5", new[] { Text.Get("source.deckpresets.188"), "F5" } },
            { "key:Shift+F5", new[] { Text.Get("source.deckpresets.189"), "Shift + F5" } },
            { "key:F12", new[] { Text.Get("source.deckpresets.190"), "F12" } },
            { "key:Ctrl+Backquote", new[] { Text.Get("source.deckpresets.191"), "Ctrl + `" } },
            { "key:Ctrl+Slash", new[] { Text.Get("source.deckpresets.192"), "Ctrl + /" } },
    
        };
    }

    static string[] Describe(PresetItem i)
    {
        switch (i.type)
        {
            case "clock": return new[] { Text.Get("source.deckpresets.193"), "" };
            case "weather": return new[] { Text.Get("source.deckpresets.194"), "" };
            case "metrics":
                if (i.width == 2) return new[] { Text.Get("source.deckpresets.195"), "" };
                return new[] { Text.Get("source.deckpresets.197", i.name.Replace(Text.Get("source.deckpresets.196"), "").Trim()), "" };
        }
        string[] help;
        if (Help.TryGetValue(i.hotkey != null ? "key:" + i.hotkey : i.action, out help)) return help;
        return new[] { "", i.hotkey ?? "" };
    }

    static DeckPreset Find(string id)
    {
        foreach (var preset in All) if (preset.id == id) return preset;
        throw new Exception(Text.Get("source.deckpresets.198"));
    }

    static object PublicLayout(PresetLayout l)
    {
        var items = new List<object>();
        foreach (var i in l.items)
        {
            var help = Describe(i);
            items.Add(new { name = i.name, type = i.type, icon = i.icon ?? "", key = i.hotkey ?? "", description = help[0], sends = help[1], row = i.row,
                column = i.column, width = i.width, height = i.height });
        }
        return new { columns = l.columns, rows = l.rows, speaker = l.speaker, mic = l.mic, items = items };
    }

    internal static object Public()
    {
        var result = new List<object>();
        foreach (var preset in All)
            result.Add(new { id = preset.id, name = preset.name, note = preset.note, setup = preset.setup, landscape = PublicLayout(preset.landscape),
                portrait = PublicLayout(preset.portrait) });
        return result;
    }

    static string Category(string action)
    {
        int dash = action.IndexOf('-');
        string prefix = dash > 0 ? action.Substring(0, dash) : action;
        switch (prefix)
        {
            case "audio": return "audio";
            case "discord": return "discord";
            case "windows": return "windows";
            case "media": return "music";
            case "browser": return "browser";
            default: return "common";
        }
    }

    static AppEntry Entry(PresetItem i, string orientation, int page, Func<string> newId)
    {
        var position = new TilePosition { page = page, row = i.row, column = i.column };
        var entry = new AppEntry
        {
            id = newId(), name = i.name, type = i.type, orientation = orientation, size = i.width == i.height ? i.width : 1, width = i.width, height = i.height,
            fontSize = 11, iconScale = 82, labelOpacity = 45, path = "", args = "", url = "", text = "",
        };
        if (orientation == "portrait") entry.portrait = position; else entry.landscape = position;
        if (i.type == "hotkey")
        {
            if (!ShortcutKeys.Exists(i.action) || !IconPresets.Exists(i.icon)) throw new Exception(Text.Get("source.deckpresets.199"));
            if (i.hotkey != null) ShortcutKeys.ValidateOverride(i.action, i.hotkey);
            entry.action = i.action;
            entry.hotkey = i.hotkey;
            entry.category = Category(i.action);
            entry.iconKey = i.icon;
        }
        else
        {
            entry.category = "widget";
            entry.hideLabel = true;
            entry.options = new Dictionary<string, object>(i.options);
        }
        return entry;
    }

    // Overwrites one page of one orientation with the preset's layout for that orientation, and sets
    // the grid to the preset's size. Buttons on other pages that no longer fit move to a new last page.
    // Returns the number of buttons placed.
    internal static int Apply(Settings s, string id, string orientation, int page, Func<string> newId)
    {
        var preset = Find(id);
        bool portrait = orientation == "portrait";
        var layout = portrait ? preset.portrait : preset.landscape;
        if (page < 0 || page >= DeckLayout.Pages(s, orientation)) throw new Exception(Text.Get("source.deckpresets.200"));
        Func<AppEntry, bool> onPage = a => a.orientation == orientation && DeckLayout.Position(a, portrait) != null
            && DeckLayout.Position(a, portrait).page == page;
        s.apps.RemoveAll(a => onPage(a));
        DeckLayout.ControlPages(s, portrait).RemoveAll(e => e == null || e.page == page);
        if (s.apps.FindAll(a => a.orientation == orientation).Count + layout.items.Length > 40)
            throw new Exception(Text.Get("source.deckpresets.201"));

        int oldColumns = DeckLayout.Columns(s, portrait), oldRows = DeckLayout.Rows(s, portrait);
        if (oldColumns != layout.columns || oldRows != layout.rows)
        {
            if (portrait) { s.portraitColumns = layout.columns; s.portraitRows = layout.rows; }
            else { s.landscapeColumns = layout.columns; s.landscapeRows = layout.rows; s.columns = layout.columns; s.rows = layout.rows; }
            // Keep this page empty while the other pages are fitted into the new grid.
            var hold = new ControlPage { page = page, speaker = F(0, 0, 1, 1), mic = F(0, 1, 1, 1), speakerHidden = true, micHidden = true };
            DeckLayout.ControlPages(s, portrait).Add(hold);
            DeckLayout.Reflow(s, orientation, oldColumns);
            DeckLayout.ControlPages(s, portrait).RemoveAll(e => e == null || e.page == page);
            var moved = s.apps.FindAll(a => onPage(a));
            if (moved.Count > 0)
            {
                foreach (var a in moved) { if (portrait) a.portrait = null; else a.landscape = null; }
                DeckLayout.PlaceFrom(s, orientation, moved, Math.Max(page + 1, DeckLayout.RequiredPages(s, orientation)));
            }
        }

        var shared = DeckLayout.GetControls(s, portrait);
        var c = new ControlLayout
        {
            speakerSlot = -1, micSlot = -1,
            speakerRow = layout.speaker != null ? layout.speaker.row : shared.speakerRow,
            speakerColumn = layout.speaker != null ? layout.speaker.column : shared.speakerColumn,
            speakerWidth = layout.speaker != null ? layout.speaker.width : shared.speakerWidth,
            speakerHeight = layout.speaker != null ? layout.speaker.height : shared.speakerHeight,
            micRow = layout.mic != null ? layout.mic.row : shared.micRow,
            micColumn = layout.mic != null ? layout.mic.column : shared.micColumn,
            micWidth = layout.mic != null ? layout.mic.width : shared.micWidth,
            micHeight = layout.mic != null ? layout.mic.height : shared.micHeight,
        };
        // A hidden fader keeps a harmless spot that cannot overlap the one shown.
        if (layout.mic == null && layout.speaker != null) { c.micRow = layout.speaker.row; c.micColumn = layout.speaker.column; c.micWidth = 1; c.micHeight = 1;
            }
        if (layout.speaker == null && layout.mic != null) { c.speakerRow = layout.mic.row; c.speakerColumn = layout.mic.column; c.speakerWidth = 1;
            c.speakerHeight = 1; }
        DeckLayout.SetPageControls(s, portrait, page, c, layout.speaker == null, layout.mic == null);

        foreach (var item in layout.items) s.apps.Add(Entry(item, orientation, page, newId));
        int pages = DeckLayout.RequiredPages(s, orientation);
        if (portrait) s.portraitPageCount = Math.Max(s.portraitPageCount, pages);
        else { s.landscapePageCount = Math.Max(s.landscapePageCount, pages); s.pageCount = s.landscapePageCount; }
        PageNames.Resize(s);
        return layout.items.Length;
    }
}
