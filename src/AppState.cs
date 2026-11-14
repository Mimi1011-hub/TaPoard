using System;

// Shared by the API, tray and PC window. Callers must hold Gate while reading or writing mutable state.
sealed class AppState
{
    internal const int Port = 18781;
    internal readonly object Gate = new object();
    internal readonly SyncHub Sync;
    internal readonly PageUndo Undo = new PageUndo();
    internal readonly string Root;
    internal readonly string Data;
    internal readonly string AppVersion;
    internal AppHost Host;
    internal ISettingsStore Store;
    internal Settings Config;
    internal string Version;
    internal int LandscapePage;
    internal int PortraitPage;
    internal string ImportId;
    internal object ImportResult;
    internal LanNetwork Lan;

    internal AppState(string root, string data, string appVersion, AppHost host, ISettingsStore store)
    {
        Root = root;
        Data = data;
        AppVersion = appVersion;
        Host = host;
        Store = store;
        Sync = new SyncHub(Gate);
        NewVersion();
    }

    internal void Save() { Store.Save(Config); }
    internal void Signal() { Sync.Signal(); }
    internal void NewVersion() { Version = Guid.NewGuid().ToString("N"); }
    internal void TouchPhone(bool localRequest) { Sync.Touch(localRequest); }
    internal bool PhoneConnected { get { return Sync.PhoneConnected; } }
}
