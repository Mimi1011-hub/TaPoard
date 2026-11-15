using System;
using System.Collections.Generic;

static class PageNames
{
    internal static string Normalize(string value)
    {
        value = (value ?? "").Trim();
        if (value.IndexOf('\r') >= 0 || value.IndexOf('\n') >= 0)
            throw new Exception(Text.Get("source.pagenames.1"));
        if (value.Length > 20)
            throw new Exception(Text.Get("source.pagenames.2"));
        return value;
    }

    internal static List<string> List(Settings settings, bool portrait)
    {
        var names = portrait ? settings.portraitPageNames : settings.landscapePageNames;
        if (names == null)
        {
            names = new List<string>();
            if (portrait) settings.portraitPageNames = names;
            else settings.landscapePageNames = names;
        }
        return names;
    }

    internal static void Resize(Settings settings)
    {
        Resize(settings, false, DeckLayout.Pages(settings, "landscape"));
        Resize(settings, true, DeckLayout.Pages(settings, "portrait"));
    }

    internal static void Resize(Settings settings, bool portrait, int count)
    {
        var names = List(settings, portrait);
        while (names.Count < count) names.Add("");
        if (names.Count > count) names.RemoveRange(count, names.Count - count);
        for (int i = 0; i < names.Count; i++) names[i] = Normalize(names[i]);
    }

    internal static string Get(Settings settings, bool portrait, int page)
    {
        var names = portrait ? settings.portraitPageNames : settings.landscapePageNames;
        return names != null && page >= 0 && page < names.Count ? names[page] ?? "" : "";
    }

    internal static void Move(Settings settings, bool portrait, int page, int to)
    {
        Resize(settings);
        var names = List(settings, portrait);
        string value = names[page]; names[page] = names[to]; names[to] = value;
    }

    internal static void Delete(Settings settings, bool portrait, int page)
    {
        Resize(settings);
        List(settings, portrait).RemoveAt(page);
    }
}
