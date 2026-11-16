using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;

public static class TextTests
{
    static void Assert(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }

    static int Placeholders(string value)
    {
        return Regex.Matches(value, "\\{[0-9]+(?:[^}]*)?\\}").Count;
    }

    public static int Main()
    {
        try
        {
            Assert(TextJa.Values.Count == TextEn.Values.Count, "dictionary sizes match");
            foreach (KeyValuePair<string, string> pair in TextJa.Values)
            {
                Assert(TextEn.Values.ContainsKey(pair.Key), "English key exists: " + pair.Key);
                Assert(Placeholders(pair.Value) == Placeholders(TextEn.Values[pair.Key]), "placeholders match: " + pair.Key);
            }
            foreach (string value in TextEn.Values.Values)
                Assert(!Regex.IsMatch(value, "[ぁ-んァ-ヶ一-龠]"), "English has no Japanese text");
            Text.Use("en");
            Assert(Text.Language == "en" && Text.Preference == "en", "English is selected");
            Assert(Text.Get("source.actionsteps.2", 2) == "Step 2 is not valid.", "English sentences are built from one text");
            Assert(WidgetRegistry.Require("clock").label == "Clock", "widget names follow the language");
            Assert(DeckPresets.All[0].name == "Streaming", "preset names follow the language");
            Text.Use("ja");
            Assert(Text.Language == "ja" && Text.Preference == "ja", "Japanese is selected");
            Assert(WidgetRegistry.Require("clock").label == "\u6642\u8a08", "widget names change with the language");
            Assert(DeckPresets.All[0].name == "\u914d\u4fe1\u8005", "preset names change with the language");
            foreach (Dictionary<string, string> values in new[] { TextJa.Values, TextEn.Values })
                foreach (string value in values.Values)
                    if (Placeholders(value) > 0)
                        String.Format(value, "a", "b", "c");
            Text.Use("auto");
            string expected = CultureInfo.CurrentUICulture.Name.StartsWith("ja", StringComparison.OrdinalIgnoreCase) ? "ja" : "en";
            Assert(Text.Language == expected && Text.Preference == "auto", "auto follows Windows");
            Assert(Text.Get("missing.key") == "missing.key", "missing key is returned");
            Console.WriteLine("PASS TextTests");
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error);
            return 1;
        }
    }
}
