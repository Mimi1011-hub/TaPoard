using System;
using System.Collections.Generic;
using System.Web.Script.Serialization;

sealed class DeckController : ControllerBase
{
    internal DeckController(AppState state, IDesktop desktop) : base(state, desktop)
    {
    }

    internal void Register(ApiRouter<ApiRequest> api)
    {
        api.Get("/api/ping", ApiAccess.Paired, delegate(ApiRequest r) { HttpIO.Reply(r.stream, 200, HttpIO.JsonType, "{\"ok\":true}"); });
        api.Get("/api/state", ApiAccess.Paired, GetState);
        api.Get("/api/sync", ApiAccess.Paired, WaitForSync);
        api.Get("/api/settings", ApiAccess.Admin, GetSettings);
        api.Post("/api/settings", ApiAccess.Admin, SaveRequest);
    }
    void SaveRequest(ApiRequest r)
    {
        SaveSettings(r.json);
        HttpIO.Reply(r.stream, 200, HttpIO.JsonType, "{\"ok\":true}");
    }

    internal void GetState(ApiRequest r)
    {
        lock (state.Gate)
        {
            var inputSessions = UpdateRuntimeSessions(r, true, true);
            state.TouchPhone(r.local);
            // Skip the app list (with its icons) when the phone already has this version.
            var apps =
                HttpIO.QueryValue(r.target, "version") == state.Version
                    ? null
                    : state.Config.apps.ConvertAll(a => WidgetRegistry.PublicEntry(a));
            int landscapePages = DeckLayout.Pages(state.Config, "landscape"),
                portraitPages = DeckLayout.Pages(state.Config, "portrait");
            state.LandscapePage = Math.Max(0, Math.Min(state.LandscapePage, landscapePages - 1));
            state.PortraitPage = Math.Max(0, Math.Min(state.PortraitPage, portraitPages - 1));
            HttpIO.ReplyJson(
                r.stream,
                200,
                new
                {
                    apps = apps,
                    // Definitions are fixed per build, so they travel only with the app list.
                    widgetDefinitions = apps == null ? null : WidgetRegistry.PublicDefinitions(),
                    version = state.Version,
                    appVersion = state.AppVersion,
                    revision = state.Sync.Revision,
                    pairingRevision = Pairing.Revision,
                    landscapePage = state.LandscapePage,
                    portraitPage = state.PortraitPage,
                    landscapePages = landscapePages,
                    portraitPages = portraitPages,
                    page = state.LandscapePage,
                    pages = landscapePages,
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
                    computer = Environment.MachineName,
                    inputSessions = inputSessions,
                }
            );
        }
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

    internal void GetSettings(ApiRequest r)
    {
        lock (state.Gate)
        {
            var inputSessions = UpdateRuntimeSessions(r, true, true);
            int landscapePages = DeckLayout.Pages(state.Config, "landscape"),
                portraitPages = DeckLayout.Pages(state.Config, "portrait");
            string lanUrl = "http://" + state.Lan.HostName + ":" + AppState.Port + "/";
            string[] ipUrls = state.Lan.Urls(AppState.Port);
            string androidUrl = ipUrls.Length > 0 ? ipUrls[0] : lanUrl;
            string fragment = "#connect=" + Uri.EscapeDataString(state.Config.token);
            HttpIO.ReplyJson(
                r.stream,
                200,
                new
                {
                    token = state.Config.token,
                    qrUrl = androidUrl + fragment,
                    iphoneQrUrl = lanUrl + fragment,
                    androidQrUrl = androidUrl + fragment,
                    apps = state.Config.apps,
                    widgetDefinitions = WidgetRegistry.PublicDefinitions(),
                    version = state.Version,
                    appVersion = state.AppVersion,
                    revision = state.Sync.Revision,
                    pairingRevision = Pairing.Revision,
                    landscapePage = state.LandscapePage,
                    portraitPage = state.PortraitPage,
                    landscapePages = landscapePages,
                    portraitPages = portraitPages,
                    page = state.LandscapePage,
                    pages = landscapePages,
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
                    weatherLocation = WeatherService.PublicLocation(state.Config),
                    phoneConnected = state.PhoneConnected,
                    pcWindowOpen = PcWindowService.IsOpen,
                    background = DeckBackgrounds.Public(state.Config.background),
                    lanUrl = lanUrl,
                    ipUrls = ipUrls,
                    networkStatus = state.Lan.Status,
                    displaySubscriptionCount = DisplaySubscriptions.Current().sessions,
                    inputSessions = inputSessions,
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
        if (String.IsNullOrEmpty(viewId) || viewId.Length < 8 || viewId.Length > 64 || !System.Text.RegularExpressions.Regex.IsMatch(viewId, "\\A[a-zA-Z0-9_-]+\\z"))
            throw new Exception("表示セッションが正しくありません。");
        return Pairing.Hash(r.auth ?? r.remote.ToString()) + ":" + viewId;
    }

    internal void SaveSettings(string json)
    {
        var next = new JavaScriptSerializer().Deserialize<Settings>(json);
        if (next.apps == null || next.apps.Count > 80)
            throw new Exception("ボタンは縦・横それぞれ40個以内です");
        if (
            next.apps.FindAll(a => a.orientation == "landscape").Count > 40
            || next.apps.FindAll(a => a.orientation == "portrait").Count > 40
        )
            throw new Exception("ボタンは縦・横それぞれ40個以内です");
        foreach (var a in next.apps)
            ValidateEntry(a);
        lock (state.Gate)
        {
            KeepServerFields(next);
            DeckLayout.Migrate(next);
            DeckLayout.Validate(next);
            var ids = new HashSet<string>();
            foreach (var a in next.apps)
                if (!ids.Add(a.id))
                    throw new Exception("ボタンIDが重複しています。");
            state.Config = next;
            DisplaySubscriptions.RemoveUnknown(state.Config.apps);
            InputSessions.ClearAll();
            state.Save();
            state.Version = DeckView.NewId();
            state.LandscapePage = Math.Min(state.LandscapePage, DeckLayout.Pages(state.Config, "landscape") - 1);
            state.PortraitPage = Math.Min(state.PortraitPage, DeckLayout.Pages(state.Config, "portrait") - 1);
            state.Signal();
        }
    }

    internal void ValidateEntry(AppEntry a)
    {
        if (String.IsNullOrWhiteSpace(a.type))
            a.type = "app";
        WidgetDefinition definition = WidgetRegistry.Require(a.type);
        if (a.orientation != "landscape" && a.orientation != "portrait")
            throw new Exception("ボタンの画面方向が正しくありません。");
        if (String.IsNullOrWhiteSpace(a.name))
            throw new Exception("表示名を入力してください");
        // 3.1: a name may have line breaks, up to 3 lines.
        a.name = a.name.Replace("\r\n", "\n").Replace('\r', '\n').Trim();
        string[] lines = a.name.Split('\n');
        if (lines.Length > 3) a.name = lines[0] + "\n" + lines[1] + "\n" + String.Join(" ", lines, 2, lines.Length - 2);
        if (a.name.Length > 80)
            throw new Exception("表示名は80文字以内です");
        if (!IconPresets.ValidColor(a.iconColor))
            throw new Exception("アイコンの色が正しくありません");
        if (!IconPresets.Exists(a.iconKey))
            throw new Exception("登録されていないアイコンです");
        if (!IconPresets.ValidCustomIcon(a.customIcon))
            throw new Exception("オリジナルアイコンの形式またはサイズが正しくありません");
        if (String.IsNullOrEmpty(a.customIcon) || !IconPacks.ValidId(a.iconPack) || !IconPacks.ValidItemId(a.iconPackItem))
        {
            a.iconPack = null;
            a.iconPackItem = null;
        }
        if (DeckView.IsType(a, "audioDevice"))
        {
            var device = ResolveAudioDevice(a);
            a.type = "audioDevice";
            a.deviceName = device.name;
            a.category = "audio";
            a.path = "";
            a.args = "";
            a.url = "";
            a.text = "";
            a.action = null;
            a.icon = null;
        }
        else if (DeckView.IsType(a, "hotkey"))
        {
            if (!ShortcutKeys.Exists(a.action))
                throw new Exception("登録されていないショートカットです");
            ShortcutKeys.ValidateOverride(a.action, a.hotkey);
            a.path = "";
            a.args = "";
            a.url = "";
            a.text = "";
            a.icon = null;
        }
        else if (DeckView.IsType(a, "url"))
        {
            CustomActions.ValidateUrl(a.url);
            a.path = "";
            a.args = "";
            a.text = "";
            a.action = null;
            a.category = "custom";
            a.icon = null;
        }
        else if (DeckView.IsType(a, "clipboard"))
        {
            CustomActions.ValidateText(a.text);
            a.path = "";
            a.args = "";
            a.url = "";
            a.action = null;
            a.category = "custom";
            a.icon = null;
        }
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
        else if (DeckView.IsType(a, "app"))
        {
            a.type = "app";
            a.action = null;
            a.category = "app";
            a.url = "";
            a.text = "";
            if (!AppImporter.ValidPath(a.path))
                throw new Exception("実在するexe・ショートカットの絶対パスを指定してください");
            a.icon = StartApps.IsStartApp(a.path) ? StartApps.Icon(a.path) : AppIcons.Read(a.path);
        }
        else
            throw new Exception("登録されていない部品種類です。");
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

    internal void KeepServerFields(Settings next)
    {
        next.schemaVersion = state.Config.schemaVersion;
        next.token = state.Config.token;
        next.pairingKey = state.Config.pairingKey;
        next.columns = state.Config.columns;
        next.rows = state.Config.rows;
        next.landscapeColumns = state.Config.landscapeColumns;
        next.landscapeRows = state.Config.landscapeRows;
        next.portraitColumns = state.Config.portraitColumns;
        next.portraitRows = state.Config.portraitRows;
        next.keepAwake = state.Config.keepAwake;
        next.speakerSlot = state.Config.speakerSlot;
        next.micSlot = state.Config.micSlot;
        next.speakerSize = state.Config.speakerSize;
        next.micSize = state.Config.micSize;
        DeckLayout.SetControls(next, false, DeckLayout.GetControls(state.Config, false));
        DeckLayout.SetControls(next, true, DeckLayout.GetControls(state.Config, true));
        next.landscapeControlPages = state.Config.landscapeControlPages;
        next.portraitControlPages = state.Config.portraitControlPages;
        next.landscapeSpeakerOff = state.Config.landscapeSpeakerOff;
        next.landscapeMicOff = state.Config.landscapeMicOff;
        next.portraitSpeakerOff = state.Config.portraitSpeakerOff;
        next.portraitMicOff = state.Config.portraitMicOff;
        next.devices = state.Config.devices;
        next.pageCount = state.Config.pageCount;
        next.landscapePageCount = state.Config.landscapePageCount;
        next.portraitPageCount = state.Config.portraitPageCount;
        next.weatherName = state.Config.weatherName;
        next.weatherLatitude = state.Config.weatherLatitude;
        next.weatherLongitude = state.Config.weatherLongitude;
        next.weatherTimezone = state.Config.weatherTimezone;
        next.pcWindow = state.Config.pcWindow;
        next.background = state.Config.background;
    }
}
