using System;
using System.IO;

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
