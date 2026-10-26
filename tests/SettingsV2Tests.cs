using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;

class TilePosition
{
    public int page { get; set; }
    public int row { get; set; }
    public int column { get; set; }
}

class PairedDevice
{
    public string id { get; set; }
    public string name { get; set; }
    public string credentialHash { get; set; }
    public string created { get; set; }
}

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
        return new Settings
        {
            token = token,
            pairingKey = "PAIR",
            apps = new List<AppEntry>(),
            devices = new List<PairedDevice>(),
        };
    }

    static void Write(string path, object value)
    {
        File.WriteAllText(path, new JavaScriptSerializer().Serialize(value), new UTF8Encoding(false));
    }

    static void Main()
    {
        string root = Path.Combine(Path.GetTempPath(), "TaPoard-settings-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            string legacyPath = Path.Combine(root, SettingsFile.LegacyFileName);
            byte[] legacy = Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(Defaults("legacy-token")));
            File.WriteAllBytes(legacyPath, legacy);

            Settings migrated = SettingsFile.Load(root, delegate { return Defaults("new-token"); });
            Check(migrated.schemaVersion == 2 && migrated.token == "legacy-token", "legacy settings are selected once");
            Check(!File.Exists(Path.Combine(root, SettingsFile.FileName)), "load does not save before validation");
            Check(Convert.ToBase64String(File.ReadAllBytes(legacyPath)) == Convert.ToBase64String(legacy), "legacy file stays byte-identical");

            SettingsFile.Save(root, migrated);
            string currentPath = Path.Combine(root, SettingsFile.FileName);
            Check(File.Exists(currentPath) && !File.Exists(currentPath + ".tmp"), "v2 settings are atomically published");
            Settings current = new JavaScriptSerializer().Deserialize<Settings>(File.ReadAllText(currentPath));
            Check(current.schemaVersion == 2, "v2 schema version is persisted");
            migrated.token = "v2-token";
            SettingsFile.Save(root, migrated);
            Check(SettingsFile.Load(root, delegate { return Defaults("unused"); }).token == "v2-token", "existing v2 settings are atomically replaced");
            Check(Convert.ToBase64String(File.ReadAllBytes(legacyPath)) == Convert.ToBase64String(legacy), "saving v2 never changes the legacy file");

            Write(legacyPath, Defaults("changed-legacy"));
            Check(SettingsFile.Load(root, delegate { return Defaults("unused"); }).token == "v2-token", "existing v2 settings win over later legacy changes");

            File.WriteAllText(currentPath, "{broken", new UTF8Encoding(false));
            Reject(
                delegate { SettingsFile.Load(root, delegate { return Defaults("fallback"); }); },
                "2.0設定を読み込めません",
                "broken v2 settings never fall back to legacy"
            );
            Check(File.ReadAllText(currentPath) == "{broken", "broken v2 file is not overwritten");

            File.WriteAllText(currentPath, "null", new UTF8Encoding(false));
            Reject(
                delegate { SettingsFile.Load(root, delegate { return Defaults("fallback"); }); },
                "形式を確認できません",
                "null v2 settings are rejected without fallback"
            );

            Settings future = Defaults("future");
            future.schemaVersion = 3;
            Write(currentPath, future);
            Reject(
                delegate { SettingsFile.Load(root, delegate { return Defaults("fallback"); }); },
                "新しいTaPoard用",
                "future schema is rejected without fallback"
            );

            File.Delete(currentPath);
            File.Delete(legacyPath);
            Settings fresh = SettingsFile.Load(root, delegate { return Defaults("fresh"); });
            Check(fresh.schemaVersion == 2 && fresh.token == "fresh", "fresh installation creates v2 settings in memory");
            Check(!File.Exists(currentPath), "fresh load also waits for validation before saving");
            SettingsFile.Save(root, fresh);
            Check(File.Exists(currentPath), "fresh validated settings can be saved");
        }
        finally
        {
            Directory.Delete(root, true);
        }
    }
}
