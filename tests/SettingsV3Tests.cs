using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;

class SettingsV3Tests
{
    static readonly JavaScriptSerializer Serializer = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };

    static void Check(bool value, string message)
    {
        if (!value)
            throw new Exception("FAIL " + message);
        Console.WriteLine("PASS " + message);
    }

    static void Reject(Action action, string expected, string message)
    {
        try
        {
            action();
            throw new Exception("FAIL " + message);
        }
        catch (Exception e)
        {
            if (!e.Message.Contains(expected))
                throw;
            Console.WriteLine("PASS " + message);
        }
    }

    static AppEntry Item(string id, string type, string orientation, int page, int row, int column, int width, int height)
    {
        return new AppEntry
        {
            id = id,
            name = id,
            path = type == "app" ? "C:\\Apps\\" + id + ".exe" : "",
            args = type == "app" ? "--test" : "",
            icon = "data:image/png;base64,AA==",
            iconKey = "common-copy",
            iconColor = "#123456",
            customIcon = "",
            type = type,
            orientation = orientation,
            landscape = orientation == "landscape" ? new TilePosition { page = page, row = row, column = column } : null,
            portrait = orientation == "portrait" ? new TilePosition { page = page, row = row, column = column } : null,
            size = width == height && width <= 2 ? width : 1,
            width = width,
            height = height,
            fontSize = 11,
            iconScale = 82,
            labelOpacity = 45,
            keyClear = 20,
            hideLabel = false,
            options = type == "clock" ? new Dictionary<string, object> { { "style", "analog" } } : new Dictionary<string, object>(),
        };
    }

    static Settings Fixture()
    {
        var settings = new Settings
        {
            schemaVersion = 2,
            token = "012345678901234567890123456789012345678901234567",
            devices = new List<PairedDevice>
            {
                new PairedDevice { id = "phone", name = "Test phone", credentialHash = "hash", created = "2026-11-14T00:00:00Z" },
            },
            apps = new List<AppEntry>
            {
                Item("landscape-app", "app", "landscape", 0, 0, 0, 1, 1),
                Item("landscape-clock", "clock", "landscape", 1, 0, 0, 2, 2),
                Item("portrait-app", "app", "portrait", 0, 0, 0, 1, 1),
            },
            columns = 5,
            rows = 3,
            landscapeColumns = 5,
            landscapeRows = 3,
            portraitColumns = 3,
            portraitRows = 5,
            keepAwake = true,
            landscapeSpeaker = new ControlPlacement { row = 0, column = 4, width = 1, height = 1 },
            landscapeMic = new ControlPlacement { row = 2, column = 4, width = 1, height = 1 },
            portraitSpeaker = new ControlPlacement { row = 0, column = 2, width = 1, height = 1 },
            portraitMic = new ControlPlacement { row = 2, column = 2, width = 1, height = 1 },
            landscapeControlPages = new List<ControlPage>
            {
                new ControlPage
                {
                    page = 1,
                    speaker = new ControlPlacement { row = 2, column = 0, width = 3, height = 1 },
                    mic = null,
                    speakerHidden = false,
                    micHidden = true,
                },
                new ControlPage { page = 9, speakerHidden = true, micHidden = true },
            },
            portraitControlPages = new List<ControlPage>(),
            portraitSpeakerOff = true,
            pageCount = 3,
            landscapePageCount = 3,
            portraitPageCount = 2,
            background = new DeckBackground
            {
                color = "#102030",
                color2 = "#405060",
                image = "abc",
                imageType = "png",
                imageWidth = 800,
                imageHeight = 600,
                landscape = new BackgroundPosition { fit = "cover", x = 30, y = 40, zoom = 1.2, flipX = true, rotate = 90 },
                portrait = new BackgroundPosition { fit = "contain", x = 50, y = 60, zoom = 1.1, flipY = true, rotate = 270 },
                dim = 10,
                blur = 2,
                keys = "glass",
                keyClear = 70,
            },
            weatherName = "東京",
            weatherLatitude = 35.6812,
            weatherLongitude = 139.7671,
            weatherTimezone = "Asia/Tokyo",
            pcWindow = new PcWindowOptions
            {
                startup = "window",
                startTopmost = "on",
                buttonSize = "large",
                autoHideBar = true,
                aspect = "fill",
                opacity = 90,
                showInfo = true,
                confirmClose = false,
                x = 10,
                y = 20,
                width = 900,
                height = 600,
                maximized = true,
                topmost = true,
                hasBounds = true,
            },
        };
        DeckLayout.Migrate(settings);
        settings.landscapePageNames = new List<string> { "配信", "作業", "" };
        settings.portraitPageNames = new List<string> { "縦", "" };
        settings.apps[0].steps = new List<ActionStep>
        {
            new ActionStep { type = "url", url = "https://example.com/", delayMs = 250 },
        };
        DeckLayout.Validate(settings);
        return settings;
    }

    static string Comparable(Settings settings)
    {
        Settings copy = Serializer.Deserialize<Settings>(Serializer.Serialize(settings));
        DeckLayout.Migrate(copy);
        copy.landscapeControlPages.RemoveAll(delegate(ControlPage page) { return page == null || page.page >= DeckLayout.Pages(copy, "landscape"); });
        copy.portraitControlPages.RemoveAll(delegate(ControlPage page) { return page == null || page.page >= DeckLayout.Pages(copy, "portrait"); });
        DeckLayout.Validate(copy);
        return Serializer.Serialize(copy);
    }

    static void Write(string path, object value)
    {
        File.WriteAllText(path, Serializer.Serialize(value), new UTF8Encoding(false));
    }

    static void MigrationTests()
    {
        Settings source = Fixture();
        string before = Serializer.Serialize(source);
        SettingsV3 v3 = SettingsMigration.ToV3(source);
        Check(Serializer.Serialize(source) == before, "v2 to v3 does not modify its input");
        Check(v3.schemaVersion == 3 && v3.deck.landscape.pages.Count == 3 && v3.deck.portrait.pages.Count == 2, "v3 keeps landscape, portrait and empty page counts");
        Check(v3.deck.landscape.pages[0].name == "配信" && v3.deck.landscape.pages[1].name == "作業", "v3 keeps page names");
        Check(v3.deck.landscape.pages[0].items.Count == 1 && v3.deck.landscape.pages[1].items.Count == 1 && v3.deck.landscape.pages[2].items.Count == 0, "v3 groups items into ordered pages");
        DeckItem clock = v3.deck.landscape.pages[1].items[0];
        Check(v3.deck.landscape.pages[0].items[0].steps.Count == 1 && v3.deck.landscape.pages[0].items[0].steps[0].delayMs == 250, "v3 keeps future action steps");
        Check(clock.row == 0 && clock.column == 0 && clock.width == 2 && clock.height == 2, "v3 stores actual item rectangle");
        Check(v3.deck.landscape.pages[0].faders == null && v3.deck.landscape.pages[1].faders != null && v3.deck.landscape.pages[1].faders.mic == null, "v3 keeps only page-specific fader overrides");
        Check(v3.deck.portrait.faders.speaker.off, "v3 keeps an orientation-wide removed fader");
        string itemJson = Serializer.Serialize(clock);
        Check(!itemJson.Contains("\"orientation\"") && !itemJson.Contains("\"landscape\"") && !itemJson.Contains("\"portrait\"") && !itemJson.Contains("\"size\""), "v3 items omit v2 placement fields");
        string json = Serializer.Serialize(v3);
        Check(!json.Contains("speakerSlot") && !json.Contains("micSlot") && !json.Contains("landscapePageCount") && !json.Contains("portraitPageCount") && !json.Contains("pageCount"), "v3 omits legacy slot and page-count fields");
        Settings roundTrip = SettingsMigration.ToV2(v3);
        Check(Comparable(roundTrip) == Comparable(source), "normalized v2 settings survive a v3 round trip");
        Check(roundTrip.background.landscape.flipX && roundTrip.background.landscape.rotate == 90
            && roundTrip.background.portrait.flipY && roundTrip.background.portrait.rotate == 270,
            "background flips and rotations survive a v3 round trip");
        Check(roundTrip.landscapePageNames[0] == "配信" && roundTrip.apps[0].steps.Count == 1, "page names and action steps survive a v3 round trip");
        DeckLayout.Validate(roundTrip);
        Check(roundTrip.apps[1].size == 2, "v3 restores the legacy size field used by the web UI");
        source.apps.Add(Item("broken-orientation", "app", "sideways", 0, 0, 0, 1, 1));
        Reject(delegate { SettingsMigration.ToV3(source); }, "向きが正しくありません", "v3 conversion rejects an invalid item orientation");
    }

    static void FileTests(string root)
    {
        Settings source = Fixture();
        string v2Path = Path.Combine(root, SettingsFile.V2FileName);
        byte[] original = Encoding.UTF8.GetBytes(Serializer.Serialize(source));
        File.WriteAllBytes(v2Path, original);
        Settings loaded = SettingsFile.Load(root, delegate { throw new Exception("defaults must not be used"); });
        Check(loaded.token == source.token && loaded.apps.Count == source.apps.Count, "v2-only folder loads through the v2 model");
        SettingsFile.Save(root, loaded);
        string v3Path = Path.Combine(root, SettingsFile.FileName);
        Check(File.Exists(v3Path) && !File.Exists(v3Path + ".tmp"), "saving migrated v2 atomically creates settings-v3.json");
        string savedV3 = File.ReadAllText(v3Path, Encoding.UTF8);
        Check(savedV3.Contains("\"name\":\"配信\"") && savedV3.Contains("\"steps\":["), "v3 file keeps page names and future action steps");
        Check(Convert.ToBase64String(File.ReadAllBytes(v2Path)) == Convert.ToBase64String(original), "saving v3 leaves settings-v2.json byte-identical");

        SettingsV3 preferred = SettingsMigration.ToV3(source);
        string legacyKeyJson = Serializer.Serialize(preferred).Replace("\"token\":", "\"pairingKey\":\"ABCDEFGHJKLM\",\"token\":");
        File.WriteAllText(v3Path, legacyKeyJson, new UTF8Encoding(false));
        Settings legacyKeyLoaded = SettingsFile.Load(root, delegate { return null; });
        Check(legacyKeyLoaded.token == source.token, "v3 containing the removed pairingKey still loads");
        SettingsFile.Save(root, legacyKeyLoaded);
        Check(!File.ReadAllText(v3Path).Contains("pairingKey"), "the next v3 save removes the legacy pairingKey");

        preferred.security.token = "v3-token";
        Write(v3Path, preferred);
        Check(SettingsFile.Load(root, delegate { return null; }).token == "v3-token", "v3 wins when v3 and v2 both exist");

        byte[] v2Before = File.ReadAllBytes(v2Path);
        File.WriteAllText(v3Path, "{broken", new UTF8Encoding(false));
        Reject(delegate { SettingsFile.Load(root, delegate { return source; }); }, "3.0設定を読み込めません", "broken v3 never falls back to v2");
        Check(File.ReadAllText(v3Path) == "{broken" && Convert.ToBase64String(File.ReadAllBytes(v2Path)) == Convert.ToBase64String(v2Before), "broken v3 and v2 are not overwritten");

        preferred.schemaVersion = 4;
        Write(v3Path, preferred);
        byte[] future = File.ReadAllBytes(v3Path);
        Reject(delegate { SettingsFile.Load(root, delegate { return source; }); }, "新しいTaPoard用", "future v3 never falls back to v2");
        Check(Convert.ToBase64String(File.ReadAllBytes(v3Path)) == Convert.ToBase64String(future) && Convert.ToBase64String(File.ReadAllBytes(v2Path)) == Convert.ToBase64String(v2Before), "future v3 and v2 are not overwritten");
    }

    static void BackupTests(string root)
    {
        Settings settings = Fixture();
        Directory.CreateDirectory(Path.Combine(root, "backups"));
        File.WriteAllText(Path.Combine(root, "backups", "keep.txt"), "v2", Encoding.UTF8);
        SettingsFile.Save(root, settings);
        settings.weatherName = "大阪";
        SettingsFile.Save(root, settings);
        string[] backups = Directory.GetFiles(SettingsBackups.Folder(root), "settings-*.json");
        Check(backups.Length == 1, "second v3 save creates one automatic backup");
        Check(File.Exists(Path.Combine(root, "backups", "keep.txt")) && Directory.GetFiles(Path.Combine(root, "backups")).Length == 1, "v3 backups do not change the v2 backups folder");
        string id = Path.GetFileNameWithoutExtension(backups[0]);
        Settings restored = SettingsBackups.Read(root, id);
        Check(restored.schemaVersion == 2 && restored.weatherName == "東京", "v3 backup restores into the v2 in-memory model");
    }

    static int Main()
    {
        // The checks below compare Japanese messages.
        Text.Use("ja");
        string root = Path.Combine(Path.GetTempPath(), "TaPoard-settings-v3-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            MigrationTests();
            Check(PcWindowOptions.TopmostAfterChange("last", "on", false), "topmost: last -> on turns it on");
            Check(!PcWindowOptions.TopmostAfterChange("last", "off", true), "topmost: last -> off turns it off");
            Check(PcWindowOptions.TopmostAfterChange("on", "on", true), "topmost: unchanged choice keeps the state");
            Check(!PcWindowOptions.TopmostAfterChange("off", "off", false), "topmost: saving other options keeps a Ctrl+T off");
            Check(PcWindowOptions.TopmostAfterChange("on", "last", true) && !PcWindowOptions.TopmostAfterChange("off", "last", false), "topmost: back to last keeps the state");
            string files = Path.Combine(root, "files");
            string backups = Path.Combine(root, "backups-test");
            Directory.CreateDirectory(files);
            Directory.CreateDirectory(backups);
            FileTests(files);
            BackupTests(backups);
            Console.WriteLine("PASS SettingsV3Tests");
            return 0;
        }
        catch (Exception e)
        {
            Console.Error.WriteLine(e);
            return 1;
        }
        finally
        {
            Directory.Delete(root, true);
        }
    }
}
