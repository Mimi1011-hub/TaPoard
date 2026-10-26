using System;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;

// Keeps 2.0 settings separate from legacy releases. Loading never writes a file;
// Program saves only after migration, normalization and validation all succeed.
static class SettingsFile
{
    internal const int CurrentSchemaVersion = 2;
    internal const string FileName = "settings-v2.json";
    internal const string LegacyFileName = "settings.json";

    internal static Settings Load(string dataDirectory, Func<Settings> createDefaults)
    {
        Directory.CreateDirectory(dataDirectory);
        string currentPath = Path.Combine(dataDirectory, FileName);
        if (File.Exists(currentPath))
            return ReadCurrent(currentPath);

        string legacyPath = Path.Combine(dataDirectory, LegacyFileName);
        Settings settings;
        if (File.Exists(legacyPath))
            settings = Deserialize(legacyPath, "旧設定");
        else
            settings = createDefaults();
        if (settings == null)
            throw new Exception("設定を作成できませんでした。");
        settings.schemaVersion = CurrentSchemaVersion;
        return settings;
    }

    static Settings ReadCurrent(string path)
    {
        Settings settings = Deserialize(path, "2.0設定");
        if (settings == null)
            throw new Exception(
                "settings-v2.json の形式を確認できません。旧設定へ自動では戻しません。ファイルを復元するか名前を変更してください。"
            );
        if (settings.schemaVersion > CurrentSchemaVersion)
            throw new Exception(
                "settings-v2.json は新しいTaPoard用です。このファイルを変更せず、対応する版を使用してください。"
            );
        if (settings.schemaVersion != CurrentSchemaVersion)
            throw new Exception(
                "settings-v2.json の形式を確認できません。旧設定へ自動では戻しません。ファイルを復元するか名前を変更してください。"
            );
        return settings;
    }

    static Settings Deserialize(string path, string label)
    {
        try
        {
            return new JavaScriptSerializer().Deserialize<Settings>(File.ReadAllText(path, Encoding.UTF8));
        }
        catch (Exception e)
        {
            throw new Exception(label + "を読み込めません。元のファイルは変更していません。", e);
        }
    }

    internal static void Save(string dataDirectory, Settings settings)
    {
        if (settings == null || settings.schemaVersion != CurrentSchemaVersion)
            throw new Exception("未対応の設定形式は保存できません。");
        Directory.CreateDirectory(dataDirectory);
        string path = Path.Combine(dataDirectory, FileName);
        string temporary = path + ".tmp";
        try
        {
            File.WriteAllText(temporary, new JavaScriptSerializer().Serialize(settings), new UTF8Encoding(false));
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
