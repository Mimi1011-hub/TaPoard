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
    const string AppVersion = "1.05";
    static readonly string Root = AppDomain.CurrentDomain.BaseDirectory;
    static readonly string Data = Path.Combine(Root, "data");

    // Guards every field below. Monitor.PulseAll on it wakes waiting /api/sync requests.
    static readonly object Gate = new object();
    static Settings config;
    static TcpListener server;
    static NotifyIcon tray;
    static Icon appIcon;
    static string admin;
    static LanNetwork lan;
    static Control ui;
    static ImportWindow importWindow;
    static string importId;
    static object importResult;

    // Changes whenever the app list changes, so phones can skip re-downloading icons.
    static string version = NewId();
    static int landscapePage,
        portraitPage;

    // Incremented by Signal() on every change that phones should pick up.
    static long revision = 1;
    static DateTime phoneLastSeen = DateTime.MinValue;

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
        return phoneLastSeen != DateTime.MinValue && (DateTime.UtcNow - phoneLastSeen).TotalSeconds < 30;
    }

    static void NormalizeControlSlots()
    {
        DeckLayout.MigrateGrid(config);
        DeckLayout.MigrateControls(config);
        NormalizeControlPair(Math.Max(2, DeckLayout.Columns(config, false) * DeckLayout.Rows(config, false)), false);
        NormalizeControlPair(Math.Max(2, DeckLayout.Columns(config, true) * DeckLayout.Rows(config, true)), true);
        // The legacy shared fields mirror the landscape layout for older clients.
        config.columns = config.landscapeColumns;
        config.rows = config.landscapeRows;
        config.speakerSlot = config.landscapeSpeakerSlot;
        config.micSlot = config.landscapeMicSlot;
        config.speakerSize = config.landscapeSpeakerSize;
        config.micSize = config.landscapeMicSize;
    }

    static void NormalizeControlPair(int total, bool portrait)
    {
        var c = DeckLayout.GetControls(config, portrait);
        if (c.speakerSlot < 0 || c.speakerSlot >= total)
            c.speakerSlot = 0;
        if (c.micSlot < 0 || c.micSlot >= total || c.micSlot == c.speakerSlot)
            c.micSlot = c.speakerSlot == 0 ? 1 : 0;
        if (c.speakerSize != 2)
            c.speakerSize = 1;
        if (c.micSize != 2)
            c.micSize = 1;
        DeckLayout.SetControls(config, portrait, c);
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
        };
    }

    static object Grid(bool portrait)
    {
        return new { columns = DeckLayout.Columns(config, portrait), rows = DeckLayout.Rows(config, portrait) };
    }

    static void Signal()
    {
        revision++;
        Monitor.PulseAll(Gate);
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
        SettingsFile.Save(Data, config);
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
                admin = RandomKey();
                lan = new LanNetwork(Path.Combine(Root, "network.json"));
                File.WriteAllText(Path.Combine(Root, "network-status.txt"), lan.Status);
                StartServer();
                ui = new Control();
                var handle = ui.Handle;
                CreateTrayIcon();
                if (Array.IndexOf(args, "--silent") < 0)
                    OpenSettings();
                Application.Run();
            }
            catch (Exception e)
            {
                MessageBox.Show(e.Message, "TaPoard");
            }
            finally
            {
                if (server != null)
                    server.Stop();
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
        config = SettingsFile.Load(
            Data,
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
                app.icon = AppIcons.Read(app.path);
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
