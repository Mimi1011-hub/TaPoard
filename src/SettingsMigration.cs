using System;
using System.Collections.Generic;
using System.Web.Script.Serialization;

static class SettingsMigration
{
    internal static SettingsV3 ToV3(Settings settings)
    {
        if (settings == null)
            throw new Exception("設定を変換できません。");
        foreach (var app in settings.apps ?? new List<AppEntry>())
            if (app.orientation != "landscape" && app.orientation != "portrait")
                throw new Exception("部品の画面の向きが正しくありません。");
        return new SettingsV3
        {
            schemaVersion = 3,
            security = new SecurityV3
            {
                token = settings.token,
                devices = Copy(settings.devices) ?? new List<PairedDevice>(),
            },
            deck = new DeckV3
            {
                keepAwake = settings.keepAwake,
                background = Copy(settings.background),
                landscape = ToOrientation(settings, false),
                portrait = ToOrientation(settings, true),
            },
            weather = new WeatherV3
            {
                name = settings.weatherName,
                latitude = settings.weatherLatitude,
                longitude = settings.weatherLongitude,
                timezone = settings.weatherTimezone,
            },
            pcWindow = Copy(settings.pcWindow),
        };
    }

    static OrientationV3 ToOrientation(Settings settings, bool portrait)
    {
        string orientation = DeckLayout.OrientationName(portrait);
        int pageCount = DeckLayout.Pages(settings, orientation);
        var pages = new List<PageV3>();
        for (int page = 0; page < pageCount; page++)
            pages.Add(new PageV3 { faders = PageFaders(settings, portrait, page, pageCount), items = new List<DeckItem>() });
        foreach (var app in settings.apps ?? new List<AppEntry>())
        {
            if (app.orientation != orientation)
                continue;
            TilePosition position = DeckLayout.Position(app, portrait);
            if (position == null || position.page < 0 || position.page >= pageCount)
                throw new Exception("部品のページ位置が正しくありません。");
            pages[position.page].items.Add(ToItem(app, position));
        }
        return new OrientationV3
        {
            columns = DeckLayout.Columns(settings, portrait),
            rows = DeckLayout.Rows(settings, portrait),
            faders = new FadersV3
            {
                speaker = ToFader(portrait ? settings.portraitSpeaker : settings.landscapeSpeaker, DeckLayout.Off(settings, portrait, false)),
                mic = ToFader(portrait ? settings.portraitMic : settings.landscapeMic, DeckLayout.Off(settings, portrait, true)),
            },
            pages = pages,
        };
    }

    static PageFadersV3 PageFaders(Settings settings, bool portrait, int page, int pageCount)
    {
        var entries = portrait ? settings.portraitControlPages : settings.landscapeControlPages;
        foreach (var entry in entries ?? new List<ControlPage>())
        {
            if (entry == null || entry.page != page || entry.page >= pageCount)
                continue;
            return new PageFadersV3
            {
                speaker = Copy(entry.speaker),
                mic = Copy(entry.mic),
                speakerHidden = entry.speakerHidden,
                micHidden = entry.micHidden,
            };
        }
        return null;
    }

    static FaderV3 ToFader(ControlPlacement placement, bool off)
    {
        if (placement == null)
            throw new Exception("フェーダー位置が正しくありません。");
        return new FaderV3
        {
            row = placement.row,
            column = placement.column,
            width = placement.width,
            height = placement.height,
            off = off,
        };
    }

    static DeckItem ToItem(AppEntry app, TilePosition position)
    {
        return new DeckItem
        {
            id = app.id,
            name = app.name,
            path = app.path,
            args = app.args,
            url = app.url,
            text = app.text,
            icon = app.icon,
            iconKey = app.iconKey,
            iconColor = app.iconColor,
            customIcon = app.customIcon,
            iconPack = app.iconPack,
            iconPackItem = app.iconPackItem,
            type = app.type,
            action = app.action,
            category = app.category,
            deviceId = app.deviceId,
            deviceTarget = app.deviceTarget,
            deviceName = app.deviceName,
            row = position.row,
            column = position.column,
            width = DeckLayout.Width(app),
            height = DeckLayout.Height(app),
            fontSize = app.fontSize,
            iconScale = app.iconScale,
            labelOpacity = app.labelOpacity,
            keyClear = app.keyClear,
            hideLabel = app.hideLabel,
            hotkey = app.hotkey,
            options = Copy(app.options),
        };
    }

    internal static Settings ToV2(SettingsV3 settings)
    {
        if (settings == null || settings.schemaVersion != 3 || settings.security == null || settings.deck == null || settings.deck.landscape == null || settings.deck.portrait == null)
            throw new Exception("settings-v3.json の形式を確認できません。");
        var result = new Settings
        {
            schemaVersion = 2,
            token = settings.security.token,
            devices = Copy(settings.security.devices) ?? new List<PairedDevice>(),
            apps = new List<AppEntry>(),
            keepAwake = settings.deck.keepAwake,
            background = Copy(settings.deck.background),
            weatherName = settings.weather == null ? null : settings.weather.name,
            weatherLatitude = settings.weather == null ? 0 : settings.weather.latitude,
            weatherLongitude = settings.weather == null ? 0 : settings.weather.longitude,
            weatherTimezone = settings.weather == null ? null : settings.weather.timezone,
            pcWindow = Copy(settings.pcWindow),
        };
        ApplyOrientation(result, settings.deck.landscape, false);
        ApplyOrientation(result, settings.deck.portrait, true);
        DeckLayout.Migrate(result);
        DeckLayout.Validate(result);
        return result;
    }

    static void ApplyOrientation(Settings target, OrientationV3 source, bool portrait)
    {
        if (source == null || source.faders == null || source.faders.speaker == null || source.faders.mic == null || source.pages == null || source.pages.Count < 1)
            throw new Exception("settings-v3.json の向き別設定が正しくありません。");
        if (portrait)
        {
            target.portraitColumns = source.columns;
            target.portraitRows = source.rows;
            target.portraitSpeaker = Placement(source.faders.speaker);
            target.portraitMic = Placement(source.faders.mic);
            target.portraitSpeakerOff = source.faders.speaker.off;
            target.portraitMicOff = source.faders.mic.off;
            target.portraitPageCount = source.pages.Count;
            target.portraitControlPages = new List<ControlPage>();
        }
        else
        {
            target.landscapeColumns = source.columns;
            target.landscapeRows = source.rows;
            target.landscapeSpeaker = Placement(source.faders.speaker);
            target.landscapeMic = Placement(source.faders.mic);
            target.landscapeSpeakerOff = source.faders.speaker.off;
            target.landscapeMicOff = source.faders.mic.off;
            target.landscapePageCount = source.pages.Count;
            target.pageCount = source.pages.Count;
            target.landscapeControlPages = new List<ControlPage>();
        }
        for (int page = 0; page < source.pages.Count; page++)
        {
            PageV3 sourcePage = source.pages[page];
            if (sourcePage == null)
                throw new Exception("settings-v3.json のページ設定が正しくありません。");
            if (sourcePage.faders != null)
                Controls(target, portrait).Add(new ControlPage
                {
                    page = page,
                    speaker = Copy(sourcePage.faders.speaker),
                    mic = Copy(sourcePage.faders.mic),
                    speakerHidden = sourcePage.faders.speakerHidden,
                    micHidden = sourcePage.faders.micHidden,
                });
            foreach (var item in sourcePage.items ?? new List<DeckItem>())
                target.apps.Add(ToApp(item, portrait, page));
        }
    }

    static List<ControlPage> Controls(Settings settings, bool portrait)
    {
        return portrait ? settings.portraitControlPages : settings.landscapeControlPages;
    }

    static ControlPlacement Placement(FaderV3 source)
    {
        return new ControlPlacement { row = source.row, column = source.column, width = source.width, height = source.height };
    }

    static AppEntry ToApp(DeckItem item, bool portrait, int page)
    {
        if (item == null)
            throw new Exception("settings-v3.json の部品設定が正しくありません。");
        var position = new TilePosition { page = page, row = item.row, column = item.column };
        return new AppEntry
        {
            id = item.id,
            name = item.name,
            path = item.path,
            args = item.args,
            url = item.url,
            text = item.text,
            icon = item.icon,
            iconKey = item.iconKey,
            iconColor = item.iconColor,
            customIcon = item.customIcon,
            iconPack = item.iconPack,
            iconPackItem = item.iconPackItem,
            type = item.type,
            action = item.action,
            category = item.category,
            deviceId = item.deviceId,
            deviceTarget = item.deviceTarget,
            deviceName = item.deviceName,
            orientation = DeckLayout.OrientationName(portrait),
            landscape = portrait ? null : position,
            portrait = portrait ? position : null,
            size = item.width == item.height && item.width <= 2 ? item.width : 1,
            width = item.width,
            height = item.height,
            fontSize = item.fontSize,
            iconScale = item.iconScale,
            labelOpacity = item.labelOpacity,
            keyClear = item.keyClear,
            hideLabel = item.hideLabel,
            hotkey = item.hotkey,
            options = Copy(item.options),
        };
    }

    static T Copy<T>(T value)
    {
        if (Object.ReferenceEquals(value, null))
            return default(T);
        var serializer = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
        return serializer.Deserialize<T>(serializer.Serialize(value));
    }
}
