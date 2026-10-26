using System;
using System.Collections.Generic;

class WidgetDefinition
{
    internal string type;
    internal string label;
    internal string[] sizes;
    internal bool displayOnly;
}

// Single source of truth for persisted widget types, sizes and safe public options.
static class WidgetRegistry
{
    static readonly Dictionary<string, WidgetDefinition> Definitions = CreateDefinitions();

    static Dictionary<string, WidgetDefinition> CreateDefinitions()
    {
        var result = new Dictionary<string, WidgetDefinition>(StringComparer.OrdinalIgnoreCase);
        Add(result, "app", "アプリ", new[] { "1x1", "2x2" }, false);
        Add(result, "hotkey", "ショートカット", new[] { "1x1", "2x2" }, false);
        Add(result, "url", "URL", new[] { "1x1", "2x2" }, false);
        Add(result, "clipboard", "テキストコピー", new[] { "1x1", "2x2" }, false);
        Add(result, "audioDevice", "音声機器", new[] { "1x1", "2x2" }, false);
        Add(result, "clock", "時計", new[] { "2x2" }, true);
        Add(result, "weather", "天気", new[] { "1x1", "2x2" }, true);
        Add(result, "metrics", "PC情報", new[] { "1x1", "2x2" }, true);
        Add(result, "wheel", "マウスホイール", new[] { "1x1", "2x2" }, true);
        Add(result, "touchpad", "タッチパッド", new[] { "3x2", "2x3" }, true);
        return result;
    }

    static void Add(
        Dictionary<string, WidgetDefinition> result,
        string type,
        string label,
        string[] sizes,
        bool displayOnly
    )
    {
        result.Add(
            type,
            new WidgetDefinition
            {
                type = type,
                label = label,
                sizes = sizes,
                displayOnly = displayOnly,
            }
        );
    }

    internal static WidgetDefinition Require(string type)
    {
        WidgetDefinition definition;
        if (String.IsNullOrWhiteSpace(type) || !Definitions.TryGetValue(type, out definition))
            throw new Exception("登録されていない部品種類です。");
        return definition;
    }

    internal static bool IsDisplayWidget(string type)
    {
        return Require(type).displayOnly;
    }

    internal static object PublicDefinitions()
    {
        var result = new List<object>();
        foreach (var pair in Definitions)
        {
            var definition = pair.Value;
            result.Add(
                new
                {
                    type = definition.type,
                    label = definition.label,
                    sizes = definition.sizes,
                    displayOnly = definition.displayOnly,
                }
            );
        }
        return result;
    }

    internal static void ValidateAndNormalize(AppEntry app)
    {
        WidgetDefinition definition = Require(app.type);
        app.type = definition.type;
        if (!definition.displayOnly)
        {
            if (app.options != null && app.options.Count != 0)
                throw new Exception("この部品には追加設定を保存できません。");
            app.options = null;
            return;
        }

        var source = app.options ?? new Dictionary<string, object>();
        var normalized = new Dictionary<string, object>();
        if (definition.type == "clock")
        {
            RequireDimensions(app, 2, 2, "時計は2×2です。");
            normalized["style"] = EnumValue(source, "style", "digital", new[] { "digital", "analog" });
            normalized["showSeconds"] = BooleanValue(source, "showSeconds", true);
            normalized["showDate"] = BooleanValue(source, "showDate", true);
            normalized["showWeekday"] = BooleanValue(source, "showWeekday", true);
            normalized["hour12"] = BooleanValue(source, "hour12", false);
            RejectUnknown(source, normalized);
        }
        else if (definition.type == "weather")
        {
            RequireSquareDimensions(app, "天気は1×1または2×2です。");
            normalized["forecastMode"] = EnumValue(source, "forecastMode", "hours", new[] { "hours", "days" });
            RejectUnknown(source, normalized);
        }
        else if (definition.type == "metrics")
        {
            RequireSquareDimensions(app, "PC情報は1×1または2×2です。");
            normalized["primary"] = EnumValue(
                source,
                "primary",
                "cpu",
                new[] { "cpu", "memory", "gpu", "gpuMemory" }
            );
            normalized["cycle"] = BooleanValue(source, "cycle", false);
            normalized["gpuId"] = ShortText(source, "gpuId", "", 128);
            RejectUnknown(source, normalized);
        }
        else if (definition.type == "wheel")
        {
            string style = EnumValue(source, "style", "vertical", new[] { "vertical", "rotary" });
            RequireDimensions(app, style == "vertical" ? 1 : 2, style == "vertical" ? 1 : 2, "縦型ホイールは1×1、円形ホイールは2×2です。");
            normalized["style"] = style;
            normalized["sensitivity"] = IntegerValue(source, "sensitivity", style == "vertical" ? 24 : 18, 1, 200);
            normalized["multiplier"] = IntegerValue(source, "multiplier", 1, 1, 10);
            normalized["reverse"] = BooleanValue(source, "reverse", false);
            normalized["ctrl"] = BooleanValue(source, "ctrl", false);
            normalized["shift"] = BooleanValue(source, "shift", false);
            normalized["alt"] = BooleanValue(source, "alt", false);
            normalized["middleClick"] = BooleanValue(source, "middleClick", false);
            RejectUnknown(source, normalized);
        }
        else if (definition.type == "touchpad")
        {
            int width = DeckLayout.Width(app), height = DeckLayout.Height(app);
            if (!((width == 3 && height == 2) || (width == 2 && height == 3)))
                throw new Exception("タッチパッドは3×2または2×3です。");
            normalized["speed"] = IntegerValue(source, "speed", 5, 1, 10);
            normalized["acceleration"] = BooleanValue(source, "acceleration", true);
            normalized["tapToClick"] = BooleanValue(source, "tapToClick", true);
            normalized["twoFingerScroll"] = BooleanValue(source, "twoFingerScroll", true);
            normalized["longPress"] = EnumValue(source, "longPress", "none", new[] { "none", "rightClick", "drag" });
            RejectUnknown(source, normalized);
        }
        app.options = normalized;
    }

    static void RequireSquareDimensions(AppEntry app, string message)
    {
        int width = DeckLayout.Width(app), height = DeckLayout.Height(app);
        if (width != height || (width != 1 && width != 2))
            throw new Exception(message);
    }

    static void RequireDimensions(AppEntry app, int width, int height, string message)
    {
        if (DeckLayout.Width(app) != width || DeckLayout.Height(app) != height)
            throw new Exception(message);
    }

    internal static void ValidateDimensions(AppEntry app)
    {
        WidgetDefinition definition = Require(app.type);
        int width = DeckLayout.Width(app), height = DeckLayout.Height(app);
        string key = width + "x" + height;
        if (Array.IndexOf(definition.sizes, key) < 0)
            throw new Exception(definition.label + "では" + key + "を使用できません。");
    }

    static string EnumValue(Dictionary<string, object> source, string name, string fallback, string[] allowed)
    {
        object raw;
        string value = source.TryGetValue(name, out raw) ? raw as string : fallback;
        if (value == null || Array.IndexOf(allowed, value) < 0)
            throw new Exception(name + " の設定が正しくありません。");
        return value;
    }

    static bool BooleanValue(Dictionary<string, object> source, string name, bool fallback)
    {
        object raw;
        if (!source.TryGetValue(name, out raw))
            return fallback;
        if (!(raw is bool))
            throw new Exception(name + " の設定が正しくありません。");
        return (bool)raw;
    }

    static int IntegerValue(Dictionary<string, object> source, string name, int fallback, int minimum, int maximum)
    {
        object raw;
        if (!source.TryGetValue(name, out raw))
            return fallback;
        int value;
        try
        {
            value = Convert.ToInt32(raw);
        }
        catch
        {
            throw new Exception(name + " の設定が正しくありません。");
        }
        if (value < minimum || value > maximum || raw is double || raw is float || raw is decimal)
            throw new Exception(name + " の設定が正しくありません。");
        return value;
    }

    static string ShortText(Dictionary<string, object> source, string name, string fallback, int maximum)
    {
        object raw;
        if (!source.TryGetValue(name, out raw))
            return fallback;
        string value = raw as string;
        if (value == null || value.Length > maximum)
            throw new Exception(name + " の設定が正しくありません。");
        return value;
    }

    static void RejectUnknown(Dictionary<string, object> source, Dictionary<string, object> normalized)
    {
        foreach (string key in source.Keys)
            if (!normalized.ContainsKey(key))
                throw new Exception("未対応の部品設定です: " + key);
    }

    internal static Dictionary<string, object> PublicEntry(AppEntry app)
    {
        var result = new Dictionary<string, object>();
        result["id"] = app.id;
        result["name"] = app.name;
        result["icon"] = app.icon;
        result["iconKey"] = app.iconKey;
        result["iconColor"] = app.iconColor;
        result["customIcon"] = app.customIcon;
        result["type"] = app.type;
        result["action"] = app.action;
        result["category"] = app.category;
        result["deviceId"] = app.deviceId;
        result["deviceTarget"] = app.deviceTarget;
        result["orientation"] = app.orientation;
        result["landscape"] = app.landscape;
        result["portrait"] = app.portrait;
        result["size"] = app.size;
        result["width"] = DeckLayout.Width(app);
        result["height"] = DeckLayout.Height(app);
        result["fontSize"] = app.fontSize;
        result["iconScale"] = app.iconScale;
        result["labelOpacity"] = app.labelOpacity;
        result["hideLabel"] = app.hideLabel;
        result["options"] = PublicOptions(app);
        return result;
    }

    internal static Dictionary<string, object> PublicOptions(AppEntry app)
    {
        if (!IsDisplayWidget(app.type) || app.options == null)
            return null;
        return new Dictionary<string, object>(app.options);
    }
}
