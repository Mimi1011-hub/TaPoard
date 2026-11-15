using System;
using System.Drawing;
using System.Windows.Forms;

// Hosts the 4.0 settings page in a normal resizable desktop window.
sealed class SettingsWindow : Form
{
    readonly string url;
    readonly string userDataFolder;
    readonly Action<string> notify;
    readonly WebView2Host web = new WebView2Host();
    bool webStarted;

    internal SettingsWindow(string url, string userDataFolder, Action<string> notify)
    {
        this.url = url;
        this.userDataFolder = userDataFolder;
        this.notify = notify;
        Text = "TaPoard 設定";
        FormBorderStyle = FormBorderStyle.Sizable;
        MinimumSize = new Size(1100, 640);
        StartPosition = FormStartPosition.Manual;
        ShowInTaskbar = true;
        BackColor = Color.FromArgb(17, 18, 22);
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

        Rectangle area = Screen.PrimaryScreen.WorkingArea;
        int width = Math.Max(MinimumSize.Width, Math.Min(1440, (int)Math.Round(area.Width * 0.8)));
        int height = Math.Max(MinimumSize.Height, Math.Min(900, (int)Math.Round(area.Height * 0.8)));
        Size = new Size(width, height);
        Location = new Point(area.Left + (area.Width - width) / 2, area.Top + (area.Height - height) / 2);
    }

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        if (webStarted) return;
        webStarted = true;
        web.ProcessFailed = delegate
        {
            if (notify != null) notify("設定ウインドウの表示が停止しました。閉じて開き直してください。");
        };
        web.Create(
            Handle,
            userDataFolder,
            delegate(string error)
            {
                if (error != null)
                {
                    if (notify != null) notify("設定ウインドウを開けませんでした：" + error);
                    return;
                }
                web.SetBounds(ClientRectangle);
                web.Navigate(url);
            }
        );
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        web.SetBounds(ClientRectangle);
        web.SetVisible(WindowState != FormWindowState.Minimized);
    }

    protected override void OnMove(EventArgs e)
    {
        base.OnMove(e);
        web.ParentMoved();
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        web.Close();
        base.OnFormClosed(e);
    }
}
