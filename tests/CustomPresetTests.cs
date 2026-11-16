using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

public static class CustomPresetTests
{
    static void Check(bool value, string message)
    {
        if (!value) throw new Exception(message);
        Console.WriteLine("PASS " + message);
    }

    static Settings Fixture()
    {
        var settings = new Settings
        {
            schemaVersion = 2,
            token = "test",
            devices = new List<PairedDevice>(),
            apps = new List<AppEntry>(),
            columns = 5,
            rows = 3,
            landscapeColumns = 5,
            landscapeRows = 3,
            portraitColumns = 3,
            portraitRows = 5,
            pageCount = 1,
            landscapePageCount = 1,
            portraitPageCount = 1,
            landscapeSpeaker = new ControlPlacement { row = 0, column = 4, width = 1, height = 1 },
            landscapeMic = new ControlPlacement { row = 2, column = 4, width = 1, height = 1 },
            portraitSpeaker = new ControlPlacement { row = 0, column = 2, width = 1, height = 1 },
            portraitMic = new ControlPlacement { row = 4, column = 2, width = 1, height = 1 },
            landscapeSpeakerOff = true,
            landscapeMicOff = true,
            portraitSpeakerOff = true,
            portraitMicOff = true,
            landscapeControlPages = new List<ControlPage>(),
            portraitControlPages = new List<ControlPage>(),
        };
        DeckLayout.Migrate(settings);
        DeckLayout.Validate(settings);
        return settings;
    }

    public static int Main()
    {
        Text.Use("ja");
        string root = Path.Combine(Path.GetTempPath(), "tapoard-presets-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            var store = new CustomPresets(root);
            Settings settings = Fixture();
            CustomPreset first = store.Save(settings, "仕事", "landscape", 0);
            Check(store.Read().Count == 1 && first.columns == 5 && first.rows == 3, "custom preset saves the page and grid");
            store.Rename(first.id, "会議");
            Check(store.Read()[0].name == "会議", "custom preset can be renamed");
            settings.landscapeColumns = 4; settings.landscapeRows = 4; settings.columns = 4; settings.rows = 4;
            int placed = store.Apply(settings, first.id, "landscape", 0, delegate { return Guid.NewGuid().ToString("N"); });
            Check(placed == 0 && settings.landscapeColumns == 5 && settings.landscapeRows == 3, "custom preset restores a different grid size");
            for (int index = 1; index < 30; index++) store.Save(Fixture(), "Preset " + index, "portrait", 0);
            bool limited = false;
            try { store.Save(Fixture(), "Too many", "portrait", 0); }
            catch (Exception error) { limited = error.Message.Contains("30"); }
            Check(limited, "custom presets are limited to 30");
            store.Delete(first.id);
            Check(store.Read().Count == 29, "custom preset can be deleted");
            File.WriteAllText(Path.Combine(root, "presets.json"), "{broken", Encoding.UTF8);
            Check(store.Read().Count == 0, "broken custom preset file is ignored");
            Settings viewport = Fixture();
            viewport.devices.Add(new PairedDevice { id = "phone", name = "Phone", credentialHash = Pairing.Hash("secret") });
            Check(Pairing.UpdateViewport(viewport, "Bearer secret", 390, 844), "paired phone viewport is accepted");
            Check(viewport.devices[0].viewportWidth == 390 && viewport.devices[0].viewportHeight == 844,
                "paired phone viewport is stored on its device");
            Check(!Pairing.UpdateViewport(viewport, "Bearer other", 400, 800), "another credential cannot change the viewport");
            Console.WriteLine("PASS CustomPresetTests");
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error);
            return 1;
        }
        finally { Directory.Delete(root, true); }
    }
}
