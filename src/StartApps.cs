using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;

// 3.1: apps from the Start menu's "all apps" list (shell:AppsFolder), including Store apps that have
// no file to drop. A button keeps "shell:AppsFolder\<app id>" as its path and starts it through Explorer.
class StartApp
{
    internal string name, id;
}

static class StartApps
{
    internal const string Prefix = "shell:AppsFolder\\";
    static readonly Dictionary<string, string> IconCache = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

    internal static bool IsStartApp(string path)
    {
        if (String.IsNullOrEmpty(path) || !path.StartsWith(Prefix, StringComparison.OrdinalIgnoreCase)) return false;
        string id = path.Substring(Prefix.Length);
        if (id.Length == 0 || id.Length > 400 || id.Contains("\"") || id.Contains("..")) return false;
        foreach (char c in id) if (c < ' ') return false;
        return true;
    }

    // Name and id of every entry in shell:AppsFolder, sorted by name. Needs an STA thread.
    internal static List<StartApp> List()
    {
        var result = new List<StartApp>();
        Type type = Type.GetTypeFromProgID("Shell.Application");
        if (type == null) return result;
        object shell = Activator.CreateInstance(type);
        try
        {
            object folder = Call(shell, "NameSpace", "shell:AppsFolder");
            if (folder == null) return result;
            object items = Call(folder, "Items");
            int count = (int)items.GetType().InvokeMember("Count", BindingFlags.GetProperty, null, items, null);
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < count; i++)
            {
                object item = Call(items, "Item", i);
                if (item == null) continue;
                string name = Convert.ToString(item.GetType().InvokeMember("Name", BindingFlags.GetProperty, null, item, null));
                string id = Convert.ToString(item.GetType().InvokeMember("Path", BindingFlags.GetProperty, null, item, null));
                if (String.IsNullOrWhiteSpace(name) || !IsStartApp(Prefix + id) || !seen.Add(id)) continue;
                // Uninstallers and help files clutter the list.
                if (name.IndexOf("uninstall", StringComparison.OrdinalIgnoreCase) >= 0 || name.Contains("アンインストール")) continue;
                result.Add(new StartApp { name = name.Length > 80 ? name.Substring(0, 80) : name, id = id });
            }
        }
        finally
        {
            Marshal.FinalReleaseComObject(shell);
        }
        result.Sort((a, b) => String.Compare(a.name, b.name, StringComparison.CurrentCultureIgnoreCase));
        return result;
    }

    static object Call(object target, string method, params object[] args)
    {
        return target.GetType().InvokeMember(method, BindingFlags.InvokeMethod, null, target, args);
    }

    internal static AppEntry Entry(StartApp app)
    {
        return new AppEntry { name = app.name, path = Prefix + app.id, args = "", icon = Icon(Prefix + app.id), type = "app", category = "app" };
    }

    internal static void Start(string path)
    {
        if (!IsStartApp(path)) throw new Exception("アプリが見つかりません。");
        Process.Start(new ProcessStartInfo("explorer.exe", "\"" + path + "\"") { UseShellExecute = false });
    }

    // The app's own picture as a PNG data URL, or null. Runs on an STA thread of its own.
    internal static string Icon(string path)
    {
        if (!IsStartApp(path)) return null;
        lock (IconCache)
        {
            string cached;
            if (IconCache.TryGetValue(path, out cached)) return cached;
        }
        string result = null;
        var thread = new Thread(delegate() { try { result = ReadIcon(path, 64); } catch { } });
        thread.SetApartmentState(ApartmentState.STA);
        thread.IsBackground = true;
        thread.Start();
        if (!thread.Join(4000)) return null;
        lock (IconCache) IconCache[path] = result;
        return result;
    }

    // For the picker list, on the caller's (UI, STA) thread.
    internal static Bitmap Picture(string id, int size)
    {
        try { return ReadBitmap(Prefix + id, size); }
        catch { return null; }
    }

    static string ReadIcon(string path, int size)
    {
        using (var bitmap = ReadBitmap(path, size))
        {
            if (bitmap == null) return null;
            using (var stream = new MemoryStream())
            {
                bitmap.Save(stream, ImageFormat.Png);
                string data = "data:image/png;base64," + Convert.ToBase64String(stream.ToArray());
                return data.Length <= 60000 ? data : null;
            }
        }
    }

    [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellItemImageFactory
    {
        [PreserveSig]
        int GetImage(NativeSize size, int flags, out IntPtr bitmap);
    }

    [StructLayout(LayoutKind.Sequential)]
    struct NativeSize
    {
        public int cx, cy;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct BitmapInfoHeader
    {
        public int biSize, biWidth, biHeight;
        public short biPlanes, biBitCount;
        public int biCompression, biSizeImage, biXPelsPerMeter, biYPelsPerMeter, biClrUsed, biClrImportant;
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    static extern void SHCreateItemFromParsingName(string path, IntPtr bindContext, [MarshalAs(UnmanagedType.LPStruct)] Guid riid, [MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory factory);

    [DllImport("gdi32.dll")]
    static extern int GetDIBits(IntPtr dc, IntPtr bitmap, uint start, uint lines, [Out] byte[] bits, ref BitmapInfoHeader info, uint usage);

    [StructLayout(LayoutKind.Sequential)]
    struct NativeBitmap
    {
        public int bmType, bmWidth, bmHeight, bmWidthBytes;
        public short bmPlanes, bmBitsPixel;
        public IntPtr bmBits;
    }

    [DllImport("gdi32.dll")]
    static extern int GetObject(IntPtr handle, int size, out NativeBitmap bitmap);

    [DllImport("gdi32.dll")]
    static extern bool DeleteObject(IntPtr handle);

    [DllImport("user32.dll")]
    static extern IntPtr GetDC(IntPtr window);

    [DllImport("user32.dll")]
    static extern int ReleaseDC(IntPtr window, IntPtr dc);

    static Bitmap ReadBitmap(string path, int size)
    {
        IShellItemImageFactory factory;
        SHCreateItemFromParsingName(path, IntPtr.Zero, typeof(IShellItemImageFactory).GUID, out factory);
        IntPtr handle = IntPtr.Zero;
        try
        {
            // SIIGBF_BIGGERSIZEOK | SIIGBF_ICONONLY
            if (factory.GetImage(new NativeSize { cx = size, cy = size }, 0x1 | 0x4, out handle) != 0 || handle == IntPtr.Zero) return null;
            NativeBitmap info;
            if (GetObject(handle, Marshal.SizeOf(typeof(NativeBitmap)), out info) == 0 || info.bmWidth <= 0 || info.bmHeight <= 0 || info.bmWidth > 1024 || info.bmHeight > 1024) return null;
            int w = info.bmWidth, h = info.bmHeight;
            // Copy the pixels top-down with their alpha (FromHbitmap would drop it).
            var header = new BitmapInfoHeader { biSize = Marshal.SizeOf(typeof(BitmapInfoHeader)), biWidth = w, biHeight = -h, biPlanes = 1, biBitCount = 32 };
            var bits = new byte[w * h * 4];
            IntPtr dc = GetDC(IntPtr.Zero);
            try
            {
                if (GetDIBits(dc, handle, 0, (uint)h, bits, ref header, 0) == 0) return null;
            }
            finally
            {
                ReleaseDC(IntPtr.Zero, dc);
            }
            bool anyAlpha = false;
            for (int i = 3; i < bits.Length; i += 4) if (bits[i] != 0) { anyAlpha = true; break; }
            if (!anyAlpha) for (int i = 3; i < bits.Length; i += 4) bits[i] = 255;
            var premultiplied = new Bitmap(w, h, PixelFormat.Format32bppPArgb);
            var data = premultiplied.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.WriteOnly, PixelFormat.Format32bppPArgb);
            try { Marshal.Copy(bits, 0, data.Scan0, bits.Length); }
            finally { premultiplied.UnlockBits(data); }
            var result = new Bitmap(size, size, PixelFormat.Format32bppArgb);
            using (var g = Graphics.FromImage(result))
            {
                g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                g.DrawImage(premultiplied, 0, 0, size, size);
            }
            premultiplied.Dispose();
            return result;
        }
        finally
        {
            if (handle != IntPtr.Zero) DeleteObject(handle);
            Marshal.ReleaseComObject(factory);
        }
    }
}
