using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Web.Script.Serialization;

// /api/* endpoints. Every handler runs on a thread-pool thread; an exception becomes a 400 reply.
partial class Program
{
    static void Route(Request r)
    {
        var s = r.stream;
        string path = r.path,
            method = r.method;

        // Pairing works before the phone has a key.
        if (path == "/api/pair/start" && method == "POST")
        {
            PairStart(r);
            return;
        }
        if (path == "/api/pair/status" && method == "GET")
        {
            PairStatus(r);
            return;
        }
        if (path == "/api/pair/manage" && method == "GET" && r.isAdmin)
        {
            lock (Gate)
                ReplyJson(s, 200, Pairing.View(config));
            return;
        }
        if (!r.allowed)
        {
            Reply(s, 401, JsonType, "{\"error\":\"接続キーを確認してください\"}");
            return;
        }

        if (path == "/api/ping" && method == "GET")
        {
            Reply(s, 200, JsonType, "{\"ok\":true}");
            return;
        }
        if (path == "/api/state" && method == "GET")
        {
            GetState(r);
            return;
        }
        if (path == "/api/sync" && method == "GET")
        {
            WaitForSync(r);
            return;
        }
        if (path == "/api/settings" && method == "GET" && r.isAdmin)
        {
            GetSettings(r);
            return;
        }
        if (path == "/api/import" && r.isAdmin && method == "GET")
        {
            lock (Gate)
                ReplyJson(s, 200, new { id = importId, result = importResult });
            return;
        }
        if (path == "/api/devices" && method == "GET" && r.isAdmin)
        {
            ReplyJson(s, 200, new { devices = AudioDevices.List() });
            return;
        }
        if (path == "/api/pc-window" && method == "GET" && r.isAdmin)
        {
            ReplyJson(s, 200, PcWindowView());
            return;
        }
        if (path == "/api/background/image" && method == "GET")
        {
            string image;
            lock (Gate)
                image = DeckBackgrounds.ImageData(Data, config.background);
            Reply(s, 200, JsonType, "{\"data\":" + (image == null ? "null" : "\"" + image + "\"") + "}");
            return;
        }
        if (path == "/api/icon-packs" && method == "GET" && r.isAdmin)
        {
            ReplyJson(s, 200, new { packs = IconPacks.List(Data), maxPacks = IconPacks.MaxPacks, maxIcons = IconPacks.MaxIcons });
            return;
        }
        if (path == "/api/icon-packs/get" && method == "GET" && r.isAdmin)
        {
            Reply(s, 200, JsonType, IconPacks.Serializer().Serialize(IconPacks.Get(Data, QueryValue(r.target, "id"))));
            return;
        }
        if (path == "/api/backups" && method == "GET" && r.isAdmin)
        {
            ReplyJson(s, 200, new { backups = SettingsBackups.List(Data) });
            return;
        }
        if (path == "/api/presets" && method == "GET" && r.isAdmin)
        {
            ReplyJson(s, 200, new { presets = DeckPresets.Public() });
            return;
        }
        if (path == "/api/icon-styles" && method == "GET" && r.isAdmin)
        {
            ReplyJson(s, 200, new { styles = IconStyles.List(Data), maxStyles = IconStyles.MaxStyles });
            return;
        }
        if (path == "/api/slideshow" && method == "GET")
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
                if (app == null) { Reply(s, 404, JsonType, "{\"error\":\"スライドショーが見つかりません。\"}"); return; }
            }
            ReplyJson(s, 200, Slideshow.Picture(folder, index));
            return;
        }
        if (path == "/api/firewall" && method == "GET" && r.isAdmin)
        {
            ReplyJson(s, 200, FirewallCheck.Status(Root));
            return;
        }
        if (method != "POST")
        {
            Reply(s, 404, JsonType, "{}");
            return;
        }

        var input = ReadInput(s, r.headers);
        string json = Json(input);
        if (path == "/api/pair/manage" && r.isAdmin)
            ManagePairing(r, input);
        else if (path == "/api/import" && r.isAdmin)
            StartImport(r);
        else if (path == "/api/page")
            SetPage(r, input);
        else if (path.StartsWith("/api/background", StringComparison.Ordinal) && r.isAdmin)
            SetBackground(r, path, input, json);
        else if (path == "/api/page/delete" && r.isAdmin)
            DeletePage(r, input);
        else if (path == "/api/backups/restore" && r.isAdmin)
            RestoreBackup(r, input);
        else if (path == "/api/fader/remove" && r.isAdmin)
            RemoveFader(r, input);
        else if (path == "/api/slideshow/pick-folder" && r.isAdmin)
        {
            object start;
            string chosen = Slideshow.PickFolder(input.TryGetValue("folder", out start) ? Convert.ToString(start) : "");
            ReplyJson(r.stream, 200, new { folder = chosen ?? "", picked = chosen != null, count = chosen == null ? 0 : Slideshow.Files(chosen).Length });
        }
        else if (path == "/api/presets/apply" && r.isAdmin)
            ApplyPreset(r, input);
        else if (path == "/api/page/undo" && r.isAdmin)
            UndoDeletePage(r);
        else if (path == "/api/layout")
            SetLayout(r, input);
        else if (path == "/api/audio")
            SetAudio(r, input);
        else if (path == "/api/weather/search" && r.isAdmin)
            ReplyJson(s, 200, new { results = WeatherService.Search(Convert.ToString(input["query"])) });
        else if (path == "/api/weather/location" && r.isAdmin)
            SetWeatherLocation(r, input);
        else if (path == "/api/view")
        {
            object rawViewId;
            if (!input.TryGetValue("viewId", out rawViewId))
                throw new Exception("表示セッションが正しくありません。");
            string viewId = Convert.ToString(rawViewId);
            var visible = new List<string>();
            object rawVisible;
            if (input.TryGetValue("visibleIds", out rawVisible))
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
            ReplyJson(s, 200, new { ok = true, inputSessions = sessions });
        }
        else if (path == "/api/input")
        {
            object rawSession, rawView, rawSequence, rawEvents;
            if (!input.TryGetValue("sessionId", out rawSession) || !input.TryGetValue("viewId", out rawView)
                || !input.TryGetValue("sequence", out rawSequence) || !input.TryGetValue("events", out rawEvents))
                throw new Exception("入力要求が正しくありません。");
            string owner = ViewIdentity(r, Convert.ToString(rawView));
            PcWindowService.YieldFocus();
            var ack = InputSessions.Execute(
                owner,
                Convert.ToString(rawSession),
                Convert.ToInt32(rawSequence),
                InputSessions.ParseEvents(rawEvents)
            );
            ReplyJson(s, 200, ack);
        }
        else if (path == "/api/input/keepalive" || path == "/api/input/release")
        {
            object rawSession, rawView;
            if (!input.TryGetValue("sessionId", out rawSession) || !input.TryGetValue("viewId", out rawView))
                throw new Exception("入力要求が正しくありません。");
            string owner = ViewIdentity(r, Convert.ToString(rawView));
            if (path == "/api/input/keepalive") InputSessions.Keepalive(owner, Convert.ToString(rawSession));
            else InputSessions.Release(owner, Convert.ToString(rawSession));
            Reply(s, 200, JsonType, "{\"ok\":true}");
        }
        else if (path == "/api/settings" && r.isAdmin)
        {
            SaveSettings(json);
            Reply(s, 200, JsonType, "{\"ok\":true}");
        }
        else if (path.StartsWith("/api/icon-styles/", StringComparison.Ordinal) && r.isAdmin)
            IconStyleAction(r, path.Substring("/api/icon-styles/".Length), input);
        else if (path.StartsWith("/api/icon-packs/", StringComparison.Ordinal) && r.isAdmin)
            IconPackAction(r, path.Substring("/api/icon-packs/".Length), input, json);
        else if (path == "/api/rotate" && r.isAdmin)
        {
            RotateKeys();
            Reply(s, 200, JsonType, "{\"ok\":true}");
        }
        else if (path == "/api/action")
            RunAction(r, input);
        else if (path == "/api/pc-window" && r.isAdmin)
            SavePcWindow(r, input);
        else if (path == "/api/pc-window/open" && r.isAdmin)
        {
            object full;
            OpenPcWindow(input.TryGetValue("fullscreen", out full) && Convert.ToBoolean(full));
            ReplyJson(s, 200, PcWindowView());
        }
        else if (path == "/api/firewall/repair" && r.isAdmin)
        {
            FirewallCheck.StartRepair(Root);
            ReplyJson(s, 200, FirewallCheck.Status(Root));
        }
        else
            Reply(s, 403, JsonType, "{}");
    }

    static void PairStart(Request r)
    {
        var request = ReadInput(r.stream, r.headers);
        lock (Gate)
        {
            var p = Pairing.Start(Convert.ToString(request["name"]), r.remote.ToString());
            Signal();
            ReplyJson(
                r.stream,
                200,
                new
                {
                    id = p.id,
                    secret = p.secret,
                    code = p.code,
                    expires = p.expires.ToString("o"),
                }
            );
        }
    }

    static void PairStatus(Request r)
    {
        string secret = r.auth != null && r.auth.StartsWith("Bearer ") ? r.auth.Substring(7) : null;
        lock (Gate)
            ReplyJson(r.stream, 200, Pairing.Poll(QueryValue(r.target, "id"), secret));
    }

    static void ManagePairing(Request r, Dictionary<string, object> input)
    {
        lock (Gate)
        {
            string id = Convert.ToString(input["id"]);
            if (input.ContainsKey("revoke"))
            {
                Pairing.Revoke(config, id);
                DisplaySubscriptions.ClearAll();
                InputSessions.ClearAll();
            }
            else
                Pairing.Decide(config, id, Convert.ToString(input["code"]), Convert.ToBoolean(input["approve"]));
            Save();
            Signal();
            ReplyJson(r.stream, 200, Pairing.View(config));
        }
    }

    // Call while holding Gate. Requests from other devices count as the phone being connected.
    static void TouchPhone(bool localRequest)
    {
        bool was = PhoneConnected();
        if (!localRequest)
        {
            phoneLastSeen = DateTime.UtcNow;
            if (!was)
                Signal();
        }
    }

    class IconPackAddRequest
    {
        public string id { get; set; }
        public List<IconPackItem> icons { get; set; }
    }

    // 3.1 icon pack create/add/rename/delete. Packs live beside the settings in data\icon-packs.
    static void IconPackAction(Request r, string action, Dictionary<string, object> input, string json)
    {
        object raw;
        string id = input.TryGetValue("id", out raw) ? Convert.ToString(raw) : null;
        string name = input.TryGetValue("name", out raw) ? Convert.ToString(raw) : null;
        string author = input.TryGetValue("author", out raw) ? Convert.ToString(raw) : null;
        if (action == "create")
            ReplyJson(r.stream, 200, new { ok = true, id = IconPacks.Create(Data, name, author) });
        else if (action == "add")
        {
            var request = IconPacks.Serializer().Deserialize<IconPackAddRequest>(json);
            ReplyJson(r.stream, 200, new { ok = true, count = IconPacks.Add(Data, request.id, request.icons) });
        }
        else if (action == "rename")
        {
            IconPacks.Rename(Data, id, name, author);
            ReplyJson(r.stream, 200, new { ok = true });
        }
        else if (action == "delete")
        {
            IconPacks.Delete(Data, id);
            ReplyJson(r.stream, 200, new { ok = true });
        }
        else
            Reply(r.stream, 404, JsonType, "{}");
    }

    // 3.1 saved looks: save the current icons and background, put one back, rename or delete one.
    static void IconStyleAction(Request r, string action, Dictionary<string, object> input)
    {
        object raw;
        string id = input.TryGetValue("id", out raw) ? Convert.ToString(raw) : null;
        string name = input.TryGetValue("name", out raw) ? Convert.ToString(raw) : null;
        if (action == "save")
        {
            string saved;
            lock (Gate)
                saved = IconStyles.Save(Data, name, config);
            ReplyJson(r.stream, 200, new { ok = true, id = saved });
        }
        else if (action == "apply")
            lock (Gate)
            {
                string before = IconPacks.Serializer().Serialize(config);
                var candidate = IconPacks.Serializer().Deserialize<Settings>(before);
                int changed = IconStyles.Apply(Data, id, candidate, ValidateEntry);
                DeckLayout.Migrate(candidate);
                DeckLayout.Validate(candidate);
                config = candidate;
                NormalizeControlSlots();
                DisplaySubscriptions.RemoveUnknown(config.apps);
                InputSessions.ClearAll();
                landscapePage = 0;
                portraitPage = 0;
                Save();
                version = NewId();
                Signal();
                // Restoring a look can be undone once, like a page delete or a preset.
                pageUndoSettings = before;
                pageUndoAfter = UndoSignature(config);
                pageUndoOrientation = "landscape";
                pageUndoPage = 0;
                ReplyJson(r.stream, 200, new { ok = true, changed = changed, background = DeckBackgrounds.Public(config.background), landscapePages = DeckLayout.Pages(config, "landscape"), portraitPages = DeckLayout.Pages(config, "portrait"), landscapePage = landscapePage, portraitPage = portraitPage, version = version, revision = revision });
            }
        else if (action == "rename")
        {
            IconStyles.Rename(Data, id, name);
            ReplyJson(r.stream, 200, new { ok = true });
        }
        else if (action == "delete")
        {
            IconStyles.Delete(Data, id);
            ReplyJson(r.stream, 200, new { ok = true });
        }
        else
            Reply(r.stream, 404, JsonType, "{}");
    }

    static void GetState(Request r)
    {
        lock (Gate)
        {
            var inputSessions = UpdateRuntimeSessions(r, true, true);
            TouchPhone(r.local);
            // Skip the app list (with its icons) when the phone already has this version.
            var apps =
                QueryValue(r.target, "version") == version
                    ? null
                    : config.apps.ConvertAll(a => WidgetRegistry.PublicEntry(a));
            int landscapePages = DeckLayout.Pages(config, "landscape"),
                portraitPages = DeckLayout.Pages(config, "portrait");
            landscapePage = Math.Max(0, Math.Min(landscapePage, landscapePages - 1));
            portraitPage = Math.Max(0, Math.Min(portraitPage, portraitPages - 1));
            ReplyJson(
                r.stream,
                200,
                new
                {
                    apps = apps,
                    // Definitions are fixed per build, so they travel only with the app list.
                    widgetDefinitions = apps == null ? null : WidgetRegistry.PublicDefinitions(),
                    version = version,
                    appVersion = AppVersion,
                    revision = revision,
                    pairingRevision = Pairing.Revision,
                    landscapePage = landscapePage,
                    portraitPage = portraitPage,
                    landscapePages = landscapePages,
                    portraitPages = portraitPages,
                    page = landscapePage,
                    pages = landscapePages,
                    columns = config.columns,
                    rows = config.rows,
                    landscapeGrid = Grid(false),
                    portraitGrid = Grid(true),
                    keepAwake = config.keepAwake,
                    speakerSlot = config.speakerSlot,
                    micSlot = config.micSlot,
                    speakerSize = config.speakerSize,
                    micSize = config.micSize,
                    landscapeControls = Controls(false),
                    portraitControls = Controls(true),
                    landscapeControlPages = ControlPages(false),
                    portraitControlPages = ControlPages(true),
                    audio = AudioControl.Read(),
                    metrics = MetricsSampler.PublicSnapshot(),
                    weather = WeatherService.PublicSnapshot(config),
                    phoneConnected = PhoneConnected(),
                    pcWindowOpen = PcWindowService.IsOpen,
                    background = DeckBackgrounds.Public(config.background),
                    computer = Environment.MachineName,
                    inputSessions = inputSessions,
                }
            );
        }
    }

    // Long poll: answers when the revision changes or after 15 seconds.
    static void WaitForSync(Request r)
    {
        long known;
        long.TryParse(QueryValue(r.target, "revision"), out known);
        lock (Gate)
        {
            TouchPhone(r.local);
            if (known == revision)
                Monitor.Wait(Gate, 15000);
            // The visible IDs were sent before the wait and may be stale: only renew, never re-plan.
            RenewRuntimeSessions(r);
            if (!r.local)
                phoneLastSeen = DateTime.UtcNow;
            ReplyJson(
                r.stream,
                200,
                new
                {
                    revision = revision,
                    pairingRevision = Pairing.Revision,
                    landscapePage = landscapePage,
                    portraitPage = portraitPage,
                    landscapePages = DeckLayout.Pages(config, "landscape"),
                    portraitPages = DeckLayout.Pages(config, "portrait"),
                    version = version,
                    appVersion = AppVersion,
                    columns = config.columns,
                    rows = config.rows,
                    landscapeGrid = Grid(false),
                    portraitGrid = Grid(true),
                    keepAwake = config.keepAwake,
                    speakerSlot = config.speakerSlot,
                    micSlot = config.micSlot,
                    speakerSize = config.speakerSize,
                    micSize = config.micSize,
                    landscapeControls = Controls(false),
                    portraitControls = Controls(true),
                    landscapeControlPages = ControlPages(false),
                    portraitControlPages = ControlPages(true),
                    audio = AudioControl.Read(),
                    metrics = MetricsSampler.PublicSnapshot(),
                    weather = WeatherService.PublicSnapshot(config),
                    phoneConnected = PhoneConnected(),
                    pcWindowOpen = PcWindowService.IsOpen,
                    background = DeckBackgrounds.Public(config.background),
                }
            );
        }
    }

    static void GetSettings(Request r)
    {
        lock (Gate)
        {
            var inputSessions = UpdateRuntimeSessions(r, true, true);
            int landscapePages = DeckLayout.Pages(config, "landscape"),
                portraitPages = DeckLayout.Pages(config, "portrait");
            string lanUrl = "http://" + lan.HostName + ":" + Port + "/";
            string[] ipUrls = lan.Urls(Port);
            string androidUrl = ipUrls.Length > 0 ? ipUrls[0] : lanUrl;
            string fragment = "#connect=" + Uri.EscapeDataString(config.token);
            ReplyJson(
                r.stream,
                200,
                new
                {
                    token = config.token,
                    qrUrl = androidUrl + fragment,
                    iphoneQrUrl = lanUrl + fragment,
                    androidQrUrl = androidUrl + fragment,
                    apps = config.apps,
                    widgetDefinitions = WidgetRegistry.PublicDefinitions(),
                    version = version,
                    appVersion = AppVersion,
                    revision = revision,
                    pairingRevision = Pairing.Revision,
                    landscapePage = landscapePage,
                    portraitPage = portraitPage,
                    landscapePages = landscapePages,
                    portraitPages = portraitPages,
                    page = landscapePage,
                    pages = landscapePages,
                    columns = config.columns,
                    rows = config.rows,
                    landscapeGrid = Grid(false),
                    portraitGrid = Grid(true),
                    keepAwake = config.keepAwake,
                    speakerSlot = config.speakerSlot,
                    micSlot = config.micSlot,
                    speakerSize = config.speakerSize,
                    micSize = config.micSize,
                    landscapeControls = Controls(false),
                    portraitControls = Controls(true),
                    landscapeControlPages = ControlPages(false),
                    portraitControlPages = ControlPages(true),
                    audio = AudioControl.Read(),
                    metrics = MetricsSampler.PublicSnapshot(),
                    weather = WeatherService.PublicSnapshot(config),
                    weatherLocation = WeatherService.PublicLocation(config),
                    phoneConnected = PhoneConnected(),
                    pcWindowOpen = PcWindowService.IsOpen,
                    background = DeckBackgrounds.Public(config.background),
                    lanUrl = lanUrl,
                    ipUrls = ipUrls,
                    networkStatus = lan.Status,
                    displaySubscriptionCount = DisplaySubscriptions.Current().sessions,
                    inputSessions = inputSessions,
                }
            );
        }
    }

    static InputSessions.PublicSession[] UpdateRuntimeSessions(Request r, bool renewMetrics, bool renewWeather)
    {
        string viewId = QueryValue(r.target, "viewId");
        if (String.IsNullOrEmpty(viewId)) return new InputSessions.PublicSession[0];
        string raw = QueryValue(r.target, "visibleIds") ?? "";
        return UpdateRuntimeSessions(r, viewId, raw.Length == 0 ? new string[0] : raw.Split(','), renewMetrics, renewWeather);
    }

    static void RenewRuntimeSessions(Request r)
    {
        string viewId = QueryValue(r.target, "viewId");
        if (String.IsNullOrEmpty(viewId)) return;
        string raw = QueryValue(r.target, "visibleIds") ?? "";
        string identity = ViewIdentity(r, viewId);
        DisplaySubscriptions.Update(identity, config.apps, raw.Length == 0 ? new string[0] : raw.Split(','), false, true);
        DisplaySubscriptions.Touch(identity);
        InputSessions.Touch(identity);
    }

    static InputSessions.PublicSession[] UpdateRuntimeSessions(Request r, string viewId, string[] ids, bool renewMetrics, bool renewWeather)
    {
        string identity = ViewIdentity(r, viewId);
        DisplaySubscriptions.Update(identity, config.apps, ids, renewMetrics, renewWeather);
        return InputSessions.Prepare(identity, config.apps, ids);
    }

    static string ViewIdentity(Request r, string viewId)
    {
        if (String.IsNullOrEmpty(viewId) || viewId.Length < 8 || viewId.Length > 64 || !System.Text.RegularExpressions.Regex.IsMatch(viewId, "\\A[a-zA-Z0-9_-]+\\z"))
            throw new Exception("表示セッションが正しくありません。");
        return Pairing.Hash(r.auth ?? r.remote.ToString()) + ":" + viewId;
    }

    // Opens the drag-and-drop window on the UI thread; the browser polls GET /api/import for the result.
    static void StartImport(Request r)
    {
        string ticket = NewId();
        ui.Invoke(
            (Action)
                delegate
                {
                    if (importWindow != null && !importWindow.IsDisposed)
                        importWindow.Close();
                    lock (Gate)
                    {
                        importId = ticket;
                        importResult = null;
                    }
                    importWindow = new ImportWindow(
                        delegate(List<AppEntry> apps)
                        {
                            lock (Gate)
                                importResult = new { cancelled = apps == null, apps = apps };
                        }
                    );
                    importWindow.Show();
                    importWindow.Activate();
                }
        );
        ReplyJson(r.stream, 200, new { id = ticket });
    }

    static string ReadOrientation(Dictionary<string, object> input)
    {
        return input.ContainsKey("orientation") ? Convert.ToString(input["orientation"]) : "landscape";
    }

    static void RequireOrientation(string orientation)
    {
        if (orientation != "landscape" && orientation != "portrait")
            throw new Exception("画面の向きが正しくありません。");
    }

    // Keeps the current pages inside the page counts after the layout changed.
    static void ShrinkCurrentPages(int landscapePages, int portraitPages)
    {
        landscapePage = Math.Min(landscapePage, landscapePages - 1);
        portraitPage = Math.Min(portraitPage, portraitPages - 1);
    }

    // Selects the shown page. The settings page may add one page by asking for the page after the last.
    static void SetPage(Request r, Dictionary<string, object> input)
    {
        int requested = Convert.ToInt32(input["page"]);
        string orientation = ReadOrientation(input);
        RequireOrientation(orientation);
        lock (Gate)
        {
            int pages = DeckLayout.Pages(config, orientation);
            if (r.isAdmin && requested == pages && pages < DeckLayout.MaxPages)
            {
                if (orientation == "portrait")
                    config.portraitPageCount = ++pages;
                else
                    config.landscapePageCount = ++pages;
                Save();
            }
            int selected = Math.Max(0, Math.Min(requested, pages - 1));
            if (orientation == "portrait")
                portraitPage = selected;
            else
                landscapePage = selected;
            Signal();
            ReplyJson(
                r.stream,
                200,
                new
                {
                    ok = true,
                    orientation = orientation,
                    page = selected,
                    pages = pages,
                    revision = revision,
                }
            );
        }
    }

    // 3.1: the deck background style, picture upload and removal (settings page only).
    static void SetBackground(Request r, string path, Dictionary<string, object> input, string json)
    {
        lock (Gate)
        {
            if (path == "/api/background")
                config.background = DeckBackgrounds.Clean(IconPacks.Serializer().Deserialize<DeckBackground>(json), config.background);
            else if (path == "/api/background/image")
                config.background = DeckBackgrounds.SetImage(Data, config.background, Convert.ToString(input["data"]), Convert.ToInt32(input["width"]), Convert.ToInt32(input["height"]));
            else if (path == "/api/background/image/delete")
                config.background = DeckBackgrounds.ClearImage(Data, config.background);
            else
                throw new Exception("不明な操作です。");
            Save();
            Signal();
            ReplyJson(r.stream, 200, new { ok = true, background = DeckBackgrounds.Public(config.background), revision = revision });
        }
    }

    // The settings before the last page delete, kept until anything else changes the settings.
    static string pageUndoSettings, pageUndoAfter;
    static string pageUndoOrientation;
    static int pageUndoPage;

    // Settings as the undo check sees them: paired phones may change without blocking an undo.
    static string UndoSignature(Settings s)
    {
        var devices = s.devices;
        s.devices = null;
        try { return IconPacks.Serializer().Serialize(s); }
        finally { s.devices = devices; }
    }

    static void DeletePage(Request r, Dictionary<string, object> input)
    {
        string orientation = ReadOrientation(input);
        RequireOrientation(orientation);
        int target = Convert.ToInt32(input["page"]);
        lock (Gate)
        {
            string before = IconPacks.Serializer().Serialize(config);
            var candidate = IconPacks.Serializer().Deserialize<Settings>(before);
            int removed = DeckLayout.DeletePage(candidate, orientation, target);
            DeckLayout.Validate(candidate);
            config = candidate;
            DisplaySubscriptions.RemoveUnknown(config.apps);
            InputSessions.ClearAll();
            bool portrait = orientation == "portrait";
            int current = portrait ? portraitPage : landscapePage;
            if (current > target) current--;
            if (portrait) portraitPage = current; else landscapePage = current;
            ShrinkCurrentPages(DeckLayout.Pages(config, "landscape"), DeckLayout.Pages(config, "portrait"));
            Save();
            version = NewId();
            Signal();
            pageUndoSettings = before;
            pageUndoAfter = UndoSignature(config);
            pageUndoOrientation = orientation;
            pageUndoPage = target;
            ReplyJson(r.stream, 200, new { ok = true, removed = removed, landscapePages = DeckLayout.Pages(config, "landscape"), portraitPages = DeckLayout.Pages(config, "portrait"), landscapePage = landscapePage, portraitPage = portraitPage, version = version, revision = revision });
        }
    }

    // 3.1: puts an automatic backup back. Phone keys, paired phones and the PC window stay as they are.
    static void RestoreBackup(Request r, Dictionary<string, object> input)
    {
        var restored = SettingsBackups.Read(Data, Convert.ToString(input["id"]));
        lock (Gate)
        {
            string before = IconPacks.Serializer().Serialize(config);
            restored.schemaVersion = config.schemaVersion;
            restored.token = config.token;
            restored.pairingKey = config.pairingKey;
            restored.devices = config.devices;
            restored.pcWindow = config.pcWindow;
            if (restored.apps == null) restored.apps = new List<AppEntry>();
            if (restored.background != null && DeckBackgrounds.ImageData(Data, restored.background) == null)
                restored.background = DeckBackgrounds.Clean(restored.background, null);
            var kept = new List<AppEntry>();
            var current = config;
            config = restored; // ValidateEntry keeps ids that exist in the settings being checked
            try
            {
                foreach (var a in restored.apps)
                {
                    try { ValidateEntry(a); kept.Add(a); }
                    catch { }
                }
            }
            finally { config = current; }
            restored.apps = kept;
            DeckLayout.Migrate(restored);
            DeckLayout.Validate(restored);
            config = restored;
            NormalizeControlSlots();
            DisplaySubscriptions.RemoveUnknown(config.apps);
            InputSessions.ClearAll();
            landscapePage = 0;
            portraitPage = 0;
            Save();
            version = NewId();
            Signal();
            pageUndoSettings = before;
            pageUndoAfter = UndoSignature(config);
            pageUndoOrientation = "landscape";
            pageUndoPage = 0;
            ReplyJson(r.stream, 200, new { ok = true, buttons = kept.Count, landscapePages = DeckLayout.Pages(config, "landscape"), portraitPages = DeckLayout.Pages(config, "portrait"), landscapePage = 0, portraitPage = 0, version = version, revision = revision });
        }
    }

    // 3.1: removes the speaker or microphone fader from every page of one orientation, or restores it.
    static void RemoveFader(Request r, Dictionary<string, object> input)
    {
        string orientation = ReadOrientation(input);
        RequireOrientation(orientation);
        string target = Convert.ToString(input["target"]);
        if (target != "speaker" && target != "mic") throw new Exception("フェーダーの指定が正しくありません。");
        bool removed = !input.ContainsKey("removed") || Convert.ToBoolean(input["removed"]);
        lock (Gate)
        {
            var candidate = IconPacks.Serializer().Deserialize<Settings>(IconPacks.Serializer().Serialize(config));
            DeckLayout.SetOff(candidate, orientation == "portrait", target == "mic", removed);
            DeckLayout.Validate(candidate);
            config = candidate;
            Save();
            Signal();
            ReplyJson(r.stream, 200, new { ok = true, revision = revision });
        }
    }

    // 3.1: overwrites the page being shown with a purpose preset (grid size, faders, buttons, widgets).
    // Uses the same one-step undo as a page delete.
    static void ApplyPreset(Request r, Dictionary<string, object> input)
    {
        string orientation = ReadOrientation(input);
        RequireOrientation(orientation);
        object raw;
        string id = input.TryGetValue("id", out raw) ? Convert.ToString(raw) : null;
        int target = input.TryGetValue("page", out raw) ? Convert.ToInt32(raw) : 0;
        lock (Gate)
        {
            string before = IconPacks.Serializer().Serialize(config);
            var candidate = IconPacks.Serializer().Deserialize<Settings>(before);
            DeckLayout.MigrateGrid(candidate);
            int placed = DeckPresets.Apply(candidate, id, orientation, target, NewId);
            foreach (var a in candidate.apps)
                if (a.orientation == orientation)
                    ValidateEntry(a);
            DeckLayout.MigrateControls(candidate);
            DeckLayout.Validate(candidate);
            config = candidate;
            NormalizeControlSlots();
            DisplaySubscriptions.RemoveUnknown(config.apps);
            InputSessions.ClearAll();
            if (orientation == "portrait") portraitPage = target; else landscapePage = target;
            ShrinkCurrentPages(DeckLayout.Pages(config, "landscape"), DeckLayout.Pages(config, "portrait"));
            Save();
            version = NewId();
            Signal();
            pageUndoSettings = before;
            pageUndoAfter = UndoSignature(config);
            pageUndoOrientation = orientation;
            pageUndoPage = target;
            ReplyJson(r.stream, 200, new { ok = true, page = target, placed = placed, landscapePages = DeckLayout.Pages(config, "landscape"), portraitPages = DeckLayout.Pages(config, "portrait"), landscapePage = landscapePage, portraitPage = portraitPage, version = version, revision = revision });
        }
    }

    static void UndoDeletePage(Request r)
    {
        lock (Gate)
        {
            if (pageUndoSettings == null || UndoSignature(config) != pageUndoAfter)
                throw new Exception("その後に設定が変わったため、元に戻せません。");
            var restored = IconPacks.Serializer().Deserialize<Settings>(pageUndoSettings);
            restored.token = config.token;
            restored.pairingKey = config.pairingKey;
            restored.devices = config.devices;
            config = restored;
            if (pageUndoOrientation == "portrait") portraitPage = pageUndoPage; else landscapePage = pageUndoPage;
            pageUndoSettings = pageUndoAfter = null;
            Save();
            version = NewId();
            Signal();
            ReplyJson(r.stream, 200, new { ok = true, landscapePages = DeckLayout.Pages(config, "landscape"), portraitPages = DeckLayout.Pages(config, "portrait"), landscapePage = landscapePage, portraitPage = portraitPage, version = version, revision = revision });
        }
    }

    // Changes the grid size or the fader positions of one orientation, plus the screen-awake option.
    static void SetLayout(Request r, Dictionary<string, object> input)
    {
        int columns = Convert.ToInt32(input["columns"]),
            rows = Convert.ToInt32(input["rows"]);
        bool keepAwake = Convert.ToBoolean(input["keepAwake"]);
        string orientation = ReadOrientation(input);
        if (columns < 2 || columns > 8 || rows < 2 || rows > 8)
            throw new Exception("枠数の設定が範囲外です。");
        RequireOrientation(orientation);
        lock (Gate)
        {
            // Work on a copy so a rejected layout leaves the saved settings untouched.
            var candidate = new JavaScriptSerializer().Deserialize<Settings>(Json(config));
            DeckLayout.MigrateGrid(candidate);
            candidate.keepAwake = keepAwake;
            bool portrait = orientation == "portrait";
            int oldColumns = DeckLayout.Columns(candidate, portrait),
                oldRows = DeckLayout.Rows(candidate, portrait);
            bool gridChanged = oldColumns != columns || oldRows != rows;
            if (portrait)
            {
                candidate.portraitColumns = columns;
                candidate.portraitRows = rows;
            }
            else
            {
                candidate.landscapeColumns = columns;
                candidate.landscapeRows = rows;
                candidate.columns = columns;
                candidate.rows = rows;
            }
            if (gridChanged)
                DeckLayout.Reflow(candidate, orientation, oldColumns);
            else
                ApplyControlInput(candidate, portrait, input);
            DeckLayout.MigrateControls(candidate);
            DeckLayout.Validate(candidate);
            config = candidate;
            NormalizeControlSlots();
            if (gridChanged)
                version = NewId();
            int landscapePages = DeckLayout.Pages(config, "landscape"),
                portraitPages = DeckLayout.Pages(config, "portrait");
            ShrinkCurrentPages(landscapePages, portraitPages);
            Save();
            Signal();
            ReplyJson(
                r.stream,
                200,
                new
                {
                    ok = true,
                    apps = gridChanged ? config.apps : null,
                    version = version,
                    columns = config.columns,
                    rows = config.rows,
                    landscapeGrid = Grid(false),
                    portraitGrid = Grid(true),
                    keepAwake = config.keepAwake,
                    speakerSlot = config.speakerSlot,
                    micSlot = config.micSlot,
                    speakerSize = config.speakerSize,
                    micSize = config.micSize,
                    landscapeControls = Controls(false),
                    portraitControls = Controls(true),
                    landscapeControlPages = ControlPages(false),
                    portraitControlPages = ControlPages(true),
                    landscapePage = landscapePage,
                    portraitPage = portraitPage,
                    landscapePages = landscapePages,
                    portraitPages = portraitPages,
                    revision = revision,
                }
            );
        }
    }

    // Applies the fader fields present in the request to the given orientation.
    static void ApplyControlInput(Settings target, bool portrait, Dictionary<string, object> input)
    {
        // A request with "page" edits only that page; without it the shared placement changes.
        int page = input.ContainsKey("page") ? Convert.ToInt32(input["page"]) : -1;
        bool speakerHidden = false, micHidden = false;
        var c = page >= 0 ? DeckLayout.GetPageControls(target, portrait, page, out speakerHidden, out micHidden) : DeckLayout.GetControls(target, portrait);
        if (input.ContainsKey("speakerHidden")) speakerHidden = Convert.ToBoolean(input["speakerHidden"]);
        if (input.ContainsKey("micHidden")) micHidden = Convert.ToBoolean(input["micHidden"]);
        if (input.ContainsKey("speakerSlot"))
        {
            c.speakerSlot = Convert.ToInt32(input["speakerSlot"]);
            if (!input.ContainsKey("speakerRow")) { c.speakerRow = -1; c.speakerColumn = -1; }
        }
        if (input.ContainsKey("micSlot"))
        {
            c.micSlot = Convert.ToInt32(input["micSlot"]);
            if (!input.ContainsKey("micRow")) { c.micRow = -1; c.micColumn = -1; }
        }
        if (input.ContainsKey("speakerSize"))
        {
            c.speakerSize = Convert.ToInt32(input["speakerSize"]);
            if (!input.ContainsKey("speakerWidth")) { c.speakerWidth = c.speakerSize; c.speakerHeight = c.speakerSize; }
        }
        if (input.ContainsKey("micSize"))
        {
            c.micSize = Convert.ToInt32(input["micSize"]);
            if (!input.ContainsKey("micWidth")) { c.micWidth = c.micSize; c.micHeight = c.micSize; }
        }
        if (input.ContainsKey("speakerRow")) c.speakerRow = Convert.ToInt32(input["speakerRow"]);
        if (input.ContainsKey("speakerColumn")) c.speakerColumn = Convert.ToInt32(input["speakerColumn"]);
        if (input.ContainsKey("speakerWidth")) c.speakerWidth = Convert.ToInt32(input["speakerWidth"]);
        if (input.ContainsKey("speakerHeight")) c.speakerHeight = Convert.ToInt32(input["speakerHeight"]);
        if (input.ContainsKey("micRow")) c.micRow = Convert.ToInt32(input["micRow"]);
        if (input.ContainsKey("micColumn")) c.micColumn = Convert.ToInt32(input["micColumn"]);
        if (input.ContainsKey("micWidth")) c.micWidth = Convert.ToInt32(input["micWidth"]);
        if (input.ContainsKey("micHeight")) c.micHeight = Convert.ToInt32(input["micHeight"]);
        if (page >= 0) DeckLayout.SetPageControls(target, portrait, page, c, speakerHidden, micHidden);
        else DeckLayout.SetControls(target, portrait, c);
    }

    // Volume changes while dragging do not notify other clients; only the final value and mute toggles do.
    static void SetAudio(Request r, Dictionary<string, object> input)
    {
        string target = Convert.ToString(input["target"]);
        AudioState audio;
        bool notify;
        if (input.ContainsKey("volume"))
        {
            audio = AudioControl.SetVolume(target, Convert.ToInt32(input["volume"]));
            notify = input.ContainsKey("final") && Convert.ToBoolean(input["final"]);
        }
        else if (input.ContainsKey("delta"))
        {
            audio = AudioControl.AdjustVolume(target, Convert.ToInt32(input["delta"]));
            notify = true;
        }
        else if (input.ContainsKey("toggleMute") && Convert.ToBoolean(input["toggleMute"]))
        {
            audio = AudioControl.ToggleMute(target);
            notify = true;
        }
        else
            throw new Exception("音量操作を指定してください。");
        lock (Gate)
        {
            if (notify)
                Signal();
            ReplyJson(
                r.stream,
                200,
                new
                {
                    ok = true,
                    target = target,
                    audio = audio,
                    revision = revision,
                }
            );
        }
    }

    // Replaces the button list. Layout, keys and paired devices stay as they are on the server.
    static void SaveSettings(string json)
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
        lock (Gate)
        {
            KeepServerFields(next);
            DeckLayout.Migrate(next);
            DeckLayout.Validate(next);
            var ids = new HashSet<string>();
            foreach (var a in next.apps)
                if (!ids.Add(a.id))
                    throw new Exception("ボタンIDが重複しています。");
            config = next;
            DisplaySubscriptions.RemoveUnknown(config.apps);
            InputSessions.ClearAll();
            Save();
            version = NewId();
            ShrinkCurrentPages(DeckLayout.Pages(config, "landscape"), DeckLayout.Pages(config, "portrait"));
            Signal();
        }
    }

    static void SetWeatherLocation(Request r, Dictionary<string, object> input)
    {
        string name = Convert.ToString(input["name"]), timezone = Convert.ToString(input["timezone"]);
        double latitude = Convert.ToDouble(input["latitude"], System.Globalization.CultureInfo.InvariantCulture),
            longitude = Convert.ToDouble(input["longitude"], System.Globalization.CultureInfo.InvariantCulture);
        WeatherService.ValidateLocation(name, latitude, longitude, timezone);
        lock (Gate)
        {
            config.weatherName = name;
            config.weatherLatitude = latitude;
            config.weatherLongitude = longitude;
            config.weatherTimezone = timezone;
            Save();
            WeatherService.Configure(config);
            Signal();
            ReplyJson(r.stream, 200, new { ok = true, weatherLocation = WeatherService.PublicLocation(config), revision = revision });
        }
    }

    // Validates one submitted button and clears the fields its type does not use.
    static void ValidateEntry(AppEntry a)
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
        if (IsType(a, "audioDevice"))
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
        else if (IsType(a, "hotkey"))
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
        else if (IsType(a, "url"))
        {
            CustomActions.ValidateUrl(a.url);
            a.path = "";
            a.args = "";
            a.text = "";
            a.action = null;
            a.category = "custom";
            a.icon = null;
        }
        else if (IsType(a, "clipboard"))
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
        else if (IsType(a, "app"))
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
        if (String.IsNullOrEmpty(a.id) || !config.apps.Exists(old => old.id == a.id))
            a.id = NewId();
    }

    // A device that is unplugged right now may still be saved if it was already registered.
    static AudioDeviceInfo ResolveAudioDevice(AppEntry a)
    {
        try
        {
            return AudioDevices.Validate(a.deviceTarget, a.deviceId);
        }
        catch
        {
            AppEntry previous;
            lock (Gate)
                previous = config.apps.Find(old =>
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

    // Call while holding Gate.
    static void KeepServerFields(Settings next)
    {
        next.schemaVersion = config.schemaVersion;
        next.token = config.token;
        next.pairingKey = config.pairingKey;
        next.columns = config.columns;
        next.rows = config.rows;
        next.landscapeColumns = config.landscapeColumns;
        next.landscapeRows = config.landscapeRows;
        next.portraitColumns = config.portraitColumns;
        next.portraitRows = config.portraitRows;
        next.keepAwake = config.keepAwake;
        next.speakerSlot = config.speakerSlot;
        next.micSlot = config.micSlot;
        next.speakerSize = config.speakerSize;
        next.micSize = config.micSize;
        DeckLayout.SetControls(next, false, DeckLayout.GetControls(config, false));
        DeckLayout.SetControls(next, true, DeckLayout.GetControls(config, true));
        next.landscapeControlPages = config.landscapeControlPages;
        next.portraitControlPages = config.portraitControlPages;
        next.landscapeSpeakerOff = config.landscapeSpeakerOff;
        next.landscapeMicOff = config.landscapeMicOff;
        next.portraitSpeakerOff = config.portraitSpeakerOff;
        next.portraitMicOff = config.portraitMicOff;
        next.devices = config.devices;
        next.pageCount = config.pageCount;
        next.landscapePageCount = config.landscapePageCount;
        next.portraitPageCount = config.portraitPageCount;
        next.weatherName = config.weatherName;
        next.weatherLatitude = config.weatherLatitude;
        next.weatherLongitude = config.weatherLongitude;
        next.weatherTimezone = config.weatherTimezone;
        next.pcWindow = config.pcWindow;
        next.background = config.background;
    }

    // Issues new phone keys and forgets every paired device.
    static void RotateKeys()
    {
        lock (Gate)
        {
            config.token = RandomKey();
            config.pairingKey = ShortKey();
            config.devices.Clear();
            DisplaySubscriptions.ClearAll();
            InputSessions.ClearAll();
            Pairing.Pending.Clear();
            Pairing.Revision++;
            Save();
            Signal();
        }
        PcWindowService.TokenChanged();
    }

    static void RunAction(Request r, Dictionary<string, object> input)
    {
        string resultMessage = "操作を送信しました。";
        string action = Convert.ToString(input["action"]);
        PcWindowService.YieldFocus();
        if (action == "up" || action == "down" || action == "mute")
        {
            InputSessions.ReleaseActive();
            byte key =
                action == "up" ? (byte)0xAF // VK_VOLUME_UP
                : action == "down" ? (byte)0xAE // VK_VOLUME_DOWN
                : (byte)0xAD; // VK_VOLUME_MUTE
            NativeInput.KeyTap(key);
        }
        else if (action == "launch")
        {
            string id = Convert.ToString(input["id"]);
            AppEntry app;
            lock (Gate)
                app = config.apps.Find(a => a.id == id);
            if (app == null)
                throw new Exception("ボタンが見つかりません");
            if (WidgetRegistry.IsDisplayWidget(app.type))
                throw new Exception("この部品は直接実行できません");
            resultMessage = Launch(app, resultMessage);
        }
        else
            throw new Exception("不明な操作です");
        ReplyJson(r.stream, 200, new { ok = true, message = resultMessage });
    }

    // Runs one registered button and returns the message shown on the phone.
    static string Launch(AppEntry app, string defaultMessage)
    {
        if (IsType(app, "audioDevice"))
        {
            AudioDevices.Switch(app.deviceTarget, app.deviceId);
            lock (Gate)
                Signal();
            return (app.deviceTarget == "mic" ? "入力先" : "出力先") + "を「" + app.deviceName + "」へ切り替えました。";
        }
        if (IsType(app, "hotkey"))
        {
            InputSessions.ReleaseActive();
            ShortcutKeys.Send(app.action, app.hotkey);
            if (ShortcutKeys.IsAudio(app.action))
                lock (Gate)
                    Signal();
            return defaultMessage;
        }
        if (IsType(app, "url"))
        {
            CustomActions.OpenUrl(app.url);
            return "URLを開きました。";
        }
        if (IsType(app, "clipboard"))
        {
            CustomActions.CopyText(app.text);
            return "テキストをWindowsへコピーしました。";
        }
        // Start menu apps (Store apps included) open through Explorer.
        if (StartApps.IsStartApp(app.path))
        {
            StartApps.Start(app.path);
            return "アプリを起動しました。";
        }
        // Shortcuts (.lnk) go through the shell so their own target, arguments and folder apply.
        Process.Start(
            new ProcessStartInfo(app.path, app.args ?? "")
            {
                UseShellExecute = app.path.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase),
                WorkingDirectory = Path.GetDirectoryName(app.path),
            }
        );
        return "アプリを起動しました。";
    }
}
