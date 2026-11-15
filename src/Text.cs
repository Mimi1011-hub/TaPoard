using System;
using System.Collections.Generic;
using System.Globalization;

static class Text
{
    static readonly Dictionary<string, Dictionary<string, string>> Languages =
        new Dictionary<string, Dictionary<string, string>>
        {
            { "ja", TextJa.Values },
            { "en", TextEn.Values },
        };
    static Dictionary<string, string> current = TextEn.Values;

    internal static string Language { get; private set; }
    internal static string Preference { get; private set; }
    internal static event Action Changed;

    static Text()
    {
        Use("auto");
    }

    internal static void Use(string preference)
    {
        if (preference != "ja" && preference != "en") preference = "auto";
        string language = preference;
        if (language == "auto")
            language = CultureInfo.CurrentUICulture.Name.StartsWith("ja", StringComparison.OrdinalIgnoreCase) ? "ja" : "en";
        Dictionary<string, string> next = Languages[language];
        bool changed = language != Language || preference != Preference;
        current = next;
        Language = language;
        Preference = preference;
        Action handler = Changed;
        if (changed && handler != null) handler();
    }

    internal static string Get(string key)
    {
        string value;
        Dictionary<string, string> selected = current;
        if (selected.TryGetValue(key, out value)) return value;
        if (TextEn.Values.TryGetValue(key, out value)) return value;
        return key;
    }

    internal static string Get(string key, params object[] values)
    {
        return String.Format(CultureInfo.CurrentCulture, Get(key), values);
    }
}
