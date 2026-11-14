using System;
using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;

// 3.1 deck background: a color (or two-color gradient) and an optional picture with its own
// position for each orientation. The picture is kept as data\backgrounds\<version>.<ext>.
class DeckBackground
{
    public string color { get; set; }
    public string color2 { get; set; }
    public string image { get; set; }
    public string imageType { get; set; }
    public int imageWidth { get; set; }
    public int imageHeight { get; set; }
    public BackgroundPosition landscape { get; set; }
    public BackgroundPosition portrait { get; set; }
    public int dim { get; set; }
    public int blur { get; set; }
    // How buttons follow the background: "" (auto: the background color, or see-through on a picture),
    // "glass" (see-through) or "standard" (the original black buttons).
    public string keys { get; set; }
    // How see-through the buttons' own background is, 0 (solid) to 100 percent. A button can set its own.
    public int keyClear { get; set; }
}

class BackgroundPosition
{
    public string fit { get; set; }
    public double x { get; set; }
    public double y { get; set; }
    public double zoom { get; set; }
}

static class DeckBackgrounds
{
    internal const int MaxImageBytes = 1400000;
    static readonly Regex VersionPattern = new Regex("\\A[0-9a-f]{32}\\z");

    internal static string Folder(string data) { return Path.Combine(data, "backgrounds"); }

    static BackgroundPosition CleanPosition(BackgroundPosition p)
    {
        if (p == null) p = new BackgroundPosition { x = 50, y = 50, zoom = 1 };
        return new BackgroundPosition
        {
            fit = p.fit == "contain" ? "contain" : "cover",
            x = Clamp(p.x, 0, 100, 50),
            y = Clamp(p.y, 0, 100, 50),
            zoom = Clamp(p.zoom, 1, 5, 1),
        };
    }

    static double Clamp(double value, double min, double max, double fallback)
    {
        if (double.IsNaN(value) || double.IsInfinity(value)) return fallback;
        if (value == 0 && min > 0) return fallback;
        return Math.Max(min, Math.Min(max, Math.Round(value, 2)));
    }

    // Checks the style the settings page sends. The picture fields are kept from the current value.
    internal static DeckBackground Clean(DeckBackground next, DeckBackground current)
    {
        if (next == null) next = new DeckBackground();
        if (!IconPresets.ValidColor(next.color) || !IconPresets.ValidColor(next.color2)) throw new Exception("背景色が正しくありません。");
        if (next.dim < 0 || next.dim > 80 || next.blur < 0 || next.blur > 20) throw new Exception("背景の暗さ・ぼかしが範囲外です。");
        if (next.keyClear < 0 || next.keyClear > 100) throw new Exception("ボタンの透過度が範囲外です。");
        return new DeckBackground
        {
            color = next.color ?? "",
            color2 = String.IsNullOrEmpty(next.color) ? "" : next.color2 ?? "",
            image = current != null ? current.image : null,
            imageType = current != null ? current.imageType : null,
            imageWidth = current != null ? current.imageWidth : 0,
            imageHeight = current != null ? current.imageHeight : 0,
            landscape = CleanPosition(next.landscape),
            portrait = CleanPosition(next.portrait),
            keys = next.keys == "glass" || next.keys == "standard" ? next.keys : "",
            dim = next.dim,
            blur = next.blur,
            keyClear = next.keyClear,
        };
    }

    // What phones and the settings page see: everything but the picture bytes.
    internal static object Public(DeckBackground b)
    {
        if (b == null) b = new DeckBackground();
        return new
        {
            color = b.color ?? "",
            color2 = b.color2 ?? "",
            image = b.image ?? "",
            imageWidth = b.imageWidth,
            imageHeight = b.imageHeight,
            landscape = CleanPosition(b.landscape),
            portrait = CleanPosition(b.portrait),
            keys = b.keys ?? "",
            dim = b.dim,
            blur = b.blur,
            keyClear = b.keyClear,
        };
    }

    static string Extension(string type) { return type == "image/png" ? ".png" : type == "image/webp" ? ".webp" : ".jpg"; }

    // Stores a picture sent as a data: URL and returns the background that points at it.
    internal static DeckBackground SetImage(string data, DeckBackground current, string value, int width, int height)
    {
        string[] prefixes = { "data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64," };
        string prefix = null;
        foreach (string candidate in prefixes) if (value != null && value.StartsWith(candidate, StringComparison.Ordinal)) prefix = candidate;
        if (prefix == null) throw new Exception("背景画像は PNG・JPEG・WebP を選んでください。");
        byte[] bytes;
        try { bytes = Convert.FromBase64String(value.Substring(prefix.Length)); }
        catch { throw new Exception("背景画像を読み取れません。"); }
        string type = prefix.Substring(5, prefix.IndexOf(';') - 5);
        if (bytes.Length == 0 || bytes.Length > MaxImageBytes) throw new Exception("背景画像が大きすぎます。");
        bool valid = type == "image/png" ? bytes.Length > 8 && bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4e && bytes[3] == 0x47
            : type == "image/jpeg" ? bytes.Length > 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff
            : bytes.Length > 12 && bytes[0] == 0x52 && bytes[1] == 0x49 && bytes[2] == 0x46 && bytes[3] == 0x46 && bytes[8] == 0x57 && bytes[9] == 0x45 && bytes[10] == 0x42 && bytes[11] == 0x50;
        if (!valid) throw new Exception("背景画像の形式が正しくありません。");
        if (width < 1 || height < 1 || width > 4096 || height > 4096) throw new Exception("背景画像の大きさが正しくありません。");
        string version = Guid.NewGuid().ToString("N");
        Directory.CreateDirectory(Folder(data));
        string file = Path.Combine(Folder(data), version + Extension(type)), temp = file + ".tmp";
        File.WriteAllBytes(temp, bytes);
        File.Move(temp, file);
        var next = Clean(current ?? new DeckBackground(), current);
        string old = current != null ? current.image : null, oldType = current != null ? current.imageType : null;
        next.image = version;
        next.imageType = type;
        next.imageWidth = width;
        next.imageHeight = height;
        RemoveFile(data, old, oldType);
        return next;
    }

    internal static DeckBackground ClearImage(string data, DeckBackground current)
    {
        var next = Clean(current ?? new DeckBackground(), current);
        if (current != null) RemoveFile(data, current.image, current.imageType);
        next.image = null;
        next.imageType = null;
        next.imageWidth = 0;
        next.imageHeight = 0;
        return next;
    }

    static void RemoveFile(string data, string version, string type)
    {
        if (version == null || !VersionPattern.IsMatch(version)) return;
        try { File.Delete(Path.Combine(Folder(data), version + Extension(type))); } catch { }
    }

    // The picture as a data: URL, or null when there is none.
    internal static string ImageData(string data, DeckBackground b)
    {
        if (b == null || b.image == null || !VersionPattern.IsMatch(b.image)) return null;
        string type = b.imageType == "image/png" || b.imageType == "image/webp" ? b.imageType : "image/jpeg";
        string file = Path.Combine(Folder(data), b.image + Extension(type));
        if (!File.Exists(file)) return null;
        return "data:" + type + ";base64," + Convert.ToBase64String(File.ReadAllBytes(file));
    }
}
