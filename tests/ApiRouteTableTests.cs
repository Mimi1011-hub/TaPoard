using System;
using System.Collections.Generic;
using System.Reflection;

public static class ApiRouteTableTests
{
    static void Assert(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }

    public static int Main()
    {
        try
        {
            FieldInfo field = typeof(Program).GetField("api", BindingFlags.Static | BindingFlags.NonPublic);
            Assert(field != null, "Program.api exists");
            var router = (ApiRouter<Program.Request>)field.GetValue(null);
            var actual = new HashSet<string>(router.Describe(), StringComparer.Ordinal);
            string[] expected = new[]
            {
                "POST /api/pair/start Open",
                "GET /api/pair/status Open",
                "GET /api/pair/manage Admin",
                "GET /api/ping Paired",
                "GET /api/state Paired",
                "GET /api/sync Paired",
                "GET /api/settings Admin",
                "GET /api/import Admin",
                "GET /api/devices Admin",
                "GET /api/pc-window Admin",
                "GET /api/background/image Paired",
                "GET /api/icon-packs Admin",
                "GET /api/icon-packs/get Admin",
                "GET /api/backups Admin",
                "GET /api/presets Admin",
                "GET /api/icon-styles Admin",
                "GET /api/slideshow Paired",
                "GET /api/firewall Admin",
                "POST /api/pair/manage Admin",
                "POST /api/import Admin",
                "POST /api/page Paired",
                "POST /api/page/move Admin",
                "POST /api/page/delete Admin",
                "POST /api/page/undo Admin",
                "POST /api/backups/restore Admin",
                "POST /api/fader/remove Admin",
                "POST /api/slideshow/pick-folder Admin",
                "POST /api/presets/apply Admin",
                "POST /api/layout Paired",
                "POST /api/audio Paired",
                "POST /api/weather/search Admin",
                "POST /api/weather/location Admin",
                "POST /api/view Paired",
                "POST /api/input Paired",
                "POST /api/input/keepalive Paired",
                "POST /api/input/release Paired",
                "POST /api/settings Admin",
                "POST /api/rotate Admin",
                "POST /api/action Paired",
                "POST /api/pc-window Admin",
                "POST /api/pc-window/open Admin",
                "POST /api/firewall/repair Admin",
                "POST /api/background* Admin",
                "POST /api/icon-styles/* Admin",
                "POST /api/icon-packs/* Admin",
            };
            Assert(router.Describe().Count == expected.Length, "route count matches the specification");
            for (int i = 0; i < expected.Length; i++)
                Assert(actual.Contains(expected[i]), "route exists: " + expected[i]);
            Assert(actual.Count == expected.Length, "route table has no unexpected entries");

            Console.WriteLine("PASS ApiRouteTableTests");
            return 0;
        }
        catch (Exception e)
        {
            Console.Error.WriteLine(e);
            return 1;
        }
    }
}
