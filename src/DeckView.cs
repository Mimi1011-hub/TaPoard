using System.Collections.Generic;

static class DeckView
{
    internal static bool IsType(AppEntry app, string type)
    {
        return System.String.Equals(app.type, type, System.StringComparison.OrdinalIgnoreCase);
    }

    internal static void NormalizeControlSlots(Settings config)
    {
        DeckLayout.MigrateGrid(config);
        DeckLayout.MigrateControls(config);
        config.columns = config.landscapeColumns;
        config.rows = config.landscapeRows;
        config.speakerSlot = config.landscapeSpeakerSlot;
        config.micSlot = config.landscapeMicSlot;
        config.speakerSize = config.landscapeSpeakerSize;
        config.micSize = config.landscapeMicSize;
    }

    internal static object Controls(Settings config, bool portrait)
    {
        var c = DeckLayout.GetControls(config, portrait);
        return new { speakerSlot = c.speakerSlot, micSlot = c.micSlot, speakerSize = c.speakerSize, micSize = c.micSize,
            speakerRow = c.speakerRow, speakerColumn = c.speakerColumn, speakerWidth = c.speakerWidth, speakerHeight = c.speakerHeight,
            micRow = c.micRow, micColumn = c.micColumn, micWidth = c.micWidth, micHeight = c.micHeight,
            speakerHidden = DeckLayout.Off(config, portrait, false), micHidden = DeckLayout.Off(config, portrait, true) };
    }

    internal static object ControlPages(Settings config, bool portrait)
    {
        var pages = new List<object>();
        foreach (var entry in DeckLayout.ControlPages(config, portrait))
        {
            bool speakerHidden, micHidden;
            var c = DeckLayout.GetPageControls(config, portrait, entry.page, out speakerHidden, out micHidden);
            pages.Add(new { page = entry.page, speakerHidden = speakerHidden, micHidden = micHidden,
                speakerSlot = c.speakerSlot, micSlot = c.micSlot, speakerSize = c.speakerSize, micSize = c.micSize,
                speakerRow = c.speakerRow, speakerColumn = c.speakerColumn, speakerWidth = c.speakerWidth, speakerHeight = c.speakerHeight,
                micRow = c.micRow, micColumn = c.micColumn, micWidth = c.micWidth, micHeight = c.micHeight });
        }
        return pages;
    }

    internal static object Grid(Settings config, bool portrait)
    {
        return new { columns = DeckLayout.Columns(config, portrait), rows = DeckLayout.Rows(config, portrait) };
    }
}
