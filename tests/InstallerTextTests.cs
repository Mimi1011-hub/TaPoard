using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

class InstallerTextTests
{
    static void Assert(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }

    static int Main()
    {
        try
        {
            Assert(InstallerText.Ja.Count == InstallerText.En.Count, "dictionary sizes match");
            foreach (KeyValuePair<string, string> pair in InstallerText.Ja)
            {
                Assert(InstallerText.En.ContainsKey(pair.Key), "English key exists: " + pair.Key);
                Assert(!Regex.IsMatch(InstallerText.En[pair.Key], "[ぁ-んァ-ヶ一-龠]"), "English is translated");
            }
            InstallerText.Use("en");
            Assert(InstallerText.Get("next") == "Next", "English can be chosen");
            InstallerText.Use("ja");
            Assert(InstallerText.Get("next") == InstallerText.Ja["next"], "Japanese can be chosen");
            InstallerText.Use("xx");
            Assert(InstallerText.Preference == "auto", "unknown values fall back to automatic");
            Console.WriteLine("PASS InstallerTextTests");
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error);
            return 1;
        }
    }
}
