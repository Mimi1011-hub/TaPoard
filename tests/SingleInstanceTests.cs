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
            Assert(!SingleInstance.SignalRunning(name, new string[0]), "no running app means no signal");
            int shown = 0;
            var gotIt = new ManualResetEvent(false);
            using (var running = new SingleInstance(name, delegate { Interlocked.Increment(ref shown); gotIt.Set(); }))
            {
                Assert(!SingleInstance.SignalRunning(name, new[] { "--silent" }), "--silent does not signal");
                Assert(!gotIt.WaitOne(300), "silent launch shows nothing");
                Assert(SingleInstance.SignalRunning(name, new string[0]), "a normal launch signals the running app");
                Assert(gotIt.WaitOne(3000), "the running app is told to show its window");
                Thread.Sleep(200);
                Assert(shown == 1, "one signal shows the window once");
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
