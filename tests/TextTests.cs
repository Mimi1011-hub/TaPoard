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
            Text.Use("ja");
            Assert(Text.Language == "ja" && Text.Preference == "ja", "Japanese is selected");
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
