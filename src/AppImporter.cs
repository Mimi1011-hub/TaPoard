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

    // A typed or dropped web address becomes a URL button named after its site.
    internal static AppEntry FromUrl(string url, string name)
    {
        url = (url ?? "").Trim();
        CustomActions.ValidateUrl(url);
        name = (name ?? "").Trim();
        if (name.Length == 0)
        {
            string host = new Uri(url).Host;
            name = host.StartsWith("www.", StringComparison.OrdinalIgnoreCase) ? host.Substring(4) : host;
        }
        if (name.Length > 80)
            name = name.Substring(0, 80);
        return new AppEntry
        {
            name = name,
            path = "",
            args = "",
            url = url,
            text = "",
            type = "url",
            category = "custom",
            iconKey = "globe",
        };
    }

    // Browsers drag links as text; only a single http(s) address counts.
    internal static string DroppedUrl(string text)
    {
        if (String.IsNullOrWhiteSpace(text))
            return null;
        string first = text.Trim().Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)[0].Trim();
        try
        {
            CustomActions.ValidateUrl(first);
            return first;
        }
        catch
        {
            return null;
        }
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
    readonly Panel dropView;
    readonly Panel urlView;
    readonly TextBox urlBox;
    readonly TextBox nameBox;
    readonly Label urlFeedback;
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
                "デスクトップやエクスプローラーから\nショートカット（.lnk）・実行ファイル（.exe）を\nまとめて追加できます。\nブラウザのURLをドロップするとURLボタンになります。",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
        };
        var pick = new Button { Text = "ファイルを選んで追加", Dock = DockStyle.Fill };
        var enterUrl = new Button { Text = "URLを入力して追加", Dock = DockStyle.Fill };
        enterUrl.Click += delegate { ShowUrlView(); };
        var buttons = ButtonRow(50, pick, enterUrl);
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
        dropView = new Panel { Dock = DockStyle.Fill };
        dropView.Controls.Add(feedback);
        dropView.Controls.Add(title);
        dropView.Controls.Add(buttons);
        dropView.AllowDrop = true;
        dropView.DragEnter += EnterFiles;
        dropView.DragDrop += DropFiles;

        urlView = new Panel { Dock = DockStyle.Fill, Visible = false, Padding = new Padding(24, 16, 24, 0) };
        var urlTitle = new Label
        {
            Text = "URLを入力して追加",
            Dock = DockStyle.Top,
            Height = 44,
            TextAlign = ContentAlignment.MiddleCenter,
            Font = new Font(SystemFonts.MessageBoxFont.FontFamily, 14),
        };
        var urlLabel = new Label { Text = "開くURL（http:// または https://）", Dock = DockStyle.Top, Height = 22 };
        urlBox = new TextBox { Dock = DockStyle.Top, MaxLength = 2048 };
        var nameLabel = new Label { Text = "表示名（空欄ならサイト名）", Dock = DockStyle.Top, Height = 26, TextAlign = ContentAlignment.BottomLeft };
        nameBox = new TextBox { Dock = DockStyle.Top, MaxLength = 80 };
        urlFeedback = new Label { Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter, ForeColor = Color.Firebrick };
        var add = new Button { Text = "追加", Dock = DockStyle.Fill };
        var back = new Button { Text = "戻る", Dock = DockStyle.Fill };
        add.Click += delegate { ImportUrl(); };
        back.Click += delegate { ShowDropView(); };
        var urlButtons = ButtonRow(70, add, back);
        // Docked controls stack in reverse order of adding.
        urlView.Controls.Add(urlFeedback);
        urlView.Controls.Add(nameBox);
        urlView.Controls.Add(nameLabel);
        urlView.Controls.Add(urlBox);
        urlView.Controls.Add(urlLabel);
        urlView.Controls.Add(urlTitle);
        urlView.Controls.Add(urlButtons);
        Controls.Add(dropView);
        Controls.Add(urlView);
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

    // Percent columns keep the buttons in proportion at any display scaling.
    static TableLayoutPanel ButtonRow(float firstPercent, Button first, Button second)
    {
        var row = new TableLayoutPanel { Dock = DockStyle.Bottom, Height = 46, ColumnCount = 2, RowCount = 1, Margin = Padding.Empty };
        row.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, firstPercent));
        row.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100 - firstPercent));
        row.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        first.Margin = new Padding(0, 0, 2, 0);
        second.Margin = new Padding(2, 0, 0, 0);
        row.Controls.Add(first, 0, 0);
        row.Controls.Add(second, 1, 0);
        return row;
    }

    void ShowUrlView()
    {
        dropView.Visible = false;
        urlView.Visible = true;
        AcceptButton = null;
        urlFeedback.Text = "";
        urlBox.Focus();
    }

    void ShowDropView()
    {
        urlView.Visible = false;
        dropView.Visible = true;
    }

    protected override bool ProcessDialogKey(Keys keyData)
    {
        if (keyData == Keys.Enter && urlView.Visible)
        {
            ImportUrl();
            return true;
        }
        return base.ProcessDialogKey(keyData);
    }

    void ImportUrl()
    {
        try
        {
            Finish(new List<AppEntry> { AppImporter.FromUrl(urlBox.Text, nameBox.Text) });
        }
        catch (Exception e)
        {
            urlFeedback.Text = e.Message;
        }
    }

    void Finish(List<AppEntry> apps)
    {
        completed = true;
        complete(apps);
        Close();
    }

    static string DroppedUrl(IDataObject data)
    {
        return data.GetDataPresent(DataFormats.UnicodeText) ? AppImporter.DroppedUrl(data.GetData(DataFormats.UnicodeText) as string) : null;
    }

    void EnterFiles(object sender, DragEventArgs e)
    {
        e.Effect =
            e.Data.GetDataPresent(DataFormats.FileDrop) || DroppedUrl(e.Data) != null
                ? DragDropEffects.Copy
                : DragDropEffects.None;
    }

    void DropFiles(object sender, DragEventArgs e)
    {
        var files = e.Data.GetData(DataFormats.FileDrop) as string[];
        if (files != null)
        {
            Import(files);
            return;
        }
        // A link dragged from the browser's address bar or a page.
        string url = DroppedUrl(e.Data);
        if (url != null)
            Finish(new List<AppEntry> { AppImporter.FromUrl(url, "") });
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
            Finish(apps);
        }
        catch (Exception e)
        {
            feedback.Text = e.Message;
        }
    }
}
