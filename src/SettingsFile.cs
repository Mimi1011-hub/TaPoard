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
            throw new Exception("設定を作成できませんでした。");
        settings.schemaVersion = V2SchemaVersion;
        return settings;
    }

    static Settings ReadV3(string path)
    {
        SettingsV3 settings = Deserialize<SettingsV3>(path, "3.0設定");
        if (settings == null)
            throw new Exception(
                "settings-v3.json の形式を確認できません。v2設定へ自動では戻しません。ファイルを復元するか名前を変更してください。"
            );
        if (settings.schemaVersion > CurrentSchemaVersion)
            throw new Exception(
                "settings-v3.json は新しいTaPoard用です。このファイルを変更せず、対応する版を使用してください。"
            );
        if (settings.schemaVersion != CurrentSchemaVersion)
            throw new Exception(
                "settings-v3.json の形式を確認できません。v2設定へ自動では戻しません。ファイルを復元するか名前を変更してください。"
            );
        try
        {
            return SettingsMigration.ToV2(settings);
        }
        catch (Exception e)
        {
            throw new Exception("settings-v3.json の形式を確認できません。v2設定へ自動では戻しません。ファイルを復元するか名前を変更してください。", e);
        }
    }

    static Settings ReadV2(string path)
    {
        Settings settings = Deserialize<Settings>(path, "2.0設定");
        if (settings == null || settings.schemaVersion != V2SchemaVersion)
            throw new Exception("settings-v2.json の形式を確認できません。ファイルは変更していません。");
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
            throw new Exception(label + "を読み込めません。元のファイルは変更していません。", e);
        }
    }

    internal static void Save(string dataDirectory, Settings settings)
    {
        if (settings == null || settings.schemaVersion != V2SchemaVersion)
            throw new Exception("未対応の設定形式は保存できません。");
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
