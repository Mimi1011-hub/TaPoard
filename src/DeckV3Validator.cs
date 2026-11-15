using System;
using System.Collections.Generic;

static class DeckV3Validator
{
    internal static Settings Validate(DeckV3 source, Settings current, DeckController controller)
    {
        if (source == null) throw new Exception(Text.Get("source.deckv3validator.1"));
        var ids = new HashSet<string>(StringComparer.Ordinal);
        ValidateOrientation(source.landscape, false, ids);
        ValidateOrientation(source.portrait, true, ids);
        SettingsV3 envelope = SettingsMigration.ToV3(current);
        source.background = envelope.deck.background;
        envelope.deck = source;
        Settings candidate = SettingsMigration.ToV2(envelope);
        foreach (AppEntry entry in candidate.apps)
        {
            try { controller.ValidateEntry(entry); }
            catch (Exception error) { throw new Exception(Location(entry) + ": " + error.Message); }
        }
        var positions = Positions(candidate);
        DeckLayout.Migrate(candidate);
        DeckLayout.Validate(candidate);
        if (positions != Positions(candidate)) throw new Exception(Text.Get("source.deckv3validator.2"));
        return candidate;
    }

    static void ValidateOrientation(OrientationV3 orientation, bool portrait, HashSet<string> ids)
    {
        string direction = portrait ? Text.Get("source.deckv3validator.3") : Text.Get("source.deckv3validator.4");
        if (orientation == null) throw new Exception(direction + Text.Get("source.deckv3validator.5"));
        if (orientation.columns < 2 || orientation.columns > 8 || orientation.rows < 2 || orientation.rows > 8)
            throw new Exception(direction + Text.Get("source.deckv3validator.6"));
        if (orientation.pages == null || orientation.pages.Count < 1 || orientation.pages.Count > DeckLayout.MaxPages)
            throw new Exception(direction + Text.Get("source.deckv3validator.7"));
        int totalItems = 0;
        foreach (PageV3 page in orientation.pages) if (page != null && page.items != null) totalItems += page.items.Count;
        if (totalItems > 40) throw new Exception(direction + Text.Get("source.deckv3validator.8"));
        if (orientation.faders == null || orientation.faders.speaker == null || orientation.faders.mic == null)
            throw new Exception(direction + Text.Get("source.deckv3validator.9"));
        ControlPlacement sharedSpeaker = Placement(orientation.faders.speaker);
        ControlPlacement sharedMic = Placement(orientation.faders.mic);
        RequireFader(sharedSpeaker, orientation, direction + Text.Get("source.deckv3validator.10"));
        RequireFader(sharedMic, orientation, direction + Text.Get("source.deckv3validator.11"));
        if (Overlap(sharedSpeaker, sharedMic)) throw new Exception(direction + Text.Get("source.deckv3validator.12"));
        for (int pageIndex = 0; pageIndex < orientation.pages.Count; pageIndex++)
        {
            PageV3 page = orientation.pages[pageIndex];
            string pageLabel = direction + " " + (pageIndex + 1) + Text.Get("source.deckv3validator.13");
            if (page == null) throw new Exception(pageLabel + Text.Get("source.deckv3validator.14"));
            try { page.name = PageNames.Normalize(page.name); }
            catch (Exception error) { throw new Exception(pageLabel + Text.Get("source.deckv3validator.15") + error.Message); }
            ControlPlacement speaker = Effective(page.faders, sharedSpeaker, orientation.faders.speaker.off, false);
            ControlPlacement mic = Effective(page.faders, sharedMic, orientation.faders.mic.off, true);
            if (speaker != null) RequireFader(speaker, orientation, pageLabel + Text.Get("source.deckv3validator.16"));
            if (mic != null) RequireFader(mic, orientation, pageLabel + Text.Get("source.deckv3validator.17"));
            if (Overlap(speaker, mic)) throw new Exception(pageLabel + Text.Get("source.deckv3validator.18"));
            bool[,] used = new bool[orientation.rows, orientation.columns];
            Mark(used, speaker); Mark(used, mic);
            foreach (DeckItem item in page.items ?? new List<DeckItem>())
            {
                string name = item == null || String.IsNullOrWhiteSpace(item.name) ? Text.Get("source.deckv3validator.19") : item.name.Trim();
                string label = pageLabel + Text.Get("source.deckv3validator.20") + name + "』";
                if (item == null) throw new Exception(label + Text.Get("source.deckv3validator.21"));
                if (!String.IsNullOrEmpty(item.id) && !ids.Add(item.id)) throw new Exception(label + Text.Get("source.deckv3validator.22"));
                if (item.steps != null) throw new Exception(label + Text.Get("source.deckv3validator.23"));
                AppEntry entry = SettingsMigration.ToApp(item, portrait, pageIndex);
                try { WidgetRegistry.ValidateDimensions(entry); }
                catch (Exception error) { throw new Exception(label + ": " + error.Message); }
                if (item.row < 0 || item.column < 0 || item.row + item.height > orientation.rows || item.column + item.width > orientation.columns)
                    throw new Exception(label + Text.Get("source.deckv3validator.24"));
                for (int row = item.row; row < item.row + item.height; row++)
                    for (int column = item.column; column < item.column + item.width; column++)
                    {
                        if (used[row, column]) throw new Exception(label + Text.Get("source.deckv3validator.25"));
                        used[row, column] = true;
                    }
            }
        }
    }

    static ControlPlacement Placement(FaderV3 source)
    {
        return new ControlPlacement { row = source.row, column = source.column, width = source.width, height = source.height };
    }

    static ControlPlacement Effective(PageFadersV3 page, ControlPlacement shared, bool off, bool mic)
    {
        if (page == null) return off ? null : shared;
        if (mic ? page.micHidden : page.speakerHidden) return null;
        ControlPlacement own = mic ? page.mic : page.speaker;
        if (own == null && off) return null;
        return own ?? shared;
    }

    static void RequireFader(ControlPlacement placement, OrientationV3 orientation, string label)
    {
        if (!DeckLayout.ControlFits(placement, orientation.columns, orientation.rows))
            throw new Exception(label + Text.Get("source.deckv3validator.26"));
    }

    static bool Overlap(ControlPlacement a, ControlPlacement b)
    {
        return a != null && b != null && a.row < b.row + b.height && a.row + a.height > b.row
            && a.column < b.column + b.width && a.column + a.width > b.column;
    }

    static void Mark(bool[,] used, ControlPlacement placement)
    {
        if (placement == null) return;
        for (int row = placement.row; row < placement.row + placement.height; row++)
            for (int column = placement.column; column < placement.column + placement.width; column++) used[row, column] = true;
    }

    static string Location(AppEntry entry)
    {
        bool portrait = entry.orientation == "portrait"; TilePosition position = DeckLayout.Position(entry, portrait);
        return (portrait ? Text.Get("source.deckv3validator.27") : Text.Get("source.deckv3validator.28")) + " " + ((position == null ? 0 : position.page) + 1) + Text.Get("source.deckv3validator.29") + (entry.name ?? Text.Get("source.deckv3validator.30")) + "』";
    }

    static string Positions(Settings settings)
    {
        var values = new List<string>();
        foreach (AppEntry entry in settings.apps)
        {
            bool portrait = entry.orientation == "portrait"; TilePosition position = DeckLayout.Position(entry, portrait);
            values.Add(entry.id + ":" + entry.orientation + ":" + position.page + ":" + position.row + ":" + position.column + ":" + entry.width + ":" + entry.height);
        }
        return String.Join("|", values.ToArray());
    }
}
