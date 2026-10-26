using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

class AudioDeviceInfo
{
    public string id { get; set; }
    public string name { get; set; }
    public string target { get; set; }
    public bool available { get; set; }
    public bool selected { get; set; }
}

// Device IDs, rather than names or list positions, keep each button tied to one endpoint.
static class AudioDevices
{
    static readonly object Gate = new object();

    internal static List<AudioDeviceInfo> List()
    {
        var result = new List<AudioDeviceInfo>();
        Enumerator enumerator = null;
        try
        {
            enumerator = (Enumerator)new DeviceEnumerator();
            for (int flow = 0; flow < 2; flow++)
            {
                string current = DefaultId(enumerator, flow, 1);
                Collection collection = null;
                try
                {
                    Marshal.ThrowExceptionForHR(enumerator.EnumAudioEndpoints(flow, 11, out collection));
                    uint count;
                    Marshal.ThrowExceptionForHR(collection.GetCount(out count));
                    for (uint i = 0; i < count; i++)
                    {
                        Device device = null;
                        PropertyStore properties = null;
                        try
                        {
                            Marshal.ThrowExceptionForHR(collection.Item(i, out device));
                            string id;
                            uint state;
                            Marshal.ThrowExceptionForHR(device.GetId(out id));
                            Marshal.ThrowExceptionForHR(device.GetState(out state));
                            string name = "音声デバイス";
                            Marshal.ThrowExceptionForHR(device.OpenPropertyStore(0, out properties));
                            var key = new PropertyKey
                            {
                                format = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"),
                                id = 14,
                            };
                            PropVariant value;
                            Marshal.ThrowExceptionForHR(properties.GetValue(ref key, out value));
                            try
                            {
                                if (value.type == 31 && value.pointer != IntPtr.Zero)
                                    name = Marshal.PtrToStringUni(value.pointer);
                            }
                            finally
                            {
                                PropVariantClear(ref value);
                            }
                            result.Add(
                                new AudioDeviceInfo
                                {
                                    id = id,
                                    name = name,
                                    target = flow == 0 ? "speaker" : "mic",
                                    available = state == 1,
                                    selected = id == current,
                                }
                            );
                        }
                        catch (COMException)
                        { /* A driver may remove an endpoint during enumeration. */
                        }
                        finally
                        {
                            Release(properties);
                            Release(device);
                        }
                    }
                }
                finally
                {
                    Release(collection);
                }
            }
        }
        finally
        {
            Release(enumerator);
        }
        return result;
    }

    internal static AudioDeviceInfo Validate(string target, string id)
    {
        if (target != "speaker" && target != "mic")
            throw new Exception("出力先または入力先を選んでください。");
        if (String.IsNullOrWhiteSpace(id) || id.Length > 1024)
            throw new Exception("切り替える機器を選んでください。");
        AudioDeviceInfo device = List().Find(d => d.id == id && d.target == target);
        if (device == null)
            throw new Exception("機器が見つかりません。PC設定画面で機器一覧を更新し、選び直してください。");
        return device;
    }

    internal static void Switch(string target, string id)
    {
        lock (Gate)
        {
            var device = Validate(target, id);
            if (!device.available)
                throw new Exception("指定した機器は未接続または無効です。接続してからもう一度押してください。");
            Enumerator enumerator = null;
            object instance = null;
            try
            {
                enumerator = (Enumerator)new DeviceEnumerator();
                int flow = target == "speaker" ? 0 : 1;
                var previous = new string[3];
                for (int role = 0; role < 3; role++)
                    previous[role] = DefaultId(enumerator, flow, role);
                instance = new PolicyClient();
                var policy = (Policy)instance;
                try
                {
                    // Multimedia, system sounds and default communications use the chosen endpoint.
                    for (int role = 0; role < 3; role++)
                        Marshal.ThrowExceptionForHR(policy.SetDefaultEndpoint(id, role));
                    for (int role = 0; role < 3; role++)
                        if (DefaultId(enumerator, flow, role) != id)
                            throw new Exception("切り替え結果を確認できませんでした。");
                }
                catch
                {
                    bool restored = true;
                    for (int role = 0; role < 3; role++)
                        try
                        {
                            if (previous[role] != null)
                                Marshal.ThrowExceptionForHR(policy.SetDefaultEndpoint(previous[role], role));
                            else
                                restored = false;
                        }
                        catch
                        {
                            restored = false;
                        }
                    throw new Exception(
                        restored
                            ? "機器を切り替えられませんでした。元の設定に戻しました。"
                            : "機器の切り替えが完了しませんでした。Windowsのサウンド設定を確認してください。"
                    );
                }
            }
            catch (COMException)
            {
                throw new Exception(
                    "このWindowsでは音声機器を切り替えられませんでした。Windowsのサウンド設定から変更してください。"
                );
            }
            catch (InvalidCastException)
            {
                throw new Exception("このWindowsでは音声機器の切り替えに対応していません。");
            }
            finally
            {
                Release(instance);
                Release(enumerator);
            }
        }
    }

    internal static string DefaultId(int flow, int role)
    {
        Enumerator e = null;
        try
        {
            e = (Enumerator)new DeviceEnumerator();
            return DefaultId(e, flow, role);
        }
        finally
        {
            Release(e);
        }
    }

    static string DefaultId(Enumerator e, int flow, int role)
    {
        Device device = null;
        try
        {
            if (e.GetDefaultAudioEndpoint(flow, role, out device) < 0)
                return null;
            string id;
            Marshal.ThrowExceptionForHR(device.GetId(out id));
            return id;
        }
        finally
        {
            Release(device);
        }
    }

    static void Release(object value)
    {
        if (value != null && Marshal.IsComObject(value))
            Marshal.ReleaseComObject(value);
    }

    [StructLayout(LayoutKind.Sequential)]
    struct PropertyKey
    {
        public Guid format;
        public uint id;
    }

    [StructLayout(LayoutKind.Explicit, Size = 24)]
    struct PropVariant
    {
        [FieldOffset(0)]
        public ushort type;

        [FieldOffset(8)]
        public IntPtr pointer;
    }

    [DllImport("ole32.dll")]
    static extern int PropVariantClear(ref PropVariant value);

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    class DeviceEnumerator { }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface Enumerator
    {
        [PreserveSig]
        int EnumAudioEndpoints(int flow, uint mask, out Collection devices);

        [PreserveSig]
        int GetDefaultAudioEndpoint(int flow, int role, out Device device);

        [PreserveSig]
        int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out Device device);
    }

    [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface Collection
    {
        [PreserveSig]
        int GetCount(out uint count);

        [PreserveSig]
        int Item(uint index, out Device device);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface Device
    {
        [PreserveSig]
        int Activate(ref Guid iid, uint context, IntPtr parameters, out IntPtr instance);

        [PreserveSig]
        int OpenPropertyStore(uint access, out PropertyStore properties);

        [PreserveSig]
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);

        [PreserveSig]
        int GetState(out uint state);
    }

    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface PropertyStore
    {
        [PreserveSig]
        int GetCount(out uint count);

        [PreserveSig]
        int GetAt(uint index, out PropertyKey key);

        [PreserveSig]
        int GetValue(ref PropertyKey key, out PropVariant value);
    }

    // Undocumented Windows PolicyConfig ABI. Keep all preceding vtable slots in order.
    [ComImport, Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")]
    class PolicyClient { }

    [ComImport, Guid("F8679F50-850A-41CF-9C72-430F290290C8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface Policy
    {
        void GetMixFormat();
        void GetDeviceFormat();
        void ResetDeviceFormat();
        void SetDeviceFormat();
        void GetProcessingPeriod();
        void SetProcessingPeriod();
        void GetShareMode();
        void SetShareMode();
        void GetPropertyValue();
        void SetPropertyValue();

        [PreserveSig]
        int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, int role);
    }
}
