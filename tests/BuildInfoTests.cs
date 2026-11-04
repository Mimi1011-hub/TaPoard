using System;
using System.Text.RegularExpressions;

class BuildInfoTests
{
    static void Main()
    {
        string version = BuildInfo.DisplayVersion;
        if (!Regex.IsMatch(version, "^2\\.1(?:\\+(?:[0-9a-f]{7,40}\\.dirty|source|unknown))?$"))
            throw new Exception("Unexpected build version: " + version);
        Console.WriteLine("PASS build version " + version);
    }
}
