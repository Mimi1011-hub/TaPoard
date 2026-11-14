using System;
using System.Diagnostics;
using System.Threading;

public static class SyncHubTests
{
    static void Assert(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }

    public static int Main()
    {
        try
        {
            var gate = new object();
            var hub = new SyncHub(gate);
            long initial = hub.Revision;
            lock (gate) hub.Signal();
            Assert(hub.Revision == initial + 1, "Signal increments Revision");

            var watch = Stopwatch.StartNew();
            lock (gate) hub.Wait(hub.Revision - 1, 1000);
            watch.Stop();
            Assert(watch.ElapsedMilliseconds < 100, "Wait returns immediately for an old revision");

            watch.Restart();
            lock (gate) hub.Wait(hub.Revision, 50);
            watch.Stop();
            Assert(watch.ElapsedMilliseconds >= 35, "Wait observes its timeout");

            long known = hub.Revision;
            var signaler = new Thread(
                delegate()
                {
                    Thread.Sleep(30);
                    lock (gate) hub.Signal();
                }
            );
            signaler.Start();
            watch.Restart();
            lock (gate) hub.Wait(known, 1000);
            watch.Stop();
            signaler.Join();
            Assert(watch.ElapsedMilliseconds < 500 && hub.Revision == known + 1, "Signal wakes a waiting thread");

            var touchGate = new object();
            var touchHub = new SyncHub(touchGate);
            long beforeTouch = touchHub.Revision;
            lock (touchGate) touchHub.Touch(false);
            Assert(touchHub.Revision == beforeTouch + 1 && touchHub.PhoneConnected, "first remote touch connects and signals");
            long afterRemote = touchHub.Revision;
            lock (touchGate) touchHub.Touch(true);
            Assert(touchHub.Revision == afterRemote, "local touch changes nothing");

            Console.WriteLine("PASS SyncHubTests");
            return 0;
        }
        catch (Exception e)
        {
            Console.Error.WriteLine(e);
            return 1;
        }
    }
}
