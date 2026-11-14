using System;
using System.Collections.Generic;

public static class ApiRouterTests
{
    static void Assert(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }

    static void Reject(Action action, string message)
    {
        try
        {
            action();
            throw new Exception("FAIL " + message);
        }
        catch (Exception e)
        {
            if (e.Message.StartsWith("FAIL ")) throw;
        }
    }

    public static int Main()
    {
        try
        {
            var router = new ApiRouter<string>();
            Action<string> state = delegate(string value) { };
            Action<string> admin = delegate(string value) { };
            Action<string> open = delegate(string value) { };
            Action<string> prefix = delegate(string value) { };
            Action<string> exact = delegate(string value) { };
            router.Get("/api/state", ApiAccess.Paired, state);
            router.Get("/api/admin", ApiAccess.Admin, admin);
            router.Post("/api/open", ApiAccess.Open, open);
            router.PostPrefix("/api/icon-packs/", ApiAccess.Admin, prefix);
            router.Post("/api/icon-packs/add", ApiAccess.Admin, exact);

            Assert(Object.ReferenceEquals(router.Find("GET", "/api/state", false), state), "exact route is found");
            Assert(router.Find("POST", "/api/state", false) == null, "different method is not found");
            Assert(router.Find("GET", "/api/admin", false) == null, "admin route is hidden from paired clients");
            Assert(Object.ReferenceEquals(router.Find("GET", "/api/admin", true), admin), "admin route is found for admins");
            Assert(Object.ReferenceEquals(router.FindOpen("POST", "/api/open"), open), "open route is found by FindOpen");
            Assert(router.Find("POST", "/api/open", true) == null, "open route is not returned by Find");
            Assert(Object.ReferenceEquals(router.Find("POST", "/api/icon-packs/rename", true), prefix), "prefix route is found");
            Assert(Object.ReferenceEquals(router.Find("POST", "/api/icon-packs/add", true), exact), "exact route wins over prefix");

            Reject(delegate { router.Get("/api/state", ApiAccess.Paired, state); }, "duplicate route is rejected");
            List<string> description = router.Describe();
            Assert(description.Count == 5, "Describe returns every route");
            Assert(description[0] == "GET /api/state Paired", "Describe preserves registration order");
            Assert(description[3] == "POST /api/icon-packs/* Admin", "Describe marks prefix routes");

            Console.WriteLine("PASS ApiRouterTests");
            return 0;
        }
        catch (Exception e)
        {
            Console.Error.WriteLine(e);
            return 1;
        }
    }
}
