using System;
using System.Collections.Generic;

partial class Program
{
    static readonly ApiRouter<Request> api = BuildApi();

    static ApiRouter<Request> BuildApi()
    {
        var api = new ApiRouter<Request>();

        // Pairing.
        api.Post("/api/pair/start", ApiAccess.Open, PairStart);
        api.Get("/api/pair/status", ApiAccess.Open, PairStatus);
        api.Get("/api/pair/manage", ApiAccess.Admin, GetPairingManagement);
        api.Post("/api/pair/manage", ApiAccess.Admin, delegate(Request r) { ManagePairing(r, r.input); });

        // Screen state and synchronization.
        api.Get("/api/ping", ApiAccess.Paired, Ping);
        api.Get("/api/state", ApiAccess.Paired, GetState);
        api.Get("/api/sync", ApiAccess.Paired, WaitForSync);

        // Pages and placement.
        api.Post("/api/page", ApiAccess.Paired, delegate(Request r) { SetPage(r, r.input); });
        api.Post("/api/page/move", ApiAccess.Admin, delegate(Request r) { MovePage(r, r.input); });
        api.Post("/api/page/delete", ApiAccess.Admin, delegate(Request r) { DeletePage(r, r.input); });
        api.Post("/api/page/undo", ApiAccess.Admin, UndoDeletePage);
        api.Post("/api/fader/remove", ApiAccess.Admin, delegate(Request r) { RemoveFader(r, r.input); });
        api.Post("/api/layout", ApiAccess.Paired, delegate(Request r) { SetLayout(r, r.input); });

        // Button appearance: backgrounds, icon packs, saved looks, presets and backups.
        api.Get("/api/background/image", ApiAccess.Paired, GetBackgroundImage);
        api.Get("/api/icon-packs", ApiAccess.Admin, GetIconPacks);
        api.Get("/api/icon-packs/get", ApiAccess.Admin, GetIconPack);
        api.Get("/api/backups", ApiAccess.Admin, GetBackups);
        api.Get("/api/presets", ApiAccess.Admin, GetPresets);
        api.Get("/api/icon-styles", ApiAccess.Admin, GetIconStyles);
        api.Post("/api/backups/restore", ApiAccess.Admin, delegate(Request r) { RestoreBackup(r, r.input); });
        api.Post("/api/presets/apply", ApiAccess.Admin, delegate(Request r) { ApplyPreset(r, r.input); });
        api.PostPrefix("/api/background", ApiAccess.Admin, delegate(Request r) { SetBackground(r, r.path, r.input, r.json); });
        api.PostPrefix("/api/icon-styles/", ApiAccess.Admin, delegate(Request r) { IconStyleAction(r, r.path.Substring("/api/icon-styles/".Length), r.input); });
        api.PostPrefix("/api/icon-packs/", ApiAccess.Admin, delegate(Request r) { IconPackAction(r, r.path.Substring("/api/icon-packs/".Length), r.input, r.json); });

        // Input and actions.
        api.Get("/api/devices", ApiAccess.Admin, GetDevices);
        api.Post("/api/audio", ApiAccess.Paired, delegate(Request r) { SetAudio(r, r.input); });
        api.Post("/api/view", ApiAccess.Paired, UpdateView);
        api.Post("/api/input", ApiAccess.Paired, SendInput);
        api.Post("/api/input/keepalive", ApiAccess.Paired, KeepInputAlive);
        api.Post("/api/input/release", ApiAccess.Paired, ReleaseInput);
        api.Post("/api/action", ApiAccess.Paired, delegate(Request r) { RunAction(r, r.input); });

        // PC window and firewall.
        api.Get("/api/pc-window", ApiAccess.Admin, GetPcWindow);
        api.Get("/api/firewall", ApiAccess.Admin, GetFirewall);
        api.Post("/api/pc-window", ApiAccess.Admin, delegate(Request r) { SavePcWindow(r, r.input); });
        api.Post("/api/pc-window/open", ApiAccess.Admin, OpenPcWindowRequest);
        api.Post("/api/firewall/repair", ApiAccess.Admin, RepairFirewall);

        // Other: weather, slideshow, import and keys.
        api.Get("/api/settings", ApiAccess.Admin, GetSettings);
        api.Get("/api/import", ApiAccess.Admin, GetImportStatus);
        api.Get("/api/slideshow", ApiAccess.Paired, GetSlideshow);
        api.Post("/api/import", ApiAccess.Admin, StartImport);
        api.Post("/api/slideshow/pick-folder", ApiAccess.Admin, PickSlideshowFolder);
        api.Post("/api/weather/search", ApiAccess.Admin, SearchWeather);
        api.Post("/api/weather/location", ApiAccess.Admin, delegate(Request r) { SetWeatherLocation(r, r.input); });
        api.Post("/api/settings", ApiAccess.Admin, SaveSettingsRequest);
        api.Post("/api/rotate", ApiAccess.Admin, RotateKeysRequest);

        return api;
    }

    static void GetPairingManagement(Request r)
    {
        lock (Gate)
            ReplyJson(r.stream, 200, Pairing.View(config));
    }

    static void Ping(Request r)
    {
        Reply(r.stream, 200, JsonType, "{\"ok\":true}");
    }

    static void GetImportStatus(Request r)
    {
        lock (Gate)
            ReplyJson(r.stream, 200, new { id = importId, result = importResult });
    }

    static void GetDevices(Request r)
    {
        ReplyJson(r.stream, 200, new { devices = AudioDevices.List() });
    }

    static void GetPcWindow(Request r)
    {
        ReplyJson(r.stream, 200, PcWindowView());
    }

    static void GetBackgroundImage(Request r)
    {
        string image;
        lock (Gate)
            image = DeckBackgrounds.ImageData(Data, config.background);
        Reply(r.stream, 200, JsonType, "{\"data\":" + (image == null ? "null" : "\"" + image + "\"") + "}");
    }

    static void GetIconPacks(Request r)
    {
        ReplyJson(r.stream, 200, new { packs = IconPacks.List(Data), maxPacks = IconPacks.MaxPacks, maxIcons = IconPacks.MaxIcons });
    }

    static void GetIconPack(Request r)
    {
        Reply(r.stream, 200, JsonType, IconPacks.Serializer().Serialize(IconPacks.Get(Data, QueryValue(r.target, "id"))));
    }

    static void GetBackups(Request r)
    {
        ReplyJson(r.stream, 200, new { backups = store.ListBackups() });
    }

    static void GetPresets(Request r)
    {
        ReplyJson(r.stream, 200, new { presets = DeckPresets.Public() });
    }

    static void GetIconStyles(Request r)
    {
        ReplyJson(r.stream, 200, new { styles = IconStyles.List(Data), maxStyles = IconStyles.MaxStyles });
    }

    static void GetSlideshow(Request r)
    {
        // Any paired device may read pictures, but only from a folder set on a slideshow widget.
        string id = QueryValue(r.target, "id"), folder = null;
        int index;
        Int32.TryParse(QueryValue(r.target, "index"), out index);
        lock (Gate)
        {
            var app = config.apps.Find(a => a.id == id && IsType(a, "slideshow"));
            object raw;
            if (app != null && app.options != null && app.options.TryGetValue("folder", out raw)) folder = raw as string;
            if (app == null) { Reply(r.stream, 404, JsonType, "{\"error\":\"スライドショーが見つかりません。\"}"); return; }
        }
        ReplyJson(r.stream, 200, Slideshow.Picture(folder, index));
    }

    static void GetFirewall(Request r)
    {
        ReplyJson(r.stream, 200, FirewallCheck.Status(Root));
    }

    static void PickSlideshowFolder(Request r)
    {
        object start;
        string chosen = Slideshow.PickFolder(r.input.TryGetValue("folder", out start) ? Convert.ToString(start) : "");
        ReplyJson(r.stream, 200, new { folder = chosen ?? "", picked = chosen != null, count = chosen == null ? 0 : Slideshow.Files(chosen).Length });
    }

    static void SearchWeather(Request r)
    {
        ReplyJson(r.stream, 200, new { results = WeatherService.Search(Convert.ToString(r.input["query"])) });
    }

    static void UpdateView(Request r)
    {
        object rawViewId;
        if (!r.input.TryGetValue("viewId", out rawViewId))
            throw new Exception("表示セッションが正しくありません。");
        string viewId = Convert.ToString(rawViewId);
        var visible = new List<string>();
        object rawVisible;
        if (r.input.TryGetValue("visibleIds", out rawVisible))
        {
            var list = rawVisible as System.Collections.IEnumerable;
            if (list == null || rawVisible is string || rawVisible is Dictionary<string, object>)
                throw new Exception("表示部品が正しくありません。");
            foreach (object id in list) visible.Add(Convert.ToString(id));
        }
        InputSessions.PublicSession[] sessions;
        lock (Gate)
        {
            sessions = UpdateRuntimeSessions(r, viewId, visible.ToArray(), true, true);
            TouchPhone(r.local);
        }
        ReplyJson(r.stream, 200, new { ok = true, inputSessions = sessions });
    }

    static void SendInput(Request r)
    {
        object rawSession, rawView, rawSequence, rawEvents;
        if (!r.input.TryGetValue("sessionId", out rawSession) || !r.input.TryGetValue("viewId", out rawView)
            || !r.input.TryGetValue("sequence", out rawSequence) || !r.input.TryGetValue("events", out rawEvents))
            throw new Exception("入力要求が正しくありません。");
        string owner = ViewIdentity(r, Convert.ToString(rawView));
        PcWindowService.YieldFocus();
        var ack = InputSessions.Execute(
            owner,
            Convert.ToString(rawSession),
            Convert.ToInt32(rawSequence),
            InputSessions.ParseEvents(rawEvents)
        );
        ReplyJson(r.stream, 200, ack);
    }

    static void KeepInputAlive(Request r)
    {
        ChangeInputLease(r, true);
    }

    static void ReleaseInput(Request r)
    {
        ChangeInputLease(r, false);
    }

    static void ChangeInputLease(Request r, bool keepalive)
    {
        object rawSession, rawView;
        if (!r.input.TryGetValue("sessionId", out rawSession) || !r.input.TryGetValue("viewId", out rawView))
            throw new Exception("入力要求が正しくありません。");
        string owner = ViewIdentity(r, Convert.ToString(rawView));
        if (keepalive) InputSessions.Keepalive(owner, Convert.ToString(rawSession));
        else InputSessions.Release(owner, Convert.ToString(rawSession));
        Reply(r.stream, 200, JsonType, "{\"ok\":true}");
    }

    static void SaveSettingsRequest(Request r)
    {
        SaveSettings(r.json);
        Reply(r.stream, 200, JsonType, "{\"ok\":true}");
    }

    static void RotateKeysRequest(Request r)
    {
        RotateKeys();
        Reply(r.stream, 200, JsonType, "{\"ok\":true}");
    }

    static void OpenPcWindowRequest(Request r)
    {
        object full;
        OpenPcWindow(r.input.TryGetValue("fullscreen", out full) && Convert.ToBoolean(full));
        ReplyJson(r.stream, 200, PcWindowView());
    }

    static void RepairFirewall(Request r)
    {
        FirewallCheck.StartRepair(Root);
        ReplyJson(r.stream, 200, FirewallCheck.Status(Root));
    }
}
