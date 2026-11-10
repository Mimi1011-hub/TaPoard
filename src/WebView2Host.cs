using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32;

// Hosts the Edge WebView2 runtime that ships with Windows 10/11 without the WebView2 SDK.
// The runtime's own loader export creates the environment; every COM call goes through the
// documented vtable order of WebView2.h, so no interop assembly or extra download is needed.
// All calls must happen on the thread that created the host (an STA thread with a message loop).
sealed class WebView2Host
{
    // Vtable slots (IUnknown takes 0-2) from WebView2.h.
    const int EnvironmentCreateController = 3;
    const int ControllerPutIsVisible = 4,
        ControllerPutBounds = 6,
        ControllerAddAcceleratorKeyPressed = 19,
        ControllerNotifyParentWindowPositionChanged = 23,
        ControllerClose = 24,
        ControllerGetCoreWebView2 = 25;
    const int WebViewGetSettings = 3,
        WebViewNavigate = 5,
        WebViewAddNavigationCompleted = 15,
        WebViewAddProcessFailed = 25,
        WebViewAddScriptOnCreated = 27,
        WebViewExecuteScript = 29,
        WebViewAddWebMessageReceived = 34;
    const int MessageGetSource = 3,
        MessageTryGetString = 5;
    const int SettingsPutIsStatusBarEnabled = 10,
        SettingsPutAreDevToolsEnabled = 12,
        SettingsPutAreDefaultContextMenusEnabled = 14,
        SettingsPutIsZoomControlEnabled = 18;
    const int AcceleratorGetKind = 3,
        AcceleratorGetVirtualKey = 4,
        AcceleratorPutHandled = 8;

    IntPtr controller,
        webView;
    bool closed;

    // (virtual key, key down) -> true when the window handled it as a shortcut.
    internal Func<int, bool, bool> AcceleratorKey;
    internal Action NavigationCompleted;
    internal Action<string> WebMessage;
    internal Action ProcessFailed;

    internal bool IsReady
    {
        get { return webView != IntPtr.Zero && !closed; }
    }

    // Returns the loader DLL of the installed Evergreen runtime, or null.
    internal static string FindRuntime()
    {
        const string client = @"SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
        string arch =
            IntPtr.Size == 4 ? "x86"
            : String.Equals(Environment.GetEnvironmentVariable("PROCESSOR_ARCHITECTURE"), "ARM64", StringComparison.OrdinalIgnoreCase) ? "arm64"
            : "x64";
        var candidates = new List<string>();
        foreach (RegistryHive hive in new[] { RegistryHive.LocalMachine, RegistryHive.CurrentUser })
            foreach (RegistryView view in new[] { RegistryView.Registry32, RegistryView.Registry64 })
            {
                try
                {
                    using (var root = RegistryKey.OpenBaseKey(hive, view))
                    using (var key = root.OpenSubKey(client))
                    {
                        if (key == null)
                            continue;
                        string version = key.GetValue("pv") as string,
                            location = key.GetValue("location") as string;
                        if (String.IsNullOrEmpty(version) || version == "0.0.0.0" || String.IsNullOrEmpty(location))
                            continue;
                        candidates.Add(Path.Combine(location, version, "EBWebView", arch, "EmbeddedBrowserWebView.dll"));
                    }
                }
                catch { }
            }
        foreach (string path in candidates)
            if (File.Exists(path))
                return path;
        return null;
    }

    // Starts creating the browser inside parent. done(null) on success, done(message) on failure.
    internal void Create(IntPtr parent, string userDataFolder, Action<string> done)
    {
        string loader = FindRuntime();
        if (loader == null)
        {
            done("Microsoft Edge WebView2 ランタイムが見つかりません。");
            return;
        }
        IntPtr module = LoadLibrary(loader);
        IntPtr export = module == IntPtr.Zero ? IntPtr.Zero : GetProcAddress(module, "CreateWebViewEnvironmentWithOptionsInternal");
        if (export == IntPtr.Zero)
        {
            done("WebView2 ランタイムを読み込めませんでした。");
            return;
        }
        Directory.CreateDirectory(userDataFolder);
        // Dark before the first paint, so opening the window never flashes white.
        Environment.SetEnvironmentVariable("WEBVIEW2_DEFAULT_BACKGROUND_COLOR", "FF000000");
        var create = (CreateEnvironment)Marshal.GetDelegateForFunctionPointer(export, typeof(CreateEnvironment));
        var environmentDone = Callback.Completed(
            delegate(int hr, IntPtr environment)
            {
                if (closed)
                    return;
                if (hr < 0 || environment == IntPtr.Zero)
                {
                    done("WebView2 を開始できませんでした（0x" + hr.ToString("X8") + "）。");
                    return;
                }
                var controllerDone = Callback.Completed(
                    delegate(int hr2, IntPtr created)
                    {
                        if (hr2 < 0 || created == IntPtr.Zero)
                        {
                            done("WebView2 の表示を作成できませんでした（0x" + hr2.ToString("X8") + "）。");
                            return;
                        }
                        if (closed)
                            return;
                        Marshal.AddRef(created);
                        controller = created;
                        IntPtr core;
                        Check(Slot<GetPointer>(controller, ControllerGetCoreWebView2)(controller, out core));
                        webView = core;
                        ConfigureSettings();
                        HookEvents();
                        done(null);
                    }
                );
                int started = Slot<CreateController>(environment, EnvironmentCreateController)(environment, parent, controllerDone);
                if (started < 0)
                    done("WebView2 の表示を作成できませんでした（0x" + started.ToString("X8") + "）。");
            }
        );
        int result = create(true, 0, userDataFolder, IntPtr.Zero, environmentDone);
        if (result < 0)
            done("WebView2 を開始できませんでした（0x" + result.ToString("X8") + "）。");
    }

    void ConfigureSettings()
    {
        IntPtr settings;
        Check(Slot<GetPointer>(webView, WebViewGetSettings)(webView, out settings));
        try
        {
            Slot<PutBool>(settings, SettingsPutAreDefaultContextMenusEnabled)(settings, false);
            Slot<PutBool>(settings, SettingsPutIsStatusBarEnabled)(settings, false);
            Slot<PutBool>(settings, SettingsPutIsZoomControlEnabled)(settings, false);
            Slot<PutBool>(settings, SettingsPutAreDevToolsEnabled)(settings, false);
        }
        finally
        {
            Marshal.Release(settings);
        }
    }

    void HookEvents()
    {
        long token;
        Slot<AddHandler>(controller, ControllerAddAcceleratorKeyPressed)(
            controller,
            Callback.Event(
                delegate(IntPtr sender, IntPtr args)
                {
                    if (AcceleratorKey == null)
                        return;
                    int kind;
                    uint key;
                    if (Slot<GetInt>(args, AcceleratorGetKind)(args, out kind) < 0 || Slot<GetUInt>(args, AcceleratorGetVirtualKey)(args, out key) < 0)
                        return;
                    // 0/2 = (system) key down, 1/3 = (system) key up.
                    if (AcceleratorKey((int)key, kind == 0 || kind == 2))
                        Slot<PutBool>(args, AcceleratorPutHandled)(args, true);
                }
            ),
            out token
        );
        Slot<AddHandler>(webView, WebViewAddNavigationCompleted)(
            webView,
            Callback.Event(delegate { if (NavigationCompleted != null) NavigationCompleted(); }),
            out token
        );
        Slot<AddHandler>(webView, WebViewAddWebMessageReceived)(
            webView,
            Callback.Event(
                delegate(IntPtr sender, IntPtr args)
                {
                    if (WebMessage == null)
                        return;
                    // Only the TaPoard page served by this PC may move the window.
                    IntPtr source;
                    if (Slot<GetPointer>(args, MessageGetSource)(args, out source) < 0)
                        return;
                    string origin = Marshal.PtrToStringUni(source);
                    Marshal.FreeCoTaskMem(source);
                    if (origin == null || !origin.StartsWith("http://127.0.0.1:", StringComparison.Ordinal))
                        return;
                    IntPtr text;
                    if (Slot<GetPointer>(args, MessageTryGetString)(args, out text) < 0 || text == IntPtr.Zero)
                        return;
                    string message = Marshal.PtrToStringUni(text);
                    Marshal.FreeCoTaskMem(text);
                    WebMessage(message);
                }
            ),
            out token
        );
        Slot<AddHandler>(webView, WebViewAddProcessFailed)(
            webView,
            Callback.Event(delegate { if (ProcessFailed != null) ProcessFailed(); }),
            out token
        );
    }

    internal void SetBounds(Rectangle bounds)
    {
        if (!IsReady)
            return;
        Slot<PutRect>(controller, ControllerPutBounds)(
            controller,
            new RECT { left = bounds.Left, top = bounds.Top, right = bounds.Right, bottom = bounds.Bottom }
        );
    }

    internal void SetVisible(bool visible)
    {
        if (IsReady)
            Slot<PutBool>(controller, ControllerPutIsVisible)(controller, visible);
    }

    internal void ParentMoved()
    {
        if (IsReady)
            Slot<NoArgs>(controller, ControllerNotifyParentWindowPositionChanged)(controller);
    }

    internal void Navigate(string url)
    {
        if (IsReady)
            Check(Slot<PutString>(webView, WebViewNavigate)(webView, url));
    }

    internal void ExecuteScript(string script)
    {
        if (IsReady)
            Slot<PutStringWithHandler>(webView, WebViewExecuteScript)(webView, script, Callback.Completed(delegate { }, true));
    }

    internal void AddScriptOnDocumentCreated(string script)
    {
        if (IsReady)
            Slot<PutStringWithHandler>(webView, WebViewAddScriptOnCreated)(webView, script, Callback.Completed(delegate { }, true));
    }

    internal void Close()
    {
        if (closed)
            return;
        closed = true;
        if (controller != IntPtr.Zero)
        {
            try
            {
                Slot<NoArgs>(controller, ControllerClose)(controller);
            }
            catch { }
        }
        if (webView != IntPtr.Zero)
            Marshal.Release(webView);
        if (controller != IntPtr.Zero)
            Marshal.Release(controller);
        webView = controller = IntPtr.Zero;
    }

    static void Check(int hr)
    {
        if (hr < 0)
            Marshal.ThrowExceptionForHR(hr);
    }

    static T Slot<T>(IntPtr instance, int index)
        where T : class
    {
        IntPtr table = Marshal.ReadIntPtr(instance);
        return (T)(object)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(table, index * IntPtr.Size), typeof(T));
    }

    [StructLayout(LayoutKind.Sequential)]
    struct RECT
    {
        public int left,
            top,
            right,
            bottom;
    }

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int CreateEnvironment(
        [MarshalAs(UnmanagedType.Bool)] bool checkRunningInstance,
        int runtimeType,
        [MarshalAs(UnmanagedType.LPWStr)] string userDataFolder,
        IntPtr options,
        IntPtr handler
    );

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int CreateController(IntPtr self, IntPtr parent, IntPtr handler);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int GetPointer(IntPtr self, out IntPtr value);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int GetInt(IntPtr self, out int value);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int GetUInt(IntPtr self, out uint value);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int PutBool(IntPtr self, [MarshalAs(UnmanagedType.Bool)] bool value);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int PutRect(IntPtr self, RECT value);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int PutString(IntPtr self, [MarshalAs(UnmanagedType.LPWStr)] string value);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int PutStringWithHandler(IntPtr self, [MarshalAs(UnmanagedType.LPWStr)] string value, IntPtr handler);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int AddHandler(IntPtr self, IntPtr handler, out long token);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int NoArgs(IntPtr self);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern IntPtr LoadLibrary(string path);

    [DllImport("kernel32.dll", CharSet = CharSet.Ansi, SetLastError = true)]
    static extern IntPtr GetProcAddress(IntPtr module, string name);

    // A minimal hand-built COM object with one Invoke method. QueryInterface answers itself for
    // any interface, so it serves every WebView2 completed/event handler type. Objects that
    // must live for the whole session are kept; one-shot ones free themselves after Invoke.
    sealed class Callback
    {
        delegate int QueryInterfaceFn(IntPtr self, ref Guid iid, out IntPtr result);
        delegate uint RefFn(IntPtr self);
        delegate int InvokeCompletedFn(IntPtr self, int hr, IntPtr value);
        delegate int InvokeEventFn(IntPtr self, IntPtr sender, IntPtr args);

        static readonly List<Callback> Alive = new List<Callback>();
        static readonly QueryInterfaceFn Query = QueryImpl;
        static readonly RefFn AddRefDelegate = delegate { return 1; };
        static readonly RefFn ReleaseDelegate = delegate { return 1; };

        Delegate invoke;
        IntPtr table,
            instance;
        bool oneShot;

        static int QueryImpl(IntPtr self, ref Guid iid, out IntPtr result)
        {
            result = self;
            return 0;
        }

        internal static IntPtr Completed(Action<int, IntPtr> action, bool oneShot = false)
        {
            var c = new Callback { oneShot = oneShot };
            InvokeCompletedFn fn = delegate(IntPtr self, int hr, IntPtr value)
            {
                try
                {
                    action(hr, value);
                }
                catch { }
                if (c.oneShot)
                    c.Free();
                return 0;
            };
            return c.Build(fn);
        }

        internal static IntPtr Event(Action<IntPtr, IntPtr> action)
        {
            var c = new Callback();
            InvokeEventFn fn = delegate(IntPtr self, IntPtr sender, IntPtr args)
            {
                try
                {
                    action(sender, args);
                }
                catch { }
                return 0;
            };
            return c.Build(fn);
        }

        IntPtr Build(Delegate fn)
        {
            invoke = fn;
            table = Marshal.AllocHGlobal(IntPtr.Size * 4);
            Marshal.WriteIntPtr(table, 0, Marshal.GetFunctionPointerForDelegate(Query));
            Marshal.WriteIntPtr(table, IntPtr.Size, Marshal.GetFunctionPointerForDelegate(AddRefDelegate));
            Marshal.WriteIntPtr(table, IntPtr.Size * 2, Marshal.GetFunctionPointerForDelegate(ReleaseDelegate));
            Marshal.WriteIntPtr(table, IntPtr.Size * 3, Marshal.GetFunctionPointerForDelegate(invoke));
            instance = Marshal.AllocHGlobal(IntPtr.Size);
            Marshal.WriteIntPtr(instance, table);
            lock (Alive)
                Alive.Add(this);
            return instance;
        }

        // The runtime may still hold the pointer briefly after Invoke, so freeing is deferred.
        void Free()
        {
            timer = new System.Threading.Timer(
                delegate
                {
                    lock (Alive)
                        Alive.Remove(this);
                    Marshal.FreeHGlobal(instance);
                    Marshal.FreeHGlobal(table);
                    timer.Dispose();
                }
            );
            timer.Change(10000, System.Threading.Timeout.Infinite);
        }

        System.Threading.Timer timer;
    }
}
