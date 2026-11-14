sealed class PageController : ControllerBase
{
    internal PageController(AppState state, IDesktop desktop) : base(state, desktop) { }
    internal void Register(ApiRouter<ApiRequest> api)
    {
        api.Post("/api/page", ApiAccess.Paired, delegate(ApiRequest r) { SetPage(r, r.input); });
        api.Post("/api/page/move", ApiAccess.Admin, delegate(ApiRequest r) { MovePage(r, r.input); });
        api.Post("/api/page/delete", ApiAccess.Admin, delegate(ApiRequest r) { DeletePage(r, r.input); });
        api.Post("/api/page/undo", ApiAccess.Admin, UndoDeletePage);
        api.Post("/api/fader/remove", ApiAccess.Admin, delegate(ApiRequest r) { RemoveFader(r, r.input); });
        api.Post("/api/presets/apply", ApiAccess.Admin, delegate(ApiRequest r) { ApplyPreset(r, r.input); });
        api.Post("/api/layout", ApiAccess.Paired, delegate(ApiRequest r) { SetLayout(r, r.input); });
    }
}
