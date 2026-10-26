using System;
using System.Text.RegularExpressions;

class BuildInfoTests
{
    static void Main()
    {
        string version = BuildInfo.DisplayVersion;
        if (!Regex.IsMatch(version, "^2\\.0-dev\\+(?:[0-9a-f]{7,40}(?:\\.dirty)?|source|unknown)$"))
            throw new Exception("Unexpected development build version: " + version);
        Console.WriteLine("PASS development build version " + version);
    }
}
