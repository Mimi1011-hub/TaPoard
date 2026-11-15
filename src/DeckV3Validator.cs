using System;
using System.Collections.Generic;

static class DeckV3Validator
{
    internal static Settings Validate(DeckV3 source, Settings current, DeckController controller)
    {
        if (source == null) throw new Exception("配置がありません。");
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
        if (positions != Positions(candidate)) throw new Exception("配置を自動で移動せず、空いている枠へ置いてください。");
        return candidate;
    }

    static void ValidateOrientation(OrientationV3 orientation, bool portrait, HashSet<string> ids)
    {
        string direction = portrait ? "縦向き" : "横向き";
        if (orientation == null) throw new Exception(direction + "の配置がありません。");
        if (orientation.columns < 2 || orientation.columns > 8 || orientation.rows < 2 || orientation.rows > 8)
            throw new Exception(direction + "の列・行は2～8です。");
        if (orientation.pages == null || orientation.pages.Count < 1 || orientation.pages.Count > DeckLayout.MaxPages)
            throw new Exception(direction + "のページ数は1～40です。");
        int totalItems = 0;
        foreach (PageV3 page in orientation.pages) if (page != null && page.items != null) totalItems += page.items.Count;
        if (totalItems > 40) throw new Exception(direction + "のボタンは40個以内です。");
        if (orientation.faders == null || orientation.faders.speaker == null || orientation.faders.mic == null)
            throw new Exception(direction + "のフェーダーが正しくありません。");
        ControlPlacement sharedSpeaker = Placement(orientation.faders.speaker);
        ControlPlacement sharedMic = Placement(orientation.faders.mic);
        RequireFader(sharedSpeaker, orientation, direction + "のスピーカーフェーダー");
        RequireFader(sharedMic, orientation, direction + "のマイクフェーダー");
        if (Overlap(sharedSpeaker, sharedMic)) throw new Exception(direction + "のフェーダー同士が重なっています。");
        for (int pageIndex = 0; pageIndex < orientation.pages.Count; pageIndex++)
        {
            PageV3 page = orientation.pages[pageIndex];
            string pageLabel = direction + " " + (pageIndex + 1) + "ページ目";
            if (page == null) throw new Exception(pageLabel + "が正しくありません。");
            try { page.name = PageNames.Normalize(page.name); }
            catch (Exception error) { throw new Exception(pageLabel + "の" + error.Message); }
            ControlPlacement speaker = Effective(page.faders, sharedSpeaker, orientation.faders.speaker.off, false);
            ControlPlacement mic = Effective(page.faders, sharedMic, orientation.faders.mic.off, true);
            if (speaker != null) RequireFader(speaker, orientation, pageLabel + "のスピーカーフェーダー");
            if (mic != null) RequireFader(mic, orientation, pageLabel + "のマイクフェーダー");
            if (Overlap(speaker, mic)) throw new Exception(pageLabel + "のフェーダー同士が重なっています。");
            bool[,] used = new bool[orientation.rows, orientation.columns];
            Mark(used, speaker); Mark(used, mic);
            foreach (DeckItem item in page.items ?? new List<DeckItem>())
            {
                string name = item == null || String.IsNullOrWhiteSpace(item.name) ? "部品" : item.name.Trim();
                string label = pageLabel + "の『" + name + "』";
                if (item == null) throw new Exception(label + "が正しくありません。");
                if (!String.IsNullOrEmpty(item.id) && !ids.Add(item.id)) throw new Exception(label + "のIDが重複しています。");
                if (item.steps != null) throw new Exception(label + ": 操作の並びは 4.1 で使えるようになります。");
                AppEntry entry = SettingsMigration.ToApp(item, portrait, pageIndex);
                try { WidgetRegistry.ValidateDimensions(entry); }
                catch (Exception error) { throw new Exception(label + ": " + error.Message); }
                if (item.row < 0 || item.column < 0 || item.row + item.height > orientation.rows || item.column + item.width > orientation.columns)
                    throw new Exception(label + "が枠からはみ出しています。");
                for (int row = item.row; row < item.row + item.height; row++)
                    for (int column = item.column; column < item.column + item.width; column++)
                    {
                        if (used[row, column]) throw new Exception(label + "がほかの部品またはフェーダーと重なっています。");
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
            throw new Exception(label + "が枠からはみ出すか、大きさが正しくありません。");
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
        return (portrait ? "縦向き" : "横向き") + " " + ((position == null ? 0 : position.page) + 1) + "ページ目の『" + (entry.name ?? "部品") + "』";
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
