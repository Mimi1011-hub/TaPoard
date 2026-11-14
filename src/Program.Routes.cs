using System;

partial class Program
{
    static readonly ProgramDesktop desktop = new ProgramDesktop();
    internal static readonly PairingController PairingApi = new PairingController(State, desktop);
    internal static readonly DeckController DeckApi = new DeckController(State, desktop);
    internal static readonly PageController PageApi = new PageController(State, desktop);
    internal static readonly LookController LookApi = new LookController(State, desktop);
    internal static readonly InputController InputApi = new InputController(State, desktop);
    internal static readonly SystemController SystemApi = new SystemController(State, desktop);
    static readonly ApiRouter<ApiRequest> api = BuildApi();
    static ApiRouter<ApiRequest> BuildApi()
    {
        var router = new ApiRouter<ApiRequest>();
        PairingApi.Register(router); DeckApi.Register(router); PageApi.Register(router);
        LookApi.Register(router); InputApi.Register(router); SystemApi.Register(router);
        return router;
    }
    static void Route(ApiRequest request)
    {
        Action<ApiRequest> handler = api.FindOpen(request.method, request.path);
        if (handler != null) { handler(request); return; }
        if (!request.allowed) { HttpIO.Reply(request.stream, 401, HttpIO.JsonType, "{\"error\":\"接続キーを確認してください\"}"); return; }
        if (request.method == "GET") { handler = api.Find(request.method, request.path, request.isAdmin); if (handler != null) { handler(request); return; } HttpIO.Reply(request.stream, 404, HttpIO.JsonType, "{}"); return; }
        if (request.method != "POST") { HttpIO.Reply(request.stream, 404, HttpIO.JsonType, "{}"); return; }
        request.input = HttpIO.ReadInput(request.stream, request.headers); request.json = HttpIO.Json(request.input);
        handler = api.Find(request.method, request.path, request.isAdmin);
        if (handler != null) { handler(request); return; }
        HttpIO.Reply(request.stream, 403, HttpIO.JsonType, "{}");
    }
}
