using System;
using System.Collections.Generic;
using System.Globalization;

static class InstallerText
{
    internal static readonly Dictionary<string, string> Ja = new Dictionary<string, string>
    {
        { "setup", "TaPoard セットアップ" },
        { "uninstall", "TaPoard アンインストール" },
        { "log", "ログ: {0}" },
        { "startFailed", "TaPoardを起動できなかったため、LAN設定を開始できませんでした。\n\nほかの場所でTaPoardが起動していないか確認し、セットアップをもう一度実行してください。\n\nログ: {0}" },
        { "doneNoFirewall", "インストールが完了しました。\n\nファイアウォールの許可は追加していないため、スマートフォンからつながらない場合があります。あとから PC の設定画面で許可を追加できます。" },
        { "done", "インストールが完了しました。\n\nPCのブラウザに表示されたQRコードをスマートフォンで読み取ってください。" },
        { "adminCancelled", "アプリのインストールは完了しました。\n\nWindowsの管理者確認がキャンセルされたため、LAN接続設定は未完了です。セットアップをもう一度実行してください。" },
        { "lanFailed", "アプリのインストールは完了しましたが、LAN接続設定でエラーが発生しました。\n\nログを確認してセットアップをもう一度実行してください。\n\nログ: {0}" },
        { "updateFailed", "インストール用ファイルを更新できませんでした。セットアップ画面を閉じて、もう一度実行してください。" },
        { "payloadMissing", "インストールデータが見つかりません。" },
        { "payloadInvalid", "不正なインストールデータです。" },
        { "uninstallLink", "TaPoardをアンインストール.lnk" },
        { "uninstallConfirm", "TaPoardをアンインストールします。\n登録したボタンと接続設定も削除されます。" },
        { "deleteInvalid", "削除先を確認できませんでした。" },
        { "deleting", "TaPoardを削除します。" },
        { "next", "次へ" }, { "back", "戻る" }, { "install", "インストール" }, { "cancel", "キャンセル" },
        { "installTitle", "TaPoardをインストール" }, { "destination", "インストール先: {0}" },
        { "desktop", "デスクトップにショートカットを作成" }, { "startMenu", "スタートメニューに登録" },
        { "startup", "Windowsログイン時に自動起動" },
        { "startupNote", "自動起動ではブラウザを開かず、通知領域に常駐します。" },
        { "firewall", "ファイアウォールで通信を許可する（おすすめ）" },
        { "firewallConfirm", "許可しないと phone から TaPoard につながりません。\n\nチェックを外しますか？" },
        { "firewallNote", "同じルーターにつながった phone から TaPoard だけに接続できるようにします。\nWindows の管理者確認が表示されます。" },
        { "networkTitle", "ネットワークの種類を確認してください" },
        { "networkGuide", "自宅のネットワークが「パブリック」の場合は Windows の設定で「プライベート」にしてください。駅やお店の Wi-Fi は「パブリック」のままにしてください。" },
        { "openNetwork", "Windows のネットワーク設定を開く" },
        { "publicProfile", "いまのネットワーク（{0}）は「パブリック」です。下の手順で「プライベート」にしてください。" },
        { "otherProfile", "いまのネットワーク（{0}）は「パブリック」ではありません。このままで使えます。" },
        { "noProfile", "ネットワークにつながっていないか、種類を確認できませんでした。" },
        { "profileFailed", "ネットワークの種類を確認できませんでした。" },
        { "publicWord", "パブリック" }, { "separator", "、" },
    };

    internal static readonly Dictionary<string, string> En = new Dictionary<string, string>
    {
        { "setup", "TaPoard Setup" }, { "uninstall", "Uninstall TaPoard" }, { "log", "Log: {0}" },
        { "startFailed", "TaPoard could not start, so LAN setup did not begin. Close other copies and run setup again.\n\nLog: {0}" },
        { "doneNoFirewall", "Installation is complete.\n\nFirewall access was not added, so the phone may not connect. You can allow it later in PC settings." },
        { "done", "Installation is complete.\n\nScan the QR code in the PC browser with your phone." },
        { "adminCancelled", "The app was installed, but LAN setup is incomplete because the administrator prompt was cancelled. Run setup again." },
        { "lanFailed", "The app was installed, but LAN setup failed. Check the log and run setup again.\n\nLog: {0}" },
        { "updateFailed", "The installer files could not be updated. Close all setup windows and try again." },
        { "payloadMissing", "Installation data was not found." }, { "payloadInvalid", "Installation data is invalid." },
        { "uninstallLink", "Uninstall TaPoard.lnk" },
        { "uninstallConfirm", "Uninstall TaPoard?\nSaved buttons and connection settings will also be removed." },
        { "deleteInvalid", "The removal location could not be verified." }, { "deleting", "TaPoard will be removed." },
        { "next", "Next" }, { "back", "Back" }, { "install", "Install" }, { "cancel", "Cancel" },
        { "installTitle", "Install TaPoard" }, { "destination", "Install to: {0}" },
        { "desktop", "Create a desktop shortcut" }, { "startMenu", "Add to the Start menu" },
        { "startup", "Start when I sign in to Windows" },
        { "startupNote", "Automatic startup stays in the notification area without opening a browser." },
        { "firewall", "Allow firewall access (recommended)" },
        { "firewallConfirm", "Without access, your phone cannot connect to TaPoard.\n\nTurn this option off?" },
        { "firewallNote", "Only TaPoard will accept connections from phones on the same router.\nWindows will ask for administrator approval." },
        { "networkTitle", "Check the network type" },
        { "networkGuide", "For a home network, change a Public profile to Private in Windows Settings. Keep public Wi-Fi set to Public." },
        { "openNetwork", "Open Windows network settings" },
        { "publicProfile", "The current network ({0}) is Public. Change it to Private using the steps below." },
        { "otherProfile", "The current network ({0}) is not Public. You can continue." },
        { "noProfile", "No network is connected, or its type could not be read." },
        { "profileFailed", "The network type could not be read." }, { "publicWord", "Public" }, { "separator", ", " },
    };

    static Dictionary<string, string> Current
    {
        get { return CultureInfo.CurrentUICulture.Name.StartsWith("ja", StringComparison.OrdinalIgnoreCase) ? Ja : En; }
    }

    internal static string Get(string key, params object[] values)
    {
        string value;
        if (!Current.TryGetValue(key, out value) && !En.TryGetValue(key, out value)) return key;
        return values.Length == 0 ? value : String.Format(CultureInfo.CurrentCulture, value, values);
    }
}
