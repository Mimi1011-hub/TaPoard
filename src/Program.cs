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
// Program.Http.cs holds the HTTP plumbing and Program.Api.cs the API endpoints.
partial class Program
{
    const int Port = 18781;
    static readonly string AppVersion = BuildInfo.DisplayVersion;
    static readonly string Root = AppDomain.CurrentDomain.BaseDirectory;
    static readonly string Data = Path.Combine(Root, "data");
    internal static readonly AppState State = new AppState(Root, Data, AppVersion, AppHost.CreateWindows(), new FileSettingsStore(Data));
    static Settings
        config { get { return State.Config; } set { State.Config = value; } }
    static object Gate { get { return State.Gate; } }
    static SyncHub sync { get { return State.Sync; } }
    static ISettingsStore store { get { return State.Store; } }
    static AppHost host { get { return State.Host; } }
    static TcpListener server;
    static NotifyIcon tray;
    static Icon appIcon;
    static string admin;
    static LanNetwork lan;
    static Control ui;
    static ImportWindow importWindow;
    static string importId { get { return State.ImportId; } set { State.ImportId = value; } }
    static object importResult { get { return State.ImportResult; } set { State.ImportResult = value; } }

    internal static void UseHost(AppHost value)
    {
        State.Host = value;
    }

    internal static void UseStore(ISettingsStore value)
    {
        State.Store = value;
    }

    // Changes whenever the app list changes, so phones can skip re-downloading icons.
    static string version { get { return State.Version; } set { State.Version = value; } }
    static int landscapePage { get { return State.LandscapePage; } set { State.LandscapePage = value; } }
    static int portraitPage { get { return State.PortraitPage; } set { State.PortraitPage = value; } }

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
        return sync.PhoneConnected;
    }

    static void NormalizeControlSlots()
    {
        DeckLayout.MigrateGrid(config);
        DeckLayout.MigrateControls(config);
        // The legacy shared fields mirror the landscape layout for older clients.
        config.columns = config.landscapeColumns;
        config.rows = config.landscapeRows;
        config.speakerSlot = config.landscapeSpeakerSlot;
        config.micSlot = config.landscapeMicSlot;
        config.speakerSize = config.landscapeSpeakerSize;
        config.micSize = config.landscapeMicSize;
    }

    static object Controls(bool portrait)
    {
        var c = DeckLayout.GetControls(config, portrait);
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
            speakerHidden = DeckLayout.Off(config, portrait, false),
            micHidden = DeckLayout.Off(config, portrait, true),
        };
    }

    // Per-page fader overrides; pages not listed use the orientation's shared controls.
    static object ControlPages(bool portrait)
    {
        var pages = new List<object>();
        foreach (var entry in DeckLayout.ControlPages(config, portrait))
        {
            bool speakerHidden, micHidden;
            var c = DeckLayout.GetPageControls(config, portrait, entry.page, out speakerHidden, out micHidden);
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
        return new { columns = DeckLayout.Columns(config, portrait), rows = DeckLayout.Rows(config, portrait) };
    }

    static void Signal()
    {
        sync.Signal();
    }

    // Settings from before 1.03 shared one entry between orientations; give each orientation its own copy.
    static void SplitOrientationApps()
    {
        var migrated = new List<AppEntry>();
        foreach (var app in config.apps)
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
        config.apps = migrated;
    }

    static void Save()
    {
        store.Save(config);
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
                WeatherService.Initialize(Data, delegate { lock (Gate) Signal(); });
                DisplaySubscriptions.Changed = delegate
                {
                    MetricsSampler.OnSubscriptionsChanged();
                    lock (Gate) WeatherService.SetActive(DisplaySubscriptions.Current().weather.Count != 0, config);
                };
                MetricsSampler.Changed = delegate
                {
                    lock (Gate)
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
        config = store.Load(
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
        if (String.IsNullOrWhiteSpace(config.token))
            config.token = RandomKey();
        if (String.IsNullOrWhiteSpace(config.pairingKey))
            config.pairingKey = ShortKey();
        if (config.apps == null)
            config.apps = new List<AppEntry>();
        if (config.columns < 3 || config.columns > 8 || config.rows < 2 || config.rows > 5)
        {
            config.columns = 5;
            config.rows = 3;
            config.keepAwake = true;
        }
        DeckLayout.MigrateGrid(config);
        NormalizeControlSlots();
        foreach (var app in config.apps)
            if (IsType(app, "app") && String.IsNullOrEmpty(app.icon))
                app.icon = StartApps.IsStartApp(app.path) ? StartApps.Icon(app.path) : AppIcons.Read(app.path);
        if (config.devices == null)
            config.devices = new List<PairedDevice>();
        SplitOrientationApps();
        DeckLayout.Migrate(config);
        foreach (var app in config.apps)
        {
            if (String.IsNullOrWhiteSpace(app.type))
                app.type = "app";
            WidgetRegistry.ValidateAndNormalize(app);
        }
        DeckLayout.Validate(config);
        Save();
    }

    static void StartServer()
    {
        server = new TcpListener(IPAddress.Any, Port);
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
        Process.Start("http://127.0.0.1:" + Port + "/settings#" + admin);
    }
}
