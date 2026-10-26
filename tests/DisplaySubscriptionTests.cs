using System;
using System.Collections.Generic;

class DisplaySubscriptionTests
{
    static void Check(bool value, string message)
    {
        if (!value) throw new Exception("FAIL " + message);
        Console.WriteLine("PASS " + message);
    }

    static void Reject(Action action, string message)
    {
        try { action(); throw new Exception("FAIL " + message); }
        catch (Exception e)
        {
            if (e.Message.StartsWith("FAIL ")) throw;
            Console.WriteLine("PASS " + message);
        }
    }

    static AppEntry Widget(string id, string type)
    {
        return new AppEntry { id = id, name = id, type = type };
    }

    static void Main()
    {
        DateTime now = new DateTime(2030, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var apps = new List<AppEntry>
        {
            Widget("metrics-1", "metrics"),
            Widget("weather-1", "weather"),
            Widget("clock-1", "clock"),
        };
        Func<DateTime> originalClock = DisplaySubscriptions.Clock;
        Action originalChanged = DisplaySubscriptions.Changed;
        int changes = 0;
        try
        {
            DisplaySubscriptions.ClearAll();
            DisplaySubscriptions.Clock = delegate { return now; };
            DisplaySubscriptions.Changed = delegate { changes++; };

            DisplaySubscriptions.Update(
                "device-a:view-a",
                apps,
                new[] { "metrics-1", "weather-1", "clock-1", "unknown" },
                true,
                true
            );
            var first = DisplaySubscriptions.Current();
            Check(first.sessions == 1, "one visible browser view creates one lease");
            Check(first.metrics.SetEquals(new[] { "metrics-1" }), "only configured metrics widgets are subscribed");
            Check(first.weather.SetEquals(new[] { "weather-1" }), "only configured weather widgets are subscribed");
            Check(first.timerArmed, "one expiry timer is armed while a lease exists");

            DisplaySubscriptions.Update("device-b:view-b", apps, new[] { "metrics-1" }, true, true);
            var shared = DisplaySubscriptions.Current();
            Check(shared.sessions == 2 && shared.metrics.Count == 1, "multiple views share a deduplicated widget union");

            now = now.AddSeconds(11);
            DisplaySubscriptions.PruneNow();
            var metricsExpired = DisplaySubscriptions.Current();
            Check(metricsExpired.metrics.Count == 0, "metrics leases expire after ten seconds without renewal");
            Check(metricsExpired.weather.SetEquals(new[] { "weather-1" }), "weather lease survives the shorter metrics timeout");
            Check(metricsExpired.sessions == 1, "empty view leases are removed on expiry");

            DisplaySubscriptions.Update(
                "device-a:view-a",
                apps,
                new[] { "metrics-1", "weather-1" },
                false,
                true
            );
            Check(DisplaySubscriptions.Current().metrics.Count == 0, "weather-only sync does not resurrect metrics sampling");
            now = now.AddSeconds(61);
            DisplaySubscriptions.PruneNow();
            var allExpired = DisplaySubscriptions.Current();
            Check(allExpired.sessions == 0 && !allExpired.timerArmed, "idle state removes every lease and disables the timer");

            DisplaySubscriptions.Update("device-a:view-a", apps, new[] { "weather-1" }, true, true);
            DisplaySubscriptions.RemoveUnknown(new[] { Widget("metrics-1", "metrics") });
            Check(DisplaySubscriptions.Current().sessions == 0, "deleted widgets are removed from subscriptions immediately");

            DisplaySubscriptions.Update("device-a:view-a", apps, new[] { "metrics-1" }, true, true);
            DisplaySubscriptions.RemoveUnknown(new[] { Widget("metrics-1", "clock") });
            Check(DisplaySubscriptions.Current().sessions == 0, "changing a widget type removes its stale subscription immediately");

            for (int i = 0; i < 32; i++)
                DisplaySubscriptions.Update("session-" + i, apps, new[] { "metrics-1" }, true, true);
            Reject(
                delegate { DisplaySubscriptions.Update("session-overflow", apps, new[] { "metrics-1" }, true, true); },
                "browser view count is bounded"
            );
            var tooMany = new List<string>();
            for (int i = 0; i < 41; i++) tooMany.Add("id-" + i);
            Reject(
                delegate { DisplaySubscriptions.Update("session-0", apps, tooMany, true, true); },
                "visible widget request count is bounded"
            );
            Check(changes > 0, "subscription changes can wake future collectors");
        }
        finally
        {
            DisplaySubscriptions.ClearAll();
            DisplaySubscriptions.Clock = originalClock;
            DisplaySubscriptions.Changed = originalChanged;
        }
    }
}
