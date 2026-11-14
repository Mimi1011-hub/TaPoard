sealed class LookController : ControllerBase
{
    internal LookController(AppState state, IDesktop desktop) : base(state, desktop) { }
    internal void Register(ApiRouter<ApiRequest> api)
    {
        api.Get("/api/background/image", ApiAccess.Paired, GetBackground);
        api.Get("/api/icon-packs", ApiAccess.Admin, GetPacks);
        api.Get("/api/icon-packs/get", ApiAccess.Admin, GetPack);
        api.Get("/api/backups", ApiAccess.Admin, GetBackups);
        api.Get("/api/presets", ApiAccess.Admin, delegate(ApiRequest r) { HttpIO.ReplyJson(r.stream, 200, new { presets = DeckPresets.Public() }); });
        api.Get("/api/icon-styles", ApiAccess.Admin, GetStyles);
        api.Post("/api/backups/restore", ApiAccess.Admin, delegate(ApiRequest r) { RestoreBackup(r, r.input); });
        api.PostPrefix("/api/background", ApiAccess.Admin, delegate(ApiRequest r) { SetBackground(r, r.path, r.input, r.json); });
        api.PostPrefix("/api/icon-styles/", ApiAccess.Admin, delegate(ApiRequest r) { IconStyleAction(r, r.path.Substring("/api/icon-styles/".Length), r.input); });
        api.PostPrefix("/api/icon-packs/", ApiAccess.Admin, delegate(ApiRequest r) { IconPackAction(r, r.path.Substring("/api/icon-packs/".Length), r.input, r.json); });
    }
    void GetBackground(ApiRequest r) { string image; lock (state.Gate) image = DeckBackgrounds.ImageData(state.Data, state.Config.background); HttpIO.Reply(r.stream, 200, HttpIO.JsonType, "{\"data\":" + (image == null ? "null" : "\"" + image + "\"") + "}"); }
    void GetPacks(ApiRequest r) { HttpIO.ReplyJson(r.stream, 200, new { packs = IconPacks.List(state.Data), maxPacks = IconPacks.MaxPacks, maxIcons = IconPacks.MaxIcons }); }
    void GetPack(ApiRequest r) { HttpIO.Reply(r.stream, 200, HttpIO.JsonType, IconPacks.Serializer().Serialize(IconPacks.Get(state.Data, HttpIO.QueryValue(r.target, "id")))); }
    void GetBackups(ApiRequest r) { HttpIO.ReplyJson(r.stream, 200, new { backups = state.Store.ListBackups() }); }
    void GetStyles(ApiRequest r) { HttpIO.ReplyJson(r.stream, 200, new { styles = IconStyles.List(state.Data), maxStyles = IconStyles.MaxStyles }); }
}
