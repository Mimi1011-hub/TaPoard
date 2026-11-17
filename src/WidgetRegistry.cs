using System;
using System.Collections.Generic;

class WidgetDefinition
{
    internal string type;
    internal string labelKey;
    internal string label { get { return Text.Get(labelKey); } }
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
        Add(result, "app", "source.widgetregistry.1", new[] { "1x1", "2x2" }, false);
        Add(result, "hotkey", "source.widgetregistry.2", new[] { "1x1", "2x2" }, false);
        Add(result, "url", "URL", new[] { "1x1", "2x2" }, false);
        Add(result, "clipboard", "source.widgetregistry.3", new[] { "1x1", "2x2" }, false);
        Add(result, "audioDevice", "source.widgetregistry.4", new[] { "1x1", "2x2" }, false);
        Add(result, "clock", "source.widgetregistry.5", new[] { "2x1", "2x2" }, true);
        Add(result, "weather", "source.widgetregistry.6", new[] { "1x1", "2x2" }, true);
        Add(result, "metrics", "source.widgetregistry.7", new[] { "1x1", "2x2" }, true);
        Add(result, "wheel", "source.widgetregistry.8", new[] { "1x1", "1x2", "2x2" }, true);
        Add(result, "touchpad", "source.widgetregistry.9", new[] { "3x2", "2x3" }, true);
        Add(result, "keypad", "source.widgetregistry.10", new[] { "4x4", "4x5" }, true);
        Add(result, "slideshow", "source.widgetregistry.11", SlideshowSizes(), true);
        Add(result, "nowPlaying", "source.widgetregistry.32", new[] { "2x1", "2x2", "3x2", "4x2", "3x3", "4x3", "4x4" }, true);
        return result;
    }

    // Every width x height from 3x3 up to the largest grid (8x8); the settings page offers the
    // ones that fit the grid in use.
    static string[] SlideshowSizes()
    {
        var list = new List<string>();
        for (int w = 3; w <= 8; w++)
            for (int h = 3; h <= 8; h++)
                list.Add(w + "x" + h);
        return list.ToArray();
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
                labelKey = label,
                sizes = sizes,
                displayOnly = displayOnly,
            }
        );
    }

    internal static WidgetDefinition Require(string type)
    {
        WidgetDefinition definition;
        if (String.IsNullOrWhiteSpace(type) || !Definitions.TryGetValue(type, out definition))
            throw new Exception(Text.Get("source.widgetregistry.12"));
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
                throw new Exception(Text.Get("source.widgetregistry.13"));
            app.options = null;
            return;
        }

        var source = app.options ?? new Dictionary<string, object>();
        var normalized = new Dictionary<string, object>();
        if (definition.type == "clock")
        {
            string clockStyle = EnumValue(source, "style", "digital", new[] { "digital", "analog" });
            int clockWidth = DeckLayout.Width(app), clockHeight = DeckLayout.Height(app);
            bool validClockSize = clockStyle == "analog"
                ? clockWidth == 2 && clockHeight == 2
                : clockWidth == 2 && (clockHeight == 1 || clockHeight == 2);
            if (!validClockSize)
                throw new Exception(clockStyle == "analog" ? Text.Get("source.widgetregistry.14") : Text.Get("source.widgetregistry.15"));
            normalized["style"] = clockStyle;
            normalized["showSeconds"] = BooleanValue(source, "showSeconds", true);
            normalized["showDate"] = BooleanValue(source, "showDate", true);
            normalized["showWeekday"] = BooleanValue(source, "showWeekday", true);
            normalized["hour12"] = BooleanValue(source, "hour12", false);
            RejectUnknown(source, normalized);
        }
        else if (definition.type == "weather")
        {
            RequireSquareDimensions(app, Text.Get("source.widgetregistry.16"));
            normalized["forecastMode"] = EnumValue(source, "forecastMode", "hours", new[] { "hours", "days" });
            RejectUnknown(source, normalized);
        }
        else if (definition.type == "metrics")
        {
            RequireSquareDimensions(app, Text.Get("source.widgetregistry.17"));
            normalized["primary"] = EnumValue(
                source,
                "primary",
                "cpu",
                new[] { "cpu", "memory", "gpu", "gpuMemory" }
            );
            normalized["cycle"] = BooleanValue(source, "cycle", false);
            normalized["gpuId"] = ShortText(source, "gpuId", "", 128);
            // The id is a Windows LUID that changes after a restart; the name lets the phone find the same GPU again.
            normalized["gpuName"] = ShortText(source, "gpuName", "", 128);
            RejectUnknown(source, normalized);
        }
        else if (definition.type == "wheel")
        {
            string style = EnumValue(source, "style", "vertical", new[] { "vertical", "rotary" });
            int width = DeckLayout.Width(app), height = DeckLayout.Height(app);
            bool fits = style == "vertical" ? width == 1 && (height == 1 || height == 2) : width == 2 && height == 2;
            if (!fits) throw new Exception(Text.Get("source.widgetregistry.18"));
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
                throw new Exception(Text.Get("source.widgetregistry.19"));
            normalized["speed"] = IntegerValue(source, "speed", 5, 1, 10);
            normalized["acceleration"] = BooleanValue(source, "acceleration", true);
            normalized["tapToClick"] = BooleanValue(source, "tapToClick", true);
            normalized["twoFingerScroll"] = BooleanValue(source, "twoFingerScroll", true);
            normalized["reverseScroll"] = BooleanValue(source, "reverseScroll", false);
            normalized["longPress"] = EnumValue(source, "longPress", "none", new[] { "none", "rightClick", "drag" });
            RejectUnknown(source, normalized);
        }
        else if (definition.type == "slideshow")
        {
            string shape = DeckLayout.Width(app) + "x" + DeckLayout.Height(app);
            if (Array.IndexOf(SlideshowSizes(), shape) < 0)
                throw new Exception(Text.Get("source.widgetregistry.20"));
            string folder = ShortText(source, "folder", "", 260).Trim();
            if (!Slideshow.ValidFolder(folder))
                throw new Exception(Text.Get("source.widgetregistry.21"));
            normalized["folder"] = folder;
            normalized["interval"] = IntegerValue(source, "interval", 10, 3, 3600);
            normalized["order"] = EnumValue(source, "order", "name", new[] { "name", "random" });
            normalized["fit"] = EnumValue(source, "fit", "cover", new[] { "cover", "contain" });
            RejectUnknown(source, normalized);
        }
        else if (definition.type == "keypad")
        {
            if (DeckLayout.Width(app) != 4 || (DeckLayout.Height(app) != 4 && DeckLayout.Height(app) != 5))
                throw new Exception(Text.Get("source.widgetregistry.22"));
            RejectUnknown(source, normalized);
        }
        else if (definition.type == "nowPlaying")
        {
            normalized["showArt"] = BooleanValue(source, "showArt", true);
            normalized["showControls"] = BooleanValue(source, "showControls", true);
            normalized["showProgress"] = BooleanValue(source, "showProgress", true);
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
            throw new Exception(Text.Get("source.widgetregistry.23", definition.label, key));
    }

    static string EnumValue(Dictionary<string, object> source, string name, string fallback, string[] allowed)
    {
        object raw;
        string value = source.TryGetValue(name, out raw) ? raw as string : fallback;
        if (value == null || Array.IndexOf(allowed, value) < 0)
            throw new Exception(Text.Get("source.widgetregistry.25", name));
        return value;
    }

    static bool BooleanValue(Dictionary<string, object> source, string name, bool fallback)
    {
        object raw;
        if (!source.TryGetValue(name, out raw))
            return fallback;
        if (!(raw is bool))
            throw new Exception(Text.Get("source.widgetregistry.26", name));
        return (bool)raw;
    }

    static int IntegerValue(Dictionary<string, object> source, string name, int fallback, int minimum, int maximum)
    {
        object raw;
        if (!source.TryGetValue(name, out raw))
            return fallback;
        // Same strictness as BooleanValue: JSON integers only, never true or "50".
        if (!(raw is int || raw is long))
            throw new Exception(Text.Get("source.widgetregistry.27", name));
        long number = Convert.ToInt64(raw);
        if (number < Int32.MinValue || number > Int32.MaxValue)
            throw new Exception(Text.Get("source.widgetregistry.28", name));
        int value = (int)number;
        if (value < minimum || value > maximum)
            throw new Exception(Text.Get("source.widgetregistry.29", name));
        return value;
    }

    static string ShortText(Dictionary<string, object> source, string name, string fallback, int maximum)
    {
        object raw;
        if (!source.TryGetValue(name, out raw))
            return fallback;
        string value = raw as string;
        if (value == null || value.Length > maximum)
            throw new Exception(Text.Get("source.widgetregistry.30", name));
        return value;
    }

    static void RejectUnknown(Dictionary<string, object> source, Dictionary<string, object> normalized)
    {
        foreach (string key in source.Keys)
            if (!normalized.ContainsKey(key))
                throw new Exception(Text.Get("source.widgetregistry.31") + key);
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
        result["keyClear"] = app.keyClear;
        result["hideLabel"] = app.hideLabel;
        result["options"] = PublicOptions(app);
        return result;
    }

    internal static Dictionary<string, object> PublicOptions(AppEntry app)
    {
        return PublicOptions(app.type, app.options);
    }

    internal static Dictionary<string, object> PublicOptions(string type, Dictionary<string, object> options)
    {
        if (!IsDisplayWidget(type) || options == null)
            return null;
        return new Dictionary<string, object>(options);
    }
}
