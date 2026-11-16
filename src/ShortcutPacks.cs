using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;

class ShortcutPackItem
{
    public string name { get; set; }
    public string keys { get; set; }
    public string description { get; set; }
    public string icon { get; set; }
}

class ShortcutPack
{
    public string id { get; set; }
    public string name { get; set; }
    public string author { get; set; }
    public string app { get; set; }
    public string iconPack { get; set; }
    public string created { get; set; }
    public List<ShortcutPackItem> shortcuts { get; set; }
}

static class ShortcutPacks
{
    internal const int MaxPacks = 20;
    internal const int MaxShortcuts = 300;
    static readonly object Gate = new object();
    static readonly Regex IdPattern = new Regex("\\A[a-z0-9]{8,40}\\z");

    internal static string Folder(string data)
    {
        return Path.Combine(data, "shortcut-packs");
    }

    internal static bool ValidId(string id)
    {
        return id != null && IdPattern.IsMatch(id);
    }

    static string FileOf(string data, string id)
    {
        if (!ValidId(id)) throw new Exception(global::Text.Get("source.shortcutpacks.1"));
        return Path.Combine(Folder(data), id + ".json");
    }

    static string Text(string value, int limit, bool required, string label)
    {
        value = (value ?? "").Trim();
        if (required && value.Length == 0) throw new Exception(global::Text.Get("source.shortcutpacks.2", label));
        if (value.Length > limit) throw new Exception(global::Text.Get("source.shortcutpacks.3", label, limit));
        return value;
    }

    static ShortcutPack Read(string data, string id)
    {
        string file = FileOf(data, id);
        var pack = IconPacks.Serializer().Deserialize<ShortcutPack>(File.ReadAllText(file, Encoding.UTF8));
        if (pack == null || pack.id != id) throw new Exception(global::Text.Get("source.shortcutpacks.5"));
        if (pack.shortcuts == null) pack.shortcuts = new List<ShortcutPackItem>();
        return pack;
    }

    static void Write(string data, ShortcutPack pack)
    {
        Directory.CreateDirectory(Folder(data));
        string file = FileOf(data, pack.id);
        string temp = file + ".tmp";
        File.WriteAllText(temp, IconPacks.Serializer().Serialize(pack), new UTF8Encoding(false));
        if (File.Exists(file)) File.Replace(temp, file, null);
        else File.Move(temp, file);
    }

    internal static List<ShortcutPack> List(string data)
    {
        var result = new List<ShortcutPack>();
        lock (Gate)
        {
            if (!Directory.Exists(Folder(data))) return result;
            foreach (string file in Directory.GetFiles(Folder(data), "*.json"))
            {
                string id = Path.GetFileNameWithoutExtension(file);
                if (!ValidId(id)) continue;
                try { result.Add(Read(data, id)); }
                catch { }
            }
        }
        result.Sort(delegate(ShortcutPack left, ShortcutPack right)
        {
            return String.CompareOrdinal(right.created ?? "", left.created ?? "");
        });
        return result;
    }

    internal static string Save(string data, ShortcutPack input)
    {
        if (input == null) throw new Exception(global::Text.Get("source.shortcutpacks.6"));
        lock (Gate)
        {
            if (List(data).Count >= MaxPacks)
                throw new Exception(global::Text.Get("source.shortcutpacks.7", MaxPacks));
            if (input.shortcuts == null || input.shortcuts.Count == 0)
                throw new Exception(global::Text.Get("source.shortcutpacks.9"));
            if (input.shortcuts.Count > MaxShortcuts)
                throw new Exception(global::Text.Get("source.shortcutpacks.10", MaxShortcuts));
            var clean = new ShortcutPack
            {
                id = Guid.NewGuid().ToString("N"),
                name = Text(input.name, 60, true, global::Text.Get("source.shortcutpacks.12")),
                author = Text(input.author, 60, false, global::Text.Get("source.shortcutpacks.13")),
                app = Text(input.app, 60, false, global::Text.Get("source.shortcutpacks.14")),
                iconPack = IconPacks.ValidId(input.iconPack) ? input.iconPack : "",
                created = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
                shortcuts = new List<ShortcutPackItem>(),
            };
            foreach (ShortcutPackItem item in input.shortcuts)
            {
                string name = Text(item == null ? null : item.name, 80, true, global::Text.Get("source.shortcutpacks.15"));
                string keys = Text(item.keys, 80, true, global::Text.Get("source.shortcutpacks.16", name));
                try { ShortcutKeys.ParseCombo(keys); }
                catch { throw new Exception(global::Text.Get("source.shortcutpacks.17", name)); }
                clean.shortcuts.Add(new ShortcutPackItem
                {
                    name = name,
                    keys = keys,
                    description = Text(item.description, 80, false, global::Text.Get("source.shortcutpacks.18")),
                    icon = Text(item.icon, 80, false, global::Text.Get("source.shortcutpacks.19")),
                });
            }
            Write(data, clean);
            return clean.id;
        }
    }

    internal static void Delete(string data, string id)
    {
        if (!ValidId(id)) return;
        lock (Gate)
        {
            string file = FileOf(data, id);
            if (File.Exists(file)) File.Delete(file);
        }
    }
}
