using System;
using System.Threading;

class SingleInstanceTests
{
    static void Assert(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }

    static int Main()
    {
        try
        {
            string name = "Local\\TaPoard.Show.Test" + Guid.NewGuid().ToString("N");
            string settingsName = name + ".Settings";
            Assert(!SingleInstance.SignalRunning(name, settingsName, new string[0]), "no running app means no signal");
            int shown = 0;
            int settingsShown = 0;
            var gotIt = new ManualResetEvent(false);
            var gotSettings = new ManualResetEvent(false);
            using (var running = new SingleInstance(name, delegate { Interlocked.Increment(ref shown); gotIt.Set(); }))
            using (var settings = new SingleInstance(settingsName, delegate
            {
                Interlocked.Increment(ref settingsShown);
                gotSettings.Set();
            }))
            {
                Assert(!SingleInstance.SignalRunning(name, settingsName, new[] { "--silent" }), "--silent does not signal");
                Assert(!gotIt.WaitOne(300), "silent launch shows nothing");
                Assert(!gotSettings.WaitOne(300), "silent launch does not show settings");
                Assert(SingleInstance.SignalRunning(name, settingsName, new string[0]), "a normal launch signals the running app");
                Assert(gotIt.WaitOne(3000), "the running app is told to show its window");
                Assert(!gotSettings.WaitOne(300), "a normal launch does not show settings");
                Assert(SingleInstance.SignalRunning(name, settingsName, new[] { "--show-settings" }),
                    "settings launch signals the running app");
                Assert(gotSettings.WaitOne(3000), "the running app is told to show settings");
                Thread.Sleep(200);
                Assert(shown == 1, "one signal shows the window once");
                Assert(settingsShown == 1, "one settings signal shows settings once");
            }
            Console.WriteLine("PASS SingleInstanceTests");
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error);
            return 1;
        }
    }
}
