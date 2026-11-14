sealed class PairingController : ControllerBase
{
    internal PairingController(AppState state, IDesktop desktop) : base(state, desktop) { }
    internal void Register(ApiRouter<ApiRequest> api)
    {
        api.Post("/api/pair/start", ApiAccess.Open, PairStart);
        api.Get("/api/pair/status", ApiAccess.Open, PairStatus);
        api.Get("/api/pair/manage", ApiAccess.Admin, GetManage);
        api.Post("/api/pair/manage", ApiAccess.Admin, delegate(ApiRequest r) { ManagePairing(r, r.input); });
        api.Post("/api/rotate", ApiAccess.Admin, RotateRequest);
    }
    void GetManage(ApiRequest r) { lock (state.Gate) HttpIO.ReplyJson(r.stream, 200, Pairing.View(state.Config)); }
    void RotateRequest(ApiRequest r) { RotateKeys(); HttpIO.Reply(r.stream, 200, HttpIO.JsonType, "{\"ok\":true}"); }
}
