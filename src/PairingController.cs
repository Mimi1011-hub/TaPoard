using System;
using System.Collections.Generic;

sealed class PairingController : ControllerBase
{
    internal PairingController(AppState state, IDesktop desktop) : base(state, desktop)
    {
    }

    internal void Register(ApiRouter<ApiRequest> api)
    {
        api.Post("/api/pair/start", ApiAccess.Open, PairStart);
        api.Get("/api/pair/status", ApiAccess.Open, PairStatus);
        api.Get("/api/pair/manage", ApiAccess.Admin, GetManage);
        api.Post("/api/pair/manage", ApiAccess.Admin, delegate(ApiRequest r) { ManagePairing(r, r.input); });
        api.Post("/api/rotate", ApiAccess.Admin, RotateRequest);
    }
    void GetManage(ApiRequest r)
    {
        lock (state.Gate)
            HttpIO.ReplyJson(r.stream, 200, Pairing.View(state.Config));
    }

    void RotateRequest(ApiRequest r)
    {
        RotateKeys();
        HttpIO.Reply(r.stream, 200, HttpIO.JsonType, "{\"ok\":true}");
    }

    internal void PairStart(ApiRequest r)
    {
        var request = HttpIO.ReadInput(r.stream, r.headers);
        lock (state.Gate)
        {
            var p = Pairing.Start(Convert.ToString(request["name"]), r.remote.ToString());
            state.Signal();
            HttpIO.ReplyJson(
                r.stream,
                200,
                new
                {
                    id = p.id,
                    secret = p.secret,
                    code = p.code,
                    expires = p.expires.ToString("o"),
                }
            );
        }
    }

    internal void PairStatus(ApiRequest r)
    {
        string secret = r.auth != null && r.auth.StartsWith("Bearer ") ? r.auth.Substring(7) : null;
        lock (state.Gate)
            HttpIO.ReplyJson(r.stream, 200, Pairing.Poll(HttpIO.QueryValue(r.target, "id"), secret));
    }

    internal void ManagePairing(ApiRequest r, Dictionary<string, object> input)
    {
        lock (state.Gate)
        {
            string id = Convert.ToString(input["id"]);
            if (input.ContainsKey("revoke"))
            {
                Pairing.Revoke(state.Config, id);
                DisplaySubscriptions.ClearAll();
                InputSessions.ClearAll();
            }
            else
                Pairing.Decide(state.Config, id, Convert.ToString(input["code"]), Convert.ToBoolean(input["approve"]));
            state.Save();
            state.Signal();
            HttpIO.ReplyJson(r.stream, 200, Pairing.View(state.Config));
        }
    }

    internal void RotateKeys()
    {
        lock (state.Gate)
        {
            state.Config.token = DeckView.RandomKey();
            state.Config.pairingKey = DeckView.ShortKey();
            state.Config.devices.Clear();
            DisplaySubscriptions.ClearAll();
            InputSessions.ClearAll();
            Pairing.Pending.Clear();
            Pairing.Revision++;
            state.Save();
            state.Signal();
        }
        PcWindowService.TokenChanged();
    }
}
