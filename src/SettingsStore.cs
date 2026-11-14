using System;

interface ISettingsStore
{
    Settings Load(Func<Settings> createDefaults);
    void Save(Settings settings);
    object ListBackups();
    Settings ReadBackup(string id);
}

sealed class FileSettingsStore : ISettingsStore
{
    readonly string data;

    internal FileSettingsStore(string data)
    {
        this.data = data;
    }

    public Settings Load(Func<Settings> createDefaults)
    {
        return SettingsFile.Load(data, createDefaults);
    }

    public void Save(Settings settings)
    {
        SettingsFile.Save(data, settings);
    }

    public object ListBackups()
    {
        return SettingsBackups.List(data);
    }

    public Settings ReadBackup(string id)
    {
        return SettingsBackups.Read(data, id);
    }
}
