using System;
using System.Collections.Generic;
using System.Reflection;

public static class HostTests
{
    static FakeKeySender keys;
    static FakePointerInput pointer;
    static FakeAudioService audio;
    static FakeAudioDevices devices;
    static FakeShellActions shell;

    static void Assert(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }

    static void Reset()
    {
        keys = new FakeKeySender();
        pointer = new FakePointerInput();
        audio = new FakeAudioService();
        devices = new FakeAudioDevices();
        shell = new FakeShellActions();
        Program.UseHost(new AppHost(keys, pointer, audio, devices, shell));
    }

    static string Launch(AppEntry app)
    {
        return Program.InputApi.Launch(app, "default");
    }

    static void Hotkey()
    {
        Reset();
        Launch(new AppEntry { type = "hotkey", action = "discord-mute", hotkey = "ctrl+shift+m" });
        Assert(keys.Calls.Count == 1, "hotkey call count");
        Assert(keys.Calls[0] == "Send:discord-mute:ctrl+shift+m", "hotkey arguments");
    }

    static void Url()
    {
        Reset();
        Launch(new AppEntry { type = "url", url = "https://example.com/path" });
        Assert(shell.Calls.Count == 1, "url call count");
        Assert(shell.Calls[0] == "OpenUrl:https://example.com/path", "url argument");
    }

    static void Clipboard()
    {
        Reset();
        Launch(new AppEntry { type = "clipboard", text = "copied text" });
        Assert(shell.Calls.Count == 1, "clipboard call count");
        Assert(shell.Calls[0] == "CopyText:copied text", "clipboard argument");
    }

    static void AudioDevice()
    {
        Reset();
        Launch(new AppEntry { type = "audioDevice", deviceTarget = "speaker", deviceId = "device-1", deviceName = "Speakers" });
        Assert(devices.Calls.Count == 1, "audio device call count");
        Assert(devices.Calls[0] == "Switch:speaker:device-1", "audio device arguments");
    }

    static void Processes()
    {
        Reset();
        Launch(new AppEntry { type = "app", path = @"C:\Apps\shortcut.lnk", args = "" });
        Launch(new AppEntry { type = "app", path = @"C:\Apps\program.exe", args = "--quiet" });
        Assert(shell.Calls.Count == 4, "process call count");
        Assert(shell.Calls[1] == @"StartProcess:C:\Apps\shortcut.lnk:", "shortcut arguments");
        Assert(shell.Calls[3] == @"StartProcess:C:\Apps\program.exe:--quiet", "executable arguments");
    }

    static void StartMenuApp()
    {
        Reset();
        Launch(new AppEntry { type = "app", path = "shell:AppsFolder\\package!app", args = "ignored" });
        Assert(shell.Calls.Count == 2, "start app call count");
        Assert(shell.Calls[0] == "IsStartApp:shell:AppsFolder\\package!app", "start app detection");
        Assert(shell.Calls[1] == "StartApp:shell:AppsFolder\\package!app", "start app launch");
    }

    static void VolumeKeys()
    {
        Assert(Program.InputApi.VolumeKey("up") == 0xAF, "volume up key");
        Assert(Program.InputApi.VolumeKey("down") == 0xAE, "volume down key");
        Assert(Program.InputApi.VolumeKey("mute") == 0xAD, "volume mute key");
    }

    static bool Apply(Dictionary<string, object> input, out string target)
    {
        bool notify;
        Program.InputApi.ApplyAudio(input, out target, out notify);
        return notify;
    }

    static void AudioActions()
    {
        string target;
        Reset();
        bool notify = Apply(new Dictionary<string, object> { { "target", "speaker" }, { "volume", 42 } }, out target);
        Assert(audio.Calls[0] == "SetVolume:speaker:42" && target == "speaker" && !notify, "volume drag does not notify");

        Reset();
        notify = Apply(new Dictionary<string, object> { { "target", "speaker" }, { "volume", 43 }, { "final", true } }, out target);
        Assert(audio.Calls[0] == "SetVolume:speaker:43" && notify, "final volume notifies");

        Reset();
        notify = Apply(new Dictionary<string, object> { { "target", "mic" }, { "delta", -2 } }, out target);
        Assert(audio.Calls[0] == "AdjustVolume:mic:-2" && target == "mic" && notify, "volume adjustment notifies");

        Reset();
        notify = Apply(new Dictionary<string, object> { { "target", "mic" }, { "toggleMute", true } }, out target);
        Assert(audio.Calls[0] == "ToggleMute:mic" && target == "mic" && notify, "mute toggle notifies");
    }

    static void SettingsStore()
    {
        ISettingsStore originalStore = Program.State.Store;
        Settings originalConfig = Program.State.Config;
        var fake = new FakeSettingsStore();
        var settings = new Settings { schemaVersion = 2, apps = new List<AppEntry>() };
        try
        {
            Program.UseStore(fake);
            Program.State.Config = settings;
            Program.State.Save();
            Assert(fake.Calls.Count == 1 && fake.Calls[0] == "Save" && Object.ReferenceEquals(fake.Saved, settings), "Program.Save uses the injected store");
        }
        finally
        {
            Program.State.Config = originalConfig;
            Program.UseStore(originalStore);
        }
    }

    public static int Main()
    {
        try
        {
            Hotkey();
            Url();
            Clipboard();
            AudioDevice();
            Processes();
            StartMenuApp();
            VolumeKeys();
            AudioActions();
            SettingsStore();
            Console.WriteLine("PASS HostTests");
            return 0;
        }
        catch (Exception e)
        {
            Console.Error.WriteLine(e);
            return 1;
        }
        finally
        {
            Program.UseHost(AppHost.CreateWindows());
        }
    }
}
