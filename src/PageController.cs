using System;
using System.Collections.Generic;
using System.Web.Script.Serialization;

sealed class PageController : ControllerBase
{
    readonly DeckController deck;

    internal PageController(AppState state, IDesktop desktop, DeckController deck) : base(state, desktop)
    {
        this.deck = deck;
    }
    internal void Register(ApiRouter<ApiRequest> api)
    {
        api.Post("/api/page", ApiAccess.Paired, delegate(ApiRequest r) { SetPage(r, r.input); });
        api.Post("/api/page/move", ApiAccess.Admin, delegate(ApiRequest r) { MovePage(r, r.input); });
        api.Post("/api/page/delete", ApiAccess.Admin, delegate(ApiRequest r) { DeletePage(r, r.input); });
        api.Post("/api/page/undo", ApiAccess.Admin, UndoDeletePage);
        api.Post("/api/fader/remove", ApiAccess.Admin, delegate(ApiRequest r) { RemoveFader(r, r.input); });
        api.Post("/api/presets/apply", ApiAccess.Admin, delegate(ApiRequest r) { ApplyPreset(r, r.input); });
        api.Post("/api/layout", ApiAccess.Paired, delegate(ApiRequest r) { SetLayout(r, r.input); });
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

    internal void ShrinkCurrentPages(int landscapePages, int portraitPages)
    {
        state.LandscapePage = Math.Min(state.LandscapePage, landscapePages - 1);
        state.PortraitPage = Math.Min(state.PortraitPage, portraitPages - 1);
    }

    internal void SetPage(ApiRequest r, Dictionary<string, object> input)
    {
        int requested = Convert.ToInt32(input["page"]);
        string orientation = ReadOrientation(input);
        RequireOrientation(orientation);
        lock (state.Gate)
        {
            int pages = DeckLayout.Pages(state.Config, orientation);
            if (r.isAdmin && requested == pages && pages < DeckLayout.MaxPages)
            {
                if (orientation == "portrait")
                    state.Config.portraitPageCount = ++pages;
                else
                    state.Config.landscapePageCount = ++pages;
                state.Save();
            }
            int selected = Math.Max(0, Math.Min(requested, pages - 1));
            if (orientation == "portrait")
                state.PortraitPage = selected;
            else
                state.LandscapePage = selected;
            state.Signal();
            HttpIO.ReplyJson(
                r.stream,
                200,
                new
                {
                    ok = true,
                    orientation = orientation,
                    page = selected,
                    pages = pages,
                    revision = state.Sync.Revision,
                }
            );
        }
    }

    internal void MovePage(ApiRequest r, Dictionary<string, object> input)
    {
        string orientation = ReadOrientation(input);
        RequireOrientation(orientation);
        int target = Convert.ToInt32(input["page"]), to = Convert.ToInt32(input["to"]);
        lock (state.Gate)
        {
            var candidate = IconPacks.Serializer().Deserialize<Settings>(IconPacks.Serializer().Serialize(state.Config));
            DeckLayout.MovePage(candidate, orientation, target, to);
            DeckLayout.Validate(candidate);
            state.Config = candidate;
            InputSessions.ClearAll();
            bool portrait = orientation == "portrait";
            int current = portrait ? state.PortraitPage : state.LandscapePage;
            if (current == target) current = to;
            else if (current == to) current = target;
            if (portrait)
                state.PortraitPage = current;
            else
                state.LandscapePage = current;
            state.Save();
            state.Version = DeckView.NewId();
            state.Signal();
            HttpIO.ReplyJson(r.stream, 200, new { ok = true, landscapePage = state.LandscapePage, portraitPage = state.PortraitPage, version = state.Version, revision = state.Sync.Revision });
        }
    }

    internal void DeletePage(ApiRequest r, Dictionary<string, object> input)
    {
        string orientation = ReadOrientation(input);
        RequireOrientation(orientation);
        int target = Convert.ToInt32(input["page"]);
        lock (state.Gate)
        {
            string before = IconPacks.Serializer().Serialize(state.Config);
            var candidate = IconPacks.Serializer().Deserialize<Settings>(before);
            int removed = DeckLayout.DeletePage(candidate, orientation, target);
            DeckLayout.Validate(candidate);
            state.Config = candidate;
            DisplaySubscriptions.RemoveUnknown(state.Config.apps);
            InputSessions.ClearAll();
            bool portrait = orientation == "portrait";
            int current = portrait ? state.PortraitPage : state.LandscapePage;
            if (current > target) current--;
            if (portrait)
                state.PortraitPage = current;
            else
                state.LandscapePage = current;
            ShrinkCurrentPages(DeckLayout.Pages(state.Config, "landscape"), DeckLayout.Pages(state.Config, "portrait"));
            state.Save();
            state.Version = DeckView.NewId();
            state.Signal();
            state.Undo.Remember(before, state.Config, orientation, target);
            HttpIO.ReplyJson(r.stream, 200, new { ok = true, removed = removed, landscapePages = DeckLayout.Pages(state.Config, "landscape"), portraitPages = DeckLayout.Pages(state.Config, "portrait"), landscapePage = state.LandscapePage, portraitPage = state.PortraitPage, version = state.Version, revision = state.Sync.Revision });
        }
    }

    internal void RemoveFader(ApiRequest r, Dictionary<string, object> input)
    {
        string orientation = ReadOrientation(input);
        RequireOrientation(orientation);
        string target = Convert.ToString(input["target"]);
        if (target != "speaker" && target != "mic") throw new Exception("フェーダーの指定が正しくありません。");
        bool removed = !input.ContainsKey("removed") || Convert.ToBoolean(input["removed"]);
        lock (state.Gate)
        {
            var candidate = IconPacks.Serializer().Deserialize<Settings>(IconPacks.Serializer().Serialize(state.Config));
            DeckLayout.SetOff(candidate, orientation == "portrait", target == "mic", removed);
            DeckLayout.Validate(candidate);
            state.Config = candidate;
            state.Save();
            state.Signal();
            HttpIO.ReplyJson(r.stream, 200, new { ok = true, revision = state.Sync.Revision });
        }
    }

    internal void ApplyPreset(ApiRequest r, Dictionary<string, object> input)
    {
        string orientation = ReadOrientation(input);
        RequireOrientation(orientation);
        object raw;
        string id = input.TryGetValue("id", out raw) ? Convert.ToString(raw) : null;
        int target = input.TryGetValue("page", out raw) ? Convert.ToInt32(raw) : 0;
        lock (state.Gate)
        {
            string before = IconPacks.Serializer().Serialize(state.Config);
            var candidate = IconPacks.Serializer().Deserialize<Settings>(before);
            DeckLayout.MigrateGrid(candidate);
            int placed = DeckPresets.Apply(candidate, id, orientation, target, DeckView.NewId);
            foreach (var a in candidate.apps)
                if (a.orientation == orientation)
                    deck.ValidateEntry(a);
            DeckLayout.MigrateControls(candidate);
            DeckLayout.Validate(candidate);
            state.Config = candidate;
            DeckView.NormalizeControlSlots(state.Config);
            DisplaySubscriptions.RemoveUnknown(state.Config.apps);
            InputSessions.ClearAll();
            if (orientation == "portrait")
                state.PortraitPage = target;
            else
                state.LandscapePage = target;
            ShrinkCurrentPages(DeckLayout.Pages(state.Config, "landscape"), DeckLayout.Pages(state.Config, "portrait"));
            state.Save();
            state.Version = DeckView.NewId();
            state.Signal();
            state.Undo.Remember(before, state.Config, orientation, target);
            HttpIO.ReplyJson(r.stream, 200, new { ok = true, page = target, placed = placed, landscapePages = DeckLayout.Pages(state.Config, "landscape"), portraitPages = DeckLayout.Pages(state.Config, "portrait"), landscapePage = state.LandscapePage, portraitPage = state.PortraitPage, version = state.Version, revision = state.Sync.Revision });
        }
    }

    internal void UndoDeletePage(ApiRequest r)
    {
        lock (state.Gate)
        {
            Settings restored;
            string orientation;
            int page;
            if (!state.Undo.TryTake(state.Config, out restored, out orientation, out page))
                throw new Exception("その後に設定が変わったため、元に戻せません。");
            restored.token = state.Config.token;
            restored.pairingKey = state.Config.pairingKey;
            restored.devices = state.Config.devices;
            state.Config = restored;
            if (orientation == "portrait")
                state.PortraitPage = page;
            else
                state.LandscapePage = page;
            state.Save();
            state.Version = DeckView.NewId();
            state.Signal();
            HttpIO.ReplyJson(r.stream, 200, new { ok = true, landscapePages = DeckLayout.Pages(state.Config, "landscape"), portraitPages = DeckLayout.Pages(state.Config, "portrait"), landscapePage = state.LandscapePage, portraitPage = state.PortraitPage, version = state.Version, revision = state.Sync.Revision });
        }
    }

    internal void SetLayout(ApiRequest r, Dictionary<string, object> input)
    {
        int columns = Convert.ToInt32(input["columns"]),
            rows = Convert.ToInt32(input["rows"]);
        bool keepAwake = Convert.ToBoolean(input["keepAwake"]);
        string orientation = ReadOrientation(input);
        if (columns < 2 || columns > 8 || rows < 2 || rows > 8)
            throw new Exception("枠数の設定が範囲外です。");
        RequireOrientation(orientation);
        lock (state.Gate)
        {
            // Work on a copy so a rejected layout leaves the saved settings untouched.
            var candidate = new JavaScriptSerializer().Deserialize<Settings>(HttpIO.Json(state.Config));
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
            state.Config = candidate;
            DeckView.NormalizeControlSlots(state.Config);
            if (gridChanged)
                state.Version = DeckView.NewId();
            int landscapePages = DeckLayout.Pages(state.Config, "landscape"),
                portraitPages = DeckLayout.Pages(state.Config, "portrait");
            ShrinkCurrentPages(landscapePages, portraitPages);
            state.Save();
            state.Signal();
            HttpIO.ReplyJson(
                r.stream,
                200,
                new
                {
                    ok = true,
                    apps = gridChanged ? state.Config.apps : null,
                    version = state.Version,
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
                    landscapePage = state.LandscapePage,
                    portraitPage = state.PortraitPage,
                    landscapePages = landscapePages,
                    portraitPages = portraitPages,
                    revision = state.Sync.Revision,
                }
            );
        }
    }

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
            if (!input.ContainsKey("speakerRow"))
            {
                c.speakerRow = -1;
                c.speakerColumn = -1;
            }
        }
        if (input.ContainsKey("micSlot"))
        {
            c.micSlot = Convert.ToInt32(input["micSlot"]);
            if (!input.ContainsKey("micRow"))
            {
                c.micRow = -1;
                c.micColumn = -1;
            }
        }
        if (input.ContainsKey("speakerSize"))
        {
            c.speakerSize = Convert.ToInt32(input["speakerSize"]);
            if (!input.ContainsKey("speakerWidth"))
            {
                c.speakerWidth = c.speakerSize;
                c.speakerHeight = c.speakerSize;
            }
        }
        if (input.ContainsKey("micSize"))
        {
            c.micSize = Convert.ToInt32(input["micSize"]);
            if (!input.ContainsKey("micWidth"))
            {
                c.micWidth = c.micSize;
                c.micHeight = c.micSize;
            }
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
}
