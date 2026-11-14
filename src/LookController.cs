using System;
using System.Collections.Generic;

sealed class LookController : ControllerBase
{
    sealed class IconPackAddRequest
    {
        public string id { get; set; }
        public List<IconPackItem> icons { get; set; }
    }

    readonly DeckController deck;

    internal LookController(AppState state, IDesktop desktop, DeckController deck) : base(state, desktop)
    {
        this.deck = deck;
    }
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
    void GetBackground(ApiRequest r)
    {
        string image;
        lock (state.Gate)
            image = DeckBackgrounds.ImageData(state.Data, state.Config.background);
        HttpIO.Reply(r.stream, 200, HttpIO.JsonType, "{\"data\":" + (image == null ? "null" : "\"" + image + "\"") + "}");
    }

    void GetPacks(ApiRequest r)
    {
        HttpIO.ReplyJson(r.stream, 200, new { packs = IconPacks.List(state.Data), maxPacks = IconPacks.MaxPacks, maxIcons = IconPacks.MaxIcons });
    }

    void GetPack(ApiRequest r)
    {
        HttpIO.Reply(r.stream, 200, HttpIO.JsonType, IconPacks.Serializer().Serialize(IconPacks.Get(state.Data, HttpIO.QueryValue(r.target, "id"))));
    }

    void GetBackups(ApiRequest r)
    {
        HttpIO.ReplyJson(r.stream, 200, new { backups = state.Store.ListBackups() });
    }

    void GetStyles(ApiRequest r)
    {
        HttpIO.ReplyJson(r.stream, 200, new { styles = IconStyles.List(state.Data), maxStyles = IconStyles.MaxStyles });
    }

    internal void IconPackAction(ApiRequest r, string action, Dictionary<string, object> input, string json)
    {
        object raw;
        string id = input.TryGetValue("id", out raw) ? Convert.ToString(raw) : null;
        string name = input.TryGetValue("name", out raw) ? Convert.ToString(raw) : null;
        string author = input.TryGetValue("author", out raw) ? Convert.ToString(raw) : null;
        if (action == "create")
            HttpIO.ReplyJson(r.stream, 200, new { ok = true, id = IconPacks.Create(state.Data, name, author) });
        else if (action == "add")
        {
            var request = IconPacks.Serializer().Deserialize<IconPackAddRequest>(json);
            HttpIO.ReplyJson(r.stream, 200, new { ok = true, count = IconPacks.Add(state.Data, request.id, request.icons) });
        }
        else if (action == "rename")
        {
            IconPacks.Rename(state.Data, id, name, author);
            HttpIO.ReplyJson(r.stream, 200, new { ok = true });
        }
        else if (action == "delete")
        {
            IconPacks.Delete(state.Data, id);
            HttpIO.ReplyJson(r.stream, 200, new { ok = true });
        }
        else
            HttpIO.Reply(r.stream, 404, HttpIO.JsonType, "{}");
    }

    internal void IconStyleAction(ApiRequest r, string action, Dictionary<string, object> input)
    {
        object raw;
        string id = input.TryGetValue("id", out raw) ? Convert.ToString(raw) : null;
        string name = input.TryGetValue("name", out raw) ? Convert.ToString(raw) : null;
        if (action == "save")
        {
            string saved;
            lock (state.Gate)
                saved = IconStyles.Save(state.Data, name, state.Config);
            HttpIO.ReplyJson(r.stream, 200, new { ok = true, id = saved });
        }
        else if (action == "apply")
            lock (state.Gate)
            {
                string before = IconPacks.Serializer().Serialize(state.Config);
                var candidate = IconPacks.Serializer().Deserialize<Settings>(before);
                int changed = IconStyles.Apply(state.Data, id, candidate, deck.ValidateEntry);
                DeckLayout.Migrate(candidate);
                DeckLayout.Validate(candidate);
                state.Config = candidate;
                DeckView.NormalizeControlSlots(state.Config);
                DisplaySubscriptions.RemoveUnknown(state.Config.apps);
                InputSessions.ClearAll();
                state.LandscapePage = 0;
                state.PortraitPage = 0;
                state.Save();
                state.Version = DeckView.NewId();
                state.Signal();
                // Restoring a look can be undone once, like a page delete or a preset.
                state.Undo.Remember(before, state.Config, "landscape", 0);
                HttpIO.ReplyJson(r.stream, 200, new { ok = true, changed = changed, background = DeckBackgrounds.Public(state.Config.background), landscapePages = DeckLayout.Pages(state.Config, "landscape"), portraitPages = DeckLayout.Pages(state.Config, "portrait"), landscapePage = state.LandscapePage, portraitPage = state.PortraitPage, version = state.Version, revision = state.Sync.Revision });
            }
        else if (action == "rename")
        {
            IconStyles.Rename(state.Data, id, name);
            HttpIO.ReplyJson(r.stream, 200, new { ok = true });
        }
        else if (action == "delete")
        {
            IconStyles.Delete(state.Data, id);
            HttpIO.ReplyJson(r.stream, 200, new { ok = true });
        }
        else
            HttpIO.Reply(r.stream, 404, HttpIO.JsonType, "{}");
    }

    internal void SetBackground(ApiRequest r, string path, Dictionary<string, object> input, string json)
    {
        lock (state.Gate)
        {
            if (path == "/api/background")
                state.Config.background = DeckBackgrounds.Clean(IconPacks.Serializer().Deserialize<DeckBackground>(json), state.Config.background);
            else if (path == "/api/background/image")
                state.Config.background = DeckBackgrounds.SetImage(state.Data, state.Config.background, Convert.ToString(input["data"]), Convert.ToInt32(input["width"]), Convert.ToInt32(input["height"]));
            else if (path == "/api/background/image/delete")
                state.Config.background = DeckBackgrounds.ClearImage(state.Data, state.Config.background);
            else
                throw new Exception("不明な操作です。");
            state.Save();
            state.Signal();
            HttpIO.ReplyJson(r.stream, 200, new { ok = true, background = DeckBackgrounds.Public(state.Config.background), revision = state.Sync.Revision });
        }
    }

    internal void RestoreBackup(ApiRequest r, Dictionary<string, object> input)
    {
        var restored = state.Store.ReadBackup(Convert.ToString(input["id"]));
        lock (state.Gate)
        {
            string before = IconPacks.Serializer().Serialize(state.Config);
            restored.schemaVersion = state.Config.schemaVersion;
            restored.token = state.Config.token;
            restored.pairingKey = state.Config.pairingKey;
            restored.devices = state.Config.devices;
            restored.pcWindow = state.Config.pcWindow;
            if (restored.apps == null) restored.apps = new List<AppEntry>();
            if (restored.background != null && DeckBackgrounds.ImageData(state.Data, restored.background) == null)
                restored.background = DeckBackgrounds.Clean(restored.background, null);
            var kept = new List<AppEntry>();
            var current = state.Config;
            state.Config = restored; // ValidateEntry keeps ids that exist in the settings being checked
            try
            {
                foreach (var a in restored.apps)
                {
                    try
                    {
                        deck.ValidateEntry(a);
                        kept.Add(a);
                    }
                    catch { }
                }
            }
            finally { state.Config = current; }
            restored.apps = kept;
            DeckLayout.Migrate(restored);
            DeckLayout.Validate(restored);
            state.Config = restored;
            DeckView.NormalizeControlSlots(state.Config);
            DisplaySubscriptions.RemoveUnknown(state.Config.apps);
            InputSessions.ClearAll();
            state.LandscapePage = 0;
            state.PortraitPage = 0;
            state.Save();
            state.Version = DeckView.NewId();
            state.Signal();
            state.Undo.Remember(before, state.Config, "landscape", 0);
            HttpIO.ReplyJson(r.stream, 200, new { ok = true, buttons = kept.Count, landscapePages = DeckLayout.Pages(state.Config, "landscape"), portraitPages = DeckLayout.Pages(state.Config, "portrait"), landscapePage = 0, portraitPage = 0, version = state.Version, revision = state.Sync.Revision });
        }
    }
}
