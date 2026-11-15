using System;
using System.Collections.Generic;
using System.IO;

public static class ShortcutPacksTests
{
    static void Assert(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }

    static ShortcutPack Pack(string name, int count, string keys)
    {
        var shortcuts = new List<ShortcutPackItem>();
        for (int index = 0; index < count; index++)
            shortcuts.Add(new ShortcutPackItem
            {
                name = "Shortcut " + index,
                keys = keys,
                description = "Description",
                icon = "icon.png",
            });
        return new ShortcutPack
        {
            name = name,
            author = "Author",
            app = "Application",
            iconPack = "",
            shortcuts = shortcuts,
        };
    }

    static void Throws(Action action, string message)
    {
        try
        {
            action();
            throw new Exception("Expected error: " + message);
        }
        catch (Exception error)
        {
            if (error.Message.StartsWith("Expected error:")) throw;
        }
    }

    public static int Main()
    {
        string root = Path.Combine(Path.GetTempPath(), "tapoard-shortcut-packs-" + Guid.NewGuid().ToString("N"));
        try
        {
            string basic = Path.Combine(root, "basic");
            string id = ShortcutPacks.Save(basic, Pack("Pack", 1, "Ctrl+A"));
            Assert(ShortcutPacks.List(basic).Count == 1, "saved pack is listed");
            ShortcutPacks.Delete(basic, "../../outside");
            Assert(ShortcutPacks.List(basic).Count == 1, "invalid id deletes nothing");
            ShortcutPacks.Delete(basic, id);
            Assert(ShortcutPacks.List(basic).Count == 0, "pack is deleted");

            Throws(delegate { ShortcutPacks.Save(Path.Combine(root, "keys"), Pack("Bad", 1, "Ctrl+NoSuchKey")); }, "invalid key");
            Throws(delegate { ShortcutPacks.Save(Path.Combine(root, "large"), Pack("Large", 301, "A")); }, "over 300");

            string full = Path.Combine(root, "full");
            for (int index = 0; index < ShortcutPacks.MaxPacks; index++)
                ShortcutPacks.Save(full, Pack("Pack " + index, 1, "F1"));
            Throws(delegate { ShortcutPacks.Save(full, Pack("Too many", 1, "F2")); }, "21st pack");
            Assert(ShortcutPacks.List(full).Count == ShortcutPacks.MaxPacks, "pack limit is preserved");

            Console.WriteLine("PASS ShortcutPacksTests");
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error);
            return 1;
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, true);
        }
    }
}
