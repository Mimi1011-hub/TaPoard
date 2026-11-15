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
        var settings = new Settings { schemaVersion = 2, token = "token", apps = new List<AppEntry>(), devices = new List<PairedDevice>(),
            columns = 5, rows = 3, landscapeColumns = 5, landscapeRows = 3, portraitColumns = 3, portraitRows = 5,
            landscapePageCount = 2, portraitPageCount = 1, speakerSlot = 0, micSlot = 1, speakerSize = 1, micSize = 1,
            landscapeSpeakerSlot = 0, landscapeMicSlot = 1, landscapeSpeakerSize = 1, landscapeMicSize = 1,
            portraitSpeakerSlot = 0, portraitMicSlot = 1, portraitSpeakerSize = 1, portraitMicSize = 1 };
        DeckLayout.Migrate(settings); DeckView.NormalizeControlSlots(settings); return settings;
    }
    static ApiRequest Request(string path, Dictionary<string, object> input)
    {
        string route = path.Split('?')[0];
        return new ApiRequest { stream = new MemoryStream(), method = route == "/api/state" || route == "/api/v3/state" ? "GET" : "POST", path = route, target = path,
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

            string languageData = Path.Combine(Path.GetTempPath(), "TaPoard-language-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(languageData);
            var languageState = new AppState("root", languageData, "test", state.Host, store);
            languageState.Config = Settings();
            var languageRouter = new ApiRouter<ApiRequest>();
            new SystemController(languageState, desktop).Register(languageRouter);
            ApiRequest request = Request("/api/v3/language", null);
            request.method = "GET";
            languageRouter.Find("GET", request.path, true)(request);
            Assert(Body(request).Contains("\"preference\":"), "language preference can be read");
            request = Request("/api/v3/language", new Dictionary<string, object> { { "preference", "en" } });
            languageRouter.Find("POST", request.path, true)(request);
            Assert(File.ReadAllText(Path.Combine(languageData, "language.txt")) == "en", "language preference is saved");
            Assert(Text.Language == "en", "saved language is applied");
            bool invalidLanguage = false;
            try
            {
                request = Request("/api/v3/language", new Dictionary<string, object> { { "preference", "xx" } });
                languageRouter.Find("POST", request.path, true)(request);
            }
            catch (ArgumentException)
            {
                invalidLanguage = true;
            }
            Assert(invalidLanguage, "invalid language is rejected as a bad request");
            Directory.Delete(languageData, true);

            request = Request("/api/state", null); router.Find("GET", request.path, false)(request);
            Assert(Body(request).Contains("\"revision\":"), "state response includes revision");

            state.Config.apps.Add(new AppEntry { id = "launch", name = "Launch", type = "app", orientation = "landscape", path = @"C:\secret\tool.exe", args = "--secret", landscape = new TilePosition { page = 0, row = 1, column = 0 }, width = 2, height = 2, fontSize = 11, iconScale = 82, labelOpacity = 45 });
            state.Config.apps.Add(new AppEntry { id = "url", name = "URL", type = "url", orientation = "landscape", url = "https://private.example/secret", landscape = new TilePosition { page = 0, row = 0, column = 2 }, width = 1, height = 1, fontSize = 11, iconScale = 82, labelOpacity = 45 });
            state.Config.apps.Add(new AppEntry { id = "text", name = "Text", type = "clipboard", orientation = "landscape", text = "private-text", landscape = new TilePosition { page = 0, row = 0, column = 3 }, width = 1, height = 1, fontSize = 11, iconScale = 82, labelOpacity = 45 });
            state.Config.apps.Add(new AppEntry { id = "keys", name = "Keys", type = "hotkey", orientation = "landscape", hotkey = "Ctrl+X", landscape = new TilePosition { page = 0, row = 0, column = 4 }, width = 1, height = 1, fontSize = 11, iconScale = 82, labelOpacity = 45, options = new Dictionary<string, object> { { "unsafe", true } } });
            state.Config.apps.Add(new AppEntry { id = "clock", name = "Clock", type = "clock", orientation = "landscape", landscape = new TilePosition { page = 0, row = 1, column = 2 }, width = 2, height = 1, fontSize = 11, iconScale = 82, labelOpacity = 45, options = new Dictionary<string, object> { { "style", "digital" } } });
            request = Request("/api/v3/state", null); router.Find("GET", request.path, false)(request);
            string v3 = Body(request);
            Assert(!v3.Contains("secret") && !v3.Contains("private.example") && !v3.Contains("private-text"), "v3 state hides executable, URL and clipboard values");
            Assert(!v3.Contains("\"path\":") && !v3.Contains("\"args\":") && !v3.Contains("\"url\":") && !v3.Contains("\"text\":") && !v3.Contains("\"hotkey\":"), "v3 state omits private field names");
            Assert(v3.Contains("\"id\":\"launch\"") && v3.Contains("\"row\":1") && v3.Contains("\"column\":0") && v3.Contains("\"width\":2") && v3.Contains("\"height\":2"), "v3 state preserves item rectangles");
            Assert(v3.Contains("\"id\":\"clock\"") && v3.Contains("\"options\":{\"style\":\"digital\"}"), "v3 state exposes display widget options");
            Assert(v3.Contains("\"id\":\"keys\"") && !v3.Contains("\"unsafe\""), "v3 state hides ordinary button options");
            request = Request("/api/v3/state?version=" + Uri.EscapeDataString(state.Version), null); router.Find("GET", request.path, false)(request);
            v3 = Body(request);
            Assert(!v3.Contains("\"deck\":") && !v3.Contains("\"widgetDefinitions\":"), "unchanged v3 state omits deck and definitions");

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
