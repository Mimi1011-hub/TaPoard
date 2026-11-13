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
            name = analog ? "アナログ時計" : "デジタル時計", type = "clock", row = row, column = column, width = 2, height = wide ? 1 : 2,
            options = new Dictionary<string, object> { { "style", analog ? "analog" : "digital" }, { "showSeconds", !wide }, { "showDate", true }, { "showWeekday", true }, { "hour12", false } },
        };
    }

    static PresetItem Weather(bool days, int row, int column)
    {
        return new PresetItem
        {
            name = days ? "3日間の天気" : "現在の天気", type = "weather", row = row, column = column, width = days ? 2 : 1, height = days ? 2 : 1,
            options = new Dictionary<string, object> { { "forecastMode", days ? "days" : "hours" } },
        };
    }

    static PresetItem Metric(string primary, int row, int column)
    {
        bool overview = primary == "overview";
        string name = overview ? "PC情報" : primary == "memory" ? "メモリ使用率" : primary == "gpu" ? "GPU使用率" : "CPU使用率";
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

    internal static readonly DeckPreset[] All =
    {
        new DeckPreset
        {
            id = "streamer", name = "配信者", note = "シーン切り替え・配信／録画・音量とミュート・経過がわかる時計",
            setup = "シーン・配信・録画のボタンは Ctrl + Shift + F1〜F6 を送ります。OBS などの配信ソフトの「ホットキー」に同じキーを登録してください。",
            landscape = L(6, 3, F(1, 0, 3, 1), F(2, 0, 3, 1),
                B("シーン1", "key-custom", "video", 0, 0, "Ctrl+Shift+F1"),
                B("シーン2", "key-custom", "camera", 0, 1, "Ctrl+Shift+F2"),
                B("シーン3", "key-custom", "monitor", 0, 2, "Ctrl+Shift+F3"),
                B("休憩画面", "key-custom", "timer", 0, 3, "Ctrl+Shift+F4"),
                B("配信", "key-custom", "radio", 0, 4, "Ctrl+Shift+F5"),
                B("録画", "key-custom", "record", 0, 5, "Ctrl+Shift+F6"),
                B("マイク消音", "audio-mic-mute", "microphone", 1, 3),
                B("Discord", "discord-mute", "headset", 1, 4),
                B("画面切取", "windows-screenshot", "screenshot", 1, 5),
                Clock("wide", 2, 3),
                B("スピーカー消音", "audio-speaker-mute", "mute", 2, 5)),
            portrait = L(3, 6, F(2, 0, 3, 1), F(3, 0, 3, 1),
                B("シーン1", "key-custom", "video", 0, 0, "Ctrl+Shift+F1"),
                B("シーン2", "key-custom", "camera", 0, 1, "Ctrl+Shift+F2"),
                B("シーン3", "key-custom", "monitor", 0, 2, "Ctrl+Shift+F3"),
                B("休憩画面", "key-custom", "timer", 1, 0, "Ctrl+Shift+F4"),
                B("配信", "key-custom", "radio", 1, 1, "Ctrl+Shift+F5"),
                B("録画", "key-custom", "record", 1, 2, "Ctrl+Shift+F6"),
                B("マイク消音", "audio-mic-mute", "microphone", 4, 0),
                B("スピーカー消音", "audio-speaker-mute", "mute", 4, 1),
                B("Discord", "discord-mute", "headset", 4, 2),
                B("画面切取", "windows-screenshot", "screenshot", 5, 0),
                Clock("wide", 5, 1)),
        },
        new DeckPreset
        {
            id = "game", name = "ゲーム", note = "ボイスチャット・録画・音量・PCの負荷",
            setup = "録画とクリップ保存は Windows の Xbox Game Bar のキー（Win + Alt + R／G）を送ります。",
            landscape = L(6, 3, F(1, 0, 3, 1), F(2, 0, 3, 1),
                B("Discord", "discord-mute", "microphone", 0, 0),
                B("聞こえない", "discord-deafen", "headphones", 0, 1),
                B("サウンド", "discord-soundboard-overlay", "music", 0, 2),
                B("Game Bar", "key-custom", "gamepad", 0, 3, "Win+G"),
                B("録画", "key-custom", "record", 0, 4, "Win+Alt+R"),
                B("クリップ", "key-custom", "video", 0, 5, "Win+Alt+G"),
                Metric("cpu", 1, 3),
                Metric("gpu", 1, 4),
                B("スクショ", "windows-printscreen", "screenshot", 1, 5),
                B("アプリ切替", "windows-alttab", "grid", 2, 3),
                Clock("wide", 2, 4)),
            portrait = L(3, 6, F(2, 0, 3, 1), F(3, 0, 3, 1),
                B("Discord", "discord-mute", "microphone", 0, 0),
                B("聞こえない", "discord-deafen", "headphones", 0, 1),
                B("サウンド", "discord-soundboard-overlay", "music", 0, 2),
                B("Game Bar", "key-custom", "gamepad", 1, 0, "Win+G"),
                B("録画", "key-custom", "record", 1, 1, "Win+Alt+R"),
                B("クリップ", "key-custom", "video", 1, 2, "Win+Alt+G"),
                Metric("cpu", 4, 0),
                Metric("gpu", 4, 1),
                B("スクショ", "windows-printscreen", "screenshot", 4, 2),
                B("アプリ切替", "windows-alttab", "grid", 5, 0),
                Clock("wide", 5, 1)),
        },
        new DeckPreset
        {
            id = "work", name = "在宅ワーク・会議", note = "時計と天気・会議中のミュートと音量・画面整理",
            setup = "マイク・スピーカーのミュートとフェーダーは Windows 全体に効くので、会議アプリを問わず使えます。天気は PC 設定画面で地域を選ぶと表示されます。",
            landscape = L(6, 3, F(2, 0, 3, 1), F(2, 3, 3, 1),
                Clock("digital", 0, 0),
                B("マイク消音", "audio-mic-mute", "microphone", 0, 2),
                B("スピーカー消音", "audio-speaker-mute", "mute", 0, 3),
                Weather(false, 0, 4),
                B("ロック", "windows-lock", "lock", 0, 5),
                B("デスクトップ", "windows-desktop", "desktop", 1, 2),
                B("左半分", "windows-snapleft", "arrow-left", 1, 3),
                B("右半分", "windows-snapright", "arrow-right", 1, 4),
                B("画面切取", "windows-screenshot", "screenshot", 1, 5)),
            portrait = L(3, 6, F(2, 0, 3, 1), F(3, 0, 3, 1),
                Clock("digital", 0, 0),
                B("マイク消音", "audio-mic-mute", "microphone", 0, 2),
                B("スピーカー消音", "audio-speaker-mute", "mute", 1, 2),
                Weather(false, 4, 0),
                B("ロック", "windows-lock", "lock", 4, 1),
                B("デスクトップ", "windows-desktop", "desktop", 4, 2),
                B("左半分", "windows-snapleft", "arrow-left", 5, 0),
                B("右半分", "windows-snapright", "arrow-right", 5, 1),
                B("画面切取", "windows-screenshot", "screenshot", 5, 2)),
        },
        new DeckPreset
        {
            id = "editing", name = "動画・画像編集", note = "再生操作（J・K・L）・イン／アウト点・編集の基本キー",
            setup = "再生まわり（Space・J・K・L・I・O）は多くの動画編集ソフトで共通のキーです。使うソフトに合わせて右クリックの詳細設定でキーを変えられます。",
            landscape = L(6, 3, F(2, 0, 3, 1), null,
                B("巻き戻し", "key-custom", "back", 0, 0, "J"),
                B("一時停止", "key-custom", "pause", 0, 1, "K"),
                B("早送り", "key-custom", "forward", 0, 2, "L"),
                B("再生/停止", "key-custom", "play", 0, 3, "Space"),
                B("イン点", "key-custom", "arrow-left", 0, 4, "I"),
                B("アウト点", "key-custom", "arrow-right", 0, 5, "O"),
                B("取り消し", "common-undo", "back", 1, 0),
                B("やり直し", "common-redo", "forward", 1, 1),
                B("保存", "common-save", "save", 1, 2),
                B("コピー", "common-copy", "copy", 1, 3),
                B("貼り付け", "common-paste", "paste", 1, 4),
                B("画面切取", "windows-screenshot", "screenshot", 1, 5),
                B("切り取り", "common-cut", "eraser", 2, 3),
                B("すべて選択", "common-selectall", "grid", 2, 4),
                Metric("cpu", 2, 5)),
            portrait = L(3, 6, F(4, 0, 3, 1), null,
                B("巻き戻し", "key-custom", "back", 0, 0, "J"),
                B("一時停止", "key-custom", "pause", 0, 1, "K"),
                B("早送り", "key-custom", "forward", 0, 2, "L"),
                B("再生/停止", "key-custom", "play", 1, 0, "Space"),
                B("イン点", "key-custom", "arrow-left", 1, 1, "I"),
                B("アウト点", "key-custom", "arrow-right", 1, 2, "O"),
                B("取り消し", "common-undo", "back", 2, 0),
                B("やり直し", "common-redo", "forward", 2, 1),
                B("保存", "common-save", "save", 2, 2),
                B("コピー", "common-copy", "copy", 3, 0),
                B("貼り付け", "common-paste", "paste", 3, 1),
                B("切り取り", "common-cut", "eraser", 3, 2),
                B("すべて選択", "common-selectall", "grid", 5, 0),
                B("画面切取", "windows-screenshot", "screenshot", 5, 1),
                Metric("cpu", 5, 2)),
        },
        new DeckPreset
        {
            id = "media", name = "音楽・動画鑑賞", note = "再生操作・音量フェーダー・時計と天気",
            setup = "再生・曲送りはメディアキーなので、ブラウザや音楽アプリなど再生中のアプリに効きます。",
            landscape = L(5, 3, F(2, 0, 4, 1), null,
                B("前の曲", "media-previous", "previous", 0, 0),
                B("再生", "media-playpause", "play", 0, 1),
                B("次の曲", "media-next", "next", 0, 2),
                Clock("analog", 0, 3),
                B("停止", "media-stop", "stop", 1, 0),
                B("ミュート", "audio-speaker-mute", "mute", 1, 1),
                B("全画面", "browser-fullscreen", "fullscreen", 1, 2),
                Weather(false, 2, 4)),
            portrait = L(3, 5, F(3, 0, 3, 1), null,
                Clock("analog", 0, 0),
                Weather(false, 0, 2),
                B("全画面", "browser-fullscreen", "fullscreen", 1, 2),
                B("前の曲", "media-previous", "previous", 2, 0),
                B("再生", "media-playpause", "play", 2, 1),
                B("次の曲", "media-next", "next", 2, 2),
                B("停止", "media-stop", "stop", 4, 0),
                B("ミュート", "audio-speaker-mute", "mute", 4, 1),
                B("アプリ切替", "windows-alttab", "grid", 4, 2)),
        },
        new DeckPreset
        {
            id = "programming", name = "プログラミング", note = "エディターの定番キー・PCの負荷・時計",
            setup = "コマンドパレット・実行・定義へ移動などは VS Code の標準キーです。ほかのエディターでは右クリックの詳細設定でキーを変えてください。",
            landscape = L(6, 3, F(2, 0, 3, 1), null,
                B("保存", "common-save", "save", 0, 0),
                B("検索", "common-find", "search", 0, 1),
                B("コマンド", "key-custom", "menu", 0, 2, "Ctrl+Shift+P"),
                B("実行", "key-custom", "play", 0, 3, "F5"),
                B("停止", "key-custom", "stop", 0, 4, "Shift+F5"),
                B("定義へ", "key-custom", "target", 0, 5, "F12"),
                B("ターミナル", "key-custom", "keyboard", 1, 0, "Ctrl+Backquote"),
                B("コメント", "key-custom", "pen", 1, 1, "Ctrl+Slash"),
                B("取り消し", "common-undo", "back", 1, 2),
                B("やり直し", "common-redo", "forward", 1, 3),
                B("コピー", "common-copy", "copy", 1, 4),
                B("貼り付け", "common-paste", "paste", 1, 5),
                Metric("cpu", 2, 3),
                Clock("wide", 2, 4)),
            portrait = L(3, 6, F(4, 0, 3, 1), null,
                B("保存", "common-save", "save", 0, 0),
                B("検索", "common-find", "search", 0, 1),
                B("コマンド", "key-custom", "menu", 0, 2, "Ctrl+Shift+P"),
                B("実行", "key-custom", "play", 1, 0, "F5"),
                B("停止", "key-custom", "stop", 1, 1, "Shift+F5"),
                B("定義へ", "key-custom", "target", 1, 2, "F12"),
                B("ターミナル", "key-custom", "keyboard", 2, 0, "Ctrl+Backquote"),
                B("コメント", "key-custom", "pen", 2, 1, "Ctrl+Slash"),
                B("取り消し", "common-undo", "back", 2, 2),
                B("やり直し", "common-redo", "forward", 3, 0),
                B("コピー", "common-copy", "copy", 3, 1),
                B("貼り付け", "common-paste", "paste", 3, 2),
                Metric("cpu", 5, 0),
                Clock("wide", 5, 1)),
        },
    };

    static DeckPreset Find(string id)
    {
        foreach (var preset in All) if (preset.id == id) return preset;
        throw new Exception("プリセットが見つかりません。");
    }

    static object PublicLayout(PresetLayout l)
    {
        var items = new List<object>();
        foreach (var i in l.items) items.Add(new { name = i.name, type = i.type, icon = i.icon ?? "", key = i.hotkey ?? "", row = i.row, column = i.column, width = i.width, height = i.height });
        return new { columns = l.columns, rows = l.rows, speaker = l.speaker, mic = l.mic, items = items };
    }

    internal static object Public()
    {
        var result = new List<object>();
        foreach (var preset in All)
            result.Add(new { id = preset.id, name = preset.name, note = preset.note, setup = preset.setup, landscape = PublicLayout(preset.landscape), portrait = PublicLayout(preset.portrait) });
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
            if (!ShortcutKeys.Exists(i.action) || !IconPresets.Exists(i.icon)) throw new Exception("プリセットの定義が正しくありません。");
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
        if (page < 0 || page >= DeckLayout.Pages(s, orientation)) throw new Exception("ページ番号が正しくありません。");
        Func<AppEntry, bool> onPage = a => a.orientation == orientation && DeckLayout.Position(a, portrait) != null && DeckLayout.Position(a, portrait).page == page;
        s.apps.RemoveAll(a => onPage(a));
        DeckLayout.ControlPages(s, portrait).RemoveAll(e => e == null || e.page == page);
        if (s.apps.FindAll(a => a.orientation == orientation).Count + layout.items.Length > 40)
            throw new Exception("ボタンはこの向きで40個以内です。ほかのページの使わないボタンを削除してから使ってください。");

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
        if (layout.mic == null && layout.speaker != null) { c.micRow = layout.speaker.row; c.micColumn = layout.speaker.column; c.micWidth = 1; c.micHeight = 1; }
        if (layout.speaker == null && layout.mic != null) { c.speakerRow = layout.mic.row; c.speakerColumn = layout.mic.column; c.speakerWidth = 1; c.speakerHeight = 1; }
        DeckLayout.SetPageControls(s, portrait, page, c, layout.speaker == null, layout.mic == null);

        foreach (var item in layout.items) s.apps.Add(Entry(item, orientation, page, newId));
        int pages = DeckLayout.RequiredPages(s, orientation);
        if (portrait) s.portraitPageCount = Math.Max(s.portraitPageCount, pages);
        else { s.landscapePageCount = Math.Max(s.landscapePageCount, pages); s.pageCount = s.landscapePageCount; }
        return layout.items.Length;
    }
}
