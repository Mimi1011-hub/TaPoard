using System;
using System.Collections.Generic;

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
        api.Post("/api/page/undo", ApiAccess.Admin, UndoDeletePage);
        api.Post("/api/presets/apply", ApiAccess.Admin, delegate(ApiRequest r) { ApplyPreset(r, r.input); });
    }

    internal string ReadOrientation(Dictionary<string, object> input)
    {
        return input.ContainsKey("orientation") ? Convert.ToString(input["orientation"]) : "landscape";
    }

    internal void RequireOrientation(string orientation)
    {
        if (orientation != "landscape" && orientation != "portrait")
            throw new Exception(Text.Get("source.pagecontroller.1"));
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
                PageNames.Resize(state.Config);
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
            HttpIO.ReplyJson(r.stream, 200,
                new { ok = true, page = target, placed = placed, landscapePages = DeckLayout.Pages(state.Config, "landscape"),
                portraitPages = DeckLayout.Pages(state.Config, "portrait"), landscapePage = state.LandscapePage, portraitPage = state.PortraitPage,
                version = state.Version, revision = state.Sync.Revision });
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
                throw new Exception(Text.Get("source.pagecontroller.3"));
            restored.token = state.Config.token;
            restored.devices = state.Config.devices;
            state.Config = restored;
            if (orientation == "portrait")
                state.PortraitPage = page;
            else
                state.LandscapePage = page;
            state.Save();
            state.Version = DeckView.NewId();
            state.Signal();
            HttpIO.ReplyJson(r.stream, 200,
                new { ok = true, landscapePages = DeckLayout.Pages(state.Config, "landscape"), portraitPages = DeckLayout.Pages(state.Config, "portrait"),
                landscapePage = state.LandscapePage, portraitPage = state.PortraitPage, version = state.Version, revision = state.Sync.Revision });
        }
    }

}
