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
        var legacy = Fixture();
        legacy.apps.Add(new AppEntry { id = "old", name = "old", type = "hotkey", action = "common-copy", orientation = "landscape", size = 2, fontSize = 11, iconScale = 82, labelOpacity = 45, landscape = new TilePosition { page = 1, row = 0, column = 0 } });
        DeckLayout.Migrate(legacy);
        Check(legacy.apps[0].width == 2 && legacy.apps[0].height == 2, "legacy 2x2 size migrates once to width and height");
        Check(legacy.landscapeSpeaker.row == 0 && legacy.landscapeMic.column == 1, "legacy fader slots migrate to row and column");
        DeckLayout.Validate(legacy);

        var rectangular = Fixture(); DeckLayout.Migrate(rectangular);
        rectangular.landscapeSpeaker = new ControlPlacement { row = 0, column = 0, width = 3, height = 1 };
        rectangular.landscapeMic = new ControlPlacement { row = 1, column = 0, width = 1, height = 1 };
        rectangular.apps.Add(Tile("wide", "landscape", 3, 2, 1, 0, 0));
        WidgetRegistry.ValidateAndNormalize(rectangular.apps[0]);
        DeckLayout.Validate(rectangular);
        Check(rectangular.portraitSpeaker.width == 1 && rectangular.portraitMic.width == 1, "portrait controls stay independent from landscape rectangles");

        rectangular.landscapeColumns = 2;
        Reject(delegate { DeckLayout.Validate(rectangular); }, "grid narrower than a 3-cell control is rejected");
        rectangular.landscapeColumns = 5;
        rectangular.apps.Add(Tile("overlap", "landscape", 2, 3, 1, 0, 1));
        WidgetRegistry.ValidateAndNormalize(rectangular.apps[1]);
        Reject(delegate { DeckLayout.Validate(rectangular); }, "overlapping rectangular widgets are rejected");
        rectangular.apps.RemoveAt(1);

        rectangular.landscapeColumns = 3; rectangular.landscapeRows = 3;
        DeckLayout.Reflow(rectangular, "landscape", 5);
        DeckLayout.Validate(rectangular);
        Check(rectangular.apps[0].width == 3 && rectangular.apps[0].height == 2, "grid reflow preserves rectangular widget dimensions");
    }
}
