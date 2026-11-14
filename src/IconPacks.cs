using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

// 3.1 icon packs: icon sets the user imports from a .tpicons/.zip file or images.
// The settings page unpacks and shrinks the images; each pack is kept as data\icon-packs\<id>.json.
class IconPackItem
{
    public string id { get; set; }
    public string name { get; set; }
    // Optional preset icon key this picture stands for, used when a whole deck switches to the pack.
    public string key { get; set; }
    public string data { get; set; }
    // 3.1: the heading the pack puts this picture under, and search words (Stream Deck "tags").
    public string group { get; set; }
    public string tags { get; set; }
}

class IconPack
{
    public string id { get; set; }
    public string name { get; set; }
    public string author { get; set; }
    public string created { get; set; }
    public List<IconPackItem> icons { get; set; }
}

static class IconPacks
{
    internal const int MaxPacks = 50;
    internal const int MaxIcons = 600;
    internal const int MaxNameLength = 80;
    static readonly object Gate = new object();
    static readonly Regex IdPattern = new Regex("\\A[0-9a-f]{32}\\z");
    static readonly Regex ItemIdPattern = new Regex("\\A[0-9a-z-]{1,40}\\z");

    internal static string Folder(string data) { return Path.Combine(data, "icon-packs"); }

    internal static JavaScriptSerializer Serializer()
    {
        return new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
    }

    internal static bool ValidId(string id) { return id != null && IdPattern.IsMatch(id); }
    internal static bool ValidItemId(string id) { return id != null && ItemIdPattern.IsMatch(id); }

    static string FileOf(string data, string id)
    {
        if (!ValidId(id)) throw new Exception("アイコンパックが見つかりません。");
        return Path.Combine(Folder(data), id + ".json");
    }

    static string CleanText(string value, string fallback)
    {
        value = (value ?? "").Trim();
        if (value.Length == 0) value = fallback;
        if (value.Length > MaxNameLength) value = value.Substring(0, MaxNameLength);
        return value;
    }

    static IconPack Read(string data, string id)
    {
        string file = FileOf(data, id);
        if (!File.Exists(file)) throw new Exception("アイコンパックが見つかりません。");
        var pack = Serializer().Deserialize<IconPack>(File.ReadAllText(file, Encoding.UTF8));
        if (pack == null || pack.id != id) throw new Exception("アイコンパックのファイルが壊れています。");
        if (pack.icons == null) pack.icons = new List<IconPackItem>();
        return pack;
    }

    static void Write(string data, IconPack pack)
    {
        Directory.CreateDirectory(Folder(data));
        string file = FileOf(data, pack.id), temp = file + ".tmp";
        File.WriteAllText(temp, Serializer().Serialize(pack), new UTF8Encoding(false));
        if (File.Exists(file)) File.Replace(temp, file, null);
        else File.Move(temp, file);
    }

    // Summaries for the settings page; icon pictures are fetched per pack.
    internal static List<Dictionary<string, object>> List(string data)
    {
        var result = new List<Dictionary<string, object>>();
        lock (Gate)
        {
            if (!Directory.Exists(Folder(data))) return result;
            foreach (string file in Directory.GetFiles(Folder(data), "*.json"))
            {
                string id = Path.GetFileNameWithoutExtension(file);
                if (!ValidId(id)) continue;
                try
                {
                    var pack = Read(data, id);
                    int mapped = 0;
                    foreach (var icon in pack.icons) if (!String.IsNullOrEmpty(icon.key)) mapped++;
                    result.Add(new Dictionary<string, object>
                    {
                        { "id", pack.id }, { "name", pack.name }, { "author", pack.author ?? "" },
                        { "created", pack.created ?? "" }, { "count", pack.icons.Count }, { "mapped", mapped },
                    });
                }
                catch { }
            }
        }
        result.Sort((a, b) => String.CompareOrdinal(Convert.ToString(a["created"]), Convert.ToString(b["created"])));
        return result;
    }

    internal static IconPack Get(string data, string id)
    {
        lock (Gate) return Read(data, id);
    }

    internal static string Create(string data, string name, string author)
    {
        lock (Gate)
        {
            if (List(data).Count >= MaxPacks) throw new Exception("アイコンパックは" + MaxPacks + "個までです。使わないパックを削除してください。");
            var pack = new IconPack
            {
                id = Guid.NewGuid().ToString("N"),
                name = CleanText(name, "アイコンパック"),
                author = CleanText(author, ""),
                created = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
                icons = new List<IconPackItem>(),
            };
            Write(data, pack);
            return pack.id;
        }
    }

    // Appends checked icons; the settings page sends a large pack in several requests.
    internal static int Add(string data, string id, List<IconPackItem> icons)
    {
        if (icons == null || icons.Count == 0) throw new Exception("追加するアイコンがありません。");
        lock (Gate)
        {
            var pack = Read(data, id);
            if (pack.icons.Count + icons.Count > MaxIcons) throw new Exception("1つのパックに入れられるアイコンは" + MaxIcons + "個までです。");
            var used = new HashSet<string>();
            foreach (var icon in pack.icons) used.Add(icon.id);
            foreach (var icon in icons)
            {
                if (icon == null || !IconPresets.ValidCustomIcon(icon.data) || String.IsNullOrEmpty(icon.data))
                    throw new Exception("アイコン画像の形式またはサイズが正しくありません。");
                if (!IconPresets.Exists(icon.key)) icon.key = "";
                icon.name = CleanText(icon.name, "アイコン");
                string itemId = ValidItemId(icon.id) ? icon.id : "i" + (pack.icons.Count + 1);
                int n = 2;
                string baseId = itemId;
                while (used.Contains(itemId)) itemId = baseId + "-" + n++;
                used.Add(itemId);
                string group = (icon.group ?? "").Trim(), tags = (icon.tags ?? "").Trim();
                if (group.Length > 40) group = group.Substring(0, 40);
                if (tags.Length > 200) tags = tags.Substring(0, 200);
                pack.icons.Add(new IconPackItem { id = itemId, name = icon.name, key = icon.key ?? "", data = icon.data, group = group, tags = tags });
            }
            Write(data, pack);
            return pack.icons.Count;
        }
    }

    internal static void Delete(string data, string id)
    {
        lock (Gate)
        {
            string file = FileOf(data, id);
            if (!File.Exists(file)) throw new Exception("アイコンパックが見つかりません。");
            File.Delete(file);
        }
    }

    internal static void Rename(string data, string id, string name, string author)
    {
        lock (Gate)
        {
            var pack = Read(data, id);
            pack.name = CleanText(name, pack.name);
            pack.author = CleanText(author, "");
            Write(data, pack);
        }
    }
}
