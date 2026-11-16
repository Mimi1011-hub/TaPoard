using System;
using System.Collections.Generic;
using System.IO;

sealed class SystemController : ControllerBase
{
    internal SystemController(AppState state, IDesktop desktop) : base(state, desktop)
    {
    }

    internal void Register(ApiRouter<ApiRequest> api)
    {
        api.Get("/api/pc-window", ApiAccess.Admin, GetPcWindow);
        api.Get("/api/firewall", ApiAccess.Admin, GetFirewall);
        api.Get("/api/v3/language", ApiAccess.Admin, GetLanguage);
        api.Get("/api/import", ApiAccess.Admin, GetImport);
        api.Get("/api/slideshow", ApiAccess.Paired, GetSlideshow);
        api.Post("/api/import", ApiAccess.Admin, StartImport);
        api.Post("/api/slideshow/pick-folder", ApiAccess.Admin, PickFolder);
        api.Post("/api/weather/search", ApiAccess.Admin, SearchWeather);
        api.Post("/api/weather/location", ApiAccess.Admin, SetWeatherLocationRequest);
        api.Post("/api/pc-window", ApiAccess.Admin, SaveWindow);
        api.Post("/api/pc-window/open", ApiAccess.Admin, OpenWindow);
        api.Post("/api/firewall/repair", ApiAccess.Admin, RepairFirewall);
        api.Post("/api/v3/language", ApiAccess.Admin, SaveLanguage);
    }

    object LanguageView()
    {
        return new
        {
            preference = Text.Preference,
            language = Text.Language,
            languages = new[]
            {
                new { id = "ja", name = TextJa.Values["language.ja"] },
                new { id = "en", name = TextEn.Values["language.en"] },
            },
        };
    }

    void GetLanguage(ApiRequest r)
    {
        HttpIO.ReplyJson(r.stream, 200, LanguageView());
    }

    void SaveLanguage(ApiRequest r)
    {
        string preference = Convert.ToString(r.input["preference"]);
        if (preference != "auto" && preference != "ja" && preference != "en")
            throw new ArgumentException(Text.Get("language.invalid"));
        Directory.CreateDirectory(state.Data);
        File.WriteAllText(Path.Combine(state.Data, "language.txt"), preference);
        lock (state.Gate)
        {
            Text.Use(preference);
            state.Signal();
        }
        HttpIO.ReplyJson(r.stream, 200, LanguageView());
    }

    void GetPcWindow(ApiRequest r)
    {
        HttpIO.ReplyJson(r.stream, 200, desktop.PcWindowView());
    }

    void GetFirewall(ApiRequest r)
    {
        HttpIO.ReplyJson(r.stream, 200, FirewallCheck.Status(state.Root));
    }

    void GetImport(ApiRequest r)
    {
        lock (state.Gate)
            HttpIO.ReplyJson(r.stream, 200, new { id = state.ImportId, result = state.ImportResult });
    }

    void GetSlideshow(ApiRequest r)
    {
        string id = HttpIO.QueryValue(r.target, "id"), folder = null;
        int index;
        Int32.TryParse(HttpIO.QueryValue(r.target, "index"), out index);
        lock (state.Gate)
        {
            var app = state.Config.apps.Find(a => a.id == id && DeckView.IsType(a, "slideshow"));
            object raw;
            if (app != null && app.options != null && app.options.TryGetValue("folder", out raw))
                folder = raw as string;
            if (app == null)
            {
                HttpIO.ReplyJson(r.stream, 404, new { error = Text.Get("source.systemcontroller.1") });
                return;
            }
        }
        HttpIO.ReplyJson(r.stream, 200, Slideshow.Picture(folder, index));
    }

    void PickFolder(ApiRequest r)
    {
        object start;
        string chosen = Slideshow.PickFolder(r.input.TryGetValue("folder", out start) ? Convert.ToString(start) : "");
        HttpIO.ReplyJson(r.stream, 200, new { folder = chosen ?? "", picked = chosen != null, count = chosen == null ? 0 : Slideshow.Files(chosen).Length });
    }

    void SearchWeather(ApiRequest r)
    {
        HttpIO.ReplyJson(r.stream, 200, new { results = WeatherService.Search(Convert.ToString(r.input["query"])) });
    }

    void SetWeatherLocationRequest(ApiRequest r)
    {
        SetWeatherLocation(r, r.input);
    }

    void SaveWindow(ApiRequest r)
    {
        desktop.SavePcWindow(r.input);
        HttpIO.ReplyJson(r.stream, 200, desktop.PcWindowView());
    }

    void OpenWindow(ApiRequest r)
    {
        object full;
        desktop.OpenPcWindow(r.input.TryGetValue("fullscreen", out full) && Convert.ToBoolean(full));
        HttpIO.ReplyJson(r.stream, 200, desktop.PcWindowView());
    }

    void RepairFirewall(ApiRequest r)
    {
        FirewallCheck.StartRepair(state.Root);
        HttpIO.ReplyJson(r.stream, 200, FirewallCheck.Status(state.Root));
    }

    internal void StartImport(ApiRequest r)
    {
        string ticket = desktop.StartImport();
        HttpIO.ReplyJson(r.stream, 200, new { id = ticket });
    }

    internal void SetWeatherLocation(ApiRequest r, Dictionary<string, object> input)
    {
        string name = Convert.ToString(input["name"]), timezone = Convert.ToString(input["timezone"]);
        double latitude = Convert.ToDouble(input["latitude"], System.Globalization.CultureInfo.InvariantCulture),
            longitude = Convert.ToDouble(input["longitude"], System.Globalization.CultureInfo.InvariantCulture);
        WeatherService.ValidateLocation(name, latitude, longitude, timezone);
        lock (state.Gate)
        {
            state.Config.weatherName = name;
            state.Config.weatherLatitude = latitude;
            state.Config.weatherLongitude = longitude;
            state.Config.weatherTimezone = timezone;
            state.Save();
            WeatherService.Configure(state.Config);
            state.Signal();
            HttpIO.ReplyJson(r.stream, 200, new { ok = true, weatherLocation = WeatherService.PublicLocation(state.Config), revision = state.Sync.Revision });
        }
    }
}
