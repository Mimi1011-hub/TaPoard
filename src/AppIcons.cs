using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

static class AppIcons
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct ShellInfo
    {
        public IntPtr icon;
        public int index;
        public uint attributes;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string displayName;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)]
        public string typeName;
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    static extern IntPtr SHGetFileInfo(string path, uint attrs, out ShellInfo info, uint size, uint flags);

    [DllImport("user32.dll")]
    static extern bool DestroyIcon(IntPtr icon);

    internal static string Read(string path)
    {
        if (String.IsNullOrEmpty(path) || !File.Exists(path))
            return null;
        ShellInfo info = new ShellInfo();
        try
        {
            if (
                SHGetFileInfo(path, 0, out info, (uint)Marshal.SizeOf(typeof(ShellInfo)), 0x100) == IntPtr.Zero
                || info.icon == IntPtr.Zero
            )
                return null;
            using (var original = Icon.FromHandle(info.icon))
            using (var bitmap = original.ToBitmap())
            using (var stream = new MemoryStream())
            {
                bitmap.Save(stream, ImageFormat.Png);
                return "data:image/png;base64," + Convert.ToBase64String(stream.ToArray());
            }
        }
        catch
        {
            return null;
        }
        finally
        {
            if (info.icon != IntPtr.Zero)
                DestroyIcon(info.icon);
        }
    }
}
