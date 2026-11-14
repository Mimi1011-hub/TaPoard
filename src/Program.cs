using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// Application startup, tray icon and the shared state that the HTTP API reads.
// Program.Http.cs holds the HTTP plumbing; the controllers own the API endpoints.
partial class Program
{
    static readonly string AppVersion = BuildInfo.DisplayVersion;
    static readonly string Root = AppDomain.CurrentDomain.BaseDirectory;
    static readonly string Data = Path.Combine(Root, "data");
    internal static readonly AppState State = new AppState(Root, Data, AppVersion, AppHost.CreateWindows(), new FileSettingsStore(Data));
    static readonly ProgramDesktop desktop = new ProgramDesktop();
    internal static readonly PairingController PairingApi = new PairingController(State, desktop);
    internal static readonly DeckController DeckApi = new DeckController(State, desktop);
    internal static readonly PageController PageApi = new PageController(State, desktop, DeckApi);
    internal static readonly LookController LookApi = new LookController(State, desktop, DeckApi);
    internal static readonly InputController InputApi = new InputController(State, desktop, DeckApi);
    internal static readonly SystemController SystemApi = new SystemController(State, desktop);
    static readonly ApiRouter<ApiRequest> api = BuildApi();
    static TcpListener server;
    static NotifyIcon tray;
    static Icon appIcon;
    static string admin;
    static LanNetwork lan;
    static Control ui;
    static ImportWindow importWindow;

    internal static void UseHost(AppHost value)
    {
        State.Host = value;
    }

    internal static void UseStore(ISettingsStore value)
    {
        State.Store = value;
    }

    static string RandomKey()
    {
        return SecureKeys.Hex();
    }

    static string ShortKey()
    {
        return SecureKeys.Short();
    }

    static string NewId()
    {
        return Guid.NewGuid().ToString("N");
    }

    static string Json(object o)
    {
        return new JavaScriptSerializer().Serialize(o);
    }

    static bool IsType(AppEntry app, string type)
    {
        return String.Equals(app.type, type, StringComparison.OrdinalIgnoreCase);
    }

    static bool PhoneConnected()
    {
        return State.Sync.PhoneConnected;
    }

    static void NormalizeControlSlots()
    {
        DeckLayout.MigrateGrid(State.Config);
        DeckLayout.MigrateControls(State.Config);
        // The legacy shared fields mirror the landscape layout for older clients.
        State.Config.columns = State.Config.landscapeColumns;
        State.Config.rows = State.Config.landscapeRows;
        State.Config.speakerSlot = State.Config.landscapeSpeakerSlot;
        State.Config.micSlot = State.Config.landscapeMicSlot;
        State.Config.speakerSize = State.Config.landscapeSpeakerSize;
        State.Config.micSize = State.Config.landscapeMicSize;
    }

    static object Controls(bool portrait)
    {
        var c = DeckLayout.GetControls(State.Config, portrait);
        return new
        {
            speakerSlot = c.speakerSlot,
            micSlot = c.micSlot,
            speakerSize = c.speakerSize,
            micSize = c.micSize,
            speakerRow = c.speakerRow,
            speakerColumn = c.speakerColumn,
            speakerWidth = c.speakerWidth,
            speakerHeight = c.speakerHeight,
            micRow = c.micRow,
            micColumn = c.micColumn,
            micWidth = c.micWidth,
            micHeight = c.micHeight,
            speakerHidden = DeckLayout.Off(State.Config, portrait, false),
            micHidden = DeckLayout.Off(State.Config, portrait, true),
        };
    }

    // Per-page fader overrides; pages not listed use the orientation's shared controls.
    static object ControlPages(bool portrait)
    {
        var pages = new List<object>();
        foreach (var entry in DeckLayout.ControlPages(State.Config, portrait))
        {
            bool speakerHidden, micHidden;
            var c = DeckLayout.GetPageControls(State.Config, portrait, entry.page, out speakerHidden, out micHidden);
            pages.Add(new
            {
                page = entry.page, speakerHidden = speakerHidden, micHidden = micHidden,
                speakerSlot = c.speakerSlot, micSlot = c.micSlot, speakerSize = c.speakerSize, micSize = c.micSize,
                speakerRow = c.speakerRow, speakerColumn = c.speakerColumn, speakerWidth = c.speakerWidth, speakerHeight = c.speakerHeight,
                micRow = c.micRow, micColumn = c.micColumn, micWidth = c.micWidth, micHeight = c.micHeight,
            });
        }
        return pages;
    }

    static object Grid(bool portrait)
    {
        return new { columns = DeckLayout.Columns(State.Config, portrait), rows = DeckLayout.Rows(State.Config, portrait) };
    }

    static void Signal()
    {
        State.Sync.Signal();
    }

    // Settings from before 1.03 shared one entry between orientations; give each orientation its own copy.
    static void SplitOrientationApps()
    {
        var migrated = new List<AppEntry>();
        foreach (var app in State.Config.apps)
        {
            if (app.orientation == "landscape" || app.orientation == "portrait")
            {
                migrated.Add(app);
                continue;
            }
            var portrait = new JavaScriptSerializer().Deserialize<AppEntry>(Json(app));
            app.orientation = "landscape";
            app.portrait = null;
            portrait.id = NewId();
            portrait.orientation = "portrait";
            portrait.landscape = null;
            migrated.Add(app);
            migrated.Add(portrait);
        }
        State.Config.apps = migrated;
    }

    static void Save()
    {
        State.Store.Save(State.Config);
    }

    [STAThread]
    static void Main(string[] args)
    {
        bool first;
        using (var mutex = new Mutex(true, "Local\\TaPoard", out first))
        {
            if (!first)
                return;
            Application.EnableVisualStyles();
            try
            {
                LoadSettings();
                WeatherService.Initialize(Data, delegate { lock (State.Gate) Signal(); });
                DisplaySubscriptions.Changed = delegate
                {
                    MetricsSampler.OnSubscriptionsChanged();
                    lock (State.Gate) WeatherService.SetActive(DisplaySubscriptions.Current().weather.Count != 0, State.Config);
                };
                MetricsSampler.Changed = delegate
                {
                    lock (State.Gate)
                        Signal();
                };
                admin = RandomKey();
                lan = new LanNetwork(Path.Combine(Root, "network.json"));
                State.Lan = lan;
                File.WriteAllText(Path.Combine(Root, "network-status.txt"), lan.Status);
                StartServer();
                ui = new Control();
                var handle = ui.Handle;
                CreateTrayIcon();
                InitPcWindow();
                string startup = StartupMode();
                if (startup != "none")
                {
                    // Opening the PC window replaces opening the browser settings at startup.
                    try
                    {
                        OpenPcWindow(startup == "fullscreen");
                    }
                    catch (Exception e)
                    {
                        ShowNotice(e.Message);
                        if (Array.IndexOf(args, "--silent") < 0)
                            OpenSettings();
                    }
                }
                else if (Array.IndexOf(args, "--silent") < 0)
                    OpenSettings();
                Application.Run();
            }
            catch (Exception e)
            {
                MessageBox.Show(e.Message, "TaPoard");
            }
            finally
            {
                PcWindowService.Close();
                if (server != null)
                    server.Stop();
                DisplaySubscriptions.Changed = null;
                DisplaySubscriptions.ClearAll();
                MetricsSampler.SetActive(false);
                WeatherService.Stop();
                InputSessions.ClearAll();
                if (lan != null)
                    lan.Dispose();
                if (tray != null)
                    tray.Dispose();
                if (appIcon != null)
                    appIcon.Dispose();
            }
        }
    }

    // Loads data\settings-v2.json. Only its first creation may read legacy settings.json.
    static void LoadSettings()
    {
        State.Config = State.Store.Load(
            delegate
            {
                return new Settings
                {
                    token = RandomKey(),
                    pairingKey = ShortKey(),
                    apps = new List<AppEntry>(),
                };
            }
        );
        if (String.IsNullOrWhiteSpace(State.Config.token))
            State.Config.token = RandomKey();
        if (String.IsNullOrWhiteSpace(State.Config.pairingKey))
            State.Config.pairingKey = ShortKey();
        if (State.Config.apps == null)
            State.Config.apps = new List<AppEntry>();
        if (State.Config.columns < 3 || State.Config.columns > 8 || State.Config.rows < 2 || State.Config.rows > 5)
        {
            State.Config.columns = 5;
            State.Config.rows = 3;
            State.Config.keepAwake = true;
        }
        DeckLayout.MigrateGrid(State.Config);
        NormalizeControlSlots();
        foreach (var app in State.Config.apps)
            if (IsType(app, "app") && String.IsNullOrEmpty(app.icon))
                app.icon = StartApps.IsStartApp(app.path) ? StartApps.Icon(app.path) : AppIcons.Read(app.path);
        if (State.Config.devices == null)
            State.Config.devices = new List<PairedDevice>();
        SplitOrientationApps();
        DeckLayout.Migrate(State.Config);
        foreach (var app in State.Config.apps)
        {
            if (String.IsNullOrWhiteSpace(app.type))
                app.type = "app";
            WidgetRegistry.ValidateAndNormalize(app);
        }
        DeckLayout.Validate(State.Config);
        Save();
    }

    static void StartServer()
    {
        server = new TcpListener(IPAddress.Any, AppState.Port);
        server.Start(16);
        var t = new Thread(
            delegate()
            {
                Accept(server);
            }
        );
        t.IsBackground = true;
        t.Start();
    }

    static void CreateTrayIcon()
    {
        appIcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        tray = new NotifyIcon
        {
            Icon = appIcon ?? SystemIcons.Application,
            Text = "TaPoard",
            Visible = true,
        };
        var menu = new ContextMenuStrip();
        var openWindow = new ToolStripMenuItem("PC 用ウィンドウを開く", null, delegate { OpenPcWindowFromTray(); });
        openWindow.Font = new Font(openWindow.Font, FontStyle.Bold);
        var leaveViewOnly = new ToolStripMenuItem("見るだけモードを解除（Ctrl+Alt+V）", null, delegate { PcWindowService.SetViewOnly(false); });
        menu.Items.Add(openWindow);
        menu.Items.Add(leaveViewOnly);
        menu.Items.Add("PC 用ウィンドウの設定", null, delegate { OpenPcWindowSettings(); });
        menu.Items.Add(new ToolStripSeparator());
        menu.Opening += delegate { leaveViewOnly.Visible = PcWindowService.ViewOnly; };
        menu.Items.Add(
            "設定をブラウザで開く",
            null,
            delegate
            {
                OpenSettings();
            }
        );
        menu.Items.Add(
            "終了",
            null,
            delegate
            {
                Application.Exit();
            }
        );
        tray.ContextMenuStrip = menu;
        tray.DoubleClick += delegate
        {
            OpenSettings();
        };
    }

    static void OpenSettings()
    {
        Process.Start("http://127.0.0.1:" + AppState.Port + "/settings#" + admin);
    }
}
