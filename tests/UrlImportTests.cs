using System;

class UrlImportTests
{
    static void Check(bool value, string message)
    {
        if (!value)
            throw new Exception("FAIL " + message);
        Console.WriteLine("PASS " + message);
    }

    static void Reject(Action action, string message)
    {
        try
        {
            action();
        }
        catch (Exception e)
        {
            if (e.Message.StartsWith("FAIL "))
                throw;
            Console.WriteLine("PASS " + message);
            return;
        }
        throw new Exception("FAIL " + message);
    }

    static void Main()
    {
        var entry = AppImporter.FromUrl("  https://www.youtube.com/feed/subscriptions ", "");
        Check(entry.type == "url" && entry.category == "custom" && entry.iconKey == "globe", "a typed URL becomes a URL button");
        Check(entry.url == "https://www.youtube.com/feed/subscriptions", "the URL is trimmed");
        Check(entry.name == "youtube.com", "an empty name falls back to the site without www");
        Check(entry.path == "" && entry.args == "" && entry.text == "", "URL buttons carry no app fields");
        Check(AppImporter.FromUrl("http://192.168.1.2:8080/", " NAS ").name == "NAS", "a given name is kept and trimmed");
        Check(AppImporter.FromUrl("https://example.com/", new string('a', 120)).name.Length == 80, "long names are cut to 80 characters");
        Reject(delegate { AppImporter.FromUrl("file:///C:/Windows/notepad.exe", ""); }, "file URLs are rejected");
        Reject(delegate { AppImporter.FromUrl("example.com", ""); }, "addresses without http(s) are rejected");
        Reject(delegate { AppImporter.FromUrl("", ""); }, "an empty URL is rejected");
        Check(AppImporter.DroppedUrl("https://example.com/a\r\nExample") == "https://example.com/a", "a dragged browser link uses its first line");
        Check(AppImporter.DroppedUrl("hello world") == null, "dragged plain text is not a URL");
        Check(AppImporter.DroppedUrl("javascript:alert(1)") == null, "dragged script links are ignored");
    }
}
