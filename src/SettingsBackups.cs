using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

// 3.1: automatic copies of settings-v2.json, taken before a save replaces it (at most one every two
// minutes, newest 30 kept) in data\backups, so a deleted page or button set can be brought back.
static class SettingsBackups
{
    internal const int Keep = 30;
    static readonly TimeSpan Spacing = TimeSpan.FromMinutes(2);
    static readonly Regex NamePattern = new Regex("\\Asettings-\\d{8}-\\d{6}\\z");

    internal static string Folder(string data) { return Path.Combine(data, "backups"); }

    static string[] Files(string data)
    {
        if (!Directory.Exists(Folder(data))) return new string[0];
        var files = Directory.GetFiles(Folder(data), "settings-*.json");
        Array.Sort(files, StringComparer.Ordinal);
        return files;
    }

    // Copies the current settings file aside before it is replaced.
    internal static void Take(string data, string current)
    {
        try
        {
            if (!File.Exists(current)) return;
            var files = Files(data);
            DateTime last;
            if (files.Length > 0 && TimeOf(Path.GetFileNameWithoutExtension(files[files.Length - 1]), out last) && DateTime.Now - last < Spacing && DateTime.Now >= last) return;
            Directory.CreateDirectory(Folder(data));
            string target = Path.Combine(Folder(data), "settings-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".json");
            if (File.Exists(target)) return;
            File.Copy(current, target);
            files = Files(data);
            for (int i = 0; i < files.Length - Keep; i++) try { File.Delete(files[i]); } catch { }
        }
        catch { } // a backup must never stop the settings from saving
    }

    // Newest first: id, local time and button counts.
    internal static List<Dictionary<string, object>> List(string data)
    {
        var result = new List<Dictionary<string, object>>();
        var files = Files(data);
        for (int i = files.Length - 1; i >= 0; i--)
        {
            string id = Path.GetFileNameWithoutExtension(files[i]);
            if (!NamePattern.IsMatch(id)) continue;
            try
            {
                var s = Read(data, id);
                int landscape = 0, portrait = 0;
                foreach (var a in s.apps ?? new List<AppEntry>()) if (a.orientation == "portrait") portrait++; else landscape++;
                DateTime time;
                TimeOf(id, out time);
                result.Add(new Dictionary<string, object> { { "id", id }, { "time", time.ToString("yyyy/MM/dd HH:mm") }, { "landscape", landscape }, { "portrait", portrait } });
            }
            catch { }
        }
        return result;
    }

    static bool TimeOf(string id, out DateTime time)
    {
        time = DateTime.MinValue;
        return NamePattern.IsMatch(id) && DateTime.TryParseExact(id.Substring(9), "yyyyMMdd-HHmmss", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out time);
    }

    internal static Settings Read(string data, string id)
    {
        if (id == null || !NamePattern.IsMatch(id)) throw new Exception("バックアップが見つかりません。");
        string file = Path.Combine(Folder(data), id + ".json");
        if (!File.Exists(file)) throw new Exception("バックアップが見つかりません。");
        var s = new JavaScriptSerializer { MaxJsonLength = int.MaxValue }.Deserialize<Settings>(File.ReadAllText(file, Encoding.UTF8));
        if (s == null) throw new Exception("バックアップのファイルが壊れています。");
        return s;
    }
}
