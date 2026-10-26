using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;

class GpuMetricInfo
{
    public string id { get; set; }
    public string name { get; set; }
    public bool utilizationAvailable { get; set; }
    public double? utilizationPercent { get; set; }
    public bool memoryAvailable { get; set; }
    public ulong memoryUsedBytes { get; set; }
    public ulong memoryTotalBytes { get; set; }
    public bool sharedMemory { get; set; }
}

class GpuMetricPoint
{
    public string id { get; set; }
    public double? utilizationPercent { get; set; }
    public double? memoryPercent { get; set; }
}

// Windows 10 exposes per-process GPU engine counters. Values belonging to the
// same physical engine are summed, then the busiest engine represents an
// adapter so parallel engines cannot inflate the result above 100 percent.
static class GpuMetrics
{
    internal sealed class AdapterInfo
    {
        internal string id;
        internal string name;
        internal ulong dedicatedBytes;
        internal ulong sharedBytes;
    }

    internal sealed class CounterItem
    {
        internal string name;
        internal double value;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct Luid
    {
        internal uint low;
        internal int high;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct AdapterDescription
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        internal string description;
        internal uint vendorId;
        internal uint deviceId;
        internal uint subSystemId;
        internal uint revision;
        internal UIntPtr dedicatedVideoMemory;
        internal UIntPtr dedicatedSystemMemory;
        internal UIntPtr sharedSystemMemory;
        internal Luid adapterLuid;
        internal uint flags;
    }

    [StructLayout(LayoutKind.Explicit, Size = 16)]
    struct FormattedValue
    {
        [FieldOffset(0)] internal uint status;
        [FieldOffset(8)] internal double doubleValue;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct FormattedItem
    {
        internal IntPtr name;
        internal FormattedValue value;
    }

    [ComImport, Guid("29038f61-3839-4626-91fd-086879011a05"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAdapter1
    {
        [PreserveSig] int SetPrivateData(ref Guid name, uint dataSize, IntPtr data);
        [PreserveSig] int SetPrivateDataInterface(ref Guid name, IntPtr unknown);
        [PreserveSig] int GetPrivateData(ref Guid name, ref uint dataSize, IntPtr data);
        [PreserveSig] int GetParent(ref Guid riid, out IntPtr parent);
        [PreserveSig] int EnumOutputs(uint output, out IntPtr result);
        [PreserveSig] int GetDesc(IntPtr description);
        [PreserveSig] int CheckInterfaceSupport(ref Guid interfaceName, out long version);
        [PreserveSig] int GetDesc1(out AdapterDescription description);
    }

    [ComImport, Guid("770aae78-f26f-4dba-a829-253c83d1b387"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IFactory1
    {
        [PreserveSig] int SetPrivateData(ref Guid name, uint dataSize, IntPtr data);
        [PreserveSig] int SetPrivateDataInterface(ref Guid name, IntPtr unknown);
        [PreserveSig] int GetPrivateData(ref Guid name, ref uint dataSize, IntPtr data);
        [PreserveSig] int GetParent(ref Guid riid, out IntPtr parent);
        [PreserveSig] int EnumAdapters(uint adapter, out IntPtr result);
        [PreserveSig] int MakeWindowAssociation(IntPtr window, uint flags);
        [PreserveSig] int GetWindowAssociation(out IntPtr window);
        [PreserveSig] int CreateSwapChain(IntPtr device, IntPtr description, out IntPtr swapChain);
        [PreserveSig] int CreateSoftwareAdapter(IntPtr module, out IntPtr adapter);
        [PreserveSig] int EnumAdapters1(uint adapter, out IAdapter1 result);
        [PreserveSig] bool IsCurrent();
    }

    [DllImport("dxgi.dll", CallingConvention = CallingConvention.StdCall)]
    static extern int CreateDXGIFactory1(ref Guid riid, out IntPtr factory);

    [DllImport("pdh.dll", CharSet = CharSet.Unicode)]
    static extern uint PdhOpenQueryW(string source, UIntPtr userData, out IntPtr query);

    [DllImport("pdh.dll", CharSet = CharSet.Unicode)]
    static extern uint PdhAddEnglishCounterW(IntPtr query, string path, UIntPtr userData, out IntPtr counter);

    [DllImport("pdh.dll")]
    static extern uint PdhCollectQueryData(IntPtr query);

    [DllImport("pdh.dll")]
    static extern uint PdhCloseQuery(IntPtr query);

    [DllImport("pdh.dll", CharSet = CharSet.Unicode)]
    static extern uint PdhGetFormattedCounterArrayW(
        IntPtr counter,
        uint format,
        ref uint bufferSize,
        ref uint itemCount,
        IntPtr items
    );

    const uint Success = 0;
    const uint MoreData = 0x800007D2;
    const uint FormatDouble = 0x00000200;
    const uint AdapterFlagSoftware = 2;
    static readonly object Sync = new object();
    static readonly Regex LuidPattern = new Regex("luid_0x([0-9a-f]+)_0x([0-9a-f]+)", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    static readonly Regex EnginePattern = new Regex("phys_([0-9]+)_eng_([0-9]+)", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    static IntPtr query;
    static IntPtr engineCounter;
    static IntPtr dedicatedCounter;
    static IntPtr sharedCounter;
    static List<AdapterInfo> adapters = new List<AdapterInfo>();

    internal static void Start()
    {
        lock (Sync)
        {
            CloseLocked();
            adapters = EnumerateAdapters();
            IntPtr opened;
            if (PdhOpenQueryW(null, UIntPtr.Zero, out opened) != Success)
                return;
            query = opened;
            AddCounter("\\GPU Engine(*)\\Utilization Percentage", out engineCounter);
            AddCounter("\\GPU Adapter Memory(*)\\Dedicated Usage", out dedicatedCounter);
            AddCounter("\\GPU Adapter Memory(*)\\Shared Usage", out sharedCounter);
            if (engineCounter == IntPtr.Zero && dedicatedCounter == IntPtr.Zero && sharedCounter == IntPtr.Zero)
            {
                CloseLocked();
                return;
            }
            PdhCollectQueryData(query); // rate counters need a baseline sample
        }
    }

    internal static GpuMetricInfo[] Read()
    {
        lock (Sync)
        {
            if (query == IntPtr.Zero)
                return Build(adapters, new CounterItem[0], new CounterItem[0], new CounterItem[0]);
            if (PdhCollectQueryData(query) != Success)
                return Build(adapters, new CounterItem[0], new CounterItem[0], new CounterItem[0]);
            return Build(adapters, ReadArray(engineCounter), ReadArray(dedicatedCounter), ReadArray(sharedCounter));
        }
    }

    internal static void Stop()
    {
        lock (Sync)
            CloseLocked();
    }

    internal static GpuMetricInfo[] Build(
        IEnumerable<AdapterInfo> sourceAdapters,
        IEnumerable<CounterItem> engineItems,
        IEnumerable<CounterItem> dedicatedItems,
        IEnumerable<CounterItem> sharedItems
    )
    {
        var engineTotals = new Dictionary<string, Dictionary<string, double>>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in engineItems)
        {
            string luid = LuidId(item.name), engine = EngineId(item.name);
            if (luid == null || engine == null || Double.IsNaN(item.value) || Double.IsInfinity(item.value)) continue;
            Dictionary<string, double> engines;
            if (!engineTotals.TryGetValue(luid, out engines)) engineTotals[luid] = engines = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
            double current;
            engines.TryGetValue(engine, out current);
            engines[engine] = current + Math.Max(0, item.value);
        }
        var dedicated = SumByLuid(dedicatedItems);
        var shared = SumByLuid(sharedItems);
        var result = new List<GpuMetricInfo>();
        foreach (var adapter in sourceAdapters)
        {
            Dictionary<string, double> engines;
            double utilization = 0;
            bool utilizationAvailable = engineTotals.TryGetValue(adapter.id, out engines) && engines.Count != 0;
            if (utilizationAvailable)
                foreach (double value in engines.Values) utilization = Math.Max(utilization, Math.Min(100, value));
            bool useShared = adapter.dedicatedBytes == 0;
            ulong total = useShared ? adapter.sharedBytes : adapter.dedicatedBytes;
            double rawUsed;
            bool memoryAvailable = (useShared ? shared : dedicated).TryGetValue(adapter.id, out rawUsed) && total != 0;
            ulong used = memoryAvailable ? (ulong)Math.Max(0, Math.Min((double)total, rawUsed)) : 0;
            result.Add(new GpuMetricInfo
            {
                id = adapter.id,
                name = adapter.name,
                utilizationAvailable = utilizationAvailable,
                utilizationPercent = utilizationAvailable ? (double?)Math.Round(utilization, 1, MidpointRounding.AwayFromZero) : null,
                memoryAvailable = memoryAvailable,
                memoryUsedBytes = used,
                memoryTotalBytes = total,
                sharedMemory = useShared,
            });
        }
        return result.ToArray();
    }

    static Dictionary<string, double> SumByLuid(IEnumerable<CounterItem> items)
    {
        var result = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in items)
        {
            string luid = LuidId(item.name);
            if (luid == null || Double.IsNaN(item.value) || Double.IsInfinity(item.value)) continue;
            double current;
            result.TryGetValue(luid, out current);
            result[luid] = current + Math.Max(0, item.value);
        }
        return result;
    }

    static string LuidId(string value)
    {
        Match match = LuidPattern.Match(value ?? "");
        if (!match.Success) return null;
        uint high, low;
        if (!UInt32.TryParse(match.Groups[1].Value, System.Globalization.NumberStyles.HexNumber, null, out high)
            || !UInt32.TryParse(match.Groups[2].Value, System.Globalization.NumberStyles.HexNumber, null, out low)) return null;
        return "luid_0x" + high.ToString("x8") + "_0x" + low.ToString("x8");
    }

    static string EngineId(string value)
    {
        Match match = EnginePattern.Match(value ?? "");
        return match.Success ? match.Groups[1].Value + ":" + match.Groups[2].Value : null;
    }

    static void AddCounter(string path, out IntPtr counter)
    {
        IntPtr added;
        counter = PdhAddEnglishCounterW(query, path, UIntPtr.Zero, out added) == Success ? added : IntPtr.Zero;
    }

    static CounterItem[] ReadArray(IntPtr counter)
    {
        if (counter == IntPtr.Zero) return new CounterItem[0];
        uint size = 0, count = 0;
        uint status = PdhGetFormattedCounterArrayW(counter, FormatDouble, ref size, ref count, IntPtr.Zero);
        if (status != MoreData || size == 0) return new CounterItem[0];
        IntPtr buffer = Marshal.AllocHGlobal((int)size);
        try
        {
            status = PdhGetFormattedCounterArrayW(counter, FormatDouble, ref size, ref count, buffer);
            if (status != Success) return new CounterItem[0];
            int stride = Marshal.SizeOf(typeof(FormattedItem));
            var result = new List<CounterItem>();
            for (int i = 0; i < count; i++)
            {
                var item = (FormattedItem)Marshal.PtrToStructure(IntPtr.Add(buffer, i * stride), typeof(FormattedItem));
                if (item.value.status > 1) continue;
                string name = Marshal.PtrToStringUni(item.name);
                if (!String.IsNullOrEmpty(name)) result.Add(new CounterItem { name = name, value = item.value.doubleValue });
            }
            return result.ToArray();
        }
        finally { Marshal.FreeHGlobal(buffer); }
    }

    static List<AdapterInfo> EnumerateAdapters()
    {
        var result = new List<AdapterInfo>();
        IFactory1 factory = null;
        IntPtr factoryPointer = IntPtr.Zero;
        try
        {
            Guid id = typeof(IFactory1).GUID;
            int createStatus = CreateDXGIFactory1(ref id, out factoryPointer);
            if (createStatus < 0 || factoryPointer == IntPtr.Zero) return result;
            factory = (IFactory1)Marshal.GetObjectForIUnknown(factoryPointer);
            Marshal.Release(factoryPointer);
            factoryPointer = IntPtr.Zero;
            for (uint index = 0; index < 32; index++)
            {
                IAdapter1 adapter;
                int status = factory.EnumAdapters1(index, out adapter);
                if (status < 0 || adapter == null) break;
                try
                {
                    AdapterDescription description;
                    int descriptionStatus = adapter.GetDesc1(out description);
                    if (descriptionStatus < 0 || (description.flags & AdapterFlagSoftware) != 0) continue;
                    result.Add(new AdapterInfo
                    {
                        id = "luid_0x" + unchecked((uint)description.adapterLuid.high).ToString("x8") + "_0x" + description.adapterLuid.low.ToString("x8"),
                        name = (description.description ?? "GPU").TrimEnd('\0').Trim(),
                        dedicatedBytes = description.dedicatedVideoMemory.ToUInt64(),
                        sharedBytes = description.sharedSystemMemory.ToUInt64(),
                    });
                }
                finally { Marshal.FinalReleaseComObject(adapter); }
            }
        }
        catch { result.Clear(); }
        finally
        {
            if (factoryPointer != IntPtr.Zero) Marshal.Release(factoryPointer);
            if (factory != null) Marshal.FinalReleaseComObject(factory);
        }
        return result;
    }

    static void CloseLocked()
    {
        if (query != IntPtr.Zero) PdhCloseQuery(query);
        query = engineCounter = dedicatedCounter = sharedCounter = IntPtr.Zero;
    }
}
