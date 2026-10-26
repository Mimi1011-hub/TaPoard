using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

class IconBuilder
{
    static byte[] ResizePng(Image source, int size)
    {
        using (var bitmap = new Bitmap(size, size, PixelFormat.Format32bppArgb))
        {
            bitmap.SetResolution(96, 96);
            using (var graphics = Graphics.FromImage(bitmap))
            {
                graphics.CompositingMode = CompositingMode.SourceCopy;
                graphics.CompositingQuality = CompositingQuality.HighQuality;
                graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                graphics.SmoothingMode = SmoothingMode.HighQuality;
                graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
                graphics.Clear(Color.Transparent);
                graphics.DrawImage(
                    source,
                    new Rectangle(0, 0, size, size),
                    0,
                    0,
                    source.Width,
                    source.Height,
                    GraphicsUnit.Pixel
                );
            }
            using (var memory = new MemoryStream())
            {
                bitmap.Save(memory, ImageFormat.Png);
                return memory.ToArray();
            }
        }
    }

    static void Main(string[] args)
    {
        if (args.Length < 4)
            throw new Exception(
                "Usage: IconBuilder source.png output.ico icon32.png icon180.png [icon192.png icon512.png]"
            );
        int[] sizes = new[] { 16, 20, 24, 32, 40, 48, 64, 128, 256 };
        using (var source = Image.FromFile(args[0]))
        {
            var images = new List<byte[]>();
            foreach (int size in sizes)
                images.Add(ResizePng(source, size));
            using (var file = File.Create(args[1]))
            using (var writer = new BinaryWriter(file))
            {
                writer.Write((ushort)0);
                writer.Write((ushort)1);
                writer.Write((ushort)sizes.Length);
                int offset = 6 + 16 * sizes.Length;
                for (int i = 0; i < sizes.Length; i++)
                {
                    writer.Write((byte)(sizes[i] == 256 ? 0 : sizes[i]));
                    writer.Write((byte)(sizes[i] == 256 ? 0 : sizes[i]));
                    writer.Write((byte)0);
                    writer.Write((byte)0);
                    writer.Write((ushort)1);
                    writer.Write((ushort)32);
                    writer.Write((uint)images[i].Length);
                    writer.Write((uint)offset);
                    offset += images[i].Length;
                }
                foreach (byte[] image in images)
                    writer.Write(image);
            }
            File.WriteAllBytes(args[2], ResizePng(source, 32));
            File.WriteAllBytes(args[3], ResizePng(source, 180));
            if (args.Length > 4)
                File.WriteAllBytes(args[4], ResizePng(source, 192));
            if (args.Length > 5)
                File.WriteAllBytes(args[5], ResizePng(source, 512));
        }
        Console.WriteLine("Created Windows and web icons");
    }
}
