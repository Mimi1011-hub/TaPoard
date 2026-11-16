using System;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;

// Loads the v3 file into the v2 in-memory model used by the application. Loading never writes;
// the first save after reading v2 creates v3 and leaves the v2 file byte-identical.
static class SettingsFile
{
    internal const int CurrentSchemaVersion = 3;
    internal const int V2SchemaVersion = 2;
    internal const string FileName = "settings-v3.json";
    internal const string V2FileName = "settings-v2.json";

    internal static Settings Load(string dataDirectory, Func<Settings> createDefaults)
    {
        Directory.CreateDirectory(dataDirectory);
        string v3Path = Path.Combine(dataDirectory, FileName);
        if (File.Exists(v3Path))
            return ReadV3(v3Path);
        string v2Path = Path.Combine(dataDirectory, V2FileName);
        Settings settings = File.Exists(v2Path) ? ReadV2(v2Path) : createDefaults();
        if (settings == null)
            throw new Exception(Text.Get("source.settingsfile.1"));
        settings.schemaVersion = V2SchemaVersion;
        return settings;
    }

    static Settings ReadV3(string path)
    {
        SettingsV3 settings = Deserialize<SettingsV3>(path, Text.Get("source.settingsfile.2"));
        if (settings == null)
            throw new Exception(
                Text.Get("source.settingsfile.3")
            );
        if (settings.schemaVersion > CurrentSchemaVersion)
            throw new Exception(
                Text.Get("source.settingsfile.4")
            );
        if (settings.schemaVersion != CurrentSchemaVersion)
            throw new Exception(
                Text.Get("source.settingsfile.5")
            );
        try
        {
            return SettingsMigration.ToV2(settings);
        }
        catch (Exception e)
        {
            throw new Exception(Text.Get("source.settingsfile.6"), e);
        }
    }

    static Settings ReadV2(string path)
    {
        Settings settings = Deserialize<Settings>(path, Text.Get("source.settingsfile.7"));
        if (settings == null || settings.schemaVersion != V2SchemaVersion)
            throw new Exception(Text.Get("source.settingsfile.8"));
        return settings;
    }

    static T Deserialize<T>(string path, string label)
    {
        try
        {
            return new JavaScriptSerializer { MaxJsonLength = int.MaxValue }.Deserialize<T>(File.ReadAllText(path, Encoding.UTF8));
        }
        catch (Exception e)
        {
            throw new Exception(Text.Get("source.settingsfile.9", label), e);
        }
    }

    internal static void Save(string dataDirectory, Settings settings)
    {
        if (settings == null || settings.schemaVersion != V2SchemaVersion)
            throw new Exception(Text.Get("source.settingsfile.10"));
        Directory.CreateDirectory(dataDirectory);
        string path = Path.Combine(dataDirectory, FileName);
        string temporary = path + ".tmp";
        SettingsBackups.Take(dataDirectory, path);
        try
        {
            var serializer = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
            File.WriteAllText(temporary, serializer.Serialize(SettingsMigration.ToV3(settings)), new UTF8Encoding(false));
            if (File.Exists(path))
                File.Replace(temporary, path, null);
            else
                File.Move(temporary, path);
        }
        finally
        {
            if (File.Exists(temporary))
                try
                {
                    File.Delete(temporary);
                }
                catch
                {
                    // Keep the original exception when cleanup itself is denied.
                }
        }
    }
}
