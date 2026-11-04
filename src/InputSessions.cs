using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;

// Ordered, authenticated input sessions. Requests are executed serially and an
// acknowledged sequence can be retried without sending the input twice.
// Only one session owns the pointer at a time; another session is refused until
// the owner releases it or stays silent for OwnershipSeconds (no takeover).
static class InputSessions
{
    internal sealed class PublicSession
    {
        public string widgetId { get; set; }
        public string sessionId { get; set; }
        public int nextSequence { get; set; }
        public int expiresInMs { get; set; }
    }

    internal sealed class Ack
    {
        public bool ok { get; set; }
        public int acknowledged { get; set; }
        public bool duplicate { get; set; }
        public long serverElapsedMs { get; set; }
        public bool foregroundBlocked { get; set; }
    }

    internal sealed class Snapshot
    {
        internal int sessions;
        internal string activeSessionId;
        internal bool timerArmed;
        internal int activeRemainingMs;
    }

    sealed class Session
    {
        internal string id;
        internal string owner;
        internal string widgetId;
        internal string widgetType;
        internal int widgetHeight;
        internal Dictionary<string, object> options;
        internal DateTime expires;
        internal int lastSequence;
        internal string lastDigest;
        internal HashSet<string> heldKeys = new HashSet<string>(StringComparer.Ordinal);
        internal HashSet<string> heldButtons = new HashSet<string>(StringComparer.Ordinal);
    }

    const int MaxSessions = 16;
    const int MaxEvents = 32;
    const int MaxWheelSteps = 20;
    const int LifetimeSeconds = 30;
    internal const int OwnershipSeconds = 2;
    internal const string BusyMessage = "他の端末が操作中です。";
    static readonly object Sync = new object();
    static readonly Dictionary<string, Session> Sessions = new Dictionary<string, Session>(StringComparer.Ordinal);
    static readonly Timer ExpiryTimer = new Timer(OnTimer, null, Timeout.Infinite, Timeout.Infinite);
    internal static Func<DateTime> Clock = delegate { return DateTime.UtcNow; };
    internal static Func<string> IdFactory = delegate { return Guid.NewGuid().ToString("N"); };
    static string activeSessionId;
    static DateTime activeUntil;
    static bool timerArmed;

    internal static PublicSession[] Prepare(string owner, IEnumerable<AppEntry> configured, IEnumerable<string> visibleIds)
    {
        ValidateOwner(owner);
        var requested = new HashSet<string>(visibleIds ?? new string[0], StringComparer.Ordinal);
        if (requested.Count > 40) throw new Exception("表示部品が多すぎます。");
        var allowed = new Dictionary<string, AppEntry>(StringComparer.Ordinal);
        foreach (var app in configured)
            if (requested.Contains(app.id) && (IsType(app, "wheel") || IsType(app, "touchpad") || IsType(app, "keypad"))) allowed[app.id] = app;

        DateTime now = Clock();
        lock (Sync)
        {
            PruneLocked(now);
            var remove = new List<Session>();
            foreach (var session in Sessions.Values)
                if (session.owner == owner && !allowed.ContainsKey(session.widgetId)) remove.Add(session);
            foreach (var session in remove) RemoveLocked(session, true);

            int missing = 0;
            foreach (string widgetId in allowed.Keys) if (FindLocked(owner, widgetId) == null) missing++;
            if (Sessions.Count + missing > MaxSessions) throw new Exception("入力セッションが多すぎます。");

            var result = new List<PublicSession>();
            foreach (var pair in allowed)
            {
                string widgetId = pair.Key;
                AppEntry app = pair.Value;
                Session session = FindLocked(owner, widgetId);
                if (session == null)
                {
                    string id;
                    int attempts = 0;
                    do { id = IdFactory(); attempts++; }
                    while (Sessions.ContainsKey(id) && attempts < 8);
                    if (String.IsNullOrEmpty(id) || id.Length > 64 || Sessions.ContainsKey(id))
                        throw new Exception("入力セッションを発行できませんでした。");
                    session = new Session { id = id, owner = owner, widgetId = widgetId };
                    Sessions.Add(session.id, session);
                }
                session.widgetType = app.type;
                session.widgetHeight = DeckLayout.Height(app);
                session.options = app.options == null
                    ? new Dictionary<string, object>()
                    : new Dictionary<string, object>(app.options, StringComparer.Ordinal);
                session.expires = now.AddSeconds(LifetimeSeconds);
                result.Add(Public(session, now));
            }
            ArmLocked(now);
            return result.ToArray();
        }
    }

    internal static Ack Execute(string owner, string sessionId, int sequence, NativeInputEvent[] events)
    {
        ValidateOwner(owner);
        if (String.IsNullOrEmpty(sessionId) || sessionId.Length > 64) throw new Exception("入力セッションが正しくありません。");
        if (sequence < 1) throw new Exception("入力の連番が正しくありません。");
        ValidateEvents(events);
        string digest = Digest(events);
        var watch = Stopwatch.StartNew();
        lock (Sync)
        {
            DateTime now = Clock();
            PruneLocked(now);
            Session session;
            if (!Sessions.TryGetValue(sessionId, out session) || session.owner != owner)
                throw new Exception("入力セッションの有効期限が切れています。");
            ValidateForSession(session, events);
            if (sequence == session.lastSequence)
            {
                if (session.lastDigest != digest) { RemoveLocked(session, true); ArmLocked(now); throw new Exception("同じ連番の内容が一致しません。"); }
                ArmLocked(now);
                return new Ack { ok = true, acknowledged = sequence, duplicate = true, serverElapsedMs = watch.ElapsedMilliseconds };
            }
            if (sequence != session.lastSequence + 1)
            {
                RemoveLocked(session, true); ArmLocked(now);
                throw new Exception("入力の連番が前後しています。新しいセッションを準備してください。");
            }

            if (activeSessionId != null && activeSessionId != session.id)
            {
                // The owner keeps the pointer; the other device retries after it is released.
                ArmLocked(now);
                throw new Exception(BusyMessage);
            }
            NativeInputEvent[] native = Expand(session, events);
            activeSessionId = session.id;

            var keys = new HashSet<string>(session.heldKeys, StringComparer.Ordinal);
            var buttons = new HashSet<string>(session.heldButtons, StringComparer.Ordinal);
            try
            {
                ApplyHeldState(native, keys, buttons);
                NativeInput.Send(native);
            }
            catch
            {
                NativeInput.Release(keys, buttons);
                RemoveLocked(session, false);
                ArmLocked(now);
                throw;
            }
            session.heldKeys = keys;
            session.heldButtons = buttons;
            session.lastSequence = sequence;
            session.lastDigest = digest;
            session.expires = now.AddSeconds(LifetimeSeconds);
            activeUntil = now.AddSeconds(OwnershipSeconds);
            ArmLocked(now);
            return new Ack
            {
                ok = true, acknowledged = sequence, duplicate = false, serverElapsedMs = watch.ElapsedMilliseconds,
                foregroundBlocked = NativeInput.ForegroundElevated(),
            };
        }
    }

    // Keeps ownership while a drag or press is held without movement.
    internal static void Keepalive(string owner, string sessionId)
    {
        ValidateOwner(owner);
        lock (Sync)
        {
            DateTime now = Clock();
            PruneLocked(now);
            Session session;
            if (sessionId == null || !Sessions.TryGetValue(sessionId, out session) || session.owner != owner)
                throw new Exception("入力セッションの有効期限が切れています。");
            if (activeSessionId != session.id) { ArmLocked(now); throw new Exception("操作権がありません。"); }
            activeUntil = now.AddSeconds(OwnershipSeconds);
            session.expires = now.AddSeconds(LifetimeSeconds);
            ArmLocked(now);
        }
    }

    // Ends the owner's operation now: held input is released and the session stays usable.
    internal static void Release(string owner, string sessionId)
    {
        ValidateOwner(owner);
        lock (Sync)
        {
            DateTime now = Clock();
            PruneLocked(now);
            Session session;
            if (sessionId != null && Sessions.TryGetValue(sessionId, out session) && session.owner == owner
                && activeSessionId == session.id)
                EndOwnershipLocked();
            ArmLocked(now);
        }
    }

    // Long-poll renewal: extends the owner's prepared sessions without adding or removing any,
    // because the visible IDs of a waiting request may already be stale.
    internal static void Touch(string owner)
    {
        if (String.IsNullOrEmpty(owner)) return;
        lock (Sync)
        {
            DateTime now = Clock();
            PruneLocked(now);
            foreach (var session in Sessions.Values)
                if (session.owner == owner) session.expires = now.AddSeconds(LifetimeSeconds);
            ArmLocked(now);
        }
    }

    internal static NativeInputEvent[] ParseEvents(object raw)
    {
        var enumerable = raw as IEnumerable;
        if (enumerable == null || raw is string || raw is Dictionary<string, object>)
            throw new Exception("入力イベントが正しくありません。");
        var result = new List<NativeInputEvent>();
        foreach (object value in enumerable)
        {
            var item = value as Dictionary<string, object>;
            if (item == null) throw new Exception("入力イベントが正しくありません。");
            object rawType; if (!item.TryGetValue("type", out rawType)) throw new Exception("入力種類がありません。");
            var e = new NativeInputEvent { type = Convert.ToString(rawType) };
            object field;
            if (item.TryGetValue("dx", out field)) e.dx = Convert.ToInt32(field);
            if (item.TryGetValue("dy", out field)) e.dy = Convert.ToInt32(field);
            if (item.TryGetValue("delta", out field)) e.delta = Convert.ToInt32(field);
            if (item.TryGetValue("control", out field)) e.control = Convert.ToString(field);
            result.Add(e);
        }
        NativeInputEvent[] events = result.ToArray();
        ValidateEvents(events);
        return events;
    }

    internal static void RemoveUnknown(IEnumerable<AppEntry> configured)
    {
        var allowed = new HashSet<string>(StringComparer.Ordinal);
        foreach (var app in configured) if (IsType(app, "wheel") || IsType(app, "touchpad") || IsType(app, "keypad")) allowed.Add(app.id);
        lock (Sync)
        {
            var remove = new List<Session>();
            foreach (var session in Sessions.Values) if (!allowed.Contains(session.widgetId)) remove.Add(session);
            foreach (var session in remove) RemoveLocked(session, true);
            ArmLocked(Clock());
        }
    }

    internal static void ClearAll()
    {
        lock (Sync)
        {
            foreach (var session in new List<Session>(Sessions.Values)) ReleaseLocked(session);
            Sessions.Clear(); activeSessionId = null; activeUntil = DateTime.MinValue; timerArmed = false;
            ExpiryTimer.Change(Timeout.Infinite, Timeout.Infinite);
        }
    }

    internal static void ReleaseActive()
    {
        lock (Sync)
        {
            EndOwnershipLocked();
            ArmLocked(Clock());
        }
    }

    internal static void PruneNow()
    {
        lock (Sync) { DateTime now = Clock(); PruneLocked(now); ArmLocked(now); }
    }

    internal static Snapshot Current()
    {
        lock (Sync)
        {
            DateTime now = Clock(); PruneLocked(now); ArmLocked(now);
            return new Snapshot
            {
                sessions = Sessions.Count,
                activeSessionId = activeSessionId,
                timerArmed = timerArmed,
                activeRemainingMs = activeSessionId == null ? 0 : (int)Math.Max(0, (activeUntil - now).TotalMilliseconds),
            };
        }
    }

    static bool IsType(AppEntry app, string type) { return String.Equals(app.type, type, StringComparison.OrdinalIgnoreCase); }

    static void ValidateOwner(string owner)
    {
        if (String.IsNullOrEmpty(owner) || owner.Length > 200) throw new Exception("表示セッションが正しくありません。");
    }

    static void ValidateEvents(NativeInputEvent[] events)
    {
        if (events == null || events.Length == 0 || events.Length > MaxEvents)
            throw new Exception("入力イベント数が正しくありません。");
        foreach (NativeInputEvent e in events)
        {
            if (e == null) throw new Exception("入力イベントが正しくありません。");
            if (e.type == "move")
            {
                if (Math.Abs(e.dx) > 4096 || Math.Abs(e.dy) > 4096 || (e.dx == 0 && e.dy == 0))
                    throw new Exception("マウス移動量が範囲外です。");
            }
            else if (e.type == "wheel")
            {
                if (e.delta == 0 || Math.Abs(e.delta) > 1200) throw new Exception("ホイール量が範囲外です。");
            }
            else if (e.type == "steps")
            {
                if (e.delta == 0 || Math.Abs(e.delta) > MaxWheelSteps) throw new Exception("ホイール量が範囲外です。");
            }
            else if (e.type == "buttonDown" || e.type == "buttonUp")
            {
                if (e.control != "left" && e.control != "right" && e.control != "middle")
                    throw new Exception("マウスボタンが正しくありません。");
            }
            else if (e.type == "keyDown" || e.type == "keyUp")
            {
                if (e.control != "ctrl" && e.control != "shift" && e.control != "alt")
                    throw new Exception("修飾キーが正しくありません。");
            }
            else if (e.type == "keyTap")
            {
                if (!IsKeypadControl(e.control)) throw new Exception("テンキーが正しくありません。");
            }
            else throw new Exception("入力種類が正しくありません。");
        }
    }

    static void ValidateForSession(Session session, NativeInputEvent[] events)
    {
        foreach (NativeInputEvent e in events)
        {
            if (String.Equals(session.widgetType, "wheel", StringComparison.OrdinalIgnoreCase))
            {
                // Wheel amount and modifiers come from the saved options; the device sends only steps.
                if (e.type == "steps") continue;
                if ((e.type == "buttonDown" || e.type == "buttonUp") && e.control == "middle" && Option(session, "middleClick", false)) continue;
                throw new Exception("このホイール設定では許可されていない入力です。");
            }
            if (String.Equals(session.widgetType, "touchpad", StringComparison.OrdinalIgnoreCase))
            {
                if (e.type == "move") continue;
                if (e.type == "wheel" && Option(session, "twoFingerScroll", true)) continue;
                if ((e.type == "buttonDown" || e.type == "buttonUp") && e.control == "left"
                    && (Option(session, "tapToClick", true) || OptionText(session, "longPress", "none") == "drag")) continue;
                // Two-finger tap is a right click when tapping is enabled.
                if ((e.type == "buttonDown" || e.type == "buttonUp") && e.control == "right"
                    && (Option(session, "tapToClick", true) || OptionText(session, "longPress", "none") == "rightClick")) continue;
                throw new Exception("このタッチパッド設定では許可されていない入力です。");
            }
            if (String.Equals(session.widgetType, "keypad", StringComparison.OrdinalIgnoreCase))
            {
                // NumLock exists only on the 4x5 keypad; each layout accepts just its own keys.
                if (e.type == "keyTap" && IsKeypadControl(e.control) && (e.control != "numpad-numlock" || session.widgetHeight == 5)) continue;
                throw new Exception("このテンキーでは許可されていない入力です。");
            }
            throw new Exception("入力部品の種類が正しくありません。");
        }
    }

    // Turns validated device events into native input using the saved widget options.
    static NativeInputEvent[] Expand(Session session, NativeInputEvent[] events)
    {
        var result = new List<NativeInputEvent>();
        bool wheel = String.Equals(session.widgetType, "wheel", StringComparison.OrdinalIgnoreCase);
        int sign = Option(session, wheel ? "reverse" : "reverseScroll", false) ? -1 : 1;
        foreach (NativeInputEvent e in events)
        {
            if (e.type == "steps")
            {
                int multiplier = Math.Max(1, Math.Min(10, OptionNumber(session, "multiplier", 1)));
                var modifiers = new List<string>();
                foreach (string name in new[] { "ctrl", "shift", "alt" }) if (Option(session, name, false)) modifiers.Add(name);
                foreach (string name in modifiers) result.Add(new NativeInputEvent { type = "keyDown", control = name });
                result.Add(new NativeInputEvent { type = "wheel", delta = sign * e.delta * multiplier * 120 });
                for (int i = modifiers.Count - 1; i >= 0; i--) result.Add(new NativeInputEvent { type = "keyUp", control = modifiers[i] });
            }
            else if (e.type == "wheel") result.Add(new NativeInputEvent { type = "wheel", delta = sign * e.delta });
            else if (e.type == "keyTap")
            {
                result.Add(new NativeInputEvent { type = "keyDown", control = e.control });
                result.Add(new NativeInputEvent { type = "keyUp", control = e.control });
            }
            else result.Add(e);
        }
        return result.ToArray();
    }

    static bool IsKeypadControl(string control)
    {
        if (String.IsNullOrEmpty(control)) return false;
        if (control.Length == 8 && control.StartsWith("numpad-", StringComparison.Ordinal)
            && control[7] >= '0' && control[7] <= '9') return true;
        return control == "numpad-enter" || control == "numpad-numlock" || control == "numpad-decimal" || control == "numpad-add"
            || control == "numpad-subtract" || control == "numpad-multiply" || control == "numpad-divide";
    }

    static int OptionNumber(Session session, string name, int fallback)
    {
        object value;
        return session.options != null && session.options.TryGetValue(name, out value) ? Convert.ToInt32(value) : fallback;
    }

    static bool Option(Session session, string name, bool fallback)
    {
        object value;
        return session.options != null && session.options.TryGetValue(name, out value) ? Convert.ToBoolean(value) : fallback;
    }

    static string OptionText(Session session, string name, string fallback)
    {
        object value;
        return session.options != null && session.options.TryGetValue(name, out value) ? Convert.ToString(value) : fallback;
    }

    static void ApplyHeldState(NativeInputEvent[] events, HashSet<string> keys, HashSet<string> buttons)
    {
        foreach (NativeInputEvent e in events)
        {
            if (e.type == "keyDown") { if (!keys.Add(e.control)) throw new Exception("同じキーを二重に押しています。"); }
            else if (e.type == "keyUp") { if (!keys.Remove(e.control)) throw new Exception("押されていないキーを離そうとしました。"); }
            else if (e.type == "buttonDown") { if (!buttons.Add(e.control)) throw new Exception("同じボタンを二重に押しています。"); }
            else if (e.type == "buttonUp") { if (!buttons.Remove(e.control)) throw new Exception("押されていないボタンを離そうとしました。"); }
        }
    }

    static string Digest(NativeInputEvent[] events)
    {
        var parts = new string[events.Length];
        for (int i = 0; i < events.Length; i++) parts[i] = events[i].Canonical();
        return String.Join(";", parts);
    }

    static Session FindLocked(string owner, string widgetId)
    {
        foreach (var session in Sessions.Values)
            if (session.owner == owner && session.widgetId == widgetId) return session;
        return null;
    }

    static PublicSession Public(Session session, DateTime now)
    {
        return new PublicSession
        {
            widgetId = session.widgetId,
            sessionId = session.id,
            nextSequence = session.lastSequence + 1,
            expiresInMs = Math.Max(0, (int)Math.Min(Int32.MaxValue, (session.expires - now).TotalMilliseconds)),
        };
    }

    static void RemoveLocked(Session session, bool release)
    {
        if (release) ReleaseLocked(session);
        Sessions.Remove(session.id);
        if (activeSessionId == session.id) activeSessionId = null;
    }

    static void ReleaseLocked(Session session)
    {
        NativeInput.Release(session.heldKeys, session.heldButtons);
        session.heldKeys.Clear(); session.heldButtons.Clear();
    }

    static void EndOwnershipLocked()
    {
        Session active;
        if (activeSessionId != null && Sessions.TryGetValue(activeSessionId, out active)) ReleaseLocked(active);
        activeSessionId = null;
    }

    static void PruneLocked(DateTime now)
    {
        if (activeSessionId != null && activeUntil <= now) EndOwnershipLocked();
        var expired = new List<Session>();
        foreach (var session in Sessions.Values) if (session.expires <= now) expired.Add(session);
        foreach (var session in expired) RemoveLocked(session, true);
    }

    static void ArmLocked(DateTime now)
    {
        DateTime earliest = DateTime.MaxValue;
        foreach (var session in Sessions.Values) if (session.expires < earliest) earliest = session.expires;
        if (activeSessionId != null && activeUntil < earliest) earliest = activeUntil;
        if (earliest == DateTime.MaxValue)
        {
            timerArmed = false; ExpiryTimer.Change(Timeout.Infinite, Timeout.Infinite); return;
        }
        timerArmed = true;
        long milliseconds = Math.Max(1, Math.Min(Int32.MaxValue, (long)Math.Ceiling((earliest - now).TotalMilliseconds)));
        ExpiryTimer.Change((int)milliseconds, Timeout.Infinite);
    }

    static void OnTimer(object state)
    {
        lock (Sync) { DateTime now = Clock(); PruneLocked(now); ArmLocked(now); }
    }
}
