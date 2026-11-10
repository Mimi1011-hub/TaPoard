using System;
using System.Collections.Generic;

// 3.0 PC window. Stored in settings-v2.json as "pcWindow"; older files simply lack it.
class PcWindowOptions
{
    // What happens when TaPoard starts: "none" (tray only / browser settings as before),
    // "window" or "fullscreen".
    public string startup { get; set; }
    // "last" keeps the state from the previous session, "on" / "off" force it.
    public string startTopmost { get; set; }
    public string buttonSize { get; set; } // small, medium, large
    public bool autoHideBar { get; set; }
    public string aspect { get; set; } // keep (black bars) or fill
    public int opacity { get; set; } // 30-100 %
    public bool showInfo { get; set; }
    public bool confirmClose { get; set; }

    // Remembered window state (physical pixels).
    public int x { get; set; }
    public int y { get; set; }
    public int width { get; set; }
    public int height { get; set; }
    public bool maximized { get; set; }
    public bool topmost { get; set; }
    public bool hasBounds { get; set; }

    internal static PcWindowOptions Defaults()
    {
        return new PcWindowOptions
        {
            startup = "none",
            startTopmost = "last",
            buttonSize = "medium",
            autoHideBar = false,
            aspect = "keep",
            opacity = 100,
            showInfo = false,
            confirmClose = true,
            topmost = true,
        };
    }

    static string OneOf(string value, string fallback, params string[] allowed)
    {
        return Array.IndexOf(allowed, value) >= 0 ? value : fallback;
    }

    // Repairs a loaded or posted value in place so the window never sees an invalid option.
    internal static PcWindowOptions Normalize(PcWindowOptions o)
    {
        if (o == null)
            return Defaults();
        o.startup = OneOf(o.startup, "none", "none", "window", "fullscreen");
        o.startTopmost = OneOf(o.startTopmost, "last", "last", "on", "off");
        o.buttonSize = OneOf(o.buttonSize, "medium", "small", "medium", "large");
        o.aspect = OneOf(o.aspect, "keep", "keep", "fill");
        if (o.opacity == 0)
            o.opacity = 100;
        o.opacity = Math.Max(30, Math.Min(100, o.opacity));
        if (o.width < 0 || o.height < 0 || o.width > 20000 || o.height > 20000)
            o.hasBounds = false;
        return o;
    }

    // Applies the user-editable fields from the settings page; window state is left alone.
    internal void ApplyPreferences(Dictionary<string, object> input)
    {
        object v;
        if (input.TryGetValue("startup", out v)) startup = Convert.ToString(v);
        if (input.TryGetValue("startTopmost", out v)) startTopmost = Convert.ToString(v);
        if (input.TryGetValue("buttonSize", out v)) buttonSize = Convert.ToString(v);
        if (input.TryGetValue("autoHideBar", out v)) autoHideBar = Convert.ToBoolean(v);
        if (input.TryGetValue("aspect", out v)) aspect = Convert.ToString(v);
        if (input.TryGetValue("opacity", out v)) opacity = Convert.ToInt32(v);
        if (input.TryGetValue("showInfo", out v)) showInfo = Convert.ToBoolean(v);
        if (input.TryGetValue("confirmClose", out v)) confirmClose = Convert.ToBoolean(v);
        Normalize(this);
    }

    internal object PublicView()
    {
        return new
        {
            startup = startup,
            startTopmost = startTopmost,
            buttonSize = buttonSize,
            autoHideBar = autoHideBar,
            aspect = aspect,
            opacity = opacity,
            showInfo = showInfo,
            confirmClose = confirmClose,
            topmost = topmost,
        };
    }

    internal PcWindowOptions Clone()
    {
        return (PcWindowOptions)MemberwiseClone();
    }
}
