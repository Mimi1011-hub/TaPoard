using System;

sealed class SystemController : ControllerBase
{
    internal SystemController(AppState state, IDesktop desktop) : base(state, desktop) { }
    internal void Register(ApiRouter<ApiRequest> api)
    {
        api.Get("/api/pc-window", ApiAccess.Admin, delegate(ApiRequest r) { HttpIO.ReplyJson(r.stream, 200, desktop.PcWindowView()); });
        api.Get("/api/firewall", ApiAccess.Admin, delegate(ApiRequest r) { HttpIO.ReplyJson(r.stream, 200, FirewallCheck.Status(state.Root)); });
        api.Get("/api/import", ApiAccess.Admin, GetImport);
        api.Get("/api/slideshow", ApiAccess.Paired, GetSlideshow);
        api.Post("/api/import", ApiAccess.Admin, StartImport);
        api.Post("/api/slideshow/pick-folder", ApiAccess.Admin, PickFolder);
        api.Post("/api/weather/search", ApiAccess.Admin, delegate(ApiRequest r) { HttpIO.ReplyJson(r.stream, 200, new { results = WeatherService.Search(Convert.ToString(r.input["query"])) }); });
        api.Post("/api/weather/location", ApiAccess.Admin, delegate(ApiRequest r) { SetWeatherLocation(r, r.input); });
        api.Post("/api/pc-window", ApiAccess.Admin, SaveWindow);
        api.Post("/api/pc-window/open", ApiAccess.Admin, OpenWindow);
        api.Post("/api/firewall/repair", ApiAccess.Admin, RepairFirewall);
    }
    void GetImport(ApiRequest r) { lock (state.Gate) HttpIO.ReplyJson(r.stream, 200, new { id = state.ImportId, result = state.ImportResult }); }
    void GetSlideshow(ApiRequest r) { string id = HttpIO.QueryValue(r.target, "id"), folder = null; int index; Int32.TryParse(HttpIO.QueryValue(r.target, "index"), out index); lock (state.Gate) { var app = state.Config.apps.Find(a => a.id == id && DeckView.IsType(a, "slideshow")); object raw; if (app != null && app.options != null && app.options.TryGetValue("folder", out raw)) folder = raw as string; if (app == null) { HttpIO.Reply(r.stream, 404, HttpIO.JsonType, "{\"error\":\"スライドショーが見つかりません。\"}"); return; } } HttpIO.ReplyJson(r.stream, 200, Slideshow.Picture(folder, index)); }
    void PickFolder(ApiRequest r) { object start; string chosen = Slideshow.PickFolder(r.input.TryGetValue("folder", out start) ? Convert.ToString(start) : ""); HttpIO.ReplyJson(r.stream, 200, new { folder = chosen ?? "", picked = chosen != null, count = chosen == null ? 0 : Slideshow.Files(chosen).Length }); }
    void SaveWindow(ApiRequest r) { desktop.SavePcWindow(r.input); HttpIO.ReplyJson(r.stream, 200, desktop.PcWindowView()); }
    void OpenWindow(ApiRequest r) { object full; desktop.OpenPcWindow(r.input.TryGetValue("fullscreen", out full) && Convert.ToBoolean(full)); HttpIO.ReplyJson(r.stream, 200, desktop.PcWindowView()); }
    void RepairFirewall(ApiRequest r) { FirewallCheck.StartRepair(state.Root); HttpIO.ReplyJson(r.stream, 200, FirewallCheck.Status(state.Root)); }
}
