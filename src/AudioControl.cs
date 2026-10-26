using System;
using System.Runtime.InteropServices;

class AudioState
{
    public System.Collections.Generic.List<AudioDeviceInfo> devices { get; set; }
    public int speakerVolume { get; set; }
    public bool speakerMuted { get; set; }
    public bool speakerAvailable { get; set; }
    public int micVolume { get; set; }
    public bool micMuted { get; set; }
    public bool micAvailable { get; set; }
}

static class AudioControl
{
    enum DataFlow
    {
        Render,
        Capture,
        All,
    }

    enum Role
    {
        Console,
        Multimedia,
        Communications,
    }

    const uint AllContexts = 23;

    internal static AudioState Read()
    {
        var state = new AudioState();
        try
        {
            int volume;
            bool muted;
            ReadEndpoint(DataFlow.Render, out volume, out muted);
            state.speakerVolume = volume;
            state.speakerMuted = muted;
            state.speakerAvailable = true;
        }
        catch { }
        try
        {
            int volume;
            bool muted;
            ReadEndpoint(DataFlow.Capture, out volume, out muted);
            state.micVolume = volume;
            state.micMuted = muted;
            state.micAvailable = true;
        }
        catch { }
        try
        {
            state.devices = AudioDevices.List();
        }
        catch { }
        return state;
    }

    internal static AudioState SetVolume(string target, int value)
    {
        if (value < 0 || value > 100)
            throw new Exception("音量は0から100で指定してください。");
        WithEndpoint(
            Flow(target),
            delegate(IAudioEndpointVolume endpoint)
            {
                Guid context = Guid.Empty;
                Marshal.ThrowExceptionForHR(endpoint.SetMasterVolumeLevelScalar(value / 100f, ref context));
            }
        );
        return ReadTarget(target);
    }

    internal static AudioState ToggleMute(string target)
    {
        WithEndpoint(
            Flow(target),
            delegate(IAudioEndpointVolume endpoint)
            {
                bool muted;
                Marshal.ThrowExceptionForHR(endpoint.GetMute(out muted));
                Guid context = Guid.Empty;
                Marshal.ThrowExceptionForHR(endpoint.SetMute(!muted, ref context));
            }
        );
        return ReadTarget(target);
    }

    static AudioState ReadTarget(string target)
    {
        var state = new AudioState();
        int volume;
        bool muted;
        ReadEndpoint(Flow(target), out volume, out muted);
        if (String.Equals(target, "mic", StringComparison.OrdinalIgnoreCase))
        {
            state.micVolume = volume;
            state.micMuted = muted;
            state.micAvailable = true;
        }
        else
        {
            state.speakerVolume = volume;
            state.speakerMuted = muted;
            state.speakerAvailable = true;
        }
        return state;
    }

    static DataFlow Flow(string target)
    {
        if (String.Equals(target, "speaker", StringComparison.OrdinalIgnoreCase))
            return DataFlow.Render;
        if (String.Equals(target, "mic", StringComparison.OrdinalIgnoreCase))
            return DataFlow.Capture;
        throw new Exception("不明な音量操作です。");
    }

    static void ReadEndpoint(DataFlow flow, out int volume, out bool muted)
    {
        int v = 0;
        bool m = false;
        WithEndpoint(
            flow,
            delegate(IAudioEndpointVolume endpoint)
            {
                float scalar;
                Marshal.ThrowExceptionForHR(endpoint.GetMasterVolumeLevelScalar(out scalar));
                Marshal.ThrowExceptionForHR(endpoint.GetMute(out m));
                v = (int)Math.Round(scalar * 100);
            }
        );
        volume = v;
        muted = m;
    }

    static void WithEndpoint(DataFlow flow, Action<IAudioEndpointVolume> action)
    {
        IMMDeviceEnumerator enumerator = null;
        IMMDevice device = null;
        IAudioEndpointVolume endpoint = null;
        object activated = null;
        try
        {
            enumerator = (IMMDeviceEnumerator)new MMDeviceEnumerator();
            Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(flow, Role.Multimedia, out device));
            Guid iid = typeof(IAudioEndpointVolume).GUID;
            Marshal.ThrowExceptionForHR(device.Activate(ref iid, AllContexts, IntPtr.Zero, out activated));
            endpoint = (IAudioEndpointVolume)activated;
            action(endpoint);
        }
        finally
        {
            if (endpoint != null)
                Marshal.FinalReleaseComObject(endpoint);
            else if (activated != null && Marshal.IsComObject(activated))
                Marshal.FinalReleaseComObject(activated);
            if (device != null)
                Marshal.FinalReleaseComObject(device);
            if (enumerator != null)
                Marshal.FinalReleaseComObject(enumerator);
        }
    }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    class MMDeviceEnumerator { }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator
    {
        [PreserveSig]
        int EnumAudioEndpoints(DataFlow flow, uint stateMask, out IntPtr devices);

        [PreserveSig]
        int GetDefaultAudioEndpoint(DataFlow flow, Role role, out IMMDevice device);

        [PreserveSig]
        int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);

        [PreserveSig]
        int RegisterEndpointNotificationCallback(IntPtr client);

        [PreserveSig]
        int UnregisterEndpointNotificationCallback(IntPtr client);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice
    {
        [PreserveSig]
        int Activate(
            ref Guid iid,
            uint context,
            IntPtr activationParams,
            [MarshalAs(UnmanagedType.IUnknown)] out object instance
        );

        [PreserveSig]
        int OpenPropertyStore(uint access, out IntPtr properties);

        [PreserveSig]
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);

        [PreserveSig]
        int GetState(out uint state);
    }

    [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioEndpointVolume
    {
        [PreserveSig]
        int RegisterControlChangeNotify(IntPtr notify);

        [PreserveSig]
        int UnregisterControlChangeNotify(IntPtr notify);

        [PreserveSig]
        int GetChannelCount(out uint count);

        [PreserveSig]
        int SetMasterVolumeLevel(float level, ref Guid context);

        [PreserveSig]
        int SetMasterVolumeLevelScalar(float level, ref Guid context);

        [PreserveSig]
        int GetMasterVolumeLevel(out float level);

        [PreserveSig]
        int GetMasterVolumeLevelScalar(out float level);

        [PreserveSig]
        int SetChannelVolumeLevel(uint channel, float level, ref Guid context);

        [PreserveSig]
        int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid context);

        [PreserveSig]
        int GetChannelVolumeLevel(uint channel, out float level);

        [PreserveSig]
        int GetChannelVolumeLevelScalar(uint channel, out float level);

        [PreserveSig]
        int SetMute([MarshalAs(UnmanagedType.Bool)] bool muted, ref Guid context);

        [PreserveSig]
        int GetMute([MarshalAs(UnmanagedType.Bool)] out bool muted);

        [PreserveSig]
        int GetVolumeStepInfo(out uint step, out uint stepCount);

        [PreserveSig]
        int VolumeStepUp(ref Guid context);

        [PreserveSig]
        int VolumeStepDown(ref Guid context);

        [PreserveSig]
        int QueryHardwareSupport(out uint mask);

        [PreserveSig]
        int GetVolumeRange(out float min, out float max, out float increment);
    }
}
