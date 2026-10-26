using System;

class MetricsSamplerTests
{
    static void Check(bool value, string message)
    {
        if (!value) throw new Exception("FAIL " + message);
        Console.WriteLine("PASS " + message);
    }

    static int counterRead;

    static MetricsSampler.SystemCounters Counters()
    {
        int step = counterRead++;
        return new MetricsSampler.SystemCounters
        {
            supported = true,
            available = true,
            idle = (ulong)(100 + step * 20),
            kernel = (ulong)(200 + step * 60),
            user = (ulong)(100 + step * 40),
        };
    }

    static MetricsSampler.MemoryCounters Memory()
    {
        return new MetricsSampler.MemoryCounters { available = true, total = 1000, availableBytes = 250 };
    }

    static void Main()
    {
        MetricsSampler.ResetForTests();
        try
        {
            counterRead = 0;
            int changed = 0;
            MetricsSampler.CounterReader = Counters;
            MetricsSampler.MemoryReader = Memory;
            MetricsSampler.GpuStarter = delegate { };
            MetricsSampler.GpuReader = delegate { return new GpuMetricInfo[0]; };
            MetricsSampler.GpuStopper = delegate { };
            MetricsSampler.Changed = delegate { changed++; };
            MetricsSampler.SetActive(true);
            var first = MetricsSampler.PublicSnapshot();
            Check(first.active && MetricsSampler.TimerArmed, "sampling starts with one armed timer");
            Check(first.cpuSupported && !first.cpuAvailable && first.memoryAvailable && first.memoryPercent == 75.0, "first sample waits for a CPU delta but reports memory immediately");

            MetricsSampler.SampleForTest();
            var second = MetricsSampler.PublicSnapshot();
            Check(second.cpuAvailable && second.cpuPercent == 80.0, "GetSystemTimes delta uses kernel plus user minus idle");
            Check(second.memoryUsedBytes == 750 && second.memoryTotalBytes == 1000, "physical memory usage is retained with its total");

            for (int i = 0; i < 40; i++) MetricsSampler.SampleForTest();
            var bounded = MetricsSampler.PublicSnapshot();
            Check(bounded.history.Length == 30, "two-second history is bounded to sixty seconds");
            Check(changed >= 42, "each completed sample publishes one update");

            var invalid = MetricsSampler.CalculateCpu(
                new MetricsSampler.SystemCounters { supported = true, available = true, idle = 20, kernel = 20, user = 20 },
                new MetricsSampler.SystemCounters { supported = true, available = true, idle = 10, kernel = 30, user = 30 }
            );
            Check(!invalid.HasValue, "counter rollback is treated as unavailable");

            MetricsSampler.SetActive(false);
            var stopped = MetricsSampler.PublicSnapshot();
            Check(!stopped.active && !MetricsSampler.TimerArmed && stopped.history.Length == 0, "sampling stops and clears stale data without subscribers");
        }
        finally
        {
            MetricsSampler.ResetForTests();
        }
    }
}
