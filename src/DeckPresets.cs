using System;
using System.Collections.Generic;

// 3.1 purpose presets: ready-made button sets built from the standard icons and shortcuts.
// "key-custom" buttons send the key shown in their note; the user registers it in the app they use.
class PresetButton
{
    internal string name, action, icon, hotkey;
    internal PresetButton(string name, string action, string icon, string hotkey = null)
    {
        this.name = name;
        this.action = action;
        this.icon = icon;
        this.hotkey = hotkey;
    }
}

class DeckPreset
{
    internal string id, name, note, setup;
    internal PresetButton[] buttons;
}

static class DeckPresets
{
    internal static readonly DeckPreset[] All =
    {
        new DeckPreset
        {
            id = "streamer", name = "配信者", note = "シーン切り替え・配信／録画・ミュートをまとめて",
            setup = "シーン・配信・録画のボタンは Ctrl + Shift + F1〜F6 を送ります。配信ソフト（OBS など）の「ホットキー」に同じキーを登録してください。",
            buttons = new[]
            {
                new PresetButton("シーン1", "key-custom", "video", "Ctrl+Shift+F1"),
                new PresetButton("シーン2", "key-custom", "camera", "Ctrl+Shift+F2"),
                new PresetButton("シーン3", "key-custom", "monitor", "Ctrl+Shift+F3"),
                new PresetButton("休憩画面", "key-custom", "timer", "Ctrl+Shift+F4"),
                new PresetButton("配信 開始／停止", "key-custom", "radio", "Ctrl+Shift+F5"),
                new PresetButton("録画 開始／停止", "key-custom", "record", "Ctrl+Shift+F6"),
                new PresetButton("マイク ミュート", "audio-mic-mute", "microphone"),
                new PresetButton("スピーカー ミュート", "audio-speaker-mute", "mute"),
                new PresetButton("Discord ミュート", "discord-mute", "headset"),
                new PresetButton("画面切り取り", "windows-screenshot", "screenshot"),
            },
        },
        new DeckPreset
        {
            id = "game", name = "ゲーム", note = "ボイスチャット・録画・音量をゲーム中に",
            setup = "録画とクリップ保存は Windows の Xbox Game Bar のキー（Win + Alt + R／G）を送ります。",
            buttons = new[]
            {
                new PresetButton("Discord ミュート", "discord-mute", "microphone"),
                new PresetButton("Discord 聞こえない", "discord-deafen", "headphones"),
                new PresetButton("サウンドボード", "discord-soundboard-overlay", "music"),
                new PresetButton("Game Bar", "key-custom", "gamepad", "Win+G"),
                new PresetButton("録画 開始／停止", "key-custom", "record", "Win+Alt+R"),
                new PresetButton("直前を保存", "key-custom", "video", "Win+Alt+G"),
                new PresetButton("スクリーンショット", "windows-printscreen", "screenshot"),
                new PresetButton("音量 ＋", "audio-speaker-up", "plus"),
                new PresetButton("音量 −", "audio-speaker-down", "minus"),
                new PresetButton("アプリ切り替え", "windows-alttab", "grid"),
            },
        },
        new DeckPreset
        {
            id = "work", name = "在宅ワーク・会議", note = "会議中のミュートと画面整理",
            setup = "マイク・スピーカーのミュートは Windows 全体に効くので、会議アプリを問わず使えます。",
            buttons = new[]
            {
                new PresetButton("マイク ミュート", "audio-mic-mute", "microphone"),
                new PresetButton("スピーカー ミュート", "audio-speaker-mute", "mute"),
                new PresetButton("画面をロック", "windows-lock", "lock"),
                new PresetButton("デスクトップ表示", "windows-desktop", "desktop"),
                new PresetButton("左半分に配置", "windows-snapleft", "arrow-left"),
                new PresetButton("右半分に配置", "windows-snapright", "arrow-right"),
                new PresetButton("画面切り取り", "windows-screenshot", "screenshot"),
                new PresetButton("クリップボード履歴", "windows-clipboard", "paste"),
                new PresetButton("エクスプローラー", "windows-explorer", "folder"),
                new PresetButton("画面出力を切替", "windows-project", "monitor"),
            },
        },
        new DeckPreset
        {
            id = "editing", name = "動画・画像編集", note = "再生・取り消し・イン／アウト点",
            setup = "再生まわり（Space・J・K・L・I・O）は多くの動画編集ソフトで共通のキーです。使うソフトに合わせて右クリックの詳細設定でキーを変えられます。",
            buttons = new[]
            {
                new PresetButton("再生／停止", "key-custom", "play", "Space"),
                new PresetButton("巻き戻し", "key-custom", "back", "J"),
                new PresetButton("一時停止", "key-custom", "pause", "K"),
                new PresetButton("早送り", "key-custom", "forward", "L"),
                new PresetButton("イン点", "key-custom", "arrow-left", "I"),
                new PresetButton("アウト点", "key-custom", "arrow-right", "O"),
                new PresetButton("取り消し", "common-undo", "back"),
                new PresetButton("やり直し", "common-redo", "forward"),
                new PresetButton("保存", "common-save", "save"),
                new PresetButton("画面切り取り", "windows-screenshot", "screenshot"),
            },
        },
        new DeckPreset
        {
            id = "media", name = "音楽・動画鑑賞", note = "再生操作と音量を手元に",
            setup = "再生・曲送りはメディアキーなので、ブラウザや音楽アプリなど再生中のアプリに効きます。",
            buttons = new[]
            {
                new PresetButton("再生／一時停止", "media-playpause", "play"),
                new PresetButton("前の曲", "media-previous", "previous"),
                new PresetButton("次の曲", "media-next", "next"),
                new PresetButton("停止", "media-stop", "stop"),
                new PresetButton("音量 ＋", "audio-speaker-up", "plus"),
                new PresetButton("音量 −", "audio-speaker-down", "minus"),
                new PresetButton("ミュート", "audio-speaker-mute", "mute"),
                new PresetButton("全画面", "browser-fullscreen", "fullscreen"),
            },
        },
        new DeckPreset
        {
            id = "programming", name = "プログラミング", note = "エディターでよく使うキー",
            setup = "コマンドパレット・実行・定義へ移動などは VS Code の標準キーです。ほかのエディターでは右クリックの詳細設定でキーを変えてください。",
            buttons = new[]
            {
                new PresetButton("保存", "common-save", "save"),
                new PresetButton("検索", "common-find", "search"),
                new PresetButton("コマンドパレット", "key-custom", "menu", "Ctrl+Shift+P"),
                new PresetButton("実行・デバッグ", "key-custom", "play", "F5"),
                new PresetButton("デバッグ停止", "key-custom", "stop", "Shift+F5"),
                new PresetButton("定義へ移動", "key-custom", "target", "F12"),
                new PresetButton("ターミナル", "key-custom", "keyboard", "Ctrl+Backquote"),
                new PresetButton("コメント切替", "key-custom", "pen", "Ctrl+Slash"),
                new PresetButton("取り消し", "common-undo", "back"),
                new PresetButton("やり直し", "common-redo", "forward"),
            },
        },
    };

    static DeckPreset Find(string id)
    {
        foreach (var preset in All) if (preset.id == id) return preset;
        throw new Exception("プリセットが見つかりません。");
    }

    internal static object Public()
    {
        var result = new List<object>();
        foreach (var preset in All)
        {
            var buttons = new List<object>();
            foreach (var b in preset.buttons) buttons.Add(new { name = b.name, icon = b.icon, key = b.hotkey ?? "" });
            result.Add(new { id = preset.id, name = preset.name, note = preset.note, setup = preset.setup, buttons = buttons });
        }
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

    // Adds the preset's buttons to one orientation, on a new page or in place of every button there.
    // Returns the page the preset starts on.
    internal static int Apply(Settings s, string id, string orientation, bool replace, Func<string> newId)
    {
        var preset = Find(id);
        bool portrait = orientation == "portrait";
        int firstPage;
        if (replace)
        {
            s.apps.RemoveAll(a => a.orientation == orientation);
            if (portrait) { s.portraitControlPages = new List<ControlPage>(); s.portraitPageCount = 1; }
            else { s.landscapeControlPages = new List<ControlPage>(); s.landscapePageCount = 1; s.pageCount = 1; }
            firstPage = 0;
        }
        else
            firstPage = DeckLayout.Pages(s, orientation);
        if (firstPage >= DeckLayout.MaxPages) throw new Exception("これ以上ページを増やせません。");
        if (s.apps.FindAll(a => a.orientation == orientation).Count + preset.buttons.Length > 40)
            throw new Exception("ボタンはこの向きで40個以内です。使わないボタンを削除してから追加してください。");
        var added = new List<AppEntry>();
        foreach (var b in preset.buttons)
        {
            if (!ShortcutKeys.Exists(b.action) || !IconPresets.Exists(b.icon)) throw new Exception("プリセットの定義が正しくありません。");
            if (b.hotkey != null) ShortcutKeys.ValidateOverride(b.action, b.hotkey);
            var entry = new AppEntry
            {
                id = newId(), name = b.name, type = "hotkey", action = b.action, hotkey = b.hotkey, category = Category(b.action),
                iconKey = b.icon, orientation = orientation, size = 1, width = 1, height = 1, fontSize = 11, iconScale = 82, labelOpacity = 45,
                path = "", args = "", url = "", text = "",
            };
            added.Add(entry);
            s.apps.Add(entry);
        }
        DeckLayout.PlaceFrom(s, orientation, added, firstPage);
        return firstPage;
    }
}
