using System;
using System.Collections.Generic;

sealed class InputController : ControllerBase
{
    readonly DeckController deck;

    internal InputController(AppState state, IDesktop desktop, DeckController deck) : base(state, desktop)
    {
        this.deck = deck;
    }
    internal void Register(ApiRouter<ApiRequest> api)
    {
        api.Get("/api/devices", ApiAccess.Admin, GetDevices);
        api.Post("/api/audio", ApiAccess.Paired, SetAudioRequest);
        api.Post("/api/view", ApiAccess.Paired, UpdateView);
        api.Post("/api/input", ApiAccess.Paired, SendInput);
        api.Post("/api/input/keepalive", ApiAccess.Paired, Keepalive);
        api.Post("/api/input/release", ApiAccess.Paired, Release);
        api.Post("/api/action", ApiAccess.Paired, RunActionRequest);
    }

    void GetDevices(ApiRequest r)
    {
        HttpIO.ReplyJson(r.stream, 200, new { devices = AudioDevices.List() });
    }

    void SetAudioRequest(ApiRequest r)
    {
        SetAudio(r, r.input);
    }

    void Keepalive(ApiRequest r)
    {
        ChangeLease(r, true);
    }

    void Release(ApiRequest r)
    {
        ChangeLease(r, false);
    }

    void RunActionRequest(ApiRequest r)
    {
        RunAction(r, r.input);
    }

    void UpdateView(ApiRequest r)
    {
        object rawViewId;
        if (!r.input.TryGetValue("viewId", out rawViewId))
            throw new Exception("表示セッションが正しくありません。");
        string viewId = Convert.ToString(rawViewId);
        var visible = new List<string>();
        object rawVisible;
        if (r.input.TryGetValue("visibleIds", out rawVisible))
        {
            var list = rawVisible as System.Collections.IEnumerable;
            if (list == null || rawVisible is string || rawVisible is Dictionary<string, object>)
                throw new Exception("表示部品が正しくありません。");
            foreach (object id in list)
                visible.Add(Convert.ToString(id));
        }
        InputSessions.PublicSession[] sessions;
        lock (state.Gate)
        {
            sessions = deck.UpdateRuntimeSessions(r, viewId, visible.ToArray(), true, true);
            state.TouchPhone(r.local);
        }
        HttpIO.ReplyJson(r.stream, 200, new { ok = true, inputSessions = sessions });
    }

    void SendInput(ApiRequest r)
    {
        object session, view, sequence, events;
        if (!r.input.TryGetValue("sessionId", out session) || !r.input.TryGetValue("viewId", out view) || !r.input.TryGetValue("sequence", out sequence) || !r.input.TryGetValue("events", out events))
            throw new Exception("入力要求が正しくありません。");
        string owner = deck.ViewIdentity(r, Convert.ToString(view));
        PcWindowService.YieldFocus();
        HttpIO.ReplyJson(r.stream, 200, InputSessions.Execute(owner, Convert.ToString(session), Convert.ToInt32(sequence), InputSessions.ParseEvents(events)));
    }

    void ChangeLease(ApiRequest r, bool keepalive)
    {
        object session, view;
        if (!r.input.TryGetValue("sessionId", out session) || !r.input.TryGetValue("viewId", out view))
            throw new Exception("入力要求が正しくありません。");
        string owner = deck.ViewIdentity(r, Convert.ToString(view));
        if (keepalive)
            InputSessions.Keepalive(owner, Convert.ToString(session));
        else
            InputSessions.Release(owner, Convert.ToString(session));
        HttpIO.Reply(r.stream, 200, HttpIO.JsonType, "{\"ok\":true}");
    }

    internal AudioState ApplyAudio(Dictionary<string, object> input, out string target, out bool notify)
    {
        target = Convert.ToString(input["target"]);
        AudioState audio;
        if (input.ContainsKey("volume"))
        {
            audio = state.Host.Audio.SetVolume(target, Convert.ToInt32(input["volume"]));
            notify = input.ContainsKey("final") && Convert.ToBoolean(input["final"]);
        }
        else if (input.ContainsKey("delta"))
        {
            audio = state.Host.Audio.AdjustVolume(target, Convert.ToInt32(input["delta"]));
            notify = true;
        }
        else if (input.ContainsKey("toggleMute") && Convert.ToBoolean(input["toggleMute"]))
        {
            audio = state.Host.Audio.ToggleMute(target);
            notify = true;
        }
        else
            throw new Exception("音量操作を指定してください。");
        return audio;
    }

    internal void SetAudio(ApiRequest r, Dictionary<string, object> input)
    {
        string target;
        bool notify;
        AudioState audio = ApplyAudio(input, out target, out notify);
        lock (state.Gate)
        {
            if (notify)
                state.Signal();
            HttpIO.ReplyJson(
                r.stream,
                200,
                new
                {
                    ok = true,
                    target = target,
                    audio = audio,
                    revision = state.Sync.Revision,
                }
            );
        }
    }

    internal void RunAction(ApiRequest r, Dictionary<string, object> input)
    {
        string resultMessage = "操作を送信しました。";
        string action = Convert.ToString(input["action"]);
        PcWindowService.YieldFocus();
        if (action == "up" || action == "down" || action == "mute")
        {
            InputSessions.ReleaseActive();
            state.Host.Pointer.KeyTap(VolumeKey(action));
        }
        else if (action == "launch")
        {
            string id = Convert.ToString(input["id"]);
            AppEntry app;
            lock (state.Gate)
                app = state.Config.apps.Find(a => a.id == id);
            if (app == null)
                throw new Exception("ボタンが見つかりません");
            if (WidgetRegistry.IsDisplayWidget(app.type))
                throw new Exception("この部品は直接実行できません");
            resultMessage = Launch(app, resultMessage);
        }
        else
            throw new Exception("不明な操作です");
        HttpIO.ReplyJson(r.stream, 200, new { ok = true, message = resultMessage });
    }

    internal byte VolumeKey(string action)
    {
        return action == "up" ? (byte)0xAF // VK_VOLUME_UP
            : action == "down" ? (byte)0xAE // VK_VOLUME_DOWN
            : (byte)0xAD; // VK_VOLUME_MUTE
    }

    internal string Launch(AppEntry app, string defaultMessage)
    {
        if (DeckView.IsType(app, "audioDevice"))
        {
            state.Host.AudioDevices.Switch(app.deviceTarget, app.deviceId);
            lock (state.Gate)
                state.Signal();
            return (app.deviceTarget == "mic" ? "入力先" : "出力先") + "を「" + app.deviceName + "」へ切り替えました。";
        }
        if (DeckView.IsType(app, "hotkey"))
        {
            InputSessions.ReleaseActive();
            state.Host.Keys.Send(app.action, app.hotkey);
            if (state.Host.Keys.IsAudio(app.action))
                lock (state.Gate)
                    state.Signal();
            return defaultMessage;
        }
        if (DeckView.IsType(app, "url"))
        {
            state.Host.Shell.OpenUrl(app.url);
            return "URLを開きました。";
        }
        if (DeckView.IsType(app, "clipboard"))
        {
            state.Host.Shell.CopyText(app.text);
            return "テキストをWindowsへコピーしました。";
        }
        // Start menu apps (Store apps included) open through Explorer.
        if (state.Host.Shell.IsStartApp(app.path))
        {
            state.Host.Shell.StartApp(app.path);
            return "アプリを起動しました。";
        }
        // Shortcuts (.lnk) go through the shell so their own target, arguments and folder apply.
        state.Host.Shell.StartProcess(app.path, app.args);
        return "アプリを起動しました。";
    }
}
