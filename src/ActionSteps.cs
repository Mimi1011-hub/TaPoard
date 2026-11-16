using System;
using System.Collections.Generic;

class ActionStep
{
    public string type { get; set; }
    public string action { get; set; }
    public string category { get; set; }
    public string path { get; set; }
    public string args { get; set; }
    public string url { get; set; }
    public string text { get; set; }
    public string hotkey { get; set; }
    public string deviceId { get; set; }
    public string deviceTarget { get; set; }
    public int delayMs { get; set; }
}

static class ActionSteps
{
    internal static void Validate(List<ActionStep> steps)
    {
        if (steps == null) return;
        if (steps.Count > 20) throw new Exception(Text.Get("source.actionsteps.1"));
        for (int i = 0; i < steps.Count; i++)
        {
            ActionStep step = steps[i];
            if (step == null) throw new Exception(Text.Get("source.actionsteps.2", i + 1));
            if (step.delayMs < 0 || step.delayMs > 10000)
                throw new Exception(Text.Get("source.actionsteps.3", i + 1));
            var entry = new AppEntry
            {
                type = step.type, action = step.action, category = step.category,
                path = step.path, args = step.args, url = step.url, text = step.text,
                hotkey = step.hotkey, deviceId = step.deviceId, deviceTarget = step.deviceTarget,
            };
            try { ValidateEntryAction(entry, ResolveAudio, false); }
            catch (Exception error) { throw new Exception(Text.Get("source.actionsteps.4", i + 1, error.Message)); }
        }
    }

    static AudioDeviceInfo ResolveAudio(AppEntry entry)
    {
        return AudioDevices.Validate(entry.deviceTarget, entry.deviceId);
    }

    internal static bool IsActionType(string type)
    {
        return String.Equals(type, "app", StringComparison.OrdinalIgnoreCase)
            || String.Equals(type, "hotkey", StringComparison.OrdinalIgnoreCase)
            || String.Equals(type, "url", StringComparison.OrdinalIgnoreCase)
            || String.Equals(type, "clipboard", StringComparison.OrdinalIgnoreCase)
            || String.Equals(type, "audioDevice", StringComparison.OrdinalIgnoreCase);
    }

    internal static void ValidateEntryAction(AppEntry entry, Func<AppEntry, AudioDeviceInfo> audioResolver, bool refreshIcon)
    {
        if (DeckView.IsType(entry, "audioDevice"))
        {
            AudioDeviceInfo device = audioResolver(entry);
            entry.type = "audioDevice"; entry.deviceName = device.name; entry.category = "audio";
            entry.path = ""; entry.args = ""; entry.url = ""; entry.text = ""; entry.action = null; entry.icon = null;
        }
        else if (DeckView.IsType(entry, "hotkey"))
        {
            if (!ShortcutKeys.Exists(entry.action)) throw new Exception(Text.Get("source.actionsteps.5"));
            ShortcutKeys.ValidateOverride(entry.action, entry.hotkey);
            entry.type = "hotkey"; entry.path = ""; entry.args = ""; entry.url = ""; entry.text = ""; entry.icon = null;
        }
        else if (DeckView.IsType(entry, "url"))
        {
            CustomActions.ValidateUrl(entry.url);
            entry.type = "url"; entry.path = ""; entry.args = ""; entry.text = ""; entry.action = null; entry.category = "custom"; entry.icon = null;
        }
        else if (DeckView.IsType(entry, "clipboard"))
        {
            CustomActions.ValidateText(entry.text);
            entry.type = "clipboard"; entry.path = ""; entry.args = ""; entry.url = ""; entry.action = null; entry.category = "custom"; entry.icon = null;
        }
        else if (DeckView.IsType(entry, "app"))
        {
            entry.type = "app"; entry.action = null; entry.category = "app"; entry.url = ""; entry.text = "";
            if (!AppImporter.ValidPath(entry.path)) throw new Exception(Text.Get("source.actionsteps.6"));
            if (refreshIcon) entry.icon = StartApps.IsStartApp(entry.path) ? StartApps.Icon(entry.path) : AppIcons.Read(entry.path);
        }
        else throw new Exception(Text.Get("source.actionsteps.7"));
    }
}
