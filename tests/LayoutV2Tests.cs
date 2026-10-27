using System;
using System.Collections.Generic;

class LayoutV2Tests
{
    static void Check(bool value, string message)
    {
        if (!value) throw new Exception("FAIL " + message);
        Console.WriteLine("PASS " + message);
    }

    static void Reject(Action action, string message)
    {
        try { action(); throw new Exception("FAIL " + message); }
        catch (Exception e) { if (e.Message.StartsWith("FAIL ")) throw; Console.WriteLine("PASS " + message); }
    }

    static Settings Fixture()
    {
        return new Settings
        {
            schemaVersion = 2, token = "test", pairingKey = "pair", columns = 5, rows = 3,
            speakerSlot = 0, micSlot = 1, speakerSize = 1, micSize = 1,
            pageCount = 1, landscapePageCount = 1, portraitPageCount = 1,
            apps = new List<AppEntry>(), devices = new List<PairedDevice>(),
        };
    }

    static AppEntry Tile(string id, string orientation, int width, int height, int page, int row, int column)
    {
        return new AppEntry
        {
            id = id, name = id, type = "touchpad", orientation = orientation, width = width, height = height,
            size = 1, fontSize = 11, iconScale = 82, labelOpacity = 45, options = new Dictionary<string, object>(),
            landscape = orientation == "landscape" ? new TilePosition { page = page, row = row, column = column } : null,
            portrait = orientation == "portrait" ? new TilePosition { page = page, row = row, column = column } : null,
        };
    }

    static void Main()
    {
        // Program.LoadSettings creates this for a new installation: both legacy fader slots are 0.
        var fresh = new Settings { schemaVersion = 2, token = "test", pairingKey = "pair", apps = new List<AppEntry>(), devices = new List<PairedDevice>(), columns = 5, rows = 3, keepAwake = true };
        DeckLayout.Migrate(fresh);
        DeckLayout.Validate(fresh);
        Check(fresh.landscapeSpeaker.column == 0 && fresh.landscapeMic.column == 1 && fresh.portraitMic.column == 1, "new installation separates the default speaker and mic faders");

        var legacy = Fixture();
        legacy.apps.Add(new AppEntry { id = "old", name = "old", type = "hotkey", action = "common-copy", orientation = "landscape", size = 2, fontSize = 11, iconScale = 82, labelOpacity = 45, landscape = new TilePosition { page = 1, row = 1, column = 2 } });
        DeckLayout.Migrate(legacy);
        Check(legacy.apps[0].width == 2 && legacy.apps[0].height == 2, "legacy 2x2 size migrates once to width and height");
        Check(legacy.landscapeSpeaker.row == 0 && legacy.landscapeMic.column == 1, "legacy fader slots migrate to row and column");
        DeckLayout.Validate(legacy);

        var rectangular = Fixture(); DeckLayout.Migrate(rectangular);
        rectangular.landscapeSpeaker = new ControlPlacement { row = 0, column = 0, width = 3, height = 1 };
        rectangular.landscapeMic = new ControlPlacement { row = 1, column = 0, width = 1, height = 1 };
        rectangular.apps.Add(Tile("wide", "landscape", 3, 2, 1, 1, 1));
        WidgetRegistry.ValidateAndNormalize(rectangular.apps[0]);
        DeckLayout.Validate(rectangular);
        Check(rectangular.portraitSpeaker.width == 1 && rectangular.portraitMic.width == 1, "portrait controls stay independent from landscape rectangles");

        rectangular.apps.Add(Tile("control-overlap", "landscape", 3, 2, 2, 0, 0));
        WidgetRegistry.ValidateAndNormalize(rectangular.apps[1]);
        Reject(delegate { DeckLayout.Validate(rectangular); }, "fader space is reserved on every page");
        rectangular.apps.RemoveAt(1);

        rectangular.landscapeColumns = 2;
        Reject(delegate { DeckLayout.Validate(rectangular); }, "grid narrower than a 3-cell control is rejected");
        rectangular.landscapeColumns = 5;
        rectangular.apps.Add(Tile("overlap", "landscape", 3, 2, 1, 1, 2));
        WidgetRegistry.ValidateAndNormalize(rectangular.apps[1]);
        Reject(delegate { DeckLayout.Validate(rectangular); }, "overlapping rectangular widgets are rejected");
        rectangular.apps.RemoveAt(1);

        rectangular.landscapeSpeaker = new ControlPlacement { row = 0, column = 0, width = 1, height = 1 };
        rectangular.landscapeMic = new ControlPlacement { row = 0, column = 1, width = 1, height = 1 };
        rectangular.landscapeColumns = 3; rectangular.landscapeRows = 3;
        DeckLayout.Reflow(rectangular, "landscape", 5);
        DeckLayout.Validate(rectangular);
        Check(rectangular.apps[0].width == 3 && rectangular.apps[0].height == 2, "grid reflow preserves rectangular widget dimensions");

        // Per-page faders: page 2 hides the speaker and moves the mic, page 1 keeps the shared ones.
        var pages = Fixture(); DeckLayout.Migrate(pages);
        bool speakerHidden, micHidden;
        var page2 = DeckLayout.GetPageControls(pages, false, 1, out speakerHidden, out micHidden);
        page2.micRow = 2; page2.micColumn = 4; page2.micSlot = 14;
        DeckLayout.SetPageControls(pages, false, 1, page2, true, false);
        pages.apps.Add(Tile("under-shared", "landscape", 3, 2, 1, 0, 0));
        WidgetRegistry.ValidateAndNormalize(pages.apps[0]);
        DeckLayout.Validate(pages);
        Check(DeckLayout.PagePlacement(pages, false, false, 1) == null && DeckLayout.PagePlacement(pages, false, true, 1).column == 4, "a page can hide or move its own faders");
        pages.apps[0].landscape = new TilePosition { page = 0, row = 0, column = 0 };
        Reject(delegate { DeckLayout.Validate(pages); }, "other pages still reserve the shared fader space");
        pages.apps[0].landscape = new TilePosition { page = 1, row = 1, column = 2 };
        Reject(delegate { DeckLayout.Validate(pages); }, "a page's moved fader is reserved on that page");
        pages.apps.Clear();
        var shared = DeckLayout.GetControls(pages, false);
        DeckLayout.SetPageControls(pages, false, 1, shared, false, false);
        Check(DeckLayout.ControlPages(pages, false).Count == 0, "a page that matches the shared faders is not stored");
        pages.landscapeControlPages.Add(new ControlPage { page = 3, speakerHidden = true });
        pages.landscapeControlPages.Add(new ControlPage { page = 3, micHidden = true });
        Reject(delegate { DeckLayout.Validate(pages); }, "duplicate fader pages are rejected");
        pages.landscapeControlPages.Clear();

        // Larger faders: 4x1, 3x2 and 4x2 are allowed per page, 5x1 is not.
        foreach (var shape in new[] { new[] { 4, 1 }, new[] { 3, 2 }, new[] { 4, 2 } })
        {
            pages.landscapeControlPages.Clear();
            pages.landscapeControlPages.Add(new ControlPage { page = 0, speaker = new ControlPlacement { row = 1, column = 0, width = shape[0], height = shape[1] }, mic = new ControlPlacement { row = 0, column = 4, width = 1, height = 1 } });
            DeckLayout.Validate(pages);
        }
        Check(true, "4x1, 3x2 and 4x2 faders validate");
        pages.landscapeControlPages[0].speaker = new ControlPlacement { row = 1, column = 0, width = 5, height = 1 };
        Reject(delegate { DeckLayout.Validate(pages); }, "a 5x1 fader is rejected");
        pages.landscapeControlPages[0].speaker = new ControlPlacement { row = 1, column = 1, width = 4, height = 2 };
        pages.landscapeColumns = 4; pages.landscapeRows = 3;
        DeckLayout.Reflow(pages, "landscape", 5);
        DeckLayout.Validate(pages);
        Check(pages.landscapeControlPages[0].speaker.column == 0 && pages.landscapeControlPages[0].mic.column < 4, "grid reflow keeps per-page faders inside the grid");
    }
}
