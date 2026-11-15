using System;
using System.IO;
using System.Text.RegularExpressions;

public static class SourceTextTests
{
    static void Assert(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }

    public static int Main()
    {
        try
        {
            foreach (string file in Directory.GetFiles("src", "*.cs"))
            {
                if (Path.GetFileName(file) == "TextJa.cs") continue;
                string source = File.ReadAllText(file);
                source = Regex.Replace(source, @"/\*.*?\*/", "", RegexOptions.Singleline);
                source = Regex.Replace(source, @"//.*$", "", RegexOptions.Multiline);
                foreach (Match literal in Regex.Matches(source, "\\\"(?:\\\\.|[^\\\"\\\\])*\\\""))
                    Assert(!Regex.IsMatch(literal.Value, "[ぁ-んァ-ヶ一-龠]"), file + " contains Japanese display text");
            }
            Console.WriteLine("PASS SourceTextTests");
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error);
            return 1;
        }
    }
}
