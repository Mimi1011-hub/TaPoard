using System;
using System.Collections.Generic;

enum ApiAccess
{
    Open,
    Paired,
    Admin,
}

// Built once at startup and read thereafter. It owns no locks.
sealed class ApiRouter<T>
{
    sealed class Route
    {
        internal string method;
        internal string path;
        internal ApiAccess access;
        internal Action<T> handler;
        internal bool prefix;
    }

    readonly List<Route> routes = new List<Route>();

    internal void Get(string path, ApiAccess access, Action<T> handler)
    {
        Add("GET", path, access, handler, false);
    }

    internal void Post(string path, ApiAccess access, Action<T> handler)
    {
        Add("POST", path, access, handler, false);
    }

    internal void PostPrefix(string prefix, ApiAccess access, Action<T> handler)
    {
        Add("POST", prefix, access, handler, true);
    }

    void Add(string method, string path, ApiAccess access, Action<T> handler, bool prefix)
    {
        for (int i = 0; i < routes.Count; i++)
            if (routes[i].method == method && routes[i].path == path)
                throw new Exception("同じAPIルートが重複しています。");
        routes.Add(new Route { method = method, path = path, access = access, handler = handler, prefix = prefix });
    }

    internal Action<T> FindOpen(string method, string path)
    {
        for (int i = 0; i < routes.Count; i++)
        {
            Route route = routes[i];
            if (!route.prefix && route.access == ApiAccess.Open && route.method == method && route.path == path)
                return route.handler;
        }
        return null;
    }

    internal Action<T> Find(string method, string path, bool isAdmin)
    {
        for (int i = 0; i < routes.Count; i++)
        {
            Route route = routes[i];
            if (!route.prefix && Available(route, isAdmin) && route.method == method && route.path == path)
                return route.handler;
        }
        for (int i = 0; i < routes.Count; i++)
        {
            Route route = routes[i];
            if (route.prefix && Available(route, isAdmin) && route.method == method && path.StartsWith(route.path, StringComparison.Ordinal))
                return route.handler;
        }
        return null;
    }

    static bool Available(Route route, bool isAdmin)
    {
        return route.access == ApiAccess.Paired || (route.access == ApiAccess.Admin && isAdmin);
    }

    internal List<string> Describe()
    {
        var result = new List<string>();
        for (int i = 0; i < routes.Count; i++)
        {
            Route route = routes[i];
            result.Add(route.method + " " + route.path + (route.prefix ? "*" : "") + " " + route.access);
        }
        return result;
    }
}
