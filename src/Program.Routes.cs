using System;

partial class Program
{
    static ApiRouter<ApiRequest> BuildApi()
    {
        var router = new ApiRouter<ApiRequest>();
        PairingApi.Register(router);
        DeckApi.Register(router);
        PageApi.Register(router);
        LookApi.Register(router);
        InputApi.Register(router);
        SystemApi.Register(router);
        return router;
    }

    static void Route(ApiRequest request)
    {
        Action<ApiRequest> handler = api.FindOpen(request.method, request.path);
        if (handler != null)
        {
            handler(request);
            return;
        }
        if (!request.allowed)
        {
            HttpIO.Reply(request.stream, 401, HttpIO.JsonType, "{\"error\":\"接続キーを確認してください\"}");
            return;
        }
        if (request.method == "GET")
        {
            handler = api.Find(request.method, request.path, request.isAdmin);
            if (handler != null)
            {
                handler(request);
                return;
            }
            HttpIO.Reply(request.stream, 404, HttpIO.JsonType, "{}");
            return;
        }
        if (request.method != "POST")
        {
            HttpIO.Reply(request.stream, 404, HttpIO.JsonType, "{}");
            return;
        }
        request.input = HttpIO.ReadInput(request.stream, request.headers);
        request.json = HttpIO.Json(request.input);
        handler = api.Find(request.method, request.path, request.isAdmin);
        if (handler != null)
        {
            handler(request);
            return;
        }
        HttpIO.Reply(request.stream, 403, HttpIO.JsonType, "{}");
    }
}
