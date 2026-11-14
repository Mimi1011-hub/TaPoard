using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Threading;
using System.Windows.Forms;

// 3.1 slideshow widget (3x3, 4x4, 5x5): shows the pictures of a folder on this PC one after another.
// Phones ask for one picture at a time; it is shrunk and sent as a JPEG data URL (the pages only
// allow data: pictures). Only folders set on a slideshow widget can be read.
static class Slideshow
{
    static readonly string[] Extensions = { ".jpg", ".jpeg", ".png", ".bmp", ".gif" };
    const int MaxFiles = 3000;
    const int MaxSide = 1280;
    static readonly object Gate = new object();
    static readonly Dictionary<string, KeyValuePair<DateTime, string[]>> Listings = new Dictionary<string, KeyValuePair<DateTime, string[]>>(StringComparer.OrdinalIgnoreCase);
    static readonly LinkedList<KeyValuePair<string, string>> Pictures = new LinkedList<KeyValuePair<string, string>>();

    internal static bool ValidFolder(string folder)
    {
        if (String.IsNullOrEmpty(folder)) return true;
        if (folder.Length > 260 || folder.IndexOfAny(Path.GetInvalidPathChars()) >= 0) return false;
        try { return Path.IsPathRooted(folder) && !folder.StartsWith("\\\\.\\", StringComparison.Ordinal) && !folder.StartsWith("\\\\?\\", StringComparison.Ordinal); }
        catch { return false; }
    }

    // Picture files of the folder (not sub-folders), by name; re-read at most every 30 seconds.
    internal static string[] Files(string folder)
    {
        if (String.IsNullOrEmpty(folder) || !ValidFolder(folder) || !Directory.Exists(folder)) return new string[0];
        lock (Gate)
        {
            KeyValuePair<DateTime, string[]> cached;
            if (Listings.TryGetValue(folder, out cached) && DateTime.UtcNow - cached.Key < TimeSpan.FromSeconds(30)) return cached.Value;
        }
        string[] files;
        try
        {
            files = Directory.EnumerateFiles(folder)
                .Where(f => Extensions.Contains(Path.GetExtension(f).ToLowerInvariant()))
                .Where(f => (File.GetAttributes(f) & (FileAttributes.Hidden | FileAttributes.System)) == 0)
                .Take(MaxFiles)
                .OrderBy(f => f, StringComparer.CurrentCultureIgnoreCase)
                .ToArray();
        }
        catch
        {
            files = new string[0];
        }
        lock (Gate) Listings[folder] = new KeyValuePair<DateTime, string[]>(DateTime.UtcNow, files);
        return files;
    }

    // { count, index, name, data } for picture number index (wrapping around).
    internal static object Picture(string folder, int index)
    {
        var files = Files(folder);
        if (files.Length == 0)
            return new { count = 0, index = 0, name = "", data = (string)null, error = String.IsNullOrEmpty(folder) ? "フォルダが設定されていません。PC設定画面で選んでください。" : Directory.Exists(folder) ? "フォルダに画像（JPEG・PNG・BMP・GIF）がありません。" : "フォルダが見つかりません。" };
        index = ((index % files.Length) + files.Length) % files.Length;
        string file = files[index], data = null;
        for (int tries = 0; tries < Math.Min(5, files.Length) && data == null; tries++)
        {
            file = files[(index + tries) % files.Length];
            data = Read(file);
            if (data != null) index = (index + tries) % files.Length;
        }
        return new { count = files.Length, index = index, name = Path.GetFileNameWithoutExtension(file), data = data, error = data == null ? "画像を読み込めませんでした。" : "" };
    }

    static string Read(string file)
    {
        string key;
        try { key = file + "|" + File.GetLastWriteTimeUtc(file).Ticks; }
        catch { return null; }
        lock (Gate)
            foreach (var cached in Pictures)
                if (cached.Key == key) return cached.Value;
        string data = null;
        try
        {
            var info = new FileInfo(file);
            if (info.Length > 60L * 1024 * 1024) return null;
            using (var stream = new MemoryStream(File.ReadAllBytes(file)))
            using (var source = Image.FromStream(stream, false, false))
            {
                Orient(source);
                double scale = Math.Min(1.0, (double)MaxSide / Math.Max(source.Width, source.Height));
                int w = Math.Max(1, (int)Math.Round(source.Width * scale)), h = Math.Max(1, (int)Math.Round(source.Height * scale));
                using (var target = new Bitmap(w, h, PixelFormat.Format24bppRgb))
                {
                    using (var g = Graphics.FromImage(target))
                    {
                        g.Clear(Color.Black);
                        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                        g.DrawImage(source, 0, 0, w, h);
                    }
                    var codec = ImageCodecInfo.GetImageEncoders().First(c => c.MimeType == "image/jpeg");
                    using (var parameters = new EncoderParameters(1))
                    using (var output = new MemoryStream())
                    {
                        parameters.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 82L);
                        target.Save(output, codec, parameters);
                        data = "data:image/jpeg;base64," + Convert.ToBase64String(output.ToArray());
                    }
                }
            }
        }
        catch
        {
            return null;
        }
        lock (Gate)
        {
            Pictures.AddFirst(new KeyValuePair<string, string>(key, data));
            while (Pictures.Count > 12) Pictures.RemoveLast();
        }
        return data;
    }

    // Camera photos store their rotation in EXIF tag 0x0112.
    static void Orient(Image image)
    {
        if (Array.IndexOf(image.PropertyIdList, 0x0112) < 0) return;
        int value = image.GetPropertyItem(0x0112).Value[0];
        RotateFlipType flip =
            value == 2 ? RotateFlipType.RotateNoneFlipX :
            value == 3 ? RotateFlipType.Rotate180FlipNone :
            value == 4 ? RotateFlipType.Rotate180FlipX :
            value == 5 ? RotateFlipType.Rotate90FlipX :
            value == 6 ? RotateFlipType.Rotate90FlipNone :
            value == 7 ? RotateFlipType.Rotate270FlipX :
            value == 8 ? RotateFlipType.Rotate270FlipNone : RotateFlipType.RotateNoneFlipNone;
        if (flip != RotateFlipType.RotateNoneFlipNone) image.RotateFlip(flip);
    }

    // The folder chooser of Windows, shown on this PC for the settings page.
    internal static string PickFolder(string start)
    {
        string result = null;
        Exception error = null;
        var thread = new Thread(delegate()
        {
            try
            {
                using (var owner = new Form { TopMost = true, ShowInTaskbar = false, Width = 0, Height = 0, StartPosition = FormStartPosition.CenterScreen })
                using (var dialog = new FolderBrowserDialog { Description = "スライドショーに使う画像のフォルダを選んでください", ShowNewFolderButton = false })
                {
                    if (ValidFolder(start) && Directory.Exists(start)) dialog.SelectedPath = start;
                    owner.Show();
                    owner.Activate();
                    if (dialog.ShowDialog(owner) == DialogResult.OK) result = dialog.SelectedPath;
                }
            }
            catch (Exception e)
            {
                error = e;
            }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();
        if (error != null) throw new Exception("フォルダを選ぶ画面を開けませんでした：" + error.Message);
        return result;
    }
}
