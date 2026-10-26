using System;
using System.Collections.Generic;
using System.Threading;

// Tracks only widgets that are currently visible. A single one-shot timer expires
// leases; there is no periodic scan while nothing is subscribed.
static class DisplaySubscriptions
{
    sealed class Lease
    {
        internal string key;
        internal HashSet<string> metrics = new HashSet<string>(StringComparer.Ordinal);
        internal HashSet<string> weather = new HashSet<string>(StringComparer.Ordinal);
        internal DateTime metricsExpires;
        internal DateTime weatherExpires;
    }

    internal sealed class Snapshot
    {
        internal readonly HashSet<string> metrics;
        internal readonly HashSet<string> weather;
        internal readonly int sessions;
        internal readonly bool timerArmed;

        internal Snapshot(HashSet<string> metrics, HashSet<string> weather, int sessions, bool timerArmed)
        {
            this.metrics = metrics; this.weather = weather; this.sessions = sessions; this.timerArmed = timerArmed;
        }
    }

    static readonly object Sync = new object();
    static readonly Dictionary<string, Lease> Leases = new Dictionary<string, Lease>(StringComparer.Ordinal);
    static readonly Timer ExpiryTimer = new Timer(OnTimer, null, Timeout.Infinite, Timeout.Infinite);
    internal static Func<DateTime> Clock = delegate { return DateTime.UtcNow; };
    internal static Action Changed = null;
    static bool timerArmed;

    internal static void Update(
        string key,
        IEnumerable<AppEntry> configured,
        IEnumerable<string> visibleIds,
        bool renewMetrics,
        bool renewWeather
    )
    {
        if (String.IsNullOrEmpty(key) || key.Length > 160) throw new Exception("表示セッションが正しくありません。");
        var requested = new HashSet<string>(visibleIds ?? new string[0], StringComparer.Ordinal);
        if (requested.Count > 40) throw new Exception("表示部品が多すぎます。");
        var metrics = new HashSet<string>(StringComparer.Ordinal);
        var weather = new HashSet<string>(StringComparer.Ordinal);
        foreach (var app in configured)
        {
            if (!requested.Contains(app.id)) continue;
            if (String.Equals(app.type, "metrics", StringComparison.OrdinalIgnoreCase)) metrics.Add(app.id);
            else if (String.Equals(app.type, "weather", StringComparison.OrdinalIgnoreCase)) weather.Add(app.id);
        }
        DateTime now = Clock(); bool changed;
        lock (Sync)
        {
            changed = PruneLocked(now);
            Lease lease;
            if (!Leases.TryGetValue(key, out lease))
            {
                if (Leases.Count >= 32) throw new Exception("表示セッションが多すぎます。");
                lease = new Lease { key = key }; Leases.Add(key, lease);
            }
            if (renewMetrics)
            {
                changed |= !lease.metrics.SetEquals(metrics); lease.metrics = metrics;
                lease.metricsExpires = metrics.Count == 0 ? DateTime.MinValue : now.AddSeconds(10);
            }
            if (renewWeather)
            {
                changed |= !lease.weather.SetEquals(weather); lease.weather = weather;
                lease.weatherExpires = weather.Count == 0 ? DateTime.MinValue : now.AddSeconds(60);
            }
            if (lease.metrics.Count == 0 && lease.weather.Count == 0) { Leases.Remove(key); changed = true; }
            ArmLocked(now);
        }
        if (changed && Changed != null) Changed();
    }

    internal static void RemoveUnknown(IEnumerable<AppEntry> configured)
    {
        var metrics = new HashSet<string>(StringComparer.Ordinal);
        var weather = new HashSet<string>(StringComparer.Ordinal);
        foreach (var app in configured)
        {
            if (String.Equals(app.type, "metrics", StringComparison.OrdinalIgnoreCase)) metrics.Add(app.id);
            else if (String.Equals(app.type, "weather", StringComparison.OrdinalIgnoreCase)) weather.Add(app.id);
        }
        bool changed = false;
        lock (Sync)
        {
            foreach (var lease in Leases.Values)
            {
                changed |= lease.metrics.RemoveWhere(id => !metrics.Contains(id)) > 0;
                changed |= lease.weather.RemoveWhere(id => !weather.Contains(id)) > 0;
            }
            var empty = new List<string>();
            foreach (var pair in Leases) if (pair.Value.metrics.Count == 0 && pair.Value.weather.Count == 0) empty.Add(pair.Key);
            foreach (string key in empty) Leases.Remove(key);
            ArmLocked(Clock());
        }
        if (changed && Changed != null) Changed();
    }

    internal static void ClearAll()
    {
        bool changed;
        lock (Sync)
        {
            changed = Leases.Count != 0; Leases.Clear(); timerArmed = false;
            ExpiryTimer.Change(Timeout.Infinite, Timeout.Infinite);
        }
        if (changed && Changed != null) Changed();
    }

    internal static Snapshot Current()
    {
        lock (Sync)
        {
            DateTime now = Clock();
            PruneLocked(now);
            ArmLocked(now);
            var metrics = new HashSet<string>(StringComparer.Ordinal);
            var weather = new HashSet<string>(StringComparer.Ordinal);
            foreach (var lease in Leases.Values) { metrics.UnionWith(lease.metrics); weather.UnionWith(lease.weather); }
            return new Snapshot(metrics, weather, Leases.Count, timerArmed);
        }
    }

    internal static void PruneNow()
    {
        bool changed;
        lock (Sync) { changed = PruneLocked(Clock()); ArmLocked(Clock()); }
        if (changed && Changed != null) Changed();
    }

    static bool PruneLocked(DateTime now)
    {
        bool changed = false; var empty = new List<string>();
        foreach (var pair in Leases)
        {
            var lease = pair.Value;
            if (lease.metrics.Count != 0 && lease.metricsExpires <= now) { lease.metrics.Clear(); changed = true; }
            if (lease.weather.Count != 0 && lease.weatherExpires <= now) { lease.weather.Clear(); changed = true; }
            if (lease.metrics.Count == 0 && lease.weather.Count == 0) empty.Add(pair.Key);
        }
        foreach (string key in empty) Leases.Remove(key);
        return changed;
    }

    static void ArmLocked(DateTime now)
    {
        DateTime earliest = DateTime.MaxValue;
        foreach (var lease in Leases.Values)
        {
            if (lease.metrics.Count != 0 && lease.metricsExpires < earliest) earliest = lease.metricsExpires;
            if (lease.weather.Count != 0 && lease.weatherExpires < earliest) earliest = lease.weatherExpires;
        }
        if (earliest == DateTime.MaxValue)
        {
            timerArmed = false; ExpiryTimer.Change(Timeout.Infinite, Timeout.Infinite); return;
        }
        timerArmed = true;
        long milliseconds = Math.Max(1, Math.Min(Int32.MaxValue, (long)Math.Ceiling((earliest - now).TotalMilliseconds)));
        ExpiryTimer.Change((int)milliseconds, Timeout.Infinite);
    }

    static void OnTimer(object state)
    {
        bool changed;
        lock (Sync) { DateTime now = Clock(); changed = PruneLocked(now); ArmLocked(now); }
        if (changed && Changed != null) Changed();
    }
}
