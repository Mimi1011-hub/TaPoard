using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

// 3.0: glue between the shared settings and the PC window (PcWindow.cs).
partial class Program
{
    static void InitPcWindow()
    {
        lock (Gate)
            config.pcWindow = PcWindowOptions.Normalize(config.pcWindow);
        PcWindowService.UserDataFolder = Path.Combine(Data, "webview2");
        PcWindowService.ReadOptions = delegate
        {
            lock (Gate)
                return config.pcWindow.Clone();
        };
        PcWindowService.SaveState = delegate(PcWindowOptions state)
        {
            lock (Gate)
            {
                var o = config.pcWindow;
                o.x = state.x;
                o.y = state.y;
                o.width = state.width;
                o.height = state.height;
                o.hasBounds = state.hasBounds;
                o.maximized = state.maximized;
                o.topmost = state.topmost;
                o.showInfo = state.showInfo;
                Save();
            }
        };
        // The window signs in with the long key; the fragment never reaches the HTTP log.
        PcWindowService.DeckUrl = delegate
        {
            lock (Gate)
                return "http://127.0.0.1:" + Port + "/?view=pc#connect=" + Uri.EscapeDataString(config.token);
        };
        PcWindowService.OpenSettingsPage = OpenPcWindowSettings;
        PcWindowService.Notify = ShowNotice;
        PcWindowService.Changed = delegate
        {
            lock (Gate)
                Signal();
        };
    }

    static string StartupMode()
    {
        lock (Gate)
            return config.pcWindow.startup;
    }

    static void OpenPcWindow(bool fullscreen)
    {
        PcWindowService.Open(fullscreen);
    }

    static void OpenPcWindowFromTray()
    {
        try
        {
            OpenPcWindow(false);
        }
        catch (Exception e)
        {
            ShowNotice(e.Message);
            OpenSettings();
        }
    }

    // The PC window's own settings: a small page on this PC only (127.0.0.1 and the per-launch admin key).
    static void OpenPcWindowSettings()
    {
        Process.Start("http://127.0.0.1:" + Port + "/pc-window#" + admin);
    }

    static object PcWindowView()
    {
        lock (Gate)
            return new
            {
                options = config.pcWindow.PublicView(),
                open = PcWindowService.IsOpen,
                viewOnly = PcWindowService.ViewOnly,
                runtimeAvailable = PcWindowService.RuntimeAvailable,
            };
    }

    static void SavePcWindow(Request r, Dictionary<string, object> input)
    {
        PcWindowOptions copy;
        lock (Gate)
        {
            config.pcWindow.ApplyPreferences(input);
            Save();
            copy = config.pcWindow.Clone();
        }
        PcWindowService.Apply(copy);
        ReplyJson(r.stream, 200, PcWindowView());
    }

    static void ShowNotice(string text)
    {
        if (ui == null || tray == null)
            return;
        ui.BeginInvoke(
            new MethodInvoker(delegate
            {
                tray.ShowBalloonTip(5000, "TaPoard", text, ToolTipIcon.Info);
            })
        );
    }
}
