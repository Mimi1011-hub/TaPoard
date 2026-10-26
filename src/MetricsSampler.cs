using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

class MetricsPoint
{
    public long timestamp { get; set; }
    public double? cpuPercent { get; set; }
    public double? memoryPercent { get; set; }
}

class MetricsSnapshot
{
    public bool active { get; set; }
    public bool cpuSupported { get; set; }
    public bool cpuAvailable { get; set; }
    public bool memoryAvailable { get; set; }
    public double? cpuPercent { get; set; }
    public double? memoryPercent { get; set; }
    public ulong memoryUsedBytes { get; set; }
    public ulong memoryTotalBytes { get; set; }
    public long sampledAt { get; set; }
    public MetricsPoint[] history { get; set; }
}

// A single process-wide sampler serves every visible metrics widget. It is armed
// only while DisplaySubscriptions contains at least one metrics widget.
static class MetricsSampler
{
    internal struct SystemCounters
    {
        internal bool supported;
        internal bool available;
        internal ulong idle;
        internal ulong kernel;
        internal ulong user;
    }

    internal struct MemoryCounters
    {
        internal bool available;
        internal ulong total;
        internal ulong availableBytes;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct FileTime
    {
        internal uint low;
        internal uint high;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    struct MemoryStatus
    {
        internal uint length;
        internal uint memoryLoad;
        internal ulong totalPhysical;
        internal ulong availablePhysical;
        internal ulong totalPageFile;
        internal ulong availablePageFile;
        internal ulong totalVirtual;
        internal ulong availableVirtual;
        internal ulong availableExtendedVirtual;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetSystemTimes(out FileTime idleTime, out FileTime kernelTime, out FileTime userTime);

    [DllImport("kernel32.dll")]
    static extern uint GetActiveProcessorCount(ushort groupNumber);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    static extern bool GlobalMemoryStatusEx(ref MemoryStatus status);

    const int IntervalMilliseconds = 2000;
    const int MaximumHistory = 30;
    static readonly object Sync = new object();
    static readonly Timer SampleTimer = new Timer(OnTimer, null, Timeout.Infinite, Timeout.Infinite);
    static readonly List<MetricsPoint> History = new List<MetricsPoint>();
    internal static Func<SystemCounters> CounterReader = ReadSystemCounters;
    internal static Func<MemoryCounters> MemoryReader = ReadMemoryCounters;
    internal static Action Changed;
    static bool running;
    static bool timerArmed;
    static bool havePrevious;
    static SystemCounters previous;
    static MetricsSnapshot latest = EmptySnapshot();

    internal static void OnSubscriptionsChanged()
    {
        SetActive(DisplaySubscriptions.Current().metrics.Count != 0);
    }

    internal static void SetActive(bool active)
    {
        bool sample = false;
        lock (Sync)
        {
            if (active == running)
                return;
            running = active;
            timerArmed = active;
            havePrevious = false;
            History.Clear();
            latest = EmptySnapshot();
            latest.active = active;
            SampleTimer.Change(Timeout.Infinite, Timeout.Infinite);
            sample = active;
        }
        if (sample)
        {
            TakeSample();
            lock (Sync)
            {
                if (running)
                    SampleTimer.Change(IntervalMilliseconds, Timeout.Infinite);
            }
        }
    }

    internal static MetricsSnapshot PublicSnapshot()
    {
        lock (Sync)
        {
            return new MetricsSnapshot
            {
                active = latest.active,
                cpuSupported = latest.cpuSupported,
                cpuAvailable = latest.cpuAvailable,
                memoryAvailable = latest.memoryAvailable,
                cpuPercent = latest.cpuPercent,
                memoryPercent = latest.memoryPercent,
                memoryUsedBytes = latest.memoryUsedBytes,
                memoryTotalBytes = latest.memoryTotalBytes,
                sampledAt = latest.sampledAt,
                history = History.ToArray(),
            };
        }
    }

    internal static bool TimerArmed
    {
        get { lock (Sync) return timerArmed; }
    }

    internal static double? CalculateCpu(SystemCounters before, SystemCounters after)
    {
        if (!before.supported || !after.supported || !before.available || !after.available || after.idle < before.idle || after.kernel < before.kernel || after.user < before.user)
            return null;
        ulong idle = after.idle - before.idle,
            kernel = after.kernel - before.kernel,
            user = after.user - before.user;
        if (UInt64.MaxValue - kernel < user)
            return null;
        ulong total = kernel + user;
        if (total == 0 || idle > total)
            return null;
        return Math.Round(100.0 * (total - idle) / total, 1, MidpointRounding.AwayFromZero);
    }

    internal static void SampleForTest()
    {
        TakeSample();
    }

    internal static void ResetForTests()
    {
        SetActive(false);
        CounterReader = ReadSystemCounters;
        MemoryReader = ReadMemoryCounters;
        Changed = null;
    }

    static void OnTimer(object state)
    {
        lock (Sync)
        {
            timerArmed = false;
            if (!running)
                return;
        }
        TakeSample();
        lock (Sync)
        {
            if (running)
            {
                timerArmed = true;
                SampleTimer.Change(IntervalMilliseconds, Timeout.Infinite);
            }
        }
    }

    static void TakeSample()
    {
        SystemCounters counters;
        MemoryCounters memory;
        try { counters = CounterReader(); }
        catch { counters = new SystemCounters(); }
        try { memory = MemoryReader(); }
        catch { memory = new MemoryCounters(); }
        Action changed = null;
        lock (Sync)
        {
            if (!running)
                return;
            double? cpu = havePrevious ? CalculateCpu(previous, counters) : null;
            previous = counters;
            havePrevious = counters.available;
            double? memoryPercent = null;
            ulong used = 0;
            if (memory.available && memory.total != 0 && memory.availableBytes <= memory.total)
            {
                used = memory.total - memory.availableBytes;
                memoryPercent = Math.Round(100.0 * used / memory.total, 1, MidpointRounding.AwayFromZero);
            }
            latest = new MetricsSnapshot
            {
                active = true,
                cpuSupported = counters.supported,
                cpuAvailable = cpu.HasValue,
                memoryAvailable = memoryPercent.HasValue,
                cpuPercent = cpu,
                memoryPercent = memoryPercent,
                memoryUsedBytes = used,
                memoryTotalBytes = memory.available ? memory.total : 0,
                sampledAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            };
            History.Add(new MetricsPoint { timestamp = latest.sampledAt, cpuPercent = cpu, memoryPercent = memoryPercent });
            if (History.Count > MaximumHistory)
                History.RemoveRange(0, History.Count - MaximumHistory);
            changed = Changed;
        }
        if (changed != null)
            changed();
    }

    static MetricsSnapshot EmptySnapshot()
    {
        return new MetricsSnapshot { cpuSupported = true, history = new MetricsPoint[0] };
    }

    static SystemCounters ReadSystemCounters()
    {
        // GetSystemTimes cannot describe every processor group as one value on
        // machines with more than 64 logical processors, so report unsupported
        // instead of showing a misleading partial percentage.
        try
        {
            if (GetActiveProcessorCount(UInt16.MaxValue) > 64)
                return new SystemCounters { supported = false };
        }
        catch (EntryPointNotFoundException) { }
        FileTime idle, kernel, user;
        if (!GetSystemTimes(out idle, out kernel, out user))
            return new SystemCounters { supported = false };
        return new SystemCounters
        {
            supported = true,
            available = true,
            idle = ToUInt64(idle),
            kernel = ToUInt64(kernel),
            user = ToUInt64(user),
        };
    }

    static MemoryCounters ReadMemoryCounters()
    {
        var status = new MemoryStatus();
        status.length = (uint)Marshal.SizeOf(typeof(MemoryStatus));
        if (!GlobalMemoryStatusEx(ref status))
            return new MemoryCounters();
        return new MemoryCounters
        {
            available = true,
            total = status.totalPhysical,
            availableBytes = status.availablePhysical,
        };
    }

    static ulong ToUInt64(FileTime value)
    {
        return ((ulong)value.high << 32) | value.low;
    }
}
