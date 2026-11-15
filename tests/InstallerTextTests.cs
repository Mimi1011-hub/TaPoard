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
