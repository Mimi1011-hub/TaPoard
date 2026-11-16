using System;
using System.Collections.Generic;
using System.Web.Script.Serialization;

sealed class DeckRuntimeState
{
    internal long revision;
    internal string version;
    internal string appVersion;
    internal string computer;
    internal int landscapePage;
    internal int portraitPage;
    internal int landscapePages;
    internal int portraitPages;
    internal object audio;
    internal object metrics;
    internal object weather;
    internal bool phoneConnected;
    internal bool pcWindowOpen;
    internal object background;
    internal InputSessions.PublicSession[] inputSessions;
}

sealed class DeckV3SaveRequest
{
    public string baseVersion { get; set; }
    public DeckV3 deck { get; set; }
}

sealed class DeckController : ControllerBase
{
    internal DeckController(AppState state, IDesktop desktop) : base(state, desktop)
    {
    }

    internal void Register(ApiRouter<ApiRequest> api)
    {
        api.Get("/api/ping", ApiAccess.Paired, delegate(ApiRequest r) { HttpIO.Reply(r.stream, 200, HttpIO.JsonType, "{\"ok\":true}"); });
        api.Get("/api/v3/state", ApiAccess.Paired, GetV3State);
        api.Get("/api/v3/deck", ApiAccess.Admin, GetV3Deck);
        api.Get("/api/sync", ApiAccess.Paired, WaitForSync);
        api.Post("/api/v3/deck", ApiAccess.Admin, SaveV3Request);
    }

    internal void GetV3Deck(ApiRequest r)
    {
        lock (state.Gate)
        {
            HttpIO.ReplyJson(r.stream, 200, new
            {
                schemaVersion = 3,
                version = state.Version,
                deck = SettingsMigration.ToV3(state.Config).deck,
                widgetDefinitions = WidgetRegistry.PublicDefinitions(),
            });
        }
    }

    internal void SaveV3Request(ApiRequest r)
    {
        var request = new JavaScriptSerializer { MaxJsonLength = int.MaxValue }.Deserialize<DeckV3SaveRequest>(r.json);
        lock (state.Gate)
        {
            if (request == null || request.baseVersion != state.Version)
            {
                HttpIO.ReplyJson(r.stream, 409, new { error = Text.Get("source.deckcontroller.1"), version = state.Version });
                return;
            }
            Settings next = DeckV3Validator.Validate(request.deck, state.Config, this);
            KeepGlobalServerFields(next);
            KeepServerItemFields(next);
            CommitSettings(next, true);
            HttpIO.ReplyJson(r.stream, 200, new { ok = true, version = state.Version });
        }
    }
    internal void GetV3State(ApiRequest r)
    {
        lock (state.Gate)
        {
            DeckRuntimeState runtime = CaptureRuntime(r);
            bool unchanged = HttpIO.QueryValue(r.target, "version") == state.Version;
            var response = new Dictionary<string, object>();
            response["schemaVersion"] = 3;
            response["revision"] = runtime.revision;
            response["version"] = runtime.version;
            response["appVersion"] = runtime.appVersion;
            response["computer"] = runtime.computer;
            if (!unchanged)
            {
                SettingsV3 settings = SettingsMigration.ToV3(state.Config);
                response["deck"] = PublicDeckV3.Create(settings.deck);
                response["widgetDefinitions"] = WidgetRegistry.PublicDefinitions();
            }
            response["current"] = new { landscape = runtime.landscapePage, portrait = runtime.portraitPage };
            response["background"] = runtime.background;
            response["audio"] = runtime.audio;
            response["metrics"] = runtime.metrics;
            response["weather"] = runtime.weather;
            response["phoneConnected"] = runtime.phoneConnected;
            response["pcWindowOpen"] = runtime.pcWindowOpen;
            response["inputSessions"] = runtime.inputSessions;
            response["pcLanguage"] = Text.Language;
            HttpIO.ReplyJson(r.stream, 200, response);
        }
    }

    DeckRuntimeState CaptureRuntime(ApiRequest r)
    {
        int viewportWidth, viewportHeight;
        if (!r.local && Int32.TryParse(HttpIO.QueryValue(r.target, "viewportWidth"), out viewportWidth)
            && Int32.TryParse(HttpIO.QueryValue(r.target, "viewportHeight"), out viewportHeight)
            && Pairing.UpdateViewport(state.Config, r.auth, viewportWidth, viewportHeight)) state.Save();
        var inputSessions = UpdateRuntimeSessions(r, true, true);
        state.TouchPhone(r.local);
        int landscapePages = DeckLayout.Pages(state.Config, "landscape");
        int portraitPages = DeckLayout.Pages(state.Config, "portrait");
        state.LandscapePage = Math.Max(0, Math.Min(state.LandscapePage, landscapePages - 1));
        state.PortraitPage = Math.Max(0, Math.Min(state.PortraitPage, portraitPages - 1));
        return new DeckRuntimeState
        {
            revision = state.Sync.Revision,
            version = state.Version,
            appVersion = state.AppVersion,
            computer = Environment.MachineName,
            landscapePage = state.LandscapePage,
            portraitPage = state.PortraitPage,
            landscapePages = landscapePages,
            portraitPages = portraitPages,
            audio = AudioControl.Read(),
            metrics = MetricsSampler.PublicSnapshot(),
            weather = WeatherService.PublicSnapshot(state.Config),
            phoneConnected = state.PhoneConnected,
            pcWindowOpen = PcWindowService.IsOpen,
            background = DeckBackgrounds.Public(state.Config.background),
            inputSessions = inputSessions,
        };
    }

    internal void WaitForSync(ApiRequest r)
    {
        long known;
        long.TryParse(HttpIO.QueryValue(r.target, "revision"), out known);
        lock (state.Gate)
        {
            state.TouchPhone(r.local);
            state.Sync.Wait(known, 15000);
            // The visible IDs were sent before the wait and may be stale: only renew, never re-plan.
            RenewRuntimeSessions(r);
            if (!r.local)
                state.Sync.MarkPhoneSeen();
            HttpIO.ReplyJson(
                r.stream,
                200,
                new
                {
                    revision = state.Sync.Revision,
                    pairingRevision = Pairing.Revision,
                    landscapePage = state.LandscapePage,
                    portraitPage = state.PortraitPage,
                    landscapePages = DeckLayout.Pages(state.Config, "landscape"),
                    portraitPages = DeckLayout.Pages(state.Config, "portrait"),
                    version = state.Version,
                    appVersion = state.AppVersion,
                    columns = state.Config.columns,
                    rows = state.Config.rows,
                    landscapeGrid = DeckView.Grid(state.Config, false),
                    portraitGrid = DeckView.Grid(state.Config, true),
                    keepAwake = state.Config.keepAwake,
                    speakerSlot = state.Config.speakerSlot,
                    micSlot = state.Config.micSlot,
                    speakerSize = state.Config.speakerSize,
                    micSize = state.Config.micSize,
                    landscapeControls = DeckView.Controls(state.Config, false),
                    portraitControls = DeckView.Controls(state.Config, true),
                    landscapeControlPages = DeckView.ControlPages(state.Config, false),
                    portraitControlPages = DeckView.ControlPages(state.Config, true),
                    audio = AudioControl.Read(),
                    metrics = MetricsSampler.PublicSnapshot(),
                    weather = WeatherService.PublicSnapshot(state.Config),
                    phoneConnected = state.PhoneConnected,
                    pcWindowOpen = PcWindowService.IsOpen,
                    background = DeckBackgrounds.Public(state.Config.background),
                }
            );
        }
    }

    internal InputSessions.PublicSession[] UpdateRuntimeSessions(ApiRequest r, bool renewMetrics, bool renewWeather)
    {
        string viewId = HttpIO.QueryValue(r.target, "viewId");
        if (String.IsNullOrEmpty(viewId)) return new InputSessions.PublicSession[0];
        string raw = HttpIO.QueryValue(r.target, "visibleIds") ?? "";
        return UpdateRuntimeSessions(r, viewId, raw.Length == 0 ? new string[0] : raw.Split(','), renewMetrics, renewWeather);
    }

    internal InputSessions.PublicSession[] UpdateRuntimeSessions(ApiRequest r, string viewId, string[] ids, bool renewMetrics, bool renewWeather)
    {
        string identity = ViewIdentity(r, viewId);
        DisplaySubscriptions.Update(identity, state.Config.apps, ids, renewMetrics, renewWeather);
        return InputSessions.Prepare(identity, state.Config.apps, ids);
    }

    internal void RenewRuntimeSessions(ApiRequest r)
    {
        string viewId = HttpIO.QueryValue(r.target, "viewId");
        if (String.IsNullOrEmpty(viewId)) return;
        string raw = HttpIO.QueryValue(r.target, "visibleIds") ?? "";
        string identity = ViewIdentity(r, viewId);
        DisplaySubscriptions.Update(identity, state.Config.apps, raw.Length == 0 ? new string[0] : raw.Split(','), false, true);
        DisplaySubscriptions.Touch(identity);
        InputSessions.Touch(identity);
    }

    internal string ViewIdentity(ApiRequest r, string viewId)
    {
        if (String.IsNullOrEmpty(viewId) || viewId.Length < 8 || viewId.Length > 64
            || !System.Text.RegularExpressions.Regex.IsMatch(viewId, "\\A[a-zA-Z0-9_-]+\\z"))
            throw new Exception(Text.Get("source.deckcontroller.2"));
        return Pairing.Hash(r.auth ?? r.remote.ToString()) + ":" + viewId;
    }

    internal void ValidateEntry(AppEntry a)
    {
        if (a.steps != null)
            throw new Exception(Text.Get("source.deckcontroller.6"));
        if (String.IsNullOrWhiteSpace(a.type))
            a.type = "app";
        WidgetDefinition definition = WidgetRegistry.Require(a.type);
        if (a.orientation != "landscape" && a.orientation != "portrait")
            throw new Exception(Text.Get("source.deckcontroller.7"));
        if (String.IsNullOrWhiteSpace(a.name))
            throw new Exception(Text.Get("source.deckcontroller.8"));
        // 3.1: a name may have line breaks, up to 3 lines.
        a.name = a.name.Replace("\r\n", "\n").Replace('\r', '\n').Trim();
        string[] lines = a.name.Split('\n');
        if (lines.Length > 3) a.name = lines[0] + "\n" + lines[1] + "\n" + String.Join(" ", lines, 2, lines.Length - 2);
        if (a.name.Length > 80)
            throw new Exception(Text.Get("source.deckcontroller.9"));
        if (!IconPresets.ValidColor(a.iconColor))
            throw new Exception(Text.Get("source.deckcontroller.10"));
        if (!IconPresets.Exists(a.iconKey))
            throw new Exception(Text.Get("source.deckcontroller.11"));
        if (!IconPresets.ValidCustomIcon(a.customIcon))
            throw new Exception(Text.Get("source.deckcontroller.12"));
        if (String.IsNullOrEmpty(a.customIcon) || !IconPacks.ValidId(a.iconPack) || !IconPacks.ValidItemId(a.iconPackItem))
        {
            a.iconPack = null;
            a.iconPackItem = null;
        }
        if (ActionSteps.IsActionType(a.type))
            ActionSteps.ValidateEntryAction(a, ResolveAudioDevice, true);
        else if (definition.displayOnly)
        {
            a.path = "";
            a.args = "";
            a.url = "";
            a.text = "";
            a.action = null;
            a.category = "widget";
            a.deviceId = null;
            a.deviceTarget = null;
            a.deviceName = null;
            a.icon = null;
        }
        else
            throw new Exception(Text.Get("source.deckcontroller.13"));
        WidgetRegistry.ValidateAndNormalize(a);
        if (String.IsNullOrEmpty(a.id) || !state.Config.apps.Exists(old => old.id == a.id))
            a.id = DeckView.NewId();
    }

    internal AudioDeviceInfo ResolveAudioDevice(AppEntry a)
    {
        try
        {
            return AudioDevices.Validate(a.deviceTarget, a.deviceId);
        }
        catch
        {
            AppEntry previous;
            lock (state.Gate)
                previous = state.Config.apps.Find(old =>
                    old.type == "audioDevice" && old.deviceId == a.deviceId && old.deviceTarget == a.deviceTarget
                );
            if (previous == null)
                throw;
            return new AudioDeviceInfo
            {
                id = previous.deviceId,
                target = previous.deviceTarget,
                name = previous.deviceName,
            };
        }
    }

    internal void KeepGlobalServerFields(Settings next)
    {
        next.schemaVersion = state.Config.schemaVersion;
        next.token = state.Config.token;
        next.devices = state.Config.devices;
        next.weatherName = state.Config.weatherName;
        next.weatherLatitude = state.Config.weatherLatitude;
        next.weatherLongitude = state.Config.weatherLongitude;
        next.weatherTimezone = state.Config.weatherTimezone;
        next.pcWindow = state.Config.pcWindow;
        next.background = state.Config.background;
    }

    internal void KeepServerItemFields(Settings next)
    {
        foreach (AppEntry item in next.apps)
        {
            AppEntry previous = state.Config.apps.Find(old => old.id == item.id);
            if (previous == null || !String.Equals(previous.type, item.type, StringComparison.OrdinalIgnoreCase)) continue;
            if (DeckView.IsType(item, "app") && previous.path == item.path) item.icon = previous.icon;
            if (DeckView.IsType(item, "audioDevice") && previous.deviceId == item.deviceId && previous.deviceTarget == item.deviceTarget)
                item.deviceName = previous.deviceName;
        }
    }

    internal void CommitSettings(Settings next, bool clearPageUndo)
    {
        DeckView.NormalizeControlSlots(next);
        state.Config = next;
        DisplaySubscriptions.RemoveUnknown(state.Config.apps);
        InputSessions.ClearAll();
        state.Save();
        state.Version = DeckView.NewId();
        state.LandscapePage = Math.Min(state.LandscapePage, DeckLayout.Pages(state.Config, "landscape") - 1);
        state.PortraitPage = Math.Min(state.PortraitPage, DeckLayout.Pages(state.Config, "portrait") - 1);
        if (clearPageUndo) state.Undo.Clear();
        state.Signal();
    }
}
