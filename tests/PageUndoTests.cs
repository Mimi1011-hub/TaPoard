using System;
using System.Collections.Generic;

public static class PageUndoTests
{
    static void Assert(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }

    static Settings Create(string name)
    {
        return new Settings
        {
            schemaVersion = 2,
            token = "token",
            pairingKey = "pairing",
            apps = new List<AppEntry> { new AppEntry { id = "one", name = name, type = "app" } },
            devices = new List<PairedDevice>(),
        };
    }

    static Settings Copy(Settings settings)
    {
        return IconPacks.Serializer().Deserialize<Settings>(IconPacks.Serializer().Serialize(settings));
    }

    public static int Main()
    {
        try
        {
            var undo = new PageUndo();
            Settings before = Create("before");
            Settings after = Create("after");
            undo.Remember(IconPacks.Serializer().Serialize(before), after, "portrait", 2);
            Settings restored;
            string orientation;
            int page;
            Assert(undo.TryTake(after, out restored, out orientation, out page), "unchanged settings can be restored");
            Assert(restored.apps[0].name == "before" && orientation == "portrait" && page == 2, "remembered settings and page are returned");
            Assert(!undo.TryTake(after, out restored, out orientation, out page), "undo is consumed after it is taken");

            undo.Remember(IconPacks.Serializer().Serialize(before), after, "landscape", 0);
            Settings changed = Copy(after);
            changed.apps[0].name = "changed";
            Assert(!undo.TryTake(changed, out restored, out orientation, out page), "button changes invalidate undo");

            undo.Remember(IconPacks.Serializer().Serialize(before), after, "landscape", 0);
            Settings deviceChanged = Copy(after);
            deviceChanged.devices.Add(new PairedDevice());
            Assert(undo.TryTake(deviceChanged, out restored, out orientation, out page), "device-only changes keep undo valid");

            Console.WriteLine("PASS PageUndoTests");
            return 0;
        }
        catch (Exception e)
        {
            Console.Error.WriteLine(e);
            return 1;
        }
    }
}
