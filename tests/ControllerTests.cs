using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;

public static class ControllerTests
{
    static void Assert(bool condition, string message) { if (!condition) throw new Exception(message); }
    static Settings Settings()
    {
        var settings = new Settings { schemaVersion = 2, token = "token", pairingKey = "short", apps = new List<AppEntry>(), devices = new List<PairedDevice>(),
            columns = 5, rows = 3, landscapeColumns = 5, landscapeRows = 3, portraitColumns = 3, portraitRows = 5,
            landscapePageCount = 2, portraitPageCount = 1, speakerSlot = 0, micSlot = 1, speakerSize = 1, micSize = 1,
            landscapeSpeakerSlot = 0, landscapeMicSlot = 1, landscapeSpeakerSize = 1, landscapeMicSize = 1,
            portraitSpeakerSlot = 0, portraitMicSlot = 1, portraitSpeakerSize = 1, portraitMicSize = 1 };
        DeckLayout.Migrate(settings); DeckView.NormalizeControlSlots(settings); return settings;
    }
    static ApiRequest Request(string path, Dictionary<string, object> input)
    {
        return new ApiRequest { stream = new MemoryStream(), method = path == "/api/state" ? "GET" : "POST", path = path, target = path,
            input = input, json = HttpIO.Json(input), auth = "Bearer token", remote = IPAddress.Loopback, local = true };
    }
    static string Body(ApiRequest request)
    {
        string text = Encoding.UTF8.GetString(((MemoryStream)request.stream).ToArray()); int split = text.IndexOf("\r\n\r\n"); return split < 0 ? text : text.Substring(split + 4);
    }
    public static int Main()
    {
        try
        {
            var keys = new FakeKeySender(); var pointer = new FakePointerInput(); var audio = new FakeAudioService();
            var devices = new FakeAudioDevices(); var shell = new FakeShellActions(); var store = new FakeSettingsStore(); var desktop = new FakeDesktop();
            var state = new AppState("root", "data", "test", new AppHost(keys, pointer, audio, devices, shell), store); state.Config = Settings();
            var router = new ApiRouter<ApiRequest>();
            var deck = new DeckController(state, desktop);
            new PairingController(state, desktop).Register(router);
            deck.Register(router);
            new PageController(state, desktop, deck).Register(router);
            new LookController(state, desktop, deck).Register(router);
            new InputController(state, desktop, deck).Register(router);
            new SystemController(state, desktop).Register(router);

            ApiRequest request = Request("/api/state", null); router.Find("GET", request.path, false)(request);
            Assert(Body(request).Contains("\"revision\":"), "state response includes revision");

            request = Request("/api/page/delete", new Dictionary<string, object> { { "orientation", "landscape" }, { "page", 1 } });
            router.Find("POST", request.path, true)(request);
            Assert(DeckLayout.Pages(state.Config, "landscape") == 1 && Object.ReferenceEquals(store.Saved, state.Config), "page delete saves one page");
            request = Request("/api/page/undo", new Dictionary<string, object>()); router.Find("POST", request.path, true)(request);
            Assert(DeckLayout.Pages(state.Config, "landscape") == 2, "page undo restores two pages");

            long revision = state.Sync.Revision;
            request = Request("/api/audio", new Dictionary<string, object> { { "target", "speaker" }, { "volume", 40 }, { "final", true } });
            router.Find("POST", request.path, false)(request);
            Assert(audio.Calls[0] == "SetVolume:speaker:40" && state.Sync.Revision == revision + 1, "audio uses fake and signals");
            Assert(store.Calls.Count >= 2, "controllers use the memory settings store");
            Console.WriteLine("PASS ControllerTests"); return 0;
        }
        catch (Exception e) { Console.Error.WriteLine(e); return 1; }
    }
}
