using System;

public static class ConnectLinksTests
{
    static void Assert(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }

    public static int Main()
    {
        try
        {
            ConnectLinks fallback = ConnectLinks.Create("my-pc", new string[0], 18781, "a b#c");
            Assert(fallback.androidUrl == fallback.iphoneUrl, "host URL is the Android fallback");
            Assert(fallback.iphoneUrl.EndsWith("#connect=a%20b%23c"), "token is escaped");
            ConnectLinks withIp = ConnectLinks.Create(
                "my-pc",
                new[] { "http://192.0.2.10:18781/" },
                18781,
                "token"
            );
            Assert(withIp.androidUrl.StartsWith("http://192.0.2.10:18781/"), "Android uses the first IP URL");
            Console.WriteLine("PASS ConnectLinksTests");
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error);
            return 1;
        }
    }
}
