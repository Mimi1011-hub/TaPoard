using System;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using Request = ApiRequest;

abstract class ControllerBase
{
    protected readonly AppState state;
    protected readonly IDesktop desktop;
    protected ControllerBase(AppState state, IDesktop desktop) { this.state = state; this.desktop = desktop; }
    protected Settings config { get { return state.Config; } set { state.Config = value; } }
    protected object Gate { get { return state.Gate; } }
    protected SyncHub sync { get { return state.Sync; } }
    protected PageUndo pageUndo { get { return state.Undo; } }
    protected ISettingsStore store { get { return state.Store; } }
    protected AppHost host { get { return state.Host; } }
    protected string Data { get { return state.Data; } }
    protected string Root { get { return state.Root; } }
    protected string AppVersion { get { return state.AppVersion; } }
    protected string version { get { return state.Version; } set { state.Version = value; } }
    protected int landscapePage { get { return state.LandscapePage; } set { state.LandscapePage = value; } }
    protected int portraitPage { get { return state.PortraitPage; } set { state.PortraitPage = value; } }
    protected LanNetwork lan { get { return state.Lan; } }
    protected const string JsonType = HttpIO.JsonType;
    protected const int Port = 18781;
    protected static string Json(object value) { return HttpIO.Json(value); }
    protected static string QueryValue(string target, string name) { return HttpIO.QueryValue(target, name); }
    protected static void Reply(System.IO.Stream stream, int code, string type, string body) { HttpIO.Reply(stream, code, type, body); }
    protected static void ReplyJson(System.IO.Stream stream, int code, object body) { HttpIO.ReplyJson(stream, code, body); }
    protected static bool IsType(AppEntry app, string type) { return DeckView.IsType(app, type); }
    protected object Controls(bool portrait) { return DeckView.Controls(config, portrait); }
    protected object ControlPages(bool portrait) { return DeckView.ControlPages(config, portrait); }
    protected object Grid(bool portrait) { return DeckView.Grid(config, portrait); }
    protected void NormalizeControlSlots() { DeckView.NormalizeControlSlots(config); }
    protected void Signal() { state.Signal(); }
    protected void Save() { state.Save(); }
    protected void TouchPhone(bool localRequest) { state.TouchPhone(localRequest); }
    protected bool PhoneConnected() { return state.PhoneConnected; }
    protected static string NewId() { return Guid.NewGuid().ToString("N"); }
    protected static string RandomKey() { return SecureKeys.Hex(); }
    protected static string ShortKey() { return SecureKeys.Short(); }

    internal void PairStart(Request r)
    {
        var request = HttpIO.ReadInput(r.stream, r.headers);
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

    internal void PairStatus(Request r)
    {
        string secret = r.auth != null && r.auth.StartsWith("Bearer ") ? r.auth.Substring(7) : null;
        lock (Gate)
            ReplyJson(r.stream, 200, Pairing.Poll(QueryValue(r.target, "id"), secret));
    }

    internal void ManagePairing(Request r, Dictionary<string, object> input)
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
    internal void TouchPhoneLegacy(bool localRequest)
    {
        sync.Touch(localRequest);
    }

    class IconPackAddRequest
    {
        public string id { get; set; }
        public List<IconPackItem> icons { get; set; }
    }

    // 3.1 icon pack create/add/rename/delete. Packs live beside the settings in data\icon-packs.
    internal void IconPackAction(Request r, string action, Dictionary<string, object> input, string json)
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
    internal void IconStyleAction(Request r, string action, Dictionary<string, object> input)
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
                pageUndo.Remember(before, config, "landscape", 0);
                ReplyJson(r.stream, 200, new { ok = true, changed = changed, background = DeckBackgrounds.Public(config.background), landscapePages = DeckLayout.Pages(config, "landscape"), portraitPages = DeckLayout.Pages(config, "portrait"), landscapePage = landscapePage, portraitPage = portraitPage, version = version, revision = sync.Revision });
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

    internal void GetState(Request r)
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
                    revision = sync.Revision,
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
    internal void WaitForSync(Request r)
    {
        long known;
        long.TryParse(QueryValue(r.target, "revision"), out known);
        lock (Gate)
        {
            TouchPhone(r.local);
            sync.Wait(known, 15000);
            // The visible IDs were sent before the wait and may be stale: only renew, never re-plan.
            RenewRuntimeSessions(r);
            if (!r.local)
                sync.MarkPhoneSeen();
            ReplyJson(
                r.stream,
                200,
                new
                {
                    revision = sync.Revision,
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

    internal void GetSettings(Request r)
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
                    revision = sync.Revision,
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

    internal InputSessions.PublicSession[] UpdateRuntimeSessions(Request r, bool renewMetrics, bool renewWeather)
    {
        string viewId = QueryValue(r.target, "viewId");
        if (String.IsNullOrEmpty(viewId)) return new InputSessions.PublicSession[0];
        string raw = QueryValue(r.target, "visibleIds") ?? "";
        return UpdateRuntimeSessions(r, viewId, raw.Length == 0 ? new string[0] : raw.Split(','), renewMetrics, renewWeather);
    }

    internal void RenewRuntimeSessions(Request r)
    {
        string viewId = QueryValue(r.target, "viewId");
        if (String.IsNullOrEmpty(viewId)) return;
        string raw = QueryValue(r.target, "visibleIds") ?? "";
        string identity = ViewIdentity(r, viewId);
        DisplaySubscriptions.Update(identity, config.apps, raw.Length == 0 ? new string[0] : raw.Split(','), false, true);
        DisplaySubscriptions.Touch(identity);
        InputSessions.Touch(identity);
    }

    internal InputSessions.PublicSession[] UpdateRuntimeSessions(Request r, string viewId, string[] ids, bool renewMetrics, bool renewWeather)
    {
        string identity = ViewIdentity(r, viewId);
        DisplaySubscriptions.Update(identity, config.apps, ids, renewMetrics, renewWeather);
        return InputSessions.Prepare(identity, config.apps, ids);
    }

    internal string ViewIdentity(Request r, string viewId)
    {
        if (String.IsNullOrEmpty(viewId) || viewId.Length < 8 || viewId.Length > 64 || !System.Text.RegularExpressions.Regex.IsMatch(viewId, "\\A[a-zA-Z0-9_-]+\\z"))
            throw new Exception("表示セッションが正しくありません。");
        return Pairing.Hash(r.auth ?? r.remote.ToString()) + ":" + viewId;
    }

    // Opens the drag-and-drop window on the UI thread; the browser polls GET /api/import for the result.
    internal void StartImport(Request r)
    {
        string ticket = desktop.StartImport();
        ReplyJson(r.stream, 200, new { id = ticket });
    }

    internal string ReadOrientation(Dictionary<string, object> input)
    {
        return input.ContainsKey("orientation") ? Convert.ToString(input["orientation"]) : "landscape";
    }

    internal void RequireOrientation(string orientation)
    {
        if (orientation != "landscape" && orientation != "portrait")
            throw new Exception("画面の向きが正しくありません。");
    }

    // Keeps the current pages inside the page counts after the layout changed.
    internal void ShrinkCurrentPages(int landscapePages, int portraitPages)
    {
        landscapePage = Math.Min(landscapePage, landscapePages - 1);
        portraitPage = Math.Min(portraitPage, portraitPages - 1);
    }

    // Selects the shown page. The settings page may add one page by asking for the page after the last.
    internal void SetPage(Request r, Dictionary<string, object> input)
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
                    revision = sync.Revision,
                }
            );
        }
    }

    // 3.1: the deck background style, picture upload and removal (settings page only).
    internal void SetBackground(Request r, string path, Dictionary<string, object> input, string json)
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
            ReplyJson(r.stream, 200, new { ok = true, background = DeckBackgrounds.Public(config.background), revision = sync.Revision });
        }
    }

    internal void MovePage(Request r, Dictionary<string, object> input)
    {
        string orientation = ReadOrientation(input);
        RequireOrientation(orientation);
        int target = Convert.ToInt32(input["page"]), to = Convert.ToInt32(input["to"]);
        lock (Gate)
        {
            var candidate = IconPacks.Serializer().Deserialize<Settings>(IconPacks.Serializer().Serialize(config));
            DeckLayout.MovePage(candidate, orientation, target, to);
            DeckLayout.Validate(candidate);
            config = candidate;
            InputSessions.ClearAll();
            bool portrait = orientation == "portrait";
            int current = portrait ? portraitPage : landscapePage;
            if (current == target) current = to;
            else if (current == to) current = target;
            if (portrait) portraitPage = current; else landscapePage = current;
            Save();
            version = NewId();
            Signal();
            ReplyJson(r.stream, 200, new { ok = true, landscapePage = landscapePage, portraitPage = portraitPage, version = version, revision = sync.Revision });
        }
    }

    internal void DeletePage(Request r, Dictionary<string, object> input)
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
            pageUndo.Remember(before, config, orientation, target);
            ReplyJson(r.stream, 200, new { ok = true, removed = removed, landscapePages = DeckLayout.Pages(config, "landscape"), portraitPages = DeckLayout.Pages(config, "portrait"), landscapePage = landscapePage, portraitPage = portraitPage, version = version, revision = sync.Revision });
        }
    }

    // 3.1: puts an automatic backup back. Phone keys, paired phones and the PC window stay as they are.
    internal void RestoreBackup(Request r, Dictionary<string, object> input)
    {
        var restored = store.ReadBackup(Convert.ToString(input["id"]));
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
            pageUndo.Remember(before, config, "landscape", 0);
            ReplyJson(r.stream, 200, new { ok = true, buttons = kept.Count, landscapePages = DeckLayout.Pages(config, "landscape"), portraitPages = DeckLayout.Pages(config, "portrait"), landscapePage = 0, portraitPage = 0, version = version, revision = sync.Revision });
        }
    }

    // 3.1: removes the speaker or microphone fader from every page of one orientation, or restores it.
    internal void RemoveFader(Request r, Dictionary<string, object> input)
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
            ReplyJson(r.stream, 200, new { ok = true, revision = sync.Revision });
        }
    }

    // 3.1: overwrites the page being shown with a purpose preset (grid size, faders, buttons, widgets).
    // Uses the same one-step undo as a page delete.
    internal void ApplyPreset(Request r, Dictionary<string, object> input)
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
            pageUndo.Remember(before, config, orientation, target);
            ReplyJson(r.stream, 200, new { ok = true, page = target, placed = placed, landscapePages = DeckLayout.Pages(config, "landscape"), portraitPages = DeckLayout.Pages(config, "portrait"), landscapePage = landscapePage, portraitPage = portraitPage, version = version, revision = sync.Revision });
        }
    }

    internal void UndoDeletePage(Request r)
    {
        lock (Gate)
        {
            Settings restored;
            string orientation;
            int page;
            if (!pageUndo.TryTake(config, out restored, out orientation, out page))
                throw new Exception("その後に設定が変わったため、元に戻せません。");
            restored.token = config.token;
            restored.pairingKey = config.pairingKey;
            restored.devices = config.devices;
            config = restored;
            if (orientation == "portrait") portraitPage = page; else landscapePage = page;
            Save();
            version = NewId();
            Signal();
            ReplyJson(r.stream, 200, new { ok = true, landscapePages = DeckLayout.Pages(config, "landscape"), portraitPages = DeckLayout.Pages(config, "portrait"), landscapePage = landscapePage, portraitPage = portraitPage, version = version, revision = sync.Revision });
        }
    }

    // Changes the grid size or the fader positions of one orientation, plus the screen-awake option.
    internal void SetLayout(Request r, Dictionary<string, object> input)
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
                    revision = sync.Revision,
                }
            );
        }
    }

    // Applies the fader fields present in the request to the given orientation.
    internal void ApplyControlInput(Settings target, bool portrait, Dictionary<string, object> input)
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
    internal AudioState ApplyAudio(Dictionary<string, object> input, out string target, out bool notify)
    {
        target = Convert.ToString(input["target"]);
        AudioState audio;
        if (input.ContainsKey("volume"))
        {
            audio = host.Audio.SetVolume(target, Convert.ToInt32(input["volume"]));
            notify = input.ContainsKey("final") && Convert.ToBoolean(input["final"]);
        }
        else if (input.ContainsKey("delta"))
        {
            audio = host.Audio.AdjustVolume(target, Convert.ToInt32(input["delta"]));
            notify = true;
        }
        else if (input.ContainsKey("toggleMute") && Convert.ToBoolean(input["toggleMute"]))
        {
            audio = host.Audio.ToggleMute(target);
            notify = true;
        }
        else
            throw new Exception("音量操作を指定してください。");
        return audio;
    }

    internal void SetAudio(Request r, Dictionary<string, object> input)
    {
        string target;
        bool notify;
        AudioState audio = ApplyAudio(input, out target, out notify);
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
                    revision = sync.Revision,
                }
            );
        }
    }

    // Replaces the button list. Layout, keys and paired devices stay as they are on the server.
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

    internal void SetWeatherLocation(Request r, Dictionary<string, object> input)
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
            ReplyJson(r.stream, 200, new { ok = true, weatherLocation = WeatherService.PublicLocation(config), revision = sync.Revision });
        }
    }

    // Validates one submitted button and clears the fields its type does not use.
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
    internal AudioDeviceInfo ResolveAudioDevice(AppEntry a)
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
    internal void KeepServerFields(Settings next)
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
    internal void RotateKeys()
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

    internal void RunAction(Request r, Dictionary<string, object> input)
    {
        string resultMessage = "操作を送信しました。";
        string action = Convert.ToString(input["action"]);
        PcWindowService.YieldFocus();
        if (action == "up" || action == "down" || action == "mute")
        {
            InputSessions.ReleaseActive();
            host.Pointer.KeyTap(VolumeKey(action));
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

    internal byte VolumeKey(string action)
    {
        return action == "up" ? (byte)0xAF // VK_VOLUME_UP
            : action == "down" ? (byte)0xAE // VK_VOLUME_DOWN
            : (byte)0xAD; // VK_VOLUME_MUTE
    }

    // Runs one registered button and returns the message shown on the phone.
    internal string Launch(AppEntry app, string defaultMessage)
    {
        if (IsType(app, "audioDevice"))
        {
            host.AudioDevices.Switch(app.deviceTarget, app.deviceId);
            lock (Gate)
                Signal();
            return (app.deviceTarget == "mic" ? "入力先" : "出力先") + "を「" + app.deviceName + "」へ切り替えました。";
        }
        if (IsType(app, "hotkey"))
        {
            InputSessions.ReleaseActive();
            host.Keys.Send(app.action, app.hotkey);
            if (host.Keys.IsAudio(app.action))
                lock (Gate)
                    Signal();
            return defaultMessage;
        }
        if (IsType(app, "url"))
        {
            host.Shell.OpenUrl(app.url);
            return "URLを開きました。";
        }
        if (IsType(app, "clipboard"))
        {
            host.Shell.CopyText(app.text);
            return "テキストをWindowsへコピーしました。";
        }
        // Start menu apps (Store apps included) open through Explorer.
        if (host.Shell.IsStartApp(app.path))
        {
            host.Shell.StartApp(app.path);
            return "アプリを起動しました。";
        }
        // Shortcuts (.lnk) go through the shell so their own target, arguments and folder apply.
        host.Shell.StartProcess(app.path, app.args);
        return "アプリを起動しました。";
    }
}
