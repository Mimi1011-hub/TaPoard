using System;
using System.Collections.Generic;

class WidgetRegistryTests
{
    static void Check(bool value, string message)
    {
        if (!value)
            throw new Exception("FAIL " + message);
        Console.WriteLine("PASS " + message);
    }

    static void Reject(Action action, string message)
    {
        try
        {
            action();
            throw new Exception("FAIL " + message);
        }
        catch (Exception e)
        {
            if (e.Message.StartsWith("FAIL "))
                throw;
            Console.WriteLine("PASS " + message);
        }
    }

    static AppEntry Entry(string type, int size)
    {
        return new AppEntry
        {
            id = "test",
            name = "test",
            type = type,
            size = size,
            path = "C:\\private.exe",
            args = "--private",
            url = "https://private.example/",
            text = "private text",
        };
    }

    static void Main()
    {
        Reject(delegate { WidgetRegistry.Require("unknown"); }, "unknown widget type is rejected");
        var app = Entry("app", 1);
        app.options = new Dictionary<string, object> { { "unsafe", true } };
        Reject(delegate { WidgetRegistry.ValidateAndNormalize(app); }, "legacy actions reject unexpected options");

        var clock = Entry("clock", 2);
        WidgetRegistry.ValidateAndNormalize(clock);
        Check((string)clock.options["style"] == "digital" && (bool)clock.options["showSeconds"], "clock defaults are normalized");
        clock.options["unknown"] = true;
        Reject(delegate { WidgetRegistry.ValidateAndNormalize(clock); }, "unknown clock option is rejected");

        var wheel = Entry("wheel", 2);
        wheel.options = new Dictionary<string, object>
        {
            { "style", "rotary" },
            { "multiplier", 3 },
            { "ctrl", true },
            { "shift", false },
            { "alt", true },
        };
        WidgetRegistry.ValidateAndNormalize(wheel);
        Check((int)wheel.options["multiplier"] == 3 && (bool)wheel.options["alt"], "wheel modifiers and multiplier are normalized");
        wheel.options["multiplier"] = 11;
        Reject(delegate { WidgetRegistry.ValidateAndNormalize(wheel); }, "wheel multiplier is range checked");

        var weather = Entry("weather", 1);
        WidgetRegistry.ValidateAndNormalize(weather);
        Dictionary<string, object> publicEntry = WidgetRegistry.PublicEntry(weather);
        Check(publicEntry.ContainsKey("options") && !publicEntry.ContainsKey("path"), "public widget entry includes options but no executable path");
        Check(!publicEntry.ContainsKey("args") && !publicEntry.ContainsKey("url") && !publicEntry.ContainsKey("text"), "private action fields never enter phone state");
        var publicOptions = (Dictionary<string, object>)publicEntry["options"];
        publicOptions["forecastMode"] = "changed";
        Check((string)weather.options["forecastMode"] == "hours", "public options are returned as a copy");

        var touchpad = Entry("touchpad", 1);
        touchpad.width = 3;
        touchpad.height = 2;
        WidgetRegistry.ValidateAndNormalize(touchpad);
        Check((int)touchpad.options["speed"] == 5, "touchpad accepts a 3x2 rectangle");
        Check((bool)touchpad.options["reverseScroll"] == false && (string)touchpad.options["longPress"] == "none", "touchpad scroll direction and long press default to normal and unassigned");
        var definitions = WidgetRegistry.PublicDefinitions() as List<object>;
        Check(definitions != null && definitions.Count == 10, "all current and planned widget definitions are public");
    }
}
