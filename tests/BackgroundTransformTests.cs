using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

public static class BackgroundTransformTests
{
    static void Check(bool value, string message)
    {
        if (!value) throw new Exception(message);
        Console.WriteLine("PASS " + message);
    }

    public static int Main()
    {
        Text.Use("ja");
        string root = Path.Combine(Path.GetTempPath(), "tapoard-background-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            Settings settings = Program.NewSettings();
            DeckLayout.Migrate(settings);
            settings.background = new DeckBackground
            {
                color = "#123456",
                landscape = new BackgroundPosition { fit = "cover", x = 40, y = 60, zoom = 1.2, flipX = true, rotate = 90 },
                portrait = new BackgroundPosition { fit = "contain", x = 55, y = 45, zoom = 1.1, flipY = true, rotate = 270 },
            };
            string id = IconStyles.Save(root, "Transform", settings);
            settings.background.landscape = new BackgroundPosition { fit = "cover", x = 50, y = 50, zoom = 1 };
            settings.background.portrait = new BackgroundPosition { fit = "cover", x = 50, y = 50, zoom = 1 };
            IconStyles.Apply(root, id, settings, delegate { });
            Check(settings.background.landscape.flipX && settings.background.landscape.rotate == 90,
                "saved looks restore the landscape background transform");
            Check(settings.background.portrait.flipY && settings.background.portrait.rotate == 270,
                "saved looks restore the portrait background transform");
            settings.landscapePageCount = 2;
            settings.portraitPageCount = 2;
            settings.pageCount = 2;
            settings.landscapeSpeakerOff = true;
            settings.landscapeMicOff = true;
            settings.portraitSpeakerOff = true;
            settings.portraitMicOff = true;
            settings.landscapeControlPages = new List<ControlPage>
            {
                new ControlPage
                {
                    page = 1,
                    speaker = new ControlPlacement { row = 0, column = 0, width = 1, height = 1 },
                    micHidden = true,
                },
            };
            settings.apps.Add(new AppEntry
            {
                id = "landscape", name = "Landscape", type = "hotkey", action = "media-play", orientation = "landscape",
                landscape = new TilePosition { page = 0, row = 0, column = 0 }, width = 1, height = 1,
                iconKey = "play", iconColor = "#3569c8", fontSize = 11, iconScale = 82, labelOpacity = 45,
            });
            settings.apps.Add(new AppEntry
            {
                id = "portrait", name = "Portrait", type = "hotkey", action = "media-play", orientation = "portrait",
                portrait = new TilePosition { page = 1, row = 0, column = 0 }, width = 1, height = 1,
                iconKey = "play", iconColor = "#3569c8", fontSize = 11, iconScale = 82, labelOpacity = 45,
            });
            string exportId = IconStyles.Save(root, "Screen", settings);
            string exportName;
            byte[] exported = IconStyles.ExportPresets(root, exportId, out exportName);
            var file = IconPacks.Serializer().Deserialize<PresetTransferFile>(Encoding.UTF8.GetString(exported));
            Check(exportName == "Screen" && file.presets.Count == 3, "saved 3.1 screens export non-empty pages as presets");
            Check(file.presets[0].name == "Screen 横 1" && file.presets[1].speaker != null
                && file.presets[2].name == "Screen 縦 2", "saved screen preset names and effective faders are exported");
            Check(!Encoding.UTF8.GetString(exported).Contains("\"background\":"), "saved screen preset files omit the background");
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error);
            return 1;
        }
        finally
        {
            Directory.Delete(root, true);
        }
    }
}
