using System;
using System.Threading;

// Callers must hold the gate supplied to the constructor.
sealed class SyncHub
{
    readonly object gate;
    long revision = 1;
    DateTime phoneLastSeen = DateTime.MinValue;

    internal SyncHub(object gate)
    {
        this.gate = gate;
    }

    internal long Revision { get { return revision; } }

    internal void Signal()
    {
        revision++;
        Monitor.PulseAll(gate);
    }

    internal bool Wait(long known, int timeoutMs)
    {
        if (known != Revision)
            return false;
        return Monitor.Wait(gate, timeoutMs);
    }

    internal void Touch(bool localRequest)
    {
        bool was = PhoneConnected;
        if (!localRequest)
        {
            phoneLastSeen = DateTime.UtcNow;
            if (!was)
                Signal();
        }
    }

    internal void MarkPhoneSeen()
    {
        phoneLastSeen = DateTime.UtcNow;
    }

    internal bool PhoneConnected
    {
        get
        {
            return phoneLastSeen != DateTime.MinValue && (DateTime.UtcNow - phoneLastSeen).TotalSeconds < 30;
        }
    }
}
