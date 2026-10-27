using System;
using System.Collections.Generic;

class InputSessionTests
{
    static void Check(bool value, string message)
    {
        if (!value) throw new Exception("FAIL " + message);
        Console.WriteLine("PASS " + message);
    }

    static void Reject(Action action, string message)
    {
        try { action(); throw new Exception("FAIL " + message); }
        catch (Exception e)
        {
            if (e.Message.StartsWith("FAIL ")) throw;
            Console.WriteLine("PASS " + message);
        }
    }

    static NativeInputEvent Event(string type, string control, int dx, int dy, int delta)
    {
        return new NativeInputEvent { type = type, control = control, dx = dx, dy = dy, delta = delta };
    }

    static AppEntry Widget(string id, string type)
    {
        var options = new Dictionary<string, object>();
        if (type == "wheel")
        {
            options["ctrl"] = true; options["shift"] = false; options["alt"] = false; options["middleClick"] = true;
            options["multiplier"] = 1; options["reverse"] = false;
        }
        else if (type == "touchpad")
        {
            options["tapToClick"] = true; options["twoFingerScroll"] = true; options["longPress"] = "rightClick";
        }
        return new AppEntry { id = id, name = id, type = type, options = options };
    }

    static InputSessions.PublicSession Find(InputSessions.PublicSession[] sessions, string widgetId)
    {
        foreach (var session in sessions) if (session.widgetId == widgetId) return session;
        throw new Exception("FAIL session not found: " + widgetId);
    }

    static void Main()
    {
        DateTime now = new DateTime(2030, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        int nextId = 0;
        bool failNext = false;
        var sent = new List<NativeInputEvent[]>();
        Func<DateTime> oldClock = InputSessions.Clock;
        Func<string> oldIds = InputSessions.IdFactory;
        Func<NativeInputEvent[], int> oldExecutor = NativeInput.Executor;
        Func<bool> oldElevated = NativeInput.ForegroundElevated;
        bool elevated = false;
        var apps = new List<AppEntry>
        {
            Widget("wheel-1", "wheel"),
            Widget("touch-1", "touchpad"),
            Widget("clock-1", "clock"),
        };
        try
        {
            InputSessions.ClearAll();
            InputSessions.Clock = delegate { return now; };
            InputSessions.IdFactory = delegate { nextId++; return "session-" + nextId.ToString("00"); };
            NativeInput.Executor = delegate(NativeInputEvent[] events)
            {
                sent.Add(events);
                if (failNext) { failNext = false; return events.Length - 1; }
                return events.Length;
            };

            NativeInput.ForegroundElevated = delegate { return elevated; };
            NativeInput.KeyCombo(new byte[] { 0x11, 0x43 });
            Check(
                sent.Count == 1 && sent[0].Length == 4 && sent[0][0].type == "keyDown"
                    && sent[0][3].type == "keyUp" && sent[0][3].control == "vk-11",
                "legacy shortcuts use the shared ordered SendInput path"
            );
            sent.Clear();

            var prepared = InputSessions.Prepare("owner-a:view-a", apps, new[] { "wheel-1", "touch-1", "clock-1", "missing" });
            Check(prepared.Length == 2, "only registered wheel and touchpad widgets receive sessions");
            Check(Find(prepared, "touch-1").nextSequence == 1 && Find(prepared, "touch-1").expiresInMs == 30000, "prepared session starts at sequence one with a bounded lease");
            var repeated = InputSessions.Prepare("owner-a:view-a", apps, new[] { "wheel-1", "touch-1" });
            Check(Find(repeated, "touch-1").sessionId == Find(prepared, "touch-1").sessionId, "visible view renewal reuses its prepared session");

            string first = Find(prepared, "touch-1").sessionId;
            var move = new[] { Event("move", null, 7, -3, 0) };
            var ack = InputSessions.Execute("owner-a:view-a", first, 1, move);
            Check(ack.acknowledged == 1 && !ack.duplicate && sent.Count == 1, "first ordered input is executed and acknowledged");
            Check(!ack.foregroundBlocked, "input to a normal window is not reported as blocked");
            var duplicate = InputSessions.Execute("owner-a:view-a", first, 1, move);
            Check(duplicate.duplicate && sent.Count == 1, "same sequence and content is acknowledged without re-execution");
            elevated = true;
            var blocked = InputSessions.Execute("owner-a:view-a", first, 2, move);
            Check(blocked.acknowledged == 2 && blocked.foregroundBlocked && sent.Count == 2, "input sent while an elevated window is in front is reported as blocked");
            elevated = false;
            Reject(
                delegate { InputSessions.Execute("owner-a:view-a", first, 2, new[] { Event("move", null, 8, -3, 0) }); },
                "same sequence with different content is rejected"
            );
            Check(InputSessions.Current().sessions == 1, "protocol violation invalidates only the offending widget session");

            prepared = InputSessions.Prepare("owner-a:view-a", apps, new[] { "wheel-1" });
            first = prepared[0].sessionId;
            Reject(
                delegate { InputSessions.Execute("owner-a:view-a", first, 2, new[] { Event("steps", null, 0, 0, 1) }); },
                "sequence gaps are rejected"
            );
            Check(InputSessions.Current().sessions == 0, "sequence gap terminates the unsafe session");

            string ownerA = InputSessions.Prepare("owner-a:view-a", apps, new[] { "touch-1" })[0].sessionId;
            string ownerB = InputSessions.Prepare("owner-b:view-b", apps, new[] { "wheel-1" })[0].sessionId;
            InputSessions.Execute("owner-a:view-a", ownerA, 1, new[] { Event("buttonDown", "left", 0, 0, 0) });
            int beforeTransfer = sent.Count;
            string busy = null;
            try { InputSessions.Execute("owner-b:view-b", ownerB, 1, new[] { Event("steps", null, 0, 0, 1) }); }
            catch (Exception e) { busy = e.Message; }
            Check(busy == InputSessions.BusyMessage && sent.Count == beforeTransfer, "another device cannot take over while the owner is operating");
            Check(InputSessions.Current().sessions == 2, "a refused device keeps its session for a later retry");
            InputSessions.Execute("owner-a:view-a", ownerA, 2, new[] { Event("move", null, 4, 4, 0) });
            Check(sent.Count == beforeTransfer + 1, "the owner keeps operating after a refused takeover");
            now = now.AddMilliseconds(1500);
            InputSessions.Keepalive("owner-a:view-a", ownerA);
            now = now.AddMilliseconds(1500);
            Reject(
                delegate { InputSessions.Execute("owner-b:view-b", ownerB, 1, new[] { Event("steps", null, 0, 0, 1) }); },
                "keepalive holds ownership during a motionless drag"
            );
            Reject(
                delegate { InputSessions.Keepalive("owner-b:view-b", ownerB); },
                "a device without ownership cannot extend it"
            );
            now = now.AddMilliseconds(600);
            InputSessions.PruneNow();
            Check(InputSessions.Current().activeSessionId == null && sent[sent.Count - 1][0].type == "buttonUp", "ownership ends two seconds after the last input or keepalive and releases held input");
            Check(InputSessions.Current().sessions == 2, "ownership expiry keeps both prepared sessions");
            InputSessions.Execute("owner-b:view-b", ownerB, 1, new[] { Event("steps", null, 0, 0, 1) });
            Check(InputSessions.Current().activeSessionId == ownerB, "another device operates after ownership has expired");
            InputSessions.Release("owner-b:view-b", ownerB);
            Check(InputSessions.Current().activeSessionId == null, "an explicit release hands ownership back immediately");
            InputSessions.Execute("owner-a:view-a", ownerA, 3, new[] { Event("move", null, 1, 1, 0) });
            InputSessions.Release("owner-a:view-a", ownerA);
            Reject(
                delegate { InputSessions.Execute("owner-a:view-a", ownerB, 2, new[] { Event("steps", null, 0, 0, 1) }); },
                "a different authenticated view cannot use another view's session"
            );

            InputSessions.ClearAll(); sent.Clear();
            var settingsApps = new List<AppEntry> { Widget("wheel-2", "wheel") };
            settingsApps[0].options["shift"] = true; settingsApps[0].options["multiplier"] = 3; settingsApps[0].options["reverse"] = true;
            string configured = InputSessions.Prepare("owner-a:view-a", settingsApps, new[] { "wheel-2" })[0].sessionId;
            InputSessions.Execute("owner-a:view-a", configured, 1, new[] { Event("steps", null, 0, 0, 2) });
            var wheelInput = sent[sent.Count - 1];
            Check(
                wheelInput.Length == 5 && wheelInput[0].type == "keyDown" && wheelInput[0].control == "ctrl"
                    && wheelInput[1].control == "shift" && wheelInput[2].type == "wheel" && wheelInput[2].delta == -720
                    && wheelInput[3].type == "keyUp" && wheelInput[3].control == "shift" && wheelInput[4].control == "ctrl",
                "the server derives wheel amount, direction and modifiers from the saved options"
            );
            Reject(
                delegate { InputSessions.Execute("owner-a:view-a", configured, 2, new[] { Event("wheel", null, 0, 0, -1200) }); },
                "a wheel device cannot send its own wheel amount"
            );
            configured = InputSessions.Prepare("owner-a:view-a", settingsApps, new[] { "wheel-2" })[0].sessionId;
            Reject(
                delegate { InputSessions.Execute("owner-a:view-a", configured, 1, new[] { Event("keyDown", "alt", 0, 0, 0) }); },
                "a wheel device cannot press modifiers itself"
            );
            Reject(
                delegate { InputSessions.Execute("owner-a:view-a", configured, 1, new[] { Event("steps", null, 0, 0, 21) }); },
                "wheel steps per request are bounded"
            );
            InputSessions.Release("owner-a:view-a", configured);

            var padApps = new List<AppEntry> { Widget("pad-2", "touchpad") };
            padApps[0].options["longPress"] = "none"; padApps[0].options["reverseScroll"] = true;
            string pad = InputSessions.Prepare("owner-a:view-a", padApps, new[] { "pad-2" })[0].sessionId;
            InputSessions.Execute("owner-a:view-a", pad, 1, new[] { Event("buttonDown", "right", 0, 0, 0), Event("buttonUp", "right", 0, 0, 0) });
            Check(sent[sent.Count - 1][1].type == "buttonUp" && sent[sent.Count - 1][1].control == "right", "two-finger tap right click is allowed while tapping is enabled");
            InputSessions.Execute("owner-a:view-a", pad, 2, new[] { Event("wheel", null, 0, 0, 90) });
            Check(sent[sent.Count - 1][0].delta == -90, "the saved touchpad scroll direction is applied on the PC");
            padApps[0].options["tapToClick"] = false; padApps[0].options["twoFingerScroll"] = false;
            pad = InputSessions.Prepare("owner-a:view-a", padApps, new[] { "pad-2" })[0].sessionId;
            Reject(
                delegate { InputSessions.Execute("owner-a:view-a", pad, 3, new[] { Event("buttonDown", "left", 0, 0, 0) }); },
                "clicks are refused when tapping and long press are off"
            );
            pad = InputSessions.Prepare("owner-a:view-a", padApps, new[] { "pad-2" })[0].sessionId;
            Reject(
                delegate { InputSessions.Execute("owner-a:view-a", pad, 1, new[] { Event("wheel", null, 0, 0, 90) }); },
                "scrolling is refused when two-finger scroll is off"
            );
            InputSessions.ClearAll(); sent.Clear();

            string restricted = InputSessions.Prepare("owner-c:view-c", apps, new[] { "wheel-1" })[0].sessionId;
            Reject(
                delegate { InputSessions.Execute("owner-c:view-c", restricted, 1, move); },
                "wheel session cannot inject pointer movement"
            );

            InputSessions.ClearAll(); sent.Clear();
            string expiring = InputSessions.Prepare("owner-a:view-a", apps, new[] { "touch-1" })[0].sessionId;
            InputSessions.Execute("owner-a:view-a", expiring, 1, new[] { Event("buttonDown", "left", 0, 0, 0) });
            Check(InputSessions.Current().activeRemainingMs == 2000, "the one-shot timer is armed for ownership expiry");
            now = now.AddSeconds(29);
            InputSessions.Touch("owner-a:view-a");
            now = now.AddSeconds(29);
            InputSessions.PruneNow();
            Check(InputSessions.Current().sessions == 1, "long-poll renewal keeps prepared sessions without re-planning them");
            now = now.AddSeconds(31);
            InputSessions.PruneNow();
            Check(InputSessions.Current().sessions == 0 && !InputSessions.Current().timerArmed, "idle session expires and stops the one-shot timer");
            Check(sent[sent.Count - 1][0].type == "buttonUp", "expiry releases held mouse buttons");

            sent.Clear();
            string hidden = InputSessions.Prepare("owner-a:view-a", apps, new[] { "touch-1" })[0].sessionId;
            InputSessions.Execute("owner-a:view-a", hidden, 1, new[] { Event("buttonDown", "left", 0, 0, 0) });
            InputSessions.Prepare("owner-a:view-a", apps, new string[0]);
            Check(InputSessions.Current().sessions == 0 && sent[sent.Count - 1][0].type == "buttonUp", "hiding a widget releases held input immediately");

            sent.Clear();
            string interrupted = InputSessions.Prepare("owner-a:view-a", apps, new[] { "touch-1" })[0].sessionId;
            InputSessions.Execute("owner-a:view-a", interrupted, 1, new[] { Event("buttonDown", "left", 0, 0, 0) });
            InputSessions.ReleaseActive();
            Check(InputSessions.Current().activeSessionId == null && sent[sent.Count - 1][0].type == "buttonUp", "legacy shortcut safely releases an active pointer session first");
            InputSessions.Prepare("owner-a:view-a", apps, new string[0]);

            string changed = InputSessions.Prepare("owner-a:view-a", apps, new[] { "wheel-1" })[0].sessionId;
            InputSessions.RemoveUnknown(new[] { Widget("wheel-1", "clock") });
            Check(InputSessions.Current().sessions == 0, "deleting or changing an input widget invalidates its session");

            string partial = InputSessions.Prepare("owner-a:view-a", apps, new[] { "touch-1" })[0].sessionId;
            failNext = true;
            Reject(
                delegate
                {
                    InputSessions.Execute(
                        "owner-a:view-a",
                        partial,
                        1,
                        new[] { Event("buttonDown", "left", 0, 0, 0), Event("move", null, 3, 2, 0) }
                    );
                },
                "partial SendInput failure is reported"
            );
            Check(InputSessions.Current().sessions == 0 && sent[sent.Count - 1][0].type == "buttonUp", "partial failure releases possibly held input and ends the session");

            Reject(
                delegate { InputSessions.Prepare("owner-a:view-a", apps, new[] { "wheel-1", "touch-1", "clock-1", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39" }); },
                "visible input IDs are bounded"
            );
            Reject(
                delegate { InputSessions.Prepare("", apps, new[] { "wheel-1" }); },
                "empty authenticated owner is rejected"
            );
            Reject(
                delegate { InputSessions.Execute("owner-a:view-a", "missing", 1, new[] { Event("move", null, 5000, 0, 0) }); },
                "unbounded pointer movement is rejected before session lookup"
            );

            InputSessions.ClearAll();
            for (int i = 0; i < 15; i++)
                InputSessions.Prepare("owner-" + i + ":view", apps, new[] { "wheel-1" });
            Reject(
                delegate { InputSessions.Prepare("owner-two:view", apps, new[] { "wheel-1", "touch-1" }); },
                "session capacity rejects a multi-widget request atomically"
            );
            Check(InputSessions.Current().sessions == 15, "failed capacity request leaves no partial session behind");
            InputSessions.Prepare("owner-15:view", apps, new[] { "wheel-1" });
            Reject(
                delegate { InputSessions.Prepare("owner-16:view", apps, new[] { "wheel-1" }); },
                "total prepared session count is bounded"
            );
        }
        finally
        {
            InputSessions.ClearAll();
            InputSessions.Clock = oldClock;
            InputSessions.IdFactory = oldIds;
            NativeInput.Executor = oldExecutor;
            NativeInput.ForegroundElevated = oldElevated;
        }
    }
}
