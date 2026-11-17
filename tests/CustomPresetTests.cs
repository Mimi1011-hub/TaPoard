using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;

public static class CustomPresetTests
{
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };

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

    static DeckItem Item(string name, string type, string path, int column)
    {
        return new DeckItem
        {
            name = name, type = type, category = type == "app" ? "app" : "custom", path = path,
            args = "", url = type == "url" ? "https://example.com/" : "", text = type == "clipboard" ? "text" : "",
            row = 0, column = column, width = 1, height = 1, fontSize = 11, iconScale = 82,
            labelOpacity = 45, iconKey = "globe", iconColor = "#3569c8", customIcon = "",
        };
    }

    static PresetTransfer Transfer(CustomPreset preset)
    {
        return new PresetTransfer
        {
            name = preset.name, orientation = preset.orientation, columns = preset.columns, rows = preset.rows,
            speaker = preset.speaker, mic = preset.mic, items = preset.items,
        };
    }

    static byte[] FileBytes(List<PresetTransfer> presets)
    {
        var file = new PresetTransferFile { format = "tapoard-preset", version = 1, presets = presets };
        return new UTF8Encoding(false).GetBytes(Json.Serialize(file));
    }

    static void Reject(byte[] bytes, DeckController controller, string message)
    {
        bool rejected = false;
        try { PresetFiles.Read(bytes, controller); }
        catch { rejected = true; }
        Check(rejected, message);
    }

    static void CheckFiles(string root, Settings settings)
    {
        var state = new AppState(root, root, "test", new AppHost(new FakeKeySender(), new FakePointerInput(), new FakeAudioService(),
            new FakeAudioDevices(), new FakeShellActions()), new FakeSettingsStore());
        state.Config = settings;
        var controller = new DeckController(state, new FakeDesktop());
        string executable = typeof(CustomPresetTests).Assembly.Location;
        var preset = new CustomPreset
        {
            id = Guid.NewGuid().ToString("N"), name = "Shared", orientation = "landscape", columns = 5, rows = 3,
            items = new List<DeckItem> { Item("App", "app", executable, 0) },
        };
        preset.items[0].customIcon = "private-picture";
        preset.items[0].deviceId = "device";
        byte[] exported = PresetFiles.Export(new[] { preset });
        string exportedText = Encoding.UTF8.GetString(exported);
        PresetImport imported = PresetFiles.Read(exported, controller);
        Check(imported.presets.Count == 1 && imported.presets[0].name == preset.name
            && imported.presets[0].items[0].path == executable, "preset file round trip keeps the preset");
        Check(!exportedText.Contains("customIcon") && !exportedText.Contains("deviceId")
            && imported.presets[0].items[0].customIcon == null, "preset files remove private icons and audio devices");

        Reject(Encoding.UTF8.GetBytes("{broken"), controller, "broken preset files are rejected");
        Reject(Encoding.UTF8.GetBytes(exportedText.Replace("tapoard-preset", "other")), controller,
            "preset files with another format are rejected");
        var tooMany = new List<PresetTransfer>();
        for (int index = 0; index < 41; index++) tooMany.Add(Transfer(preset));
        Reject(FileBytes(tooMany), controller, "preset files with more than 40 presets are rejected");
        Reject(new byte[PresetFiles.MaxBytes + 1], controller, "preset files larger than 2 MB are rejected");

        CustomPreset overflow = Json.Deserialize<CustomPreset>(Json.Serialize(preset));
        overflow.items[0].column = 5;
        Reject(FileBytes(new List<PresetTransfer> { Transfer(overflow) }), controller, "items outside the grid are rejected");
        CustomPreset wrongSize = Json.Deserialize<CustomPreset>(Json.Serialize(preset));
        wrongSize.items[0] = Item("Pad", "touchpad", "", 0);
        Reject(FileBytes(new List<PresetTransfer> { Transfer(wrongSize) }), controller, "unsupported widget sizes are rejected");
        PresetImport privateIcon = PresetFiles.Read(FileBytes(new List<PresetTransfer> { Transfer(preset) }), controller);
        Check(privateIcon.presets[0].items[0].customIcon == null, "imported custom icons return to a built-in icon");

        CustomPreset risky = Json.Deserialize<CustomPreset>(Json.Serialize(preset));
        risky.items.Add(Item("URL", "url", "", 1));
        risky.items.Add(Item("Text", "clipboard", "", 2));
        risky.items[0].steps = new List<ActionStep>
        {
            new ActionStep { type = "app", path = executable },
            new ActionStep { type = "url", url = "https://example.com/" },
        };
        PresetSafety safety = PresetFiles.Safety(new[] { risky });
        Check(safety.apps == 2 && safety.urls == 2 && safety.texts == 1 && safety.paths.Count == 2,
            "preset safety counts action types and application paths");
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
            CheckFiles(root, Fixture());
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
