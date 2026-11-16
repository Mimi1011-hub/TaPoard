using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Web.Script.Serialization;

public static class DeckV3SaveTests
{
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
    sealed class ReadResponse { public int schemaVersion; public string version; public DeckV3 deck; }
    sealed class Result { public int status; public string body; public string error; }

    static void Assert(bool condition, string message) { if (!condition) throw new Exception(message); Console.WriteLine("PASS " + message); }
    static T Copy<T>(T value) { return Json.Deserialize<T>(Json.Serialize(value)); }
    static AppEntry Entry(string id, string name, string type, string path, int page, int row, int column, int width, int height)
    {
        return new AppEntry { id = id, name = name, type = type, category = type == "app" ? "app" : type == "url" ? "custom" : "widget", path = path, args = "", url = type == "url" ? "https://example.com/" : "", text = "", orientation = "landscape",
            landscape = new TilePosition { page = page, row = row, column = column }, width = width, height = height, size = 1,
            fontSize = 11, iconScale = 82, labelOpacity = 45, iconKey = "globe", iconColor = "#3569c8", customIcon = "", options = null };
    }
    static Settings Fixture(string executable)
    {
        var settings = new Settings { schemaVersion = 2, token = "phone", devices = new List<PairedDevice>(), apps = new List<AppEntry>(),
            columns = 5, rows = 4, landscapeColumns = 5, landscapeRows = 4, portraitColumns = 4, portraitRows = 5,
            pageCount = 2, landscapePageCount = 2, portraitPageCount = 1, keepAwake = true,
            landscapeSpeaker = new ControlPlacement { row = 2, column = 4, width = 1, height = 1 }, landscapeMic = new ControlPlacement { row = 3, column = 4, width = 1, height = 1 },
            portraitSpeaker = new ControlPlacement { row = 3, column = 3, width = 1, height = 1 }, portraitMic = new ControlPlacement { row = 4, column = 3, width = 1, height = 1 },
            landscapeControlPages = new List<ControlPage>(), portraitControlPages = new List<ControlPage>(),
            background = new DeckBackground { color = "#112233", color2 = "#445566", landscape = new BackgroundPosition(), portrait = new BackgroundPosition() } };
        AppEntry app = Entry("app", "App", "app", executable, 0, 0, 0, 1, 1); app.icon = "server-icon";
        settings.apps.Add(app); settings.apps.Add(Entry("url", "URL", "url", "", 0, 0, 1, 1, 1));
        AppEntry clock = Entry("clock", "Clock", "clock", "", 1, 0, 0, 2, 1);
        clock.options = new Dictionary<string, object> { { "style", "digital" }, { "showSeconds", true }, { "showDate", true }, { "showWeekday", true }, { "hour12", false } };
        settings.apps.Add(clock);
        DeckLayout.Migrate(settings); settings.landscapePageNames = new List<string> { "配信", "作業" }; settings.portraitPageNames = new List<string> { "縦" };
        DeckLayout.Validate(settings); return settings;
    }
    static ApiRequest Request(string method, string path, object body)
    {
        string json = body == null ? null : Json.Serialize(body);
        return new ApiRequest { stream = new MemoryStream(), method = method, path = path, target = path, json = json,
            input = body == null ? null : Json.Deserialize<Dictionary<string, object>>(json), auth = "Bearer admin", remote = IPAddress.Loopback, local = true, isAdmin = true, allowed = true };
    }
    static Result Invoke(Action<ApiRequest> handler, ApiRequest request)
    {
        try { handler(request); }
        catch (Exception error) { return new Result { status = 400, error = error.Message, body = Json.Serialize(new { error = error.Message }) }; }
        string text = Encoding.UTF8.GetString(((MemoryStream)request.stream).ToArray()); int split = text.IndexOf("\r\n\r\n");
        string first = text.Substring(0, text.IndexOf("\r\n"));
        return new Result { status = Convert.ToInt32(first.Split(' ')[1]), body = split < 0 ? "" : text.Substring(split + 4) };
    }
    static ReadResponse Read(DeckController deck)
    {
        Result result = Invoke(deck.GetV3Deck, Request("GET", "/api/v3/deck", null));
        Assert(result.status == 200, "GET v3 deck returns 200"); return Json.Deserialize<ReadResponse>(result.body);
    }
    static Result Save(DeckController controller, string version, DeckV3 deck)
    {
        return Invoke(controller.SaveV3Request, Request("POST", "/api/v3/deck", new { baseVersion = version, deck = deck }));
    }
    static void ExpectInvalid(DeckController controller, AppState state, DeckV3 deck, string expected, string message)
    {
        Result result = Save(controller, state.Version, deck);
        Assert(result.status == 400 && result.error.Contains(expected), message);
    }

    public static int Main()
    {
        // The checks below compare Japanese messages.
        Text.Use("ja");
        string root = Path.Combine(Path.GetTempPath(), "TaPoard-v3-save-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(root);
        string executable = Path.Combine(root, "test.exe"); File.WriteAllBytes(executable, new byte[] { 1, 2, 3 });
        try
        {
            var store = new FakeSettingsStore(); var desktop = new FakeDesktop();
            var state = new AppState(root, root, "test", new AppHost(new FakeKeySender(), new FakePointerInput(), new FakeAudioService(), new FakeAudioDevices(), new FakeShellActions()), store);
            state.Config = Fixture(executable); var controller = new DeckController(state, desktop);
            var pages = new PageController(state, desktop, controller);

            ReadResponse first = Read(controller); Assert(first.schemaVersion == 3 && first.deck.landscape.pages[0].items[0].path == executable, "admin deck includes private action fields");
            string originalDeck = Json.Serialize(first.deck); Result saved = Save(controller, first.version, first.deck);
            Assert(saved.status == 200, "unchanged v3 deck saves successfully" + (saved.error == null ? "" : ": " + saved.error));
            Assert(state.Config.speakerSlot != state.Config.micSlot, "v3 save refreshes legacy fader slots");
            string afterDeck = Json.Serialize(Read(controller).deck);
            if (afterDeck != originalDeck) throw new Exception("round-trip mismatch\nBEFORE " + originalDeck + "\nAFTER " + afterDeck);
            Assert(true, "read-save-read preserves the v3 deck");
            Assert(state.Config.apps[0].icon == "server-icon", "server-derived executable icon is preserved");

            ReadResponse moved = Read(controller); moved.deck.landscape.pages[0].items[1].column = 2;
            Result movedSave = Save(controller, moved.version, moved.deck); Assert(movedSave.status == 200 && state.Config.apps.Find(a => a.id == "url").landscape.column == 2, "v3 save moves a button in the legacy model");
            ApiRequest publicState = Request("GET", "/api/v3/state", null); controller.GetV3State(publicState);
            string publicBody = Encoding.UTF8.GetString(((MemoryStream)publicState.stream).ToArray());
            Assert(publicBody.Contains("\"id\":\"url\"") && publicBody.Contains("\"column\":2"), "public v3 state sees the saved position");

            string currentVersion = state.Version; string beforeConflict = Json.Serialize(state.Config);
            Result conflict = Save(controller, "stale", Read(controller).deck);
            Assert(conflict.status == 409 && conflict.body.Contains("読み直してください") && Json.Serialize(state.Config) == beforeConflict && state.Version == currentVersion, "stale baseVersion returns 409 without changes");

            DeckV3 invalid = Copy(Read(controller).deck); invalid.landscape.pages[0].items[0].row = invalid.landscape.rows;
            ExpectInvalid(controller, state, invalid, "枠からはみ出", "out-of-bounds item is rejected with its location");
            invalid = Copy(Read(controller).deck); invalid.landscape.pages[0].items[1].row = invalid.landscape.pages[0].items[0].row; invalid.landscape.pages[0].items[1].column = invalid.landscape.pages[0].items[0].column;
            ExpectInvalid(controller, state, invalid, "重な", "overlapping items are rejected");
            invalid = Copy(Read(controller).deck); invalid.landscape.pages[0].items[1].id = invalid.landscape.pages[0].items[0].id;
            ExpectInvalid(controller, state, invalid, "IDが重複", "duplicate item IDs are rejected");
            invalid = Copy(Read(controller).deck); while (invalid.landscape.pages[0].items.Count <= 40) invalid.landscape.pages[0].items.Add(Copy(invalid.landscape.pages[0].items[0]));
            ExpectInvalid(controller, state, invalid, "40個以内", "the 41st landscape item is rejected");
            invalid = Copy(Read(controller).deck); invalid.landscape.columns = 9;
            ExpectInvalid(controller, state, invalid, "2～8", "nine columns are rejected");

            ReadResponse named = Read(controller); named.deck.background.color = "#ffffff"; named.deck.landscape.pages[0].name = "  配信  ";
            string background = state.Config.background.color; Result namedSave = Save(controller, named.version, named.deck);
            Assert(namedSave.status == 200 && state.Config.landscapePageNames[0] == "配信" && state.Config.background.color == background, "page name is trimmed and request background is ignored");
            Assert(Read(controller).deck.landscape.pages[0].name == "配信", "saved page name is returned by the admin API");
            publicState = Request("GET", "/api/v3/state", null); controller.GetV3State(publicState); publicBody = Encoding.UTF8.GetString(((MemoryStream)publicState.stream).ToArray());
            Assert(publicBody.Contains("\"name\":\"配信\""), "public v3 state includes page names");
            invalid = Copy(Read(controller).deck); invalid.landscape.pages[0].name = new string('長', 21);
            ExpectInvalid(controller, state, invalid, "20文字以内", "a 21-character page name is rejected");

            ReadResponse pageEdit = Read(controller);
            PageV3 firstPage = pageEdit.deck.landscape.pages[0];
            pageEdit.deck.landscape.pages[0] = pageEdit.deck.landscape.pages[1];
            pageEdit.deck.landscape.pages[1] = firstPage;
            Save(controller, pageEdit.version, pageEdit.deck);
            Assert(state.Config.landscapePageNames[0] == "作業" && state.Config.landscapePageNames[1] == "配信", "page move carries names");
            pageEdit = Read(controller);
            pageEdit.deck.landscape.pages.RemoveAt(0);
            Save(controller, pageEdit.version, pageEdit.deck);
            Assert(state.Config.landscapePageNames.Count == 1 && state.Config.landscapePageNames[0] == "配信", "page delete removes the matching name");

            invalid = Copy(Read(controller).deck); invalid.landscape.pages[0].items[0].steps = new List<ActionStep>();
            ExpectInvalid(controller, state, invalid, "4.1", "buttons with action steps are rejected until 4.1");
            var validSteps = new List<ActionStep> { new ActionStep { type = "url", url = "https://example.com/", delayMs = 100 }, new ActionStep { type = "hotkey", action = "common-copy", delayMs = 0 } };
            ActionSteps.Validate(validSteps); Assert(true, "a valid future action sequence passes direct validation");
            var tooMany = new List<ActionStep>(); for (int i = 0; i < 21; i++) tooMany.Add(validSteps[0]);
            try { ActionSteps.Validate(tooMany); throw new Exception("21 action steps passed"); } catch (Exception e) { Assert(e.Message.Contains("20個以内"), "21 action steps are rejected"); }
            try { ActionSteps.Validate(new List<ActionStep> { new ActionStep { type = "url", url = "https://example.com/", delayMs = 10001 } }); throw new Exception("long delay passed"); } catch (Exception e) { Assert(e.Message.Contains("10000"), "action delay above 10000ms is rejected"); }
            state.Config.apps[0].steps = validSteps;
            publicState = Request("GET", "/api/v3/state", null); controller.GetV3State(publicState); publicBody = Encoding.UTF8.GetString(((MemoryStream)publicState.stream).ToArray());
            Assert(!publicBody.Contains("\"steps\""), "public v3 state omits future action steps");

            string files = Path.Combine(root, "files"); SettingsFile.Save(files, state.Config); string disk = File.ReadAllText(Path.Combine(files, SettingsFile.FileName), Encoding.UTF8);
            Assert(disk.Contains("\"name\":\"配信\"") && disk.Contains("\"steps\":[")
                && !File.Exists(Path.Combine(files, SettingsFile.V2FileName)),
                "v3 file saves names and validated steps without writing v2");
            Console.WriteLine("PASS DeckV3SaveTests"); return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
        finally { Directory.Delete(root, true); }
    }
}
