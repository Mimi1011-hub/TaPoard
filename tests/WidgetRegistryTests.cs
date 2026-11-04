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

        var clock = Entry("clock", 1);
        clock.width = 2;
        clock.height = 1;
        WidgetRegistry.ValidateAndNormalize(clock);
        Check((string)clock.options["style"] == "digital" && (bool)clock.options["showSeconds"], "2x1 clock defaults are normalized");
        var analogWide = Entry("clock", 1);
        analogWide.width = 2;
        analogWide.height = 1;
        analogWide.options = new Dictionary<string, object> { { "style", "analog" } };
        Reject(delegate { WidgetRegistry.ValidateAndNormalize(analogWide); }, "analog clock remains fixed at 2x2");
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

        var tallWheel = Entry("wheel", 1);
        tallWheel.width = 1;
        tallWheel.height = 2;
        tallWheel.options = new Dictionary<string, object> { { "style", "vertical" } };
        WidgetRegistry.ValidateAndNormalize(tallWheel);
        Check((string)tallWheel.options["style"] == "vertical", "a 1x2 vertical wheel is accepted");
        var wideWheel = Entry("wheel", 1);
        wideWheel.width = 2;
        wideWheel.height = 1;
        wideWheel.options = new Dictionary<string, object> { { "style", "vertical" } };
        Reject(delegate { WidgetRegistry.ValidateAndNormalize(wideWheel); }, "a 2x1 vertical wheel is rejected");
        var tallRotary = Entry("wheel", 1);
        tallRotary.width = 1;
        tallRotary.height = 2;
        tallRotary.options = new Dictionary<string, object> { { "style", "rotary" } };
        Reject(delegate { WidgetRegistry.ValidateAndNormalize(tallRotary); }, "a 1x2 rotary wheel is rejected");

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
        foreach (object wrong in new object[] { true, "5", 5.0m })
        {
            var strict = Entry("touchpad", 1);
            strict.width = 3;
            strict.height = 2;
            strict.options = new Dictionary<string, object> { { "speed", wrong } };
            Reject(delegate { WidgetRegistry.ValidateAndNormalize(strict); }, "integer options reject " + wrong.GetType().Name);
        }
        Check((bool)touchpad.options["reverseScroll"] == false && (string)touchpad.options["longPress"] == "none", "touchpad scroll direction and long press default to normal and unassigned");
        var keypad = Entry("keypad", 1);
        keypad.width = 4;
        keypad.height = 4;
        WidgetRegistry.ValidateAndNormalize(keypad);
        Check(keypad.options.Count == 0, "4x4 keypad is accepted without client-controlled key options");
        keypad.height = 5;
        WidgetRegistry.ValidateAndNormalize(keypad);
        Check(keypad.options.Count == 0, "4x5 keypad is accepted");
        keypad.height = 3;
        Reject(delegate { WidgetRegistry.ValidateAndNormalize(keypad); }, "keypad rejects sizes other than 4x4 and 4x5");
        var gpuMetric = Entry("metrics", 1);
        gpuMetric.options = new Dictionary<string, object> { { "primary", "gpu" }, { "gpuId", "luid_0x00000000_0x0000abcd" }, { "gpuName", "Test GPU" } };
        WidgetRegistry.ValidateAndNormalize(gpuMetric);
        Check((string)gpuMetric.options["gpuName"] == "Test GPU", "metrics keep the GPU name so a restart can find the same GPU");
        var legacyMetric = Entry("metrics", 1);
        legacyMetric.options = new Dictionary<string, object> { { "primary", "gpu" }, { "gpuId", "luid_0x00000000_0x0000abcd" } };
        WidgetRegistry.ValidateAndNormalize(legacyMetric);
        Check((string)legacyMetric.options["gpuName"] == "", "2.0 metrics without a GPU name still load");
        var definitions = WidgetRegistry.PublicDefinitions() as List<object>;
        Check(definitions != null && definitions.Count == 11, "all current widget definitions are public");
    }
}
