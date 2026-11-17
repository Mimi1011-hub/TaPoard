using System;

sealed class MediaController : ControllerBase
{
    internal MediaController(AppState state, IDesktop desktop) : base(state, desktop)
    {
    }

    internal void Register(ApiRouter<ApiRequest> api)
    {
        api.Get("/api/media/art", ApiAccess.Paired, Art);
        api.Post("/api/media/command", ApiAccess.Paired, Command);
    }

    void Art(ApiRequest request)
    {
        byte[] art = MediaService.Art();
        if (art == null)
        {
            HttpIO.Reply(request.stream, 404, HttpIO.JsonType, "{}");
            return;
        }
        string type = art.Length > 3 && art[0] == 0xFF && art[1] == 0xD8 ? "image/jpeg" : "image/png";
        HttpIO.ReplyCachedBytes(request.stream, 200, type, art, "private, max-age=3600");
    }

    void Command(ApiRequest request)
    {
        if (request.local && PcWindowService.ViewOnly) throw new Exception(Text.Get("source.media.2"));
        MediaService.Command(Convert.ToString(request.input["command"]));
        HttpIO.Reply(request.stream, 200, HttpIO.JsonType, "{\"ok\":true}");
    }
}
