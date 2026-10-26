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
            var ack = InputSessions.Execute(
                owner,
                Convert.ToString(rawSession),
                Convert.ToInt32(rawSequence),
                InputSessions.ParseEvents(rawEvents)
            );
            ReplyJson(s, 200, ack);
        }
        else if (path == "/api/settings" && r.isAdmin)
        {
            SaveSettings(json);
            Reply(s, 200, JsonType, "{\"ok\":true}");
        }
        else if (path == "/api/rotate" && r.isAdmin)
        {
            RotateKeys();
            Reply(s, 200, JsonType, "{\"ok\":true}");
        }
        else if (path == "/api/action")
            RunAction(r, input);
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
                    audio = AudioControl.Read(),
                    metrics = MetricsSampler.PublicSnapshot(),
                    weather = WeatherService.PublicSnapshot(config),
                    phoneConnected = PhoneConnected(),
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
            var inputSessions = UpdateRuntimeSessions(r, false, true);
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
                    audio = AudioControl.Read(),
                    metrics = MetricsSampler.PublicSnapshot(),
                    weather = WeatherService.PublicSnapshot(config),
                    phoneConnected = PhoneConnected(),
                    inputSessions = inputSessions,
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
                    audio = AudioControl.Read(),
                    metrics = MetricsSampler.PublicSnapshot(),
                    weather = WeatherService.PublicSnapshot(config),
                    weatherLocation = WeatherService.PublicLocation(config),
                    phoneConnected = PhoneConnected(),
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
        var c = DeckLayout.GetControls(target, portrait);
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
        DeckLayout.SetControls(target, portrait, c);
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
        if (a.name.Length > 80)
            throw new Exception("表示名は80文字以内です");
        if (!IconPresets.ValidColor(a.iconColor))
            throw new Exception("アイコンの色が正しくありません");
        if (!IconPresets.Exists(a.iconKey))
            throw new Exception("登録されていないアイコンです");
        if (!IconPresets.ValidCustomIcon(a.customIcon))
            throw new Exception("オリジナルアイコンの形式またはサイズが正しくありません");
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
            a.icon = AppIcons.Read(a.path);
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
        next.devices = config.devices;
        next.pageCount = config.pageCount;
        next.landscapePageCount = config.landscapePageCount;
        next.portraitPageCount = config.portraitPageCount;
        next.weatherName = config.weatherName;
        next.weatherLatitude = config.weatherLatitude;
        next.weatherLongitude = config.weatherLongitude;
        next.weatherTimezone = config.weatherTimezone;
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
    }

    static void RunAction(Request r, Dictionary<string, object> input)
    {
        string resultMessage = "操作を送信しました。";
        string action = Convert.ToString(input["action"]);
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
