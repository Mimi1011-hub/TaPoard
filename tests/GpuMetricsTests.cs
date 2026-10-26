using System;
using System.Collections.Generic;

class GpuMetricsTests
{
    static void Check(bool value, string message)
    {
        if (!value) throw new Exception("FAIL " + message);
        Console.WriteLine("PASS " + message);
    }

    static GpuMetrics.CounterItem Item(string name, double value)
    {
        return new GpuMetrics.CounterItem { name = name, value = value };
    }

    static void Main()
    {
        var adapters = new[]
        {
            new GpuMetrics.AdapterInfo { id = "luid_0x00000000_0x00000001", name = "GPU A", dedicatedBytes = 1000, sharedBytes = 4000 },
            new GpuMetrics.AdapterInfo { id = "luid_0x00000000_0x00000002", name = "GPU B", dedicatedBytes = 0, sharedBytes = 2000 },
        };
        var engines = new[]
        {
            Item("pid_1_luid_0x0_0x1_phys_0_eng_0_engtype_3D", 40),
            Item("pid_2_luid_0x0_0x1_phys_0_eng_0_engtype_3D", 30),
            Item("pid_1_luid_0x0_0x1_phys_0_eng_1_engtype_Copy", 90),
            Item("pid_3_luid_0x0_0x2_phys_0_eng_0_engtype_3D", 20),
        };
        var dedicated = new[]
        {
            Item("pid_1_luid_0x0_0x1_phys_0", 100),
            Item("pid_2_luid_0x0_0x1_phys_0", 200),
        };
        var shared = new[] { Item("pid_3_luid_0x0_0x2_phys_0", 500) };
        var result = GpuMetrics.Build(adapters, engines, dedicated, shared);
        Check(result.Length == 2, "DXGI adapters remain individually selectable");
        Check(result[0].utilizationPercent == 90.0, "process values are summed per engine and the busiest engine represents GPU usage");
        Check(result[0].memoryUsedBytes == 300 && result[0].memoryTotalBytes == 1000 && !result[0].sharedMemory, "dedicated GPU memory is aggregated by adapter LUID");
        Check(result[1].utilizationPercent == 20.0 && result[1].memoryUsedBytes == 500 && result[1].sharedMemory, "integrated adapters fall back to shared GPU memory");

        int stopped = 0;
        MetricsSampler.ResetForTests();
        try
        {
            int counter = 0;
            MetricsSampler.CounterReader = delegate
            {
                int step = counter++;
                return new MetricsSampler.SystemCounters { supported = true, available = true, idle = (ulong)(100 + step * 20), kernel = (ulong)(200 + step * 60), user = (ulong)(100 + step * 40) };
            };
            MetricsSampler.MemoryReader = delegate { return new MetricsSampler.MemoryCounters { available = true, total = 1000, availableBytes = 250 }; };
            MetricsSampler.GpuStarter = delegate { };
            MetricsSampler.GpuReader = delegate { return result; };
            MetricsSampler.GpuStopper = delegate { stopped++; };
            MetricsSampler.SetActive(true);
            MetricsSampler.SampleForTest();
            var snapshot = MetricsSampler.PublicSnapshot();
            Check(snapshot.gpus.Length == 2 && snapshot.history[1].gpus.Length == 2, "GPU values and bounded history share the metrics sampler");
            MetricsSampler.SetActive(false);
            Check(stopped == 1, "GPU query closes when the last metrics subscription stops");
        }
        finally { MetricsSampler.ResetForTests(); }

        GpuMetrics.Start();
        try
        {
            var native = GpuMetrics.Read();
            foreach (var gpu in native)
            {
                Check(!String.IsNullOrWhiteSpace(gpu.id) && !String.IsNullOrWhiteSpace(gpu.name), "native GPU has a stable LUID and name");
                Check(!gpu.utilizationPercent.HasValue || (gpu.utilizationPercent >= 0 && gpu.utilizationPercent <= 100), "native GPU usage stays in range");
            }
            Console.WriteLine("INFO native DXGI adapters: " + native.Length);
        }
        finally { GpuMetrics.Stop(); }
    }
}
