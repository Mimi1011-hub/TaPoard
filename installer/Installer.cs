using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

class Installer
{
    const string Product = "TaPoard";
    static readonly string Version = ReadVersion();

    static string ReadVersion()
    {
        object[] attributes = Assembly.GetExecutingAssembly()
            .GetCustomAttributes(typeof(AssemblyInformationalVersionAttribute), false);
        return attributes.Length == 1
            ? ((AssemblyInformationalVersionAttribute)attributes[0]).InformationalVersion
            : "3.1+source";
    }

    enum FirewallResult
    {
        Success,
        Cancelled,
        Failed,
        MissingScript,
    }

    static readonly string LogPath = Path.Combine(Path.GetTempPath(), "TaPoard-install.log");
    static string InstallDirectory
    {
        get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), Product); }
    }
    static string AppPath
    {
        get { return Path.Combine(InstallDirectory, "TaPoard.exe"); }
    }

    [STAThread]
    static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        try
        {
            if (args.Length > 0 && String.Equals(args[0], "/uninstall", StringComparison.OrdinalIgnoreCase))
                Uninstall();
            else if (args.Length > 1 && String.Equals(args[0], "/extract-only", StringComparison.OrdinalIgnoreCase))
            {
                ExtractPayload(args[1]);
                Console.WriteLine("Extracted");
            }
            else
            {
                File.WriteAllText(LogPath, DateTime.Now.ToString("s") + " setup started" + Environment.NewLine);
                Install();
            }
        }
        catch (Exception e)
        {
            Log("ERROR " + e);
            MessageBox.Show(
                e.Message + "\n\nログ: " + LogPath,
                Product + " セットアップ",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
            Environment.ExitCode = 1;
        }
    }

    static void Install()
    {
        using (var options = new InstallOptionsForm(InstallDirectory))
        {
            if (options.ShowDialog() != DialogResult.OK)
                return;
            Log(
                "options desktop="
                    + options.DesktopShortcut
                    + " startMenu="
                    + options.StartMenuShortcut
                    + " startup="
                    + options.StartWithWindows
                    + " firewall="
                    + options.AllowFirewall
            );
            StopAllApps();
            Directory.CreateDirectory(InstallDirectory);
            ExtractPayload(InstallDirectory);
            Log("payload extracted");
            string installerCopy = Path.Combine(InstallDirectory, "TaPoard-Setup.exe");
            string current = Assembly.GetExecutingAssembly().Location;
            PrepareInstallerCopy(current, installerCopy);
            CreateShortcuts(installerCopy, options.DesktopShortcut, options.StartMenuShortcut);
            SetAutoStart(options.StartWithWindows);
            RegisterUninstaller(installerCopy);
            Log("shortcuts and registry configured");
            using (
                Process app = Process.Start(
                    new ProcessStartInfo(AppPath) { WorkingDirectory = InstallDirectory, UseShellExecute = true }
                )
            )
            {
                string network = Path.Combine(InstallDirectory, "network.json");
                for (int i = 0; i < 40 && !File.Exists(network) && !app.HasExited; i++)
                    Thread.Sleep(250);
                if (!File.Exists(network))
                {
                    Log("installed app failed to create network.json; exited=" + app.HasExited);
                    MessageBox.Show(
                        "TaPoardを起動できなかったため、LAN設定を開始できませんでした。\n\nほかの場所でTaPoardが起動していないか確認し、セットアップをもう一度実行してください。\n\nログ: "
                            + LogPath,
                        Product + " セットアップ",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Warning
                    );
                    return;
                }
            }
            string note;
            MessageBoxIcon messageIcon;
            if (!options.AllowFirewall)
            {
                Log("firewall skipped by user");
                MessageBox.Show(
                    "インストールが完了しました。\n\nファイアウォールの許可は追加していないため、スマートフォンからつながらない場合があります。あとから許可するときは、PC の設定画面の QR コードの下にある「設定のしかたを見る」から追加できます。",
                    Product + " セットアップ",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
                return;
            }
            FirewallResult firewall = ConfigureFirewall("setup-lan.ps1");
            Log("firewall result=" + firewall);
            if (firewall == FirewallResult.Success)
            {
                note =
                    "インストールが完了しました。\n\nPCのブラウザに表示されたQRコードをスマートフォンで読み取ってください。";
                messageIcon = MessageBoxIcon.Information;
            }
            else if (firewall == FirewallResult.Cancelled)
            {
                note =
                    "アプリのインストールは完了しました。\n\nWindowsの管理者確認がキャンセルされたため、LAN接続設定は未完了です。セットアップをもう一度実行してください。";
                messageIcon = MessageBoxIcon.Warning;
            }
            else
            {
                note =
                    "アプリのインストールは完了しましたが、LAN接続設定でエラーが発生しました。\n\nログを確認してセットアップをもう一度実行してください。\n\nログ: "
                    + LogPath;
                messageIcon = MessageBoxIcon.Warning;
            }
            MessageBox.Show(note, Product + " セットアップ", MessageBoxButtons.OK, messageIcon);
        }
    }

    internal static void PrepareInstallerCopy(string current, string installerCopy)
    {
        current = Path.GetFullPath(current);
        installerCopy = Path.GetFullPath(installerCopy);
        if (String.Equals(current, installerCopy, StringComparison.OrdinalIgnoreCase))
            return;
        StopOldInstallerCopy(installerCopy);
        Exception last = null;
        for (int attempt = 1; attempt <= 20; attempt++)
        {
            try
            {
                if (File.Exists(installerCopy))
                {
                    FileAttributes attributes = File.GetAttributes(installerCopy);
                    if ((attributes & FileAttributes.ReadOnly) != 0)
                        File.SetAttributes(installerCopy, attributes & ~FileAttributes.ReadOnly);
                }
                File.Copy(current, installerCopy, true);
                Log("installer copy updated attempt=" + attempt);
                return;
            }
            catch (UnauthorizedAccessException e)
            {
                last = e;
                Log("installer copy busy attempt=" + attempt + " " + e.Message);
            }
            catch (IOException e)
            {
                last = e;
                Log("installer copy busy attempt=" + attempt + " " + e.Message);
            }
            Thread.Sleep(250);
        }
        throw new IOException(
            "インストール用ファイルを更新できませんでした。TaPoardのセットアップ画面をすべて閉じ、ウイルス対策ソフトの検査が終わってから、もう一度実行してください。",
            last
        );
    }

    static void StopOldInstallerCopy(string installerCopy)
    {
        foreach (Process process in Process.GetProcessesByName("TaPoard-Setup"))
        {
            try
            {
                string path = process.MainModule.FileName;
                if (String.Equals(Path.GetFullPath(path), installerCopy, StringComparison.OrdinalIgnoreCase))
                {
                    Log("stopping old installer " + process.Id);
                    process.Kill();
                    process.WaitForExit(5000);
                }
            }
            catch (Exception e)
            {
                Log("could not stop old installer: " + e.Message);
            }
            finally
            {
                process.Dispose();
            }
        }
    }

    static void ExtractPayload(string target)
    {
        Directory.CreateDirectory(target);
        string root = Path.GetFullPath(target).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        using (Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("TaPoard.Payload.zip"))
        {
            if (resource == null)
                throw new Exception("インストールデータが見つかりません。");
            using (var archive = new ZipArchive(resource, ZipArchiveMode.Read))
                foreach (ZipArchiveEntry entry in archive.Entries)
                {
                    string destination = Path.GetFullPath(Path.Combine(target, entry.FullName));
                    if (!destination.StartsWith(root, StringComparison.OrdinalIgnoreCase))
                        throw new Exception("不正なインストールデータです。");
                    if (String.IsNullOrEmpty(entry.Name))
                    {
                        Directory.CreateDirectory(destination);
                        continue;
                    }
                    Directory.CreateDirectory(Path.GetDirectoryName(destination));
                    using (Stream input = entry.Open())
                    using (
                        FileStream output = new FileStream(
                            destination,
                            FileMode.Create,
                            FileAccess.Write,
                            FileShare.None
                        )
                    )
                        input.CopyTo(output);
                }
        }
    }

    static void StopInstalledApp()
    {
        foreach (Process process in Process.GetProcessesByName("TaPoard"))
        {
            try
            {
                string path = process.MainModule.FileName;
                if (String.Equals(path, AppPath, StringComparison.OrdinalIgnoreCase))
                {
                    process.Kill();
                    process.WaitForExit(5000);
                }
            }
            catch { }
            finally
            {
                process.Dispose();
            }
        }
    }

    static void StopAllApps()
    {
        foreach (Process process in Process.GetProcessesByName("TaPoard"))
        {
            try
            {
                string path = "";
                try
                {
                    path = process.MainModule.FileName;
                }
                catch { }
                Log("stopping running app " + process.Id + " " + path);
                process.Kill();
                process.WaitForExit(5000);
            }
            catch (Exception e)
            {
                Log("could not stop process: " + e.Message);
            }
            finally
            {
                process.Dispose();
            }
        }
    }

    static FirewallResult ConfigureFirewall(string scriptName)
    {
        string script = Path.Combine(InstallDirectory, scriptName);
        if (!File.Exists(script))
            return FirewallResult.MissingScript;
        try
        {
            var start = new ProcessStartInfo(
                "powershell.exe",
                "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + script + "\""
            )
            {
                UseShellExecute = true,
                Verb = "runas",
                WorkingDirectory = InstallDirectory,
                WindowStyle = ProcessWindowStyle.Hidden,
            };
            using (Process process = Process.Start(start))
            {
                process.WaitForExit();
                Log("firewall script exit=" + process.ExitCode);
                return process.ExitCode == 0 ? FirewallResult.Success : FirewallResult.Failed;
            }
        }
        catch (System.ComponentModel.Win32Exception e)
        {
            if (e.NativeErrorCode == 1223)
                return FirewallResult.Cancelled;
            Log("firewall elevation error=" + e);
            return FirewallResult.Failed;
        }
        catch (Exception e)
        {
            Log("firewall error=" + e);
            return FirewallResult.Failed;
        }
    }

    static void CreateShortcuts(string installerCopy, bool desktop, bool startMenu)
    {
        string startFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), Product),
            desktopLink = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                "TaPoard.lnk"
            );
        TryDelete(desktopLink);
        if (Directory.Exists(startFolder))
            Directory.Delete(startFolder, true);
        if (startMenu)
        {
            Directory.CreateDirectory(startFolder);
            CreateShortcut(Path.Combine(startFolder, "TaPoard.lnk"), AppPath, "", InstallDirectory, AppPath);
            string readme = Path.Combine(InstallDirectory, "README.txt");
            if (File.Exists(readme))
                CreateShortcut(Path.Combine(startFolder, "README.lnk"), readme, "", InstallDirectory, AppPath);
            CreateShortcut(
                Path.Combine(startFolder, "TaPoardをアンインストール.lnk"),
                installerCopy,
                "/uninstall",
                InstallDirectory,
                installerCopy
            );
        }
        if (desktop)
            CreateShortcut(desktopLink, AppPath, "", InstallDirectory, AppPath);
    }

    static void SetAutoStart(bool enabled)
    {
        using (RegistryKey key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run"))
        {
            if (enabled)
                key.SetValue(Product, "\"" + AppPath + "\" --silent");
            else
                key.DeleteValue(Product, false);
        }
    }

    static void CreateShortcut(
        string shortcutPath,
        string target,
        string arguments,
        string workingDirectory,
        string icon
    )
    {
        Type type = Type.GetTypeFromProgID("WScript.Shell");
        object shell = Activator.CreateInstance(type);
        object shortcut = null;
        try
        {
            shortcut = type.InvokeMember(
                "CreateShortcut",
                BindingFlags.InvokeMethod,
                null,
                shell,
                new object[] { shortcutPath }
            );
            Type link = shortcut.GetType();
            link.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { target });
            link.InvokeMember("Arguments", BindingFlags.SetProperty, null, shortcut, new object[] { arguments });
            link.InvokeMember(
                "WorkingDirectory",
                BindingFlags.SetProperty,
                null,
                shortcut,
                new object[] { workingDirectory }
            );
            link.InvokeMember("IconLocation", BindingFlags.SetProperty, null, shortcut, new object[] { icon + ",0" });
            link.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
        }
        finally
        {
            if (shortcut != null && Marshal.IsComObject(shortcut))
                Marshal.FinalReleaseComObject(shortcut);
            if (shell != null && Marshal.IsComObject(shell))
                Marshal.FinalReleaseComObject(shell);
        }
    }

    static void RegisterUninstaller(string installerCopy)
    {
        using (
            RegistryKey key = Registry.CurrentUser.CreateSubKey(
                @"Software\Microsoft\Windows\CurrentVersion\Uninstall\TaPoard"
            )
        )
        {
            key.SetValue("DisplayName", Product);
            key.SetValue("DisplayVersion", Version);
            key.SetValue("Publisher", "TaPoard");
            key.SetValue("DisplayIcon", AppPath);
            key.SetValue("InstallLocation", InstallDirectory);
            key.SetValue("UninstallString", "\"" + installerCopy + "\" /uninstall");
            key.SetValue("NoModify", 1, RegistryValueKind.DWord);
            key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
        }
    }

    static void Uninstall()
    {
        if (
            MessageBox.Show(
                "TaPoardをアンインストールします。\n登録したボタンと接続設定も削除されます。",
                Product + " アンインストール",
                MessageBoxButtons.OKCancel,
                MessageBoxIcon.Warning
            ) != DialogResult.OK
        )
            return;
        StopInstalledApp();
        ConfigureFirewall("remove-firewall.ps1");
        string startFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), Product);
        TryDelete(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "TaPoard.lnk"));
        if (Directory.Exists(startFolder))
            Directory.Delete(startFolder, true);
        Registry.CurrentUser.DeleteSubKeyTree(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\TaPoard", false);
        SetAutoStart(false);
        string expected = Path.GetFullPath(
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), Product)
        );
        string actual = Path.GetFullPath(InstallDirectory);
        if (!String.Equals(expected, actual, StringComparison.OrdinalIgnoreCase))
            throw new Exception("削除先を確認できませんでした。");
        MessageBox.Show(
            "TaPoardを削除します。",
            Product + " アンインストール",
            MessageBoxButtons.OK,
            MessageBoxIcon.Information
        );
        Process.Start(
            new ProcessStartInfo("cmd.exe", "/c timeout /t 2 /nobreak >nul & rmdir /s /q \"" + actual + "\"")
            {
                CreateNoWindow = true,
                UseShellExecute = false,
                WindowStyle = ProcessWindowStyle.Hidden,
            }
        );
    }

    static void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path))
                File.Delete(path);
        }
        catch { }
    }

    static void Log(string text)
    {
        try
        {
            File.AppendAllText(LogPath, DateTime.Now.ToString("s") + " " + text + Environment.NewLine);
        }
        catch { }
    }
}


class InstallOptionsForm : Form
{
    readonly CheckBox desktop = new CheckBox(),
        startMenu = new CheckBox(),
        startup = new CheckBox(),
        firewall = new CheckBox();
    readonly Panel optionsPage = new Panel(),
        networkPage = new Panel();
    readonly Button next = new Button(),
        back = new Button(),
        install = new Button(),
        cancel = new Button();
    bool restoringFirewall;

    public bool DesktopShortcut
    {
        get { return desktop.Checked; }
    }
    public bool StartMenuShortcut
    {
        get { return startMenu.Checked; }
    }
    public bool StartWithWindows
    {
        get { return startup.Checked; }
    }
    public bool AllowFirewall
    {
        get { return firewall.Checked; }
    }

    public InstallOptionsForm(string installDirectory)
    {
        Text = "TaPoard セットアップ";
        ClientSize = new Size(540, 410);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        try
        {
            Icon = System.Drawing.Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location);
        }
        catch { }
        optionsPage.Bounds = networkPage.Bounds = new Rectangle(0, 0, 540, 350);
        Controls.Add(optionsPage);
        Controls.Add(networkPage);
        BuildOptionsPage(installDirectory);
        BuildNetworkPage();

        next.Text = "次へ";
        next.Bounds = new Rectangle(310, 360, 104, 34);
        next.Click += delegate { ShowPage(true); };
        back.Text = "戻る";
        back.Bounds = new Rectangle(198, 360, 104, 34);
        back.Click += delegate { ShowPage(false); };
        install.Text = "インストール";
        install.DialogResult = DialogResult.OK;
        install.Bounds = new Rectangle(310, 360, 104, 34);
        cancel.Text = "キャンセル";
        cancel.DialogResult = DialogResult.Cancel;
        cancel.Bounds = new Rectangle(424, 360, 92, 34);
        Controls.AddRange(new Control[] { next, back, install, cancel });
        CancelButton = cancel;
        ShowPage(false);
    }

    void ShowPage(bool network)
    {
        optionsPage.Visible = !network;
        networkPage.Visible = network;
        next.Visible = !network;
        back.Visible = network;
        install.Visible = network;
        AcceptButton = network ? install : next;
        (network ? install : next).Focus();
    }

    void BuildOptionsPage(string installDirectory)
    {
        var title = new Label
        {
            Text = "TaPoardをインストール",
            Font = new Font(SystemFonts.MessageBoxFont.FontFamily, 16, FontStyle.Bold),
            AutoSize = true,
            Location = new Point(24, 22),
        };
        optionsPage.Controls.Add(title);
        var path = new Label
        {
            Text = "インストール先: " + installDirectory,
            AutoEllipsis = true,
            Location = new Point(27, 62),
            Size = new Size(486, 35),
            ForeColor = Color.DimGray,
        };
        optionsPage.Controls.Add(path);
        string startFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "TaPoard"),
            desktopLink = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                "TaPoard.lnk"
            );
        desktop.Text = "デスクトップにショートカットを作成";
        desktop.AutoSize = true;
        desktop.Location = new Point(30, 108);
        desktop.Checked = File.Exists(desktopLink);
        optionsPage.Controls.Add(desktop);
        startMenu.Text = "スタートメニューに登録";
        startMenu.AutoSize = true;
        startMenu.Location = new Point(30, 142);
        startMenu.Checked = Directory.Exists(startFolder) || !Directory.Exists(installDirectory);
        optionsPage.Controls.Add(startMenu);
        startup.Text = "Windowsログイン時に自動起動";
        startup.AutoSize = true;
        startup.Location = new Point(30, 176);
        using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run"))
        {
            startup.Checked = key != null && key.GetValue("TaPoard") != null;
        }
        optionsPage.Controls.Add(startup);
        optionsPage.Controls.Add(new Label
        {
            Text = "自動起動ではブラウザを開かず、通知領域に常駐します。",
            AutoSize = true,
            Location = new Point(49, 202),
            ForeColor = Color.DimGray,
        });
        firewall.Text = "ファイアウォールで通信を許可する（おすすめ）";
        firewall.AutoSize = true;
        firewall.Location = new Point(30, 238);
        firewall.Checked = true;
        firewall.Font = new Font(SystemFonts.MessageBoxFont, FontStyle.Bold);
        firewall.CheckedChanged += delegate
        {
            if (restoringFirewall || firewall.Checked)
                return;
            var answer = MessageBox.Show(
                this,
                "ファイアウォールで許可しないと、スマートフォンから TaPoard につながりません。\n\nチェックを外してよろしいですか？\n（あとから PC の設定画面で許可を追加することもできます）",
                "TaPoard セットアップ",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning,
                MessageBoxDefaultButton.Button2
            );
            if (answer != DialogResult.Yes)
            {
                restoringFirewall = true;
                firewall.Checked = true;
                restoringFirewall = false;
            }
        };
        optionsPage.Controls.Add(firewall);
        optionsPage.Controls.Add(new Label
        {
            Text = "TaPoard だけが、同じルーターにつながったスマートフォンから通信を受け付けるようにします。\nWindows の管理者の確認が表示されます。",
            Location = new Point(49, 264),
            Size = new Size(470, 60),
            ForeColor = Color.DimGray,
        });
    }

    void BuildNetworkPage()
    {
        networkPage.Controls.Add(new Label
        {
            Text = "ネットワークの種類を確認してください",
            Font = new Font(SystemFonts.MessageBoxFont.FontFamily, 14, FontStyle.Bold),
            AutoSize = true,
            Location = new Point(24, 22),
        });
        string profile = NetworkProfile.Describe();
        networkPage.Controls.Add(new Label
        {
            Text = profile,
            Location = new Point(27, 60),
            Size = new Size(486, 40),
            ForeColor = profile.Contains("パブリック") ? Color.Firebrick : Color.DarkGreen,
            Font = new Font(SystemFonts.MessageBoxFont, FontStyle.Bold),
        });
        networkPage.Controls.Add(new Label
        {
            Text =
                "Windows のネットワークが「パブリック」になっていると、ファイアウォールを許可していてもスマートフォンからつながらないことがあります。自宅のルーターでは「プライベート」にしてください。\n\n"
                + "「プライベート」にする手順\n"
                + "1. Windows の「設定」→「ネットワークとインターネット」を開く\n"
                + "2. 使っている「Wi-Fi」または「イーサネット」を選び、つながっているネットワークを開く\n"
                + "3. 「ネットワーク プロファイルの種類」で「プライベート ネットワーク」を選ぶ\n\n"
                + "駅やお店などの Wi-Fi は「パブリック」のままにしてください。",
            Location = new Point(27, 104),
            Size = new Size(490, 196),
        });
        var open = new Button
        {
            Text = "Windows のネットワーク設定を開く",
            Bounds = new Rectangle(27, 304, 260, 32),
        };
        open.Click += delegate
        {
            try
            {
                Process.Start(new ProcessStartInfo("ms-settings:network-status") { UseShellExecute = true });
            }
            catch { }
        };
        networkPage.Controls.Add(open);
    }
}

// Reads the category of the connected networks (NLM_NETWORK_CATEGORY: 0 public, 1 private, 2 domain).
static class NetworkProfile
{
    internal static string Describe()
    {
        try
        {
            Type type = Type.GetTypeFromCLSID(new Guid("DCB00C01-570F-4A9B-8D69-199FDBA5723B"));
            object manager = Activator.CreateInstance(type);
            object list = type.InvokeMember("GetNetworks", BindingFlags.InvokeMethod, null, manager, new object[] { 1 });
            string publicNames = "",
                otherNames = "";
            foreach (object network in (System.Collections.IEnumerable)list)
            {
                Type t = network.GetType();
                int category = Convert.ToInt32(t.InvokeMember("GetCategory", BindingFlags.InvokeMethod, null, network, null));
                string name = Convert.ToString(t.InvokeMember("GetName", BindingFlags.InvokeMethod, null, network, null));
                if (category == 0)
                    publicNames += (publicNames.Length > 0 ? "、" : "") + name;
                else
                    otherNames += (otherNames.Length > 0 ? "、" : "") + name;
            }
            if (publicNames.Length > 0)
                return "いまのネットワーク（" + publicNames + "）は「パブリック」です。下の手順で「プライベート」にしてください。";
            if (otherNames.Length > 0)
                return "いまのネットワーク（" + otherNames + "）は「パブリック」ではありません。このままで使えます。";
            return "ネットワークにつながっていないか、種類を確認できませんでした。";
        }
        catch
        {
            return "ネットワークの種類を確認できませんでした。";
        }
    }
}