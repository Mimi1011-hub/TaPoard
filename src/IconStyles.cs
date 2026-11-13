using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

// 3.1 saved looks: named copies of every button's icon and color plus the deck background, which the
// user saves by hand and can put back later. Button actions and placement are not part of a look.
// Each look is data\icon-styles\<id>.json, with its background picture copied beside it.
class IconStyleButton
{
    public string id { get; set; }
    public string orientation { get; set; }
    public string name { get; set; }
    public string iconKey { get; set; }
    public string iconColor { get; set; }
    public string customIcon { get; set; }
    public string iconPack { get; set; }
    public string iconPackItem { get; set; }
    public int iconScale { get; set; }
}

class IconStyle
{
    public string id { get; set; }
    public string name { get; set; }
    public string created { get; set; }
    public List<IconStyleButton> buttons { get; set; }
    public DeckBackground background { get; set; }
    // Since the 3.1 release: the whole button layout (buttons, pages, grid, faders) at save time.
    public Settings deck { get; set; }
}

static class IconStyles
{
    internal const int MaxStyles = 20;
    internal const int MaxNameLength = 40;
    static readonly object Gate = new object();

    internal static string Folder(string data) { return Path.Combine(data, "icon-styles"); }

    static string FileOf(string data, string id)
    {
        if (!IconPacks.ValidId(id)) throw new Exception("保存した見た目が見つかりません。");
        return Path.Combine(Folder(data), id + ".json");
    }

    static string PictureOf(string data, string id, string type)
    {
        return Path.Combine(Folder(data), id + (type == "image/png" ? ".png" : type == "image/webp" ? ".webp" : ".jpg"));
    }

    static string CleanName(string value, string fallback)
    {
        value = (value ?? "").Trim();
        if (value.Length == 0) value = fallback;
        if (value.Length > MaxNameLength) value = value.Substring(0, MaxNameLength);
        return value;
    }

    static IconStyle Read(string data, string id)
    {
        string file = FileOf(data, id);
        if (!File.Exists(file)) throw new Exception("保存した見た目が見つかりません。");
        var style = IconPacks.Serializer().Deserialize<IconStyle>(File.ReadAllText(file, Encoding.UTF8));
        if (style == null || style.id != id) throw new Exception("保存した見た目のファイルが壊れています。");
        if (style.buttons == null) style.buttons = new List<IconStyleButton>();
        return style;
    }

    static void Write(string data, IconStyle style)
    {
        Directory.CreateDirectory(Folder(data));
        string file = FileOf(data, style.id), temp = file + ".tmp";
        File.WriteAllText(temp, IconPacks.Serializer().Serialize(style), new UTF8Encoding(false));
        if (File.Exists(file)) File.Replace(temp, file, null);
        else File.Move(temp, file);
    }

    static List<IconStyle> ReadAll(string data)
    {
        var result = new List<IconStyle>();
        if (!Directory.Exists(Folder(data))) return result;
        foreach (string file in Directory.GetFiles(Folder(data), "*.json"))
        {
            string id = Path.GetFileNameWithoutExtension(file);
            if (!IconPacks.ValidId(id)) continue;
            try { result.Add(Read(data, id)); }
            catch { }
        }
        result.Sort((a, b) => String.CompareOrdinal(b.created ?? "", a.created ?? ""));
        return result;
    }

    // Newest first, without the pictures.
    internal static List<Dictionary<string, object>> List(string data)
    {
        var result = new List<Dictionary<string, object>>();
        lock (Gate)
            foreach (var style in ReadAll(data))
            {
                var b = style.background ?? new DeckBackground();
                int custom = 0;
                foreach (var button in style.buttons) if (!String.IsNullOrEmpty(button.customIcon)) custom++;
                result.Add(new Dictionary<string, object>
                {
                    { "id", style.id }, { "name", style.name }, { "created", style.created ?? "" },
                    { "count", style.buttons.Count }, { "customCount", custom },
                    { "color", b.color ?? "" }, { "color2", b.color2 ?? "" }, { "hasImage", !String.IsNullOrEmpty(b.image) },
                });
            }
        return result;
    }

    // The layout part of the settings: no keys, paired phones, weather place, window or background.
    static Settings LayoutOf(Settings s)
    {
        var copy = IconPacks.Serializer().Deserialize<Settings>(IconPacks.Serializer().Serialize(s));
        copy.token = null;
        copy.pairingKey = null;
        copy.devices = null;
        copy.weatherName = null;
        copy.weatherTimezone = null;
        copy.weatherLatitude = 0;
        copy.weatherLongitude = 0;
        copy.pcWindow = null;
        copy.background = null;
        return copy;
    }

    static void RestoreLayout(Settings s, Settings deck, Action<AppEntry> validate)
    {
        var apps = new List<AppEntry>();
        foreach (var a in deck.apps ?? new List<AppEntry>())
        {
            try { validate(a); apps.Add(a); }
            catch { } // e.g. an app that is no longer installed
        }
        s.apps = apps;
        s.columns = deck.columns; s.rows = deck.rows;
        s.landscapeColumns = deck.landscapeColumns; s.landscapeRows = deck.landscapeRows;
        s.portraitColumns = deck.portraitColumns; s.portraitRows = deck.portraitRows;
        s.speakerSlot = deck.speakerSlot; s.micSlot = deck.micSlot; s.speakerSize = deck.speakerSize; s.micSize = deck.micSize;
        s.landscapeSpeakerSlot = deck.landscapeSpeakerSlot; s.landscapeMicSlot = deck.landscapeMicSlot;
        s.landscapeSpeakerSize = deck.landscapeSpeakerSize; s.landscapeMicSize = deck.landscapeMicSize;
        s.portraitSpeakerSlot = deck.portraitSpeakerSlot; s.portraitMicSlot = deck.portraitMicSlot;
        s.portraitSpeakerSize = deck.portraitSpeakerSize; s.portraitMicSize = deck.portraitMicSize;
        s.landscapeSpeaker = deck.landscapeSpeaker; s.landscapeMic = deck.landscapeMic;
        s.portraitSpeaker = deck.portraitSpeaker; s.portraitMic = deck.portraitMic;
        s.landscapeControlPages = deck.landscapeControlPages; s.portraitControlPages = deck.portraitControlPages;
        s.landscapeSpeakerOff = deck.landscapeSpeakerOff; s.landscapeMicOff = deck.landscapeMicOff;
        s.portraitSpeakerOff = deck.portraitSpeakerOff; s.portraitMicOff = deck.portraitMicOff;
        s.pageCount = deck.pageCount; s.landscapePageCount = deck.landscapePageCount; s.portraitPageCount = deck.portraitPageCount;
    }

    internal static string Save(string data, string name, Settings s)
    {
        lock (Gate)
        {
            if (ReadAll(data).Count >= MaxStyles) throw new Exception("保存できる見た目は" + MaxStyles + "個までです。使わないものを削除してください。");
            var style = new IconStyle
            {
                id = Guid.NewGuid().ToString("N"),
                name = CleanName(name, DateTime.Now.ToString("M/d H:mm") + " の見た目"),
                created = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
                buttons = new List<IconStyleButton>(),
            };
            foreach (var a in s.apps ?? new List<AppEntry>())
                style.buttons.Add(new IconStyleButton
                {
                    id = a.id, orientation = a.orientation, name = a.name, iconKey = a.iconKey, iconColor = a.iconColor,
                    customIcon = a.customIcon, iconPack = a.iconPack, iconPackItem = a.iconPackItem, iconScale = a.iconScale,
                });
            style.deck = LayoutOf(s);
            var b = s.background ?? new DeckBackground();
            style.background = DeckBackgrounds.Clean(b, b);
            string picture = DeckBackgrounds.ImageData(data, b);
            if (picture != null)
            {
                Directory.CreateDirectory(Folder(data));
                string comma = picture.Substring(0, picture.IndexOf(','));
                File.WriteAllBytes(PictureOf(data, style.id, b.imageType), Convert.FromBase64String(picture.Substring(comma.Length + 1)));
                style.background.image = "saved";
            }
            else
            {
                style.background.image = null;
                style.background.imageType = null;
                style.background.imageWidth = 0;
                style.background.imageHeight = 0;
            }
            Write(data, style);
            return style.id;
        }
    }

    // Puts a saved look back on the buttons that still exist (matched by id, then by name in the same
    // orientation) and restores the background. Returns how many buttons changed.
    internal static int Apply(string data, string id, Settings s, Action<AppEntry> validate)
    {
        IconStyle style;
        byte[] picture = null;
        lock (Gate)
        {
            style = Read(data, id);
            var b = style.background;
            if (b != null && !String.IsNullOrEmpty(b.image))
            {
                string file = PictureOf(data, id, b.imageType);
                if (File.Exists(file)) picture = File.ReadAllBytes(file);
            }
        }
        int changed = 0;
        if (style.deck != null)
        {
            RestoreLayout(s, style.deck, validate);
            changed = s.apps.Count;
        }
        else
        {
        var byId = new Dictionary<string, IconStyleButton>();
        foreach (var button in style.buttons) if (button.id != null) byId[button.id] = button;
        var used = new HashSet<IconStyleButton>();
        var targets = new List<KeyValuePair<AppEntry, IconStyleButton>>();
        foreach (var a in s.apps)
        {
            IconStyleButton saved;
            if (a.id != null && byId.TryGetValue(a.id, out saved) && used.Add(saved)) targets.Add(new KeyValuePair<AppEntry, IconStyleButton>(a, saved));
        }
        foreach (var a in s.apps)
        {
            if (targets.Exists(t => t.Key == a)) continue;
            var saved = style.buttons.Find(x => !used.Contains(x) && x.orientation == a.orientation && !String.IsNullOrEmpty(x.name) && x.name == a.name);
            if (saved != null && used.Add(saved)) targets.Add(new KeyValuePair<AppEntry, IconStyleButton>(a, saved));
        }
        foreach (var pair in targets)
        {
            var a = pair.Key;
            var saved = pair.Value;
            string customIcon = IconPresets.ValidCustomIcon(saved.customIcon) ? saved.customIcon : null;
            string iconKey = IconPresets.Exists(saved.iconKey) ? saved.iconKey : a.iconKey;
            string iconColor = IconPresets.ValidColor(saved.iconColor) ? saved.iconColor : null;
            if (a.iconKey == iconKey && a.iconColor == iconColor && a.customIcon == customIcon && a.iconPack == saved.iconPack && a.iconPackItem == saved.iconPackItem && (saved.iconScale == 0 || a.iconScale == saved.iconScale))
                continue;
            a.iconKey = iconKey;
            a.iconColor = iconColor;
            a.customIcon = customIcon;
            a.iconPack = customIcon != null && IconPacks.ValidId(saved.iconPack) ? saved.iconPack : null;
            a.iconPackItem = a.iconPack != null && IconPacks.ValidItemId(saved.iconPackItem) ? saved.iconPackItem : null;
            if (saved.iconScale >= 20 && saved.iconScale <= 100) a.iconScale = saved.iconScale;
            changed++;
        }
        }
        var look = style.background ?? new DeckBackground();
        var current = s.background;
        if (picture != null)
        {
            string type = look.imageType == "image/png" || look.imageType == "image/webp" ? look.imageType : "image/jpeg";
            current = DeckBackgrounds.SetImage(data, current, "data:" + type + ";base64," + Convert.ToBase64String(picture), look.imageWidth, look.imageHeight);
        }
        else if (current != null && !String.IsNullOrEmpty(current.image))
            current = DeckBackgrounds.ClearImage(data, current);
        s.background = DeckBackgrounds.Clean(look, current);
        return changed;
    }

    internal static void Rename(string data, string id, string name)
    {
        lock (Gate)
        {
            var style = Read(data, id);
            style.name = CleanName(name, style.name);
            Write(data, style);
        }
    }

    internal static void Delete(string data, string id)
    {
        lock (Gate)
        {
            string file = FileOf(data, id);
            if (!File.Exists(file)) throw new Exception("保存した見た目が見つかりません。");
            foreach (string type in new[] { "image/jpeg", "image/png", "image/webp" })
                try { File.Delete(PictureOf(data, id, type)); } catch { }
            File.Delete(file);
        }
    }
}
