using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// 3.0 PC window: the phone deck in a frameless window on this PC.
// It runs on its own per-monitor DPI aware UI thread so the deck stays sharp at any scaling,
// while the rest of TaPoard (tray, import window) keeps its existing DPI behaviour.
// The window never takes focus when the deck is clicked, so shortcuts reach the app the user
// was working in; YieldFocus() covers the cases where the window did become active.
static class PcWindowService
{
    // Set by Program before the first Open.
    internal static Func<PcWindowOptions> ReadOptions;
    internal static Action<PcWindowOptions> SaveState;
    internal static Func<string> DeckUrl;
    internal static Action OpenSettingsPage;
    internal static Action<string> Notify;
    // Called when the window opens or closes (3.1: the settings page moves the phone connection panel down).
    internal static Action Changed;
    internal static string UserDataFolder;

    static readonly object Sync = new object();
    static PcWindow window;
    static IntPtr lastExternal;
    static readonly int ProcessId = Process.GetCurrentProcess().Id;

    internal static bool IsOpen
    {
        get
        {
            lock (Sync)
                return window != null;
        }
    }

    internal static bool ViewOnly
    {
        get
        {
            lock (Sync)
                return window != null && window.ViewOnlyState;
        }
    }

    internal static bool RuntimeAvailable
    {
        get { return WebView2Host.FindRuntime() != null; }
    }

    internal static void Open(bool fullscreen)
    {
        lock (Sync)
        {
            if (window != null)
            {
                var w = window;
                RunOnWindow(delegate { w.ShowFromOutside(fullscreen); });
                return;
            }
            if (!RuntimeAvailable)
                throw new Exception("この PC には Microsoft Edge WebView2 ランタイムがありません。Windows Update を実行するか、ブラウザで操作画面を開いてください。");
            var ready = new ManualResetEvent(false);
            var thread = new Thread(
                delegate()
                {
                    PcWindow created = null;
                    try
                    {
                        DpiAwareness.EnterPerMonitorV2();
                        Application.EnableVisualStyles();
                        created = new PcWindow(ReadOptions(), fullscreen);
                        lock (Sync)
                            window = created;
                        ready.Set();
                        if (Changed != null) Changed();
                        Application.Run(created);
                    }
                    catch (Exception e)
                    {
                        if (Notify != null)
                            Notify("PC 用ウィンドウを開けませんでした：" + e.Message);
                    }
                    finally
                    {
                        lock (Sync)
                            if (window == created)
                                window = null;
                        ready.Set();
                        if (Changed != null) Changed();
                        UnhookForeground();
                    }
                }
            );
            thread.Name = "TaPoard PC window";
            thread.IsBackground = true;
            thread.SetApartmentState(ApartmentState.STA);
            thread.Start();
            Monitor.Exit(Sync);
            try
            {
                ready.WaitOne(10000);
            }
            finally
            {
                Monitor.Enter(Sync);
            }
        }
    }

    internal static void Apply(PcWindowOptions options)
    {
        RunOnWindow(w => w.ApplyOptions(options));
    }

    internal static void SetViewOnly(bool value)
    {
        RunOnWindow(w => w.SetViewOnly(value));
    }

    internal static void TokenChanged()
    {
        RunOnWindow(w => w.Reload());
    }

    internal static void Close()
    {
        RunOnWindow(w => w.CloseWithoutPrompt());
    }

    static void RunOnWindow(Action<PcWindow> action)
    {
        PcWindow w;
        lock (Sync)
            w = window;
        if (w == null || w.IsDisposed)
            return;
        try
        {
            w.BeginInvoke(new MethodInvoker(delegate
            {
                if (!w.IsDisposed)
                    action(w);
            }));
        }
        catch (InvalidOperationException) { }
    }

    // Called before every deck action. If a TaPoard window is in front, hands the foreground
    // back to the window the user was working in, so keys and clicks go there.
    internal static void YieldFocus()
    {
        IntPtr foreground = GetForegroundWindow(),
            target;
        lock (Sync)
            target = lastExternal;
        if (foreground == IntPtr.Zero || target == IntPtr.Zero || !IsWindow(target) || foreground == target)
            return;
        uint pid;
        GetWindowThreadProcessId(foreground, out pid);
        if (pid != ProcessId)
            return;
        uint current = GetCurrentThreadId(),
            foregroundThread = GetWindowThreadProcessId(foreground, IntPtr.Zero);
        bool attached = foregroundThread != current && AttachThreadInput(current, foregroundThread, true);
        try
        {
            SetForegroundWindow(target);
        }
        finally
        {
            if (attached)
                AttachThreadInput(current, foregroundThread, false);
        }
        Thread.Sleep(40);
    }

    // Puts a TaPoard window in front and makes it active although TaPoard is a background app
    // (the click came from the tray, a browser or a phone). Windows refuses SetForegroundWindow
    // to background apps unless their thread shares input with the app in front for a moment.
    internal static void ForceForeground(IntPtr handle)
    {
        IntPtr foreground = GetForegroundWindow();
        uint current = GetCurrentThreadId(),
            foregroundThread = foreground == IntPtr.Zero ? 0 : GetWindowThreadProcessId(foreground, IntPtr.Zero);
        bool attached = foregroundThread != 0 && foregroundThread != current && AttachThreadInput(current, foregroundThread, true);
        try
        {
            BringWindowToTop(handle);
            SetForegroundWindow(handle);
        }
        finally
        {
            if (attached)
                AttachThreadInput(current, foregroundThread, false);
        }
    }

    static WinEventProc foregroundProc;
    static IntPtr foregroundHook;

    // Must run on a thread with a message loop (the PC window thread).
    internal static void HookForeground()
    {
        if (foregroundHook != IntPtr.Zero)
            return;
        RememberIfExternal(GetForegroundWindow());
        foregroundProc = delegate(IntPtr hook, uint e, IntPtr hwnd, int obj, int child, uint thread, uint time)
        {
            RememberIfExternal(hwnd);
        };
        foregroundHook = SetWinEventHook(3, 3, IntPtr.Zero, foregroundProc, 0, 0, 0);
    }

    static void UnhookForeground()
    {
        if (foregroundHook != IntPtr.Zero)
            UnhookWinEvent(foregroundHook);
        foregroundHook = IntPtr.Zero;
    }

    static void RememberIfExternal(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero)
            return;
        uint pid;
        GetWindowThreadProcessId(hwnd, out pid);
        if (pid == ProcessId)
            return;
        lock (Sync)
            lastExternal = hwnd;
    }

    delegate void WinEventProc(IntPtr hook, uint eventType, IntPtr hwnd, int idObject, int idChild, uint thread, uint time);

    [DllImport("user32.dll")]
    static extern IntPtr SetWinEventHook(uint min, uint max, IntPtr module, WinEventProc proc, uint pid, uint thread, uint flags);

    [DllImport("user32.dll")]
    static extern bool UnhookWinEvent(IntPtr hook);

    [DllImport("user32.dll")]
    static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    static extern bool SetForegroundWindow(IntPtr window);

    [DllImport("user32.dll")]
    static extern bool IsWindow(IntPtr window);

    [DllImport("user32.dll")]
    static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    [DllImport("user32.dll")]
    static extern uint GetWindowThreadProcessId(IntPtr window, IntPtr processId);

    [DllImport("kernel32.dll")]
    static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    static extern bool AttachThreadInput(uint attach, uint attachTo, bool value);

    [DllImport("user32.dll")]
    static extern bool BringWindowToTop(IntPtr window);
}

static class DpiAwareness
{
    [DllImport("user32.dll")]
    static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);

    [DllImport("user32.dll")]
    static extern uint GetDpiForWindow(IntPtr window);

    internal static void EnterPerMonitorV2()
    {
        try
        {
            if (SetThreadDpiAwarenessContext(new IntPtr(-4)) == IntPtr.Zero)
                SetThreadDpiAwarenessContext(new IntPtr(-3));
        }
        catch (EntryPointNotFoundException) { }
    }

    [DllImport("user32.dll")]
    static extern uint GetDpiForSystem();

    internal static int SystemDpi()
    {
        try
        {
            uint dpi = GetDpiForSystem();
            return dpi == 0 ? 96 : (int)dpi;
        }
        catch (EntryPointNotFoundException)
        {
            return 96;
        }
    }

    internal static int ForWindow(IntPtr window)
    {
        try
        {
            uint dpi = GetDpiForWindow(window);
            return dpi == 0 ? 96 : (int)dpi;
        }
        catch (EntryPointNotFoundException)
        {
            return 96;
        }
    }
}

sealed class PcWindow : Form
{
    const int WM_NCHITTEST = 0x84,
        WM_NCLBUTTONDOWN = 0xA1,
        WM_GETMINMAXINFO = 0x24,
        WM_DPICHANGED = 0x02E0,
        WM_HOTKEY = 0x0312,
        WM_EXITSIZEMOVE = 0x0232,
        WM_MOUSEACTIVATE = 0x21,
        WM_SYSCOMMAND = 0x112;
    const int HTCLIENT = 1,
        HTCAPTION = 2,
        HTLEFT = 10,
        HTRIGHT = 11,
        HTTOP = 12,
        HTTOPLEFT = 13,
        HTTOPRIGHT = 14,
        HTBOTTOM = 15,
        HTBOTTOMLEFT = 16,
        HTBOTTOMRIGHT = 17;
    const int WS_EX_NOACTIVATE = 0x08000000,
        WS_EX_APPWINDOW = 0x00040000,
        WS_EX_LAYERED = 0x00080000,
        WS_EX_TRANSPARENT = 0x00000020,
        GWL_EXSTYLE = -20;
    const int HotkeyViewOnly = 1;

    PcWindowOptions options;
    WebView2Host web = new WebView2Host();
    readonly PcBar bar;
    readonly PcOverlay overlay;
    readonly PcGrip grip;
    readonly System.Windows.Forms.Timer revealTimer = new System.Windows.Forms.Timer { Interval = 120 };
    readonly System.Windows.Forms.Timer saveTimer = new System.Windows.Forms.Timer { Interval = 800 };
    int dpi = 96;
    bool fullscreen,
        maximized,
        viewOnly,
        allowClose,
        hotkeyRegistered,
        webStarted;
    Rectangle restoreBounds;
    DateTime lastInsideBar = DateTime.MinValue;
    string webError;

    internal bool ViewOnlyState
    {
        get { return viewOnly; }
    }

    float UiScale
    {
        get { return dpi / 96f; }
    }

    int BarHeight
    {
        get
        {
            int logical = options.buttonSize == "small" ? 30 : options.buttonSize == "large" ? 48 : 38;
            return (int)Math.Round(logical * UiScale);
        }
    }

    int Border
    {
        get { return maximized || fullscreen ? 0 : Math.Max(5, (int)Math.Round(8 * UiScale)); }
    }

    bool BarHidden
    {
        get { return fullscreen || options.autoHideBar; }
    }

    internal PcWindow(PcWindowOptions initial, bool startFullscreen)
    {
        options = PcWindowOptions.Normalize(initial == null ? null : initial.Clone());
        if (options.startTopmost == "on")
            options.topmost = true;
        else if (options.startTopmost == "off")
            options.topmost = false;
        Text = "TaPoard";
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        BackColor = Color.FromArgb(9, 9, 11);
        ShowInTaskbar = true;
        KeyPreview = true;
        try
        {
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        }
        catch { }
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);

        bar = new PcBar(this);
        overlay = new PcOverlay();
        grip = new PcGrip();
        grip.Clicked += ShowGripMenu;
        Controls.Add(bar);

        revealTimer.Tick += delegate { UpdateReveal(); };
        saveTimer.Tick += delegate
        {
            saveTimer.Stop();
            PersistState();
        };
        // Full screen is entered once the window exists, so the remembered bounds stay intact.
        pendingFullscreen = startFullscreen;
        // Create the window directly at its remembered place. Moving it there after creation
        // would cross monitors with different scaling, and Windows would shrink or grow it.
        dpi = DpiAwareness.SystemDpi();
        Bounds = InitialBounds();
    }

    bool pendingFullscreen,
        inSizeMove;

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            // WS_POPUP | WS_CLIPCHILDREN | WS_MINIMIZEBOX | WS_SYSMENU | WS_THICKFRAME. Windows only
            // resizes windows that have a sizing frame; WM_NCCALCSIZE below hides that frame, so the
            // window still looks frameless. NOACTIVATE keeps the user's app focused on deck clicks.
            cp.Style = unchecked((int)0x80000000) | 0x02000000 | 0x00020000 | 0x00080000 | 0x00040000;
            cp.ExStyle |= WS_EX_NOACTIVATE | WS_EX_APPWINDOW;
            return cp;
        }
    }

    protected override bool ShowWithoutActivation
    {
        get { return true; }
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        // The window was created at its remembered bounds (see the constructor), so it already
        // sits on the right monitor with that monitor's scaling; nothing is resized here.
        dpi = DpiAwareness.ForWindow(Handle);
        maximized = options.maximized;
        if (maximized)
        {
            restoreBounds = Bounds;
            Bounds = MonitorArea(false);
        }
        overlay.Owner = this;
        grip.Owner = this;
        hotkeyRegistered = RegisterHotKey(Handle, HotkeyViewOnly, 0x0001 | 0x0002 | 0x4000, (int)Keys.V);
        PcWindowService.HookForeground();
    }

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        ApplyTopmost();
        // Opening the window always shows it in front of other apps, even when "always on
        // top" is off (a window shown without activation would otherwise open behind them).
        BringToFront();
        ApplyLayered();
        if (pendingFullscreen)
            SetFullscreen(true);
        LayoutChildren();
        StartWeb();
    }

    void StartWeb()
    {
        if (webStarted)
            return;
        webStarted = true;
        web.AcceleratorKey = (vk, down) => down && HandleShortcut(vk);
        web.NavigationCompleted = delegate
        {
            lastPushed = null;
            PushPageState();
        };
        // The deck page asks to move or resize the window when its empty area is pressed.
        web.WebMessage = delegate(string message)
        {
            BeginInvoke(new MethodInvoker(delegate { PageRequest(message); }));
        };
        web.ProcessFailed = delegate
        {
            BeginInvoke(new MethodInvoker(RestartWeb));
        };
        web.Create(
            Handle,
            PcWindowService.UserDataFolder,
            delegate(string error)
            {
                if (error != null)
                {
                    webError = error;
                    Invalidate();
                    return;
                }
                LayoutChildren();
                web.Navigate(PcWindowService.DeckUrl());
            }
        );
    }

    // A crashed browser process cannot be revived; start a fresh one in the same window.
    void RestartWeb()
    {
        if (IsDisposed || allowClose)
            return;
        web.Close();
        web = new WebView2Host();
        webStarted = false;
        StartWeb();
    }

    internal void Reload()
    {
        if (web.IsReady)
            web.Navigate(PcWindowService.DeckUrl());
    }

    // Sends the display options to the page (info overlay, aspect ratio, view-only notice).
    void PushPageState()
    {
        var state = new Dictionary<string, object>
        {
            { "info", options.showInfo },
            { "aspect", options.aspect },
            { "viewOnly", viewOnly },
            { "host", true },
            { "resizable", !maximized && !fullscreen },
            { "barVisible", !BarHidden },
        };
        string json = new JavaScriptSerializer().Serialize(state);
        if (json == lastPushed)
            return;
        lastPushed = json;
        web.ExecuteScript("window.tapoardPc&&window.tapoardPc.set(" + json + ")");
    }

    string lastPushed;

    // Requests from the deck page: "raise", "page:N/M", "drag:<ratio>", "resize:<edge>",
    // "move:dx,dy" and "dragend". Moves are measured by the page from the press, in physical
    // pixels, so they work for the mouse, real touch and edgehost's injected touch alike
    // (injected touch neither moves the cursor nor counts as a pressed mouse button).
    void PageRequest(string message)
    {
        if (message == null)
            return;
        if (message == "raise")
            Raise();
        else if (message.StartsWith("page:"))
            bar.SetPage(message.Substring(5));
        else if (message.StartsWith("drag:"))
        {
            if (fullscreen)
                return;
            double ratio;
            if (!double.TryParse(message.Substring(5), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out ratio))
                ratio = 0.5;
            if (maximized)
            {
                // Leave the maximised state under the pressed point, like a title bar does.
                Rectangle r = restoreBounds;
                int pressX = Left + (int)(Width * ratio);
                r.X = pressX - (int)(r.Width * ratio);
                r.Y = Top;
                maximized = false;
                Bounds = r;
                LayoutChildren();
            }
            BeginTrack("");
        }
        else if (message.StartsWith("resize:"))
        {
            string edge = message.Substring(7);
            if (!maximized && !fullscreen && Array.IndexOf(new[] { "left", "right", "top", "bottom", "topleft", "topright", "bottomleft", "bottomright" }, edge) >= 0)
                BeginTrack(edge);
        }
        else if (message.StartsWith("move:"))
        {
            string[] parts = message.Substring(5).Split(',');
            int dx,
                dy;
            if (tracking && parts.Length == 2 && int.TryParse(parts[0], out dx) && int.TryParse(parts[1], out dy))
                TrackTo(dx, dy);
        }
        else if (message == "dragend")
        {
            if (!tracking)
                return;
            tracking = false;
            PositionOverlays();
            PersistState();
        }
    }

    bool tracking;
    Rectangle trackBounds;
    string trackEdge = "";

    void BeginTrack(string edge)
    {
        trackBounds = Bounds;
        trackEdge = edge;
        tracking = true;
    }

    void TrackTo(int dx, int dy)
    {
        Rectangle r = trackBounds;
        if (trackEdge == "")
            r.Offset(dx, dy);
        else
        {
            int minW = (int)(260 * UiScale),
                minH = (int)(180 * UiScale);
            int left = r.Left,
                top = r.Top,
                right = r.Right,
                bottom = r.Bottom;
            if (trackEdge.Contains("left")) left = Math.Min(r.Left + dx, right - minW);
            if (trackEdge.Contains("right")) right = Math.Max(r.Right + dx, left + minW);
            if (trackEdge.StartsWith("top")) top = Math.Min(r.Top + dy, bottom - minH);
            if (trackEdge.StartsWith("bottom")) bottom = Math.Max(r.Bottom + dy, top + minH);
            r = Rectangle.FromLTRB(left, top, right, bottom);
        }
        if (r != Bounds)
            Bounds = r;
    }

    void LeaveMaximizedUnderCursor()
    {
        Point cursor = Cursor.Position;
        double ratio = (cursor.X - Left) / (double)Math.Max(1, Width);
        maximized = false;
        Rectangle r = restoreBounds;
        r.X = cursor.X - (int)(r.Width * ratio);
        r.Y = cursor.Y - BarHeight / 2;
        Bounds = r;
        LayoutChildren();
    }

    static IntPtr CursorLParam()
    {
        Point p = Cursor.Position;
        return new IntPtr((p.Y << 16) | (p.X & 0xffff));
    }

    internal void ShowFromOutside(bool wantFullscreen)
    {
        if (WindowState == FormWindowState.Minimized)
            ShowWindow(Handle, 9);
        if (!Visible)
            Show();
        if (!fullscreen && !maximized && !OnSomeScreen())
            Bounds = InitialBounds();
        if (wantFullscreen && !fullscreen)
            SetFullscreen(true);
        ApplyTopmost();
        BringToFront();
    }

    // A display that was switched off, unplugged or rearranged can leave the window where no
    // screen shows it; opening it again then brings it back onto a screen.
    bool OnSomeScreen()
    {
        foreach (Rectangle area in AllWorkAreas())
        {
            var overlap = Rectangle.Intersect(area, Bounds);
            if (overlap.Width >= 80 && overlap.Height >= 60)
                return true;
        }
        return false;
    }

    System.Windows.Forms.Timer frontTimer;

    // "Open" must always end with the window in front, whichever screen it is on. Raise() alone
    // can lose to the app in front (it is active and may lift itself again, or is full screen
    // on that display), so the window stays in the topmost band for a moment and asks for the
    // foreground the way Windows allows a background app to.
    void BringToFront()
    {
        SetWindowPos(Handle, new IntPtr(-1), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010 | 0x0040);
        PcWindowService.ForceForeground(Handle);
        if (options.topmost)
            return;
        if (frontTimer == null)
        {
            frontTimer = new System.Windows.Forms.Timer { Interval = 1200 };
            frontTimer.Tick += delegate
            {
                frontTimer.Stop();
                if (!IsDisposed && !options.topmost)
                    SetWindowPos(Handle, new IntPtr(-2), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010);
            };
        }
        frontTimer.Stop();
        frontTimer.Start();
    }

    internal void ApplyOptions(PcWindowOptions next)
    {
        bool topmost = options.topmost;
        int x = options.x,
            y = options.y,
            w = options.width,
            h = options.height;
        bool hasBounds = options.hasBounds,
            wasMaximized = options.maximized;
        options = PcWindowOptions.Normalize(next.Clone());
        // The page edits preferences only; the live window state stays the window's own.
        options.topmost = topmost;
        options.x = x;
        options.y = y;
        options.width = w;
        options.height = h;
        options.hasBounds = hasBounds;
        options.maximized = wasMaximized;
        ApplyLayered();
        LayoutChildren();
        PushPageState();
        bar.Invalidate();
    }

    // ---- Commands ----

    internal void Command(string id)
    {
        switch (id)
        {
            case "topmost":
                options.topmost = !options.topmost;
                ApplyTopmost();
                PersistState();
                break;
            case "fullscreen":
                SetFullscreen(!fullscreen);
                break;
            case "info":
                options.showInfo = !options.showInfo;
                PushPageState();
                PersistState();
                break;
            case "viewonly":
                SetViewOnly(!viewOnly);
                break;
            case "settings":
                if (PcWindowService.OpenSettingsPage != null)
                    PcWindowService.OpenSettingsPage();
                break;
            case "minimize":
                ShowWindow(Handle, 6);
                break;
            case "maximize":
                ToggleMaximize();
                break;
            case "close":
                CloseWithPrompt();
                break;
            case "prev":
            case "next":
                web.ExecuteScript("window.tapoardPc&&window.tapoardPc.page(" + (id == "prev" ? "-1" : "1") + ")");
                break;
            case "menu":
                web.ExecuteScript("window.tapoardPc&&window.tapoardPc.menu()");
                break;
        }
        bar.Invalidate();
        overlay.Invalidate(true);
    }

    internal bool IsActive(string id)
    {
        switch (id)
        {
            case "topmost":
                return options.topmost;
            case "fullscreen":
                return fullscreen;
            case "info":
                return options.showInfo;
            case "viewonly":
                return viewOnly;
        }
        return false;
    }

    // Esc close, F11 / Alt+Enter fullscreen, Ctrl+T topmost, Ctrl+I info, Ctrl+, settings.
    bool HandleShortcut(int vk)
    {
        Keys mods = Control.ModifierKeys;
        bool ctrl = (mods & Keys.Control) != 0,
            alt = (mods & Keys.Alt) != 0,
            shift = (mods & Keys.Shift) != 0;
        string command = null;
        if (vk == (int)Keys.Escape && !ctrl && !alt && !shift)
            command = "close";
        else if (vk == (int)Keys.F11 && !ctrl && !alt)
            command = "fullscreen";
        else if (vk == (int)Keys.Return && alt && !ctrl)
            command = "fullscreen";
        else if (ctrl && !alt && vk == (int)Keys.T)
            command = "topmost";
        else if (ctrl && !alt && vk == (int)Keys.I)
            command = "info";
        else if (ctrl && !alt && vk == 0xBC)
            command = "settings";
        if (command == null)
            return false;
        // Accelerator events arrive inside the browser callback; run the command afterwards.
        BeginInvoke(new MethodInvoker(delegate { Command(command); }));
        return true;
    }

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        if ((msg.Msg == 0x100 || msg.Msg == 0x104) && HandleShortcut((int)(keyData & Keys.KeyCode)))
            return true;
        return base.ProcessCmdKey(ref msg, keyData);
    }

    void CloseWithPrompt()
    {
        if (options.confirmClose)
        {
            var answer = MessageBox.Show(
                this,
                "PC 用ウィンドウを閉じますか？\nTaPoard は通知領域で動き続け、スマートフォンからの操作も使えます。",
                "TaPoard",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question,
                MessageBoxDefaultButton.Button2
            );
            if (answer != DialogResult.Yes)
                return;
        }
        CloseWithoutPrompt();
    }

    internal void CloseWithoutPrompt()
    {
        allowClose = true;
        Close();
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (!allowClose && e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true;
            BeginInvoke(new MethodInvoker(CloseWithPrompt));
            return;
        }
        PersistState();
        base.OnFormClosing(e);
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        revealTimer.Stop();
        saveTimer.Stop();
        if (hotkeyRegistered)
            UnregisterHotKey(Handle, HotkeyViewOnly);
        web.Close();
        overlay.Dispose();
        grip.Dispose();
        base.OnFormClosed(e);
    }

    void PersistState()
    {
        if (PcWindowService.SaveState == null)
            return;
        Rectangle normal = fullscreen || maximized ? restoreBounds : Bounds;
        if (normal.Width > 0 && normal.Height > 0)
        {
            options.x = normal.X;
            options.y = normal.Y;
            options.width = normal.Width;
            options.height = normal.Height;
            options.hasBounds = true;
        }
        options.maximized = maximized;
        PcWindowService.SaveState(options.Clone());
    }

    void ActivateWindow()
    {
        SetForegroundWindow(Handle);
    }

    // ---- Window state ----

    Rectangle InitialBounds()
    {
        Rectangle work = PrimaryWorkArea();
        if (options.hasBounds && options.width >= 200 && options.height >= 150)
        {
            var saved = new Rectangle(options.x, options.y, options.width, options.height);
            foreach (Rectangle area in AllWorkAreas())
            {
                var overlap = Rectangle.Intersect(area, saved);
                if (overlap.Width >= 80 && overlap.Height >= 60)
                    return saved;
            }
        }
        int w = Math.Min(work.Width - 40, (int)(880 * UiScale)),
            h = Math.Min(work.Height - 40, (int)(560 * UiScale));
        return new Rectangle(work.Left + (work.Width - w) / 2, work.Top + (work.Height - h) / 2, w, h);
    }

    void ApplyTopmost()
    {
        SetWindowPos(Handle, options.topmost ? new IntPtr(-1) : new IntPtr(-2), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010);
        overlay.SetTopmost(options.topmost);
        grip.SetTopmost(options.topmost);
    }

    bool IsTopmostNow()
    {
        return (GetWindowLong(Handle, GWL_EXSTYLE) & 0x8) != 0;
    }

    DateTime lastTopmostRepair = DateTime.MinValue;

    // "Always on top" must hold whatever else happens to the window (other windows, display
    // changes, restore from the taskbar). If Windows dropped it, put it back.
    void KeepTopmost()
    {
        if (!options.topmost || !IsHandleCreated || IsTopmostNow())
            return;
        if ((DateTime.UtcNow - lastTopmostRepair).TotalMilliseconds < 300)
            return;
        lastTopmostRepair = DateTime.UtcNow;
        BeginInvoke(new MethodInvoker(ApplyTopmost));
    }

    // Brings the window above other apps without taking the keyboard from them.
    internal void Raise()
    {
        if (!options.topmost)
        {
            // Windows ignores HWND_TOP from a background app; passing through the topmost band
            // and back leaves the window at the top of the normal windows instead.
            SetWindowPos(Handle, new IntPtr(-1), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010);
            SetWindowPos(Handle, new IntPtr(-2), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010);
        }
        else
            ApplyTopmost();
    }

    // If Windows moved or resized a full-screen / maximised window (display or scaling change),
    // fit it to its monitor again instead of leaving the layout half switched.
    bool refitPending;

    void RefitLater()
    {
        if (refitPending || (!fullscreen && !maximized) || tracking)
            return;
        Rectangle target = MonitorArea(fullscreen);
        if (Bounds == target)
            return;
        refitPending = true;
        BeginInvoke(new MethodInvoker(delegate
        {
            refitPending = false;
            if (fullscreen || maximized)
            {
                Rectangle area = MonitorArea(fullscreen);
                if (Bounds != area)
                    Bounds = area;
                LayoutChildren();
            }
        }));
    }

    void ApplyLayered()
    {
        int ex = GetWindowLong(Handle, GWL_EXSTYLE);
        bool layered = viewOnly || options.opacity < 100;
        int next = layered ? ex | WS_EX_LAYERED : ex & ~WS_EX_LAYERED;
        next = viewOnly ? next | WS_EX_TRANSPARENT : next & ~WS_EX_TRANSPARENT;
        if (next != ex)
            SetWindowLong(Handle, GWL_EXSTYLE, next);
        if (layered)
            SetLayeredWindowAttributes(Handle, 0, (byte)Math.Round(options.opacity * 255 / 100.0), 0x2);
    }

    internal void SetViewOnly(bool value)
    {
        if (viewOnly == value)
            return;
        viewOnly = value;
        ApplyLayered();
        UpdateReveal();
        PushPageState();
        bar.Invalidate();
        if (value && PcWindowService.Notify != null)
            PcWindowService.Notify(
                hotkeyRegistered
                    ? "見るだけモードにしました。Ctrl+Alt+V で元に戻せます。"
                    : "見るだけモードにしました。通知領域の TaPoard メニューから元に戻せます。"
            );
    }

    void SetFullscreen(bool value)
    {
        if (value == fullscreen)
            return;
        if (value)
        {
            if (!maximized)
                restoreBounds = Bounds;
            fullscreen = true;
            Bounds = MonitorArea(true);
        }
        else
        {
            fullscreen = false;
            Bounds = maximized ? MonitorArea(false) : restoreBounds;
        }
        LayoutChildren();
        PersistState();
    }

    void ToggleMaximize()
    {
        if (fullscreen)
            return;
        if (maximized)
        {
            maximized = false;
            Bounds = restoreBounds;
        }
        else
        {
            restoreBounds = Bounds;
            maximized = true;
            Bounds = MonitorArea(false);
        }
        LayoutChildren();
        PersistState();
    }

    // Starts moving the window with the mouse, as if its title bar was dragged.
    internal void BeginDrag()
    {
        if (fullscreen)
            return;
        // Like Windows: leave the maximised state under the cursor and keep dragging.
        if (maximized)
            LeaveMaximizedUnderCursor();
        ReleaseCapture();
        SendMessage(Handle, WM_NCLBUTTONDOWN, new IntPtr(HTCAPTION), CursorLParam());
        PositionOverlays();
        saveTimer.Stop();
        saveTimer.Start();
    }

    internal bool CanDrag
    {
        get { return !fullscreen; }
    }

    // The overlay row moved the window itself; leave maximised state and save the place.
    internal void DragFinished()
    {
        maximized = false;
        PositionOverlays();
        PersistState();
    }

    internal void BarDoubleClick()
    {
        ToggleMaximize();
    }

    internal void BarPressed()
    {
        // Clicking the bar (not the deck) brings the window to the front and makes it active
        // so its shortcuts work.
        Raise();
        ActivateWindow();
    }

    // ---- Layout ----

    void LayoutChildren()
    {
        if (!IsHandleCreated)
            return;
        int b = Border,
            h = BarHeight;
        bar.UiScale = UiScale;
        bar.Height = h;
        Rectangle content;
        if (BarHidden)
        {
            if (bar.Parent != overlay)
            {
                bar.Parent = overlay;
                bar.Dock = DockStyle.Fill;
            }
            content = new Rectangle(b, b, ClientSize.Width - 2 * b, ClientSize.Height - 2 * b);
        }
        else
        {
            if (bar.Parent != this)
            {
                overlay.Hide();
                bar.Dock = DockStyle.None;
                bar.Parent = this;
            }
            bar.Bounds = new Rectangle(0, 0, ClientSize.Width, h);
            content = new Rectangle(b, h, ClientSize.Width - 2 * b, ClientSize.Height - h - b);
        }
        if (content.Width < 1)
            content.Width = 1;
        if (content.Height < 1)
            content.Height = 1;
        web.SetBounds(content);
        grip.UiScale = UiScale;
        PositionOverlays();
        UpdateReveal();
        revealTimer.Enabled = BarHidden;
        PushPageState();
        Invalidate();
    }

    void PositionOverlays()
    {
        if (!IsHandleCreated)
            return;
        int b = Border;
        overlay.Bounds = new Rectangle(Left + b, Top + b, Math.Max(1, Width - 2 * b), BarHeight);
        Size g = grip.PreferredSizeFor(UiScale);
        grip.Bounds = new Rectangle(Left + (Width - g.Width) / 2, Top + b, g.Width, g.Height);
        web.ParentMoved();
    }

    void UpdateReveal()
    {
        bool minimized = WindowState == FormWindowState.Minimized || IsIconic(Handle);
        if (!BarHidden || viewOnly || !Visible || minimized)
        {
            if (overlay.Visible)
                overlay.Hide();
            if (grip.Visible)
                grip.Hide();
            return;
        }
        Point cursor = Cursor.Position;
        var zone = new Rectangle(Left, Top, Width, Math.Max(3, (int)(5 * UiScale)));
        bool inside = zone.Contains(cursor) || overlay.Visible && overlay.Bounds.Contains(cursor) || bar.MenuOpen;
        if (inside)
            lastInsideBar = DateTime.UtcNow;
        bool show = inside || overlay.Visible && (DateTime.UtcNow - lastInsideBar).TotalMilliseconds < 700;
        if (show && !overlay.Visible)
        {
            PositionOverlays();
            overlay.ShowNoActivate(options.topmost);
        }
        else if (!show && overlay.Visible)
            overlay.Hide();
        bool gripVisible = !overlay.Visible;
        if (gripVisible && !grip.Visible)
        {
            PositionOverlays();
            grip.ShowNoActivate(options.topmost);
        }
        else if (!gripVisible && grip.Visible)
            grip.Hide();
    }

    void ShowGripMenu()
    {
        var menu = bar.BuildMenu();
        menu.Show(grip, new Point(0, grip.Height));
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        LayoutChildren();
    }

    protected override void OnMove(EventArgs e)
    {
        base.OnMove(e);
        PositionOverlays();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        if (webError != null)
        {
            using (var font = new Font("Yu Gothic UI", 15 * UiScale, GraphicsUnit.Pixel))
            using (var brush = new SolidBrush(Color.FromArgb(220, 222, 228)))
            {
                var area = new Rectangle(Border + 16, BarHidden ? 16 : BarHeight + 16, ClientSize.Width - 32, ClientSize.Height - BarHeight - 32);
                e.Graphics.DrawString(webError + "\n\n通知領域の TaPoard から「設定をブラウザで開く」を選ぶと、ブラウザで操作できます。", font, brush, area);
            }
        }
    }

    protected override void WndProc(ref Message m)
    {
        switch (m.Msg)
        {
            case WM_NCHITTEST:
                m.Result = new IntPtr(HitTest(m.LParam));
                return;
            case 0x0083: // WM_NCCALCSIZE: the whole window is client area (no visible sizing frame).
                if (m.WParam != IntPtr.Zero)
                {
                    m.Result = IntPtr.Zero;
                    return;
                }
                break;
            case 0x0086: // WM_NCACTIVATE: keep Windows from painting a frame on (de)activation.
                m.Result = new IntPtr(1);
                return;
            case WM_MOUSEACTIVATE:
                // MA_NOACTIVATE: clicking the deck keeps the keyboard in the user's app, but the
                // window itself comes to the front when it was behind another app.
                Raise();
                m.Result = new IntPtr(3);
                return;
            case 0x0047: // WM_WINDOWPOSCHANGED
                base.WndProc(ref m);
                KeepTopmost();
                RefitLater();
                return;
            case 0x007E: // WM_DISPLAYCHANGE
                base.WndProc(ref m);
                RefitLater();
                return;
            case 0x0231: // WM_ENTERSIZEMOVE
                inSizeMove = true;
                break;
            case WM_NCLBUTTONDOWN:
                if (m.WParam.ToInt64() == HTCAPTION)
                {
                    // Pressing the title area brings the window forward and lets its shortcuts
                    // work; then Windows' own move loop runs.
                    Raise();
                    ActivateWindow();
                }
                break;
            case 0x0216: // WM_MOVING: dragging a maximised window out restores its size under the pointer.
                if (maximized && inSizeMove)
                {
                    var moving = (RECT)Marshal.PtrToStructure(m.LParam, typeof(RECT));
                    Point cursor = Cursor.Position;
                    double ratio = (cursor.X - Left) / (double)Math.Max(1, Width);
                    Rectangle r = restoreBounds;
                    r.X = cursor.X - (int)(r.Width * ratio);
                    r.Y = moving.top;
                    maximized = false;
                    Marshal.StructureToPtr(new RECT { left = r.Left, top = r.Top, right = r.Right, bottom = r.Bottom }, m.LParam, false);
                    m.Result = new IntPtr(1);
                    BeginInvoke(new MethodInvoker(LayoutChildren));
                    return;
                }
                break;
            case 0x00A3: // WM_NCLBUTTONDBLCLK: our own maximise (it covers the work area only).
                if (m.WParam.ToInt64() == HTCAPTION)
                {
                    ToggleMaximize();
                    return;
                }
                break;
            case 0x00A5: // WM_NCRBUTTONUP on the title area: the button row's menu.
                if (m.WParam.ToInt64() == HTCAPTION)
                {
                    bar.ShowMenuAtCursor();
                    return;
                }
                break;
            case 0x007B: // WM_CONTEXTMENU: no Windows system menu on the frameless window.
                return;
            case WM_GETMINMAXINFO:
                base.WndProc(ref m);
                var info = (MINMAXINFO)Marshal.PtrToStructure(m.LParam, typeof(MINMAXINFO));
                info.minTrackX = (int)(260 * UiScale);
                info.minTrackY = (int)(180 * UiScale);
                Marshal.StructureToPtr(info, m.LParam, false);
                return;
            case WM_DPICHANGED:
                dpi = (int)((m.WParam.ToInt64() >> 16) & 0xffff);
                var suggested = (RECT)Marshal.PtrToStructure(m.LParam, typeof(RECT));
                var rect = Rectangle.FromLTRB(suggested.left, suggested.top, suggested.right, suggested.bottom);
                // Follow Windows' new size only while the user drags the window to another
                // monitor; a programmatic placement keeps the size it was given.
                if (tracking && trackEdge == "")
                {
                    // The page measures from here on (its pixel ratio changed too).
                    trackBounds = rect;
                    Bounds = rect;
                    web.ExecuteScript("window.tapoardPc&&window.tapoardPc.rebase()");
                }
                else if (inSizeMove && !fullscreen && !maximized)
                    Bounds = rect;
                LayoutChildren();
                RefitLater();
                m.Result = IntPtr.Zero;
                return;
            case WM_HOTKEY:
                if (m.WParam.ToInt32() == HotkeyViewOnly)
                    SetViewOnly(!viewOnly);
                return;
            case WM_EXITSIZEMOVE:
                inSizeMove = false;
                base.WndProc(ref m);
                PositionOverlays();
                PersistState();
                return;
            case WM_SYSCOMMAND:
                // Alt+F4 / taskbar "close window" use SC_CLOSE; honour the confirmation setting.
                if ((m.WParam.ToInt64() & 0xFFF0) == 0xF060)
                {
                    BeginInvoke(new MethodInvoker(CloseWithPrompt));
                    return;
                }
                break;
        }
        base.WndProc(ref m);
    }

    int HitTest(IntPtr lParam)
    {
        long v = lParam.ToInt64();
        var p = PointToClient(new Point((short)(v & 0xffff), (short)((v >> 16) & 0xffff)));
        if (fullscreen)
            return HTCLIENT;
        int b = Border,
            corner = b * 3;
        if (b > 0)
        {
            bool left = p.X < b,
                right = p.X >= ClientSize.Width - b,
                top = p.Y < b,
                bottom = p.Y >= ClientSize.Height - b;
            bool nearLeft = p.X < corner,
                nearRight = p.X >= ClientSize.Width - corner,
                nearTop = p.Y < corner,
                nearBottom = p.Y >= ClientSize.Height - corner;
            if (top && nearLeft || left && nearTop) return HTTOPLEFT;
            if (top && nearRight || right && nearTop) return HTTOPRIGHT;
            if (bottom && nearLeft || left && nearBottom) return HTBOTTOMLEFT;
            if (bottom && nearRight || right && nearBottom) return HTBOTTOMRIGHT;
            if (left) return HTLEFT;
            if (right) return HTRIGHT;
            if (top) return HTTOP;
            if (bottom) return HTBOTTOM;
        }
        // The button row's empty space is the title bar: Windows moves the window, maximises it
        // on a double click, and touch input (edgehost included) drags it like any title bar.
        if (bar.Parent == this && p.Y >= 0 && p.Y < bar.Height && !bar.IsOnItem(p))
            return HTCAPTION;
        return HTCLIENT;
    }

    // ---- Monitor helpers (physical pixels on this DPI-aware thread) ----

    Rectangle MonitorArea(bool full)
    {
        IntPtr monitor = MonitorFromWindow(Handle, 2);
        var mi = new MONITORINFO { cbSize = Marshal.SizeOf(typeof(MONITORINFO)) };
        if (!GetMonitorInfo(monitor, ref mi))
            return Bounds;
        RECT r = full ? mi.rcMonitor : mi.rcWork;
        return Rectangle.FromLTRB(r.left, r.top, r.right, r.bottom);
    }

    static Rectangle PrimaryWorkArea()
    {
        IntPtr monitor = MonitorFromPoint(new POINT(), 1);
        var mi = new MONITORINFO { cbSize = Marshal.SizeOf(typeof(MONITORINFO)) };
        GetMonitorInfo(monitor, ref mi);
        return Rectangle.FromLTRB(mi.rcWork.left, mi.rcWork.top, mi.rcWork.right, mi.rcWork.bottom);
    }

    static List<Rectangle> AllWorkAreas()
    {
        var list = new List<Rectangle>();
        MonitorEnumProc proc = delegate(IntPtr monitor, IntPtr dc, IntPtr rect, IntPtr data)
        {
            var mi = new MONITORINFO { cbSize = Marshal.SizeOf(typeof(MONITORINFO)) };
            if (GetMonitorInfo(monitor, ref mi))
                list.Add(Rectangle.FromLTRB(mi.rcWork.left, mi.rcWork.top, mi.rcWork.right, mi.rcWork.bottom));
            return true;
        };
        EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, proc, IntPtr.Zero);
        GC.KeepAlive(proc);
        return list;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct RECT
    {
        public int left,
            top,
            right,
            bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct POINT
    {
        public int x,
            y;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct MONITORINFO
    {
        public int cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public int dwFlags;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct MINMAXINFO
    {
        public int reservedX,
            reservedY,
            maxSizeX,
            maxSizeY,
            maxPositionX,
            maxPositionY,
            minTrackX,
            minTrackY,
            maxTrackX,
            maxTrackY;
    }

    delegate bool MonitorEnumProc(IntPtr monitor, IntPtr dc, IntPtr rect, IntPtr data);

    [DllImport("user32.dll")]
    static extern bool EnumDisplayMonitors(IntPtr dc, IntPtr clip, MonitorEnumProc proc, IntPtr data);

    [DllImport("user32.dll")]
    static extern IntPtr MonitorFromWindow(IntPtr window, int flags);

    [DllImport("user32.dll")]
    static extern IntPtr MonitorFromPoint(POINT point, int flags);

    [DllImport("user32.dll")]
    static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFO info);

    [DllImport("user32.dll")]
    internal static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int cx, int cy, int flags);

    [DllImport("user32.dll")]
    static extern int GetWindowLong(IntPtr window, int index);

    [DllImport("user32.dll")]
    static extern int SetWindowLong(IntPtr window, int index, int value);

    [DllImport("user32.dll")]
    static extern bool SetLayeredWindowAttributes(IntPtr window, int key, byte alpha, int flags);

    [DllImport("user32.dll")]
    static extern bool RegisterHotKey(IntPtr window, int id, int modifiers, int key);

    [DllImport("user32.dll")]
    static extern bool UnregisterHotKey(IntPtr window, int id);

    [DllImport("user32.dll")]
    static extern bool ReleaseCapture();

    [DllImport("user32.dll")]
    static extern IntPtr SendMessage(IntPtr window, int message, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    internal static extern bool ShowWindow(IntPtr window, int command);

    [DllImport("user32.dll")]
    static extern bool IsIconic(IntPtr window);

    [DllImport("user32.dll")]
    static extern bool SetForegroundWindow(IntPtr window);
}

// The button row. Lives in the window, or in PcOverlay while the row is auto-hidden.
sealed class PcBar : Control
{
    sealed class Item
    {
        internal string id,
            glyph,
            activeGlyph,
            tip;
        internal Rectangle bounds;
    }

    static readonly string GlyphFont = PickGlyphFont();
    readonly PcWindow owner;
    readonly List<Item> items = new List<Item>();
    readonly ToolTip tips = new ToolTip { InitialDelay = 500, ShowAlways = true };
    Item hover,
        pressed;
    DateTime lastEmptyDown = DateTime.MinValue;
    Point lastEmptyPoint;
    internal float UiScale = 1;
    internal bool MenuOpen;
    readonly List<Item> nav = new List<Item>();
    string pageText = "1/1";
    Rectangle pageTextBounds;
    bool dragging;
    Point dragStart;
    Rectangle dragBounds;

    internal PcBar(PcWindow owner)
    {
        this.owner = owner;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw | ControlStyles.UserPaint, true);
        BackColor = Color.FromArgb(22, 23, 27);
        AddNav("prev", "", "前のページ");
        AddNav("next", "", "次のページ");
        AddNav("menu", "", "画面と接続のメニュー");
        Add("info", "", null, "情報表示（Ctrl+I）");
        Add("viewonly", "", "", "見るだけモード（Ctrl+Alt+V で戻す）");
        Add("topmost", "", "", "常に最前面（Ctrl+T）");
        Add("fullscreen", "", "", "全画面（F11 / Alt+Enter）");
        Add("settings", "", null, "PC 用ウィンドウの設定（Ctrl+,）");
        Add("minimize", "", null, "最小化");
        Add("close", "", null, "閉じる（Esc）");
    }

    // Page buttons and the deck's menu sit on the left, next to the name; they replace the
    // in-page toolbar row so the deck gets that height.
    void AddNav(string id, string glyph, string tip)
    {
        nav.Add(new Item { id = id, glyph = glyph, activeGlyph = glyph, tip = tip });
    }

    internal void SetPage(string text)
    {
        if (text == pageText)
            return;
        pageText = text;
        Invalidate();
    }

    internal bool CanTurn(int step)
    {
        string[] parts = pageText.Split('/');
        int current, total;
        if (parts.Length != 2 || !int.TryParse(parts[0], out current) || !int.TryParse(parts[1], out total))
            return true;
        return step < 0 ? current > 1 : current < total;
    }

    void Add(string id, string glyph, string active, string tip)
    {
        items.Add(new Item { id = id, glyph = glyph, activeGlyph = active ?? glyph, tip = tip });
    }

    static string PickGlyphFont()
    {
        foreach (FontFamily f in FontFamily.Families)
            if (f.Name == "Segoe Fluent Icons")
                return f.Name;
        return "Segoe MDL2 Assets";
    }

    void LayoutItems()
    {
        int h = Height,
            w = (int)Math.Round(h * 1.22),
            gap = (int)(10 * UiScale),
            x = Width;
        for (int i = items.Count - 1; i >= 0; i--)
        {
            x -= w;
            items[i].bounds = new Rectangle(x, 0, w, h);
            if (items[i].id == "minimize")
                x -= gap;
        }
        // Left: name, then ‹ page › and the menu. The name is dropped when space runs short.
        int rightStart = x,
            navW = (int)Math.Round(h * 0.95),
            textW = (int)Math.Round(h * 1.5),
            navTotal = navW * 3 + textW + gap;
        int left = (int)(h * 0.4f) + (int)(h * 2.4f);
        showTitle = left + navTotal <= rightStart - gap;
        if (!showTitle)
            left = (int)(h * 0.2f);
        nav[0].bounds = new Rectangle(left, 0, navW, h);
        pageTextBounds = new Rectangle(left + navW, 0, textW, h);
        nav[1].bounds = new Rectangle(left + navW + textW, 0, navW, h);
        nav[2].bounds = new Rectangle(left + navW * 2 + textW + gap, 0, navW, h);
        bool fits = nav[2].bounds.Right <= rightStart;
        foreach (var item in nav)
            if (!fits)
                item.bounds = Rectangle.Empty;
        if (!fits)
            pageTextBounds = Rectangle.Empty;
    }

    bool showTitle = true;

    Item ItemAt(Point p)
    {
        foreach (var item in items)
            if (item.bounds.Contains(p))
                return item;
        foreach (var item in nav)
            if (item.bounds.Contains(p))
                return item;
        return null;
    }

    internal bool IsOnItem(Point p)
    {
        LayoutItems();
        return ItemAt(p) != null;
    }

    // In the window, the empty part of the row is the window's title bar (HTCAPTION there),
    // so it lets those clicks through to the window. In the overlay it handles them itself.
    protected override void WndProc(ref Message m)
    {
        if (m.Msg == 0x84 && Parent is PcWindow)
        {
            long v = m.LParam.ToInt64();
            var p = PointToClient(new Point((short)(v & 0xffff), (short)((v >> 16) & 0xffff)));
            if (!IsOnItem(p))
            {
                m.Result = new IntPtr(-1); // HTTRANSPARENT
                return;
            }
        }
        base.WndProc(ref m);
    }

    internal void ShowMenuAtCursor()
    {
        BuildMenu().Show(Cursor.Position);
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        LayoutItems();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        LayoutItems();
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
        g.Clear(BackColor);
        int h = Height;
        using (var titleFont = new Font("Segoe UI Semibold", h * 0.36f, GraphicsUnit.Pixel))
        using (var titleBrush = new SolidBrush(Color.FromArgb(205, 209, 218)))
        using (var dim = new SolidBrush(Color.FromArgb(120, 126, 140)))
        if (showTitle)
        {
            float x = h * 0.4f;
            var fmt = new StringFormat { LineAlignment = StringAlignment.Center };
            g.DrawString("TaP", titleFont, titleBrush, new RectangleF(x, 0, Width, h), fmt);
            float tap = g.MeasureString("TaP", titleFont, PointF.Empty, StringFormat.GenericTypographic).Width;
            using (var light = new Font("Segoe UI Light", h * 0.36f, GraphicsUnit.Pixel))
                g.DrawString("oard", light, dim, new RectangleF(x + tap + 1, 0, Width, h), fmt);
        }
        using (var glyphFont = new Font(GlyphFont, h * 0.34f, GraphicsUnit.Pixel))
        {
            var center = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
            foreach (var item in items)
            {
                bool active = owner.IsActive(item.id);
                Color back = Color.Empty;
                if (item == pressed)
                    back = item.id == "close" ? Color.FromArgb(160, 30, 20) : Color.FromArgb(52, 55, 64);
                else if (item == hover)
                    back = item.id == "close" ? Color.FromArgb(196, 43, 28) : Color.FromArgb(42, 44, 51);
                if (active && back.IsEmpty)
                    back = Color.FromArgb(36, 52, 98);
                if (!back.IsEmpty)
                    using (var b = new SolidBrush(back))
                        g.FillRectangle(b, item.bounds);
                if (active)
                    using (var accent = new SolidBrush(Color.FromArgb(110, 150, 255)))
                        g.FillRectangle(accent, item.bounds.X + item.bounds.Width / 4, item.bounds.Bottom - Math.Max(2, (int)(2 * UiScale)), item.bounds.Width / 2, Math.Max(2, (int)(2 * UiScale)));
                using (var fg = new SolidBrush(active ? Color.FromArgb(150, 182, 255) : Color.FromArgb(222, 224, 230)))
                    g.DrawString(active ? item.activeGlyph : item.glyph, glyphFont, fg, item.bounds, center);
            }
            foreach (var item in nav)
            {
                if (item.bounds.IsEmpty)
                    continue;
                bool enabled = item.id == "menu" || CanTurn(item.id == "prev" ? -1 : 1);
                if (enabled && (item == pressed || item == hover))
                    using (var b = new SolidBrush(item == pressed ? Color.FromArgb(52, 55, 64) : Color.FromArgb(42, 44, 51)))
                        g.FillRectangle(b, item.bounds);
                using (var fg = new SolidBrush(enabled ? Color.FromArgb(222, 224, 230) : Color.FromArgb(78, 82, 92)))
                    g.DrawString(item.glyph, glyphFont, fg, item.bounds, center);
            }
            if (!pageTextBounds.IsEmpty)
                using (var pageFont = new Font("Segoe UI", h * 0.34f, GraphicsUnit.Pixel))
                using (var fg = new SolidBrush(Color.FromArgb(170, 176, 190)))
                    g.DrawString(pageText.Replace("/", " / "), pageFont, fg, pageTextBounds, center);
        }
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        if (dragging)
        {
            Point now = PointToScreen(e.Location);
            var r = dragBounds;
            r.Offset(now.X - dragStart.X, now.Y - dragStart.Y);
            owner.Bounds = r;
            return;
        }
        var item = ItemAt(e.Location);
        if (item != hover)
        {
            hover = item;
            tips.SetToolTip(this, item == null ? null : item.tip);
            Invalidate();
        }
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        base.OnMouseLeave(e);
        hover = null;
        Invalidate();
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        var item = ItemAt(e.Location);
        if (e.Button == MouseButtons.Right && item == null)
        {
            ShowMenu(e.Location);
            return;
        }
        if (e.Button != MouseButtons.Left)
            return;
        if (item != null)
        {
            pressed = item;
            Invalidate();
            return;
        }
        // Only the overlay row gets here (in the window this area is the title bar). Double
        // click maximises; otherwise the window follows the pointer from this control's own
        // messages, which touch input delivers too.
        var now = DateTime.UtcNow;
        var size = SystemInformation.DoubleClickSize;
        bool second = (now - lastEmptyDown).TotalMilliseconds <= SystemInformation.DoubleClickTime
            && Math.Abs(e.X - lastEmptyPoint.X) <= size.Width
            && Math.Abs(e.Y - lastEmptyPoint.Y) <= size.Height;
        lastEmptyDown = second ? DateTime.MinValue : now;
        lastEmptyPoint = e.Location;
        owner.BarPressed();
        if (second)
        {
            owner.BarDoubleClick();
            return;
        }
        if (!owner.CanDrag)
            return;
        dragging = true;
        dragStart = PointToScreen(e.Location);
        dragBounds = owner.Bounds;
        Capture = true;
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        if (dragging)
        {
            dragging = false;
            Capture = false;
            owner.DragFinished();
            return;
        }
        var item = pressed;
        pressed = null;
        Invalidate();
        if (item != null && item.bounds.Contains(e.Location))
        {
            if (item.id != "minimize" && item.id != "close")
                owner.BarPressed();
            owner.Command(item.id);
        }
    }

    void ShowMenu(Point at)
    {
        BuildMenu().Show(this, at);
    }

    internal ContextMenuStrip BuildMenu()
    {
        var menu = new ContextMenuStrip { Font = new Font("Yu Gothic UI", 14 * UiScale, GraphicsUnit.Pixel), ShowImageMargin = false };
        foreach (var item in nav)
        {
            string id = item.id;
            var entry = new ToolStripMenuItem(item.tip) { Enabled = id == "menu" || CanTurn(id == "prev" ? -1 : 1) };
            entry.Click += delegate { owner.Command(id); };
            menu.Items.Add(entry);
        }
        menu.Items.Add(new ToolStripSeparator());
        foreach (var item in items)
        {
            string id = item.id;
            var entry = new ToolStripMenuItem(item.tip) { Checked = owner.IsActive(id), CheckOnClick = false };
            entry.Click += delegate { owner.Command(id); };
            menu.Items.Add(entry);
        }
        menu.Opened += delegate { MenuOpen = true; };
        menu.Closed += delegate
        {
            MenuOpen = false;
            BeginInvoke(new MethodInvoker(menu.Dispose));
        };
        return menu;
    }
}

// Borderless owned window that shows the button row over the deck (full screen / auto-hide).
sealed class PcOverlay : Form
{
    internal PcOverlay()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        BackColor = Color.FromArgb(22, 23, 27);
    }

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            cp.ExStyle |= 0x08000000 | 0x00000080; // NOACTIVATE | TOOLWINDOW
            return cp;
        }
    }

    protected override bool ShowWithoutActivation
    {
        get { return true; }
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == 0x21)
        {
            m.Result = new IntPtr(3);
            return;
        }
        base.WndProc(ref m);
    }

    internal void ShowNoActivate(bool topmost)
    {
        PcWindow.ShowWindow(Handle, 4); // SW_SHOWNOACTIVATE
        SetTopmost(topmost);
    }

    internal void SetTopmost(bool topmost)
    {
        if (IsHandleCreated)
            PcWindow.SetWindowPos(Handle, topmost ? new IntPtr(-1) : IntPtr.Zero, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010);
    }
}

// The small handle at the top centre while the row is hidden; tap it for the menu.
sealed class PcGrip : Form
{
    internal event Action Clicked;
    internal float UiScale = 1;
    bool hover;

    internal PcGrip()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        BackColor = Color.FromArgb(28, 30, 36);
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
    }

    internal Size PreferredSizeFor(float scale)
    {
        return new Size((int)(72 * scale), (int)(18 * scale));
    }

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            cp.ExStyle |= 0x08000000 | 0x00000080;
            return cp;
        }
    }

    protected override bool ShowWithoutActivation
    {
        get { return true; }
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == 0x21)
        {
            m.Result = new IntPtr(3);
            return;
        }
        base.WndProc(ref m);
    }

    internal void ShowNoActivate(bool topmost)
    {
        PcWindow.ShowWindow(Handle, 4);
        SetTopmost(topmost);
    }

    internal void SetTopmost(bool topmost)
    {
        if (IsHandleCreated)
            PcWindow.SetWindowPos(Handle, topmost ? new IntPtr(-1) : IntPtr.Zero, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(hover ? Color.FromArgb(50, 54, 66) : BackColor);
        using (var pen = new Pen(Color.FromArgb(180, 186, 200), Math.Max(1.5f, 2 * UiScale)))
        {
            float cx = Width / 2f,
                cy = Height / 2f,
                half = 12 * UiScale,
                step = 3.5f * UiScale;
            g.DrawLine(pen, cx - half, cy - step, cx + half, cy - step);
            g.DrawLine(pen, cx - half, cy + step, cx + half, cy + step);
        }
    }

    protected override void OnMouseEnter(EventArgs e)
    {
        hover = true;
        Invalidate();
        base.OnMouseEnter(e);
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        hover = false;
        Invalidate();
        base.OnMouseLeave(e);
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        if (Clicked != null)
            Clicked();
    }
}