using System;
using System.Collections.Generic;

sealed class InputController : ControllerBase
{
    internal InputController(AppState state, IDesktop desktop) : base(state, desktop) { }
    internal void Register(ApiRouter<ApiRequest> api)
    {
        api.Get("/api/devices", ApiAccess.Admin, delegate(ApiRequest r) { HttpIO.ReplyJson(r.stream, 200, new { devices = AudioDevices.List() }); });
        api.Post("/api/audio", ApiAccess.Paired, delegate(ApiRequest r) { SetAudio(r, r.input); });
        api.Post("/api/view", ApiAccess.Paired, UpdateView);
        api.Post("/api/input", ApiAccess.Paired, SendInput);
        api.Post("/api/input/keepalive", ApiAccess.Paired, delegate(ApiRequest r) { ChangeLease(r, true); });
        api.Post("/api/input/release", ApiAccess.Paired, delegate(ApiRequest r) { ChangeLease(r, false); });
        api.Post("/api/action", ApiAccess.Paired, delegate(ApiRequest r) { RunAction(r, r.input); });
    }
    void UpdateView(ApiRequest r)
    {
        object rawViewId; if (!r.input.TryGetValue("viewId", out rawViewId)) throw new Exception("表示セッションが正しくありません。");
        string viewId = Convert.ToString(rawViewId); var visible = new List<string>(); object rawVisible;
        if (r.input.TryGetValue("visibleIds", out rawVisible)) { var list = rawVisible as System.Collections.IEnumerable; if (list == null || rawVisible is string || rawVisible is Dictionary<string, object>) throw new Exception("表示部品が正しくありません。"); foreach (object id in list) visible.Add(Convert.ToString(id)); }
        InputSessions.PublicSession[] sessions; lock (state.Gate) { sessions = UpdateRuntimeSessions(r, viewId, visible.ToArray(), true, true); state.TouchPhone(r.local); }
        HttpIO.ReplyJson(r.stream, 200, new { ok = true, inputSessions = sessions });
    }
    void SendInput(ApiRequest r)
    {
        object session, view, sequence, events; if (!r.input.TryGetValue("sessionId", out session) || !r.input.TryGetValue("viewId", out view) || !r.input.TryGetValue("sequence", out sequence) || !r.input.TryGetValue("events", out events)) throw new Exception("入力要求が正しくありません。");
        string owner = ViewIdentity(r, Convert.ToString(view)); PcWindowService.YieldFocus();
        HttpIO.ReplyJson(r.stream, 200, InputSessions.Execute(owner, Convert.ToString(session), Convert.ToInt32(sequence), InputSessions.ParseEvents(events)));
    }
    void ChangeLease(ApiRequest r, bool keepalive)
    {
        object session, view; if (!r.input.TryGetValue("sessionId", out session) || !r.input.TryGetValue("viewId", out view)) throw new Exception("入力要求が正しくありません。");
        string owner = ViewIdentity(r, Convert.ToString(view)); if (keepalive) InputSessions.Keepalive(owner, Convert.ToString(session)); else InputSessions.Release(owner, Convert.ToString(session)); HttpIO.Reply(r.stream, 200, HttpIO.JsonType, "{\"ok\":true}");
    }
}
