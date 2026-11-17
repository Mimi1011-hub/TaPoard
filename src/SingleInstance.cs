using System;
using System.Threading;

// Lets a second launch ask the running TaPoard to show its PC window.
class SingleInstance : IDisposable
{
    internal const string EventName = "Local\\TaPoard.Show";
    readonly EventWaitHandle handle;
    readonly Thread listener;
    readonly Action onShow;
    volatile bool stopped;

    internal SingleInstance(string eventName, Action onShow)
    {
        this.onShow = onShow;
        handle = new EventWaitHandle(false, EventResetMode.AutoReset, eventName);
        listener = new Thread(Listen) { IsBackground = true, Name = "TaPoard.Show" };
        listener.Start();
    }

    void Listen()
    {
        while (!stopped)
        {
            handle.WaitOne();
            if (stopped)
                return;
            try { onShow(); }
            catch (Exception) { }
        }
    }

    internal static bool SignalRunning(string eventName, string[] args)
    {
        if (Array.IndexOf(args, "--silent") >= 0)
            return false;
        try
        {
            using (EventWaitHandle other = EventWaitHandle.OpenExisting(eventName))
            {
                other.Set();
                return true;
            }
        }
        catch (Exception)
        {
            return false;
        }
    }

    public void Dispose()
    {
        stopped = true;
        handle.Set();
        handle.Close();
    }
}
