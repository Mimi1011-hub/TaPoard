using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

static class AppImporter
{
    internal static AppEntry FromPath(string path)
    {
        path = Path.GetFullPath(path);
        string ext = Path.GetExtension(path).ToLowerInvariant();
        if (!File.Exists(path) || (ext != ".exe" && ext != ".lnk"))
            throw new Exception("アプリの実行ファイル（.exe）かショートカット（.lnk）を選んでください。");
        return new AppEntry
        {
            name = Path.GetFileNameWithoutExtension(path),
            path = path,
            args = "",
            icon = AppIcons.Read(path),
            type = "app",
            category = "app",
        };
    }

    internal static bool ValidPath(string path)
    {
        return !String.IsNullOrWhiteSpace(path)
            && Path.IsPathRooted(path)
            && File.Exists(path)
            && (
                path.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)
                || path.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase)
            );
    }
}

sealed class ImportWindow : Form
{
    readonly Label feedback;
    readonly Action<List<AppEntry>> complete;
    bool completed;

    public ImportWindow(Action<List<AppEntry>> callback)
    {
        complete = callback;
        Text = "TaPoard — アイコンから追加";
        ClientSize = new Size(490, 260);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        TopMost = true;
        AllowDrop = true;
        var title = new Label
        {
            Text = "ここにアプリのアイコンをドロップ",
            Dock = DockStyle.Top,
            Height = 65,
            TextAlign = ContentAlignment.MiddleCenter,
            Font = new Font(SystemFonts.MessageBoxFont.FontFamily, 14),
        };
        feedback = new Label
        {
            Text =
                "デスクトップやエクスプローラーから\nショートカット（.lnk）・実行ファイル（.exe）を\nまとめて追加できます。",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
        };
        var pick = new Button
        {
            Text = "ファイルを選んで追加",
            Dock = DockStyle.Bottom,
            Height = 46,
        };
        pick.Click += delegate
        {
            using (
                var dialog = new OpenFileDialog
                {
                    Filter = "アプリ・ショートカット|*.exe;*.lnk",
                    Multiselect = true,
                    DereferenceLinks = false,
                }
            )
            {
                if (dialog.ShowDialog(this) == DialogResult.OK)
                    Import(dialog.FileNames);
            }
        };
        Controls.Add(feedback);
        Controls.Add(title);
        Controls.Add(pick);
        DragEnter += EnterFiles;
        DragDrop += DropFiles;
        title.AllowDrop = true;
        title.DragEnter += EnterFiles;
        title.DragDrop += DropFiles;
        feedback.AllowDrop = true;
        feedback.DragEnter += EnterFiles;
        feedback.DragDrop += DropFiles;
        FormClosed += delegate
        {
            if (!completed)
                complete(null);
        };
    }

    void EnterFiles(object sender, DragEventArgs e)
    {
        e.Effect = e.Data.GetDataPresent(DataFormats.FileDrop) ? DragDropEffects.Copy : DragDropEffects.None;
    }

    void DropFiles(object sender, DragEventArgs e)
    {
        var files = e.Data.GetData(DataFormats.FileDrop) as string[];
        if (files != null)
            Import(files);
    }

    void Import(string[] files)
    {
        try
        {
            if (files.Length > 40)
                throw new Exception("一度に追加できるのは40個までです。");
            var apps = new List<AppEntry>();
            foreach (string file in files)
                apps.Add(AppImporter.FromPath(file));
            completed = true;
            complete(apps);
            Close();
        }
        catch (Exception e)
        {
            feedback.Text = e.Message;
        }
    }
}
