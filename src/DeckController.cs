sealed class DeckController : ControllerBase
{
    internal DeckController(AppState state, IDesktop desktop) : base(state, desktop) { }
    internal void Register(ApiRouter<ApiRequest> api)
    {
        api.Get("/api/ping", ApiAccess.Paired, delegate(ApiRequest r) { HttpIO.Reply(r.stream, 200, HttpIO.JsonType, "{\"ok\":true}"); });
        api.Get("/api/state", ApiAccess.Paired, GetState);
        api.Get("/api/sync", ApiAccess.Paired, WaitForSync);
        api.Get("/api/settings", ApiAccess.Admin, GetSettings);
        api.Post("/api/settings", ApiAccess.Admin, SaveRequest);
    }
    void SaveRequest(ApiRequest r) { SaveSettings(r.json); HttpIO.Reply(r.stream, 200, HttpIO.JsonType, "{\"ok\":true}"); }
}
