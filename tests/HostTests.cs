using System;
using System.Reflection;

public static class HostTests
{
    static FakeKeySender keys;
    static FakePointerInput pointer;
    static FakeAudioService audio;
    static FakeAudioDevices devices;
    static FakeShellActions shell;
    static MethodInfo launch;

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
        return (string)launch.Invoke(null, new object[] { app, "default" });
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

    public static int Main()
    {
        try
        {
            launch = typeof(Program).GetMethod("Launch", BindingFlags.Static | BindingFlags.NonPublic);
            Assert(launch != null, "Program.Launch not found");
            Hotkey();
            Url();
            Clipboard();
            AudioDevice();
            Processes();
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
