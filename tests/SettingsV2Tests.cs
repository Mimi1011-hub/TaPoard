using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;

class SettingsV2Tests
{
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

    static Settings Defaults(string token)
    {
        var settings = new Settings
        {
            schemaVersion = 2,
            token = token,
            apps = new List<AppEntry>(),
            devices = new List<PairedDevice>(),
            columns = 5,
            rows = 3,
            pageCount = 1,
            landscapePageCount = 1,
            portraitPageCount = 1,
            keepAwake = true,
        };
        DeckLayout.Migrate(settings);
        DeckLayout.Validate(settings);
        return settings;
    }

    static void Write(string path, object value)
    {
        File.WriteAllText(path, new JavaScriptSerializer().Serialize(value), new UTF8Encoding(false));
    }

    static int Main()
    {
        // The checks below compare Japanese messages.
        Text.Use("ja");
        string root = Path.Combine(Path.GetTempPath(), "TaPoard-settings-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            string v3Path = Path.Combine(root, SettingsFile.FileName);
            string v2Path = Path.Combine(root, SettingsFile.V2FileName);
            string legacyPath = Path.Combine(root, "settings.json");

            Settings fresh = SettingsFile.Load(root, delegate { return Defaults("fresh"); });
            Check(fresh.schemaVersion == 2 && fresh.token == "fresh", "fresh installation creates v2 settings in memory");
            Check(!File.Exists(v3Path), "fresh load waits for validation before saving");
            SettingsFile.Save(root, fresh);
            Check(File.Exists(v3Path) && !File.Exists(v3Path + ".tmp"), "fresh validated settings are atomically published as v3");
            SettingsV3 stored = new JavaScriptSerializer().Deserialize<SettingsV3>(File.ReadAllText(v3Path));
            Check(stored.schemaVersion == 3 && stored.security.token == "fresh", "v3 schema and security are persisted");
            Check(SettingsFile.Load(root, delegate { return Defaults("unused"); }).token == "fresh", "existing v3 settings are loaded");

            Directory.Delete(root, true);
            Directory.CreateDirectory(root);
            byte[] v2 = Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(Defaults("v2-token")));
            File.WriteAllBytes(v2Path, v2);
            Settings migrated = SettingsFile.Load(root, delegate { return Defaults("unused"); });
            Check(migrated.schemaVersion == 2 && migrated.token == "v2-token", "v2 settings are read when v3 is absent");
            Check(!File.Exists(v3Path), "reading v2 does not save before validation");
            Check(Convert.ToBase64String(File.ReadAllBytes(v2Path)) == Convert.ToBase64String(v2), "reading v2 leaves it byte-identical");

            File.WriteAllText(v2Path, "{broken", new UTF8Encoding(false));
            Reject(delegate { SettingsFile.Load(root, delegate { return Defaults("fallback"); }); }, "2.0設定を読み込めません", "broken v2 is rejected when v3 is absent");
            Check(File.ReadAllText(v2Path) == "{broken", "broken v2 is not overwritten");

            File.Delete(v2Path);
            Write(legacyPath, Defaults("legacy-token"));
            Settings noLegacyMigration = SettingsFile.Load(root, delegate { return Defaults("new-token"); });
            Check(noLegacyMigration.token == "new-token", "1.x settings.json is no longer imported");
            Check(File.Exists(legacyPath), "ignored 1.x settings remain untouched");
            Console.WriteLine("PASS SettingsV2Tests");
            return 0;
        }
        catch (Exception e)
        {
            Console.Error.WriteLine(e);
            return 1;
        }
        finally
        {
            if (Directory.Exists(root))
                Directory.Delete(root, true);
        }
    }
}
