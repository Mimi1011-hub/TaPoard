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
        { "doneNoFirewall", "インストールが完了しました。\n\nファイアウォールの許可は追加していないため、スマートフォンからつながらない場合があります。あとから許可するときは、PC の設定画面の「接続」から追加できます。" },
        { "done", "インストールが完了しました。\n\nPCのブラウザに表示されたQRコードをスマートフォンで読み取ってください。" },
        { "adminCancelled", "アプリのインストールは完了しました。\n\nWindowsの管理者確認がキャンセルされたため、LAN接続設定は未完了です。セットアップをもう一度実行してください。" },
        { "lanFailed", "アプリのインストールは完了しましたが、LAN接続設定でエラーが発生しました。\n\nログを確認してセットアップをもう一度実行してください。\n\nログ: {0}" },
        { "updateFailed", "インストール用ファイルを更新できませんでした。TaPoardのセットアップ画面をすべて閉じ、ウイルス対策ソフトの検査が終わってから、もう一度実行してください。" },
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
        { "firewallConfirm", "ファイアウォールで許可しないと、スマートフォンから TaPoard につながりません。\n\nチェックを外してよろしいですか？\n（あとから PC の設定画面で許可を追加することもできます）" },
        { "firewallNote", "TaPoard だけが、同じルーターにつながったスマートフォンから通信を受け付けるようにします。\nWindows の管理者の確認が表示されます。" },
        { "networkTitle", "ネットワークの種類を確認してください" },
        { "networkGuide", "Windows のネットワークが「パブリック」になっていると、ファイアウォールを許可していてもスマートフォンからつながらないことがあります。自宅のルーターでは「プライベート」にしてください。\n\n「プライベート」にする手順\n1. Windows の「設定」→「ネットワークとインターネット」を開く\n2. 使っている「Wi-Fi」または「イーサネット」を選び、つながっているネットワークを開く\n3. 「ネットワーク プロファイルの種類」で「プライベート ネットワーク」を選ぶ\n\n駅やお店などの Wi-Fi は「パブリック」のままにしてください。" },
        { "openNetwork", "Windows のネットワーク設定を開く" },
        { "publicProfile", "いまのネットワーク（{0}）は「パブリック」です。下の手順で「プライベート」にしてください。" },
        { "otherProfile", "いまのネットワーク（{0}）は「パブリック」ではありません。このままで使えます。" },
        { "noProfile", "ネットワークにつながっていないか、種類を確認できませんでした。" },
        { "profileFailed", "ネットワークの種類を確認できませんでした。" },
        { "separator", "、" },
    };

    internal static readonly Dictionary<string, string> En = new Dictionary<string, string>
    {
        { "setup", "TaPoard Setup" }, { "uninstall", "Uninstall TaPoard" }, { "log", "Log: {0}" },
        { "startFailed", "TaPoard could not start, so network setup did not begin.\n\nCheck that no other copy of TaPoard is running, then run setup again.\n\nLog: {0}" },
        { "doneNoFirewall", "Installation is complete.\n\nNo firewall rule was added, so your phone may not be able to connect. You can add it later under Connection in Settings on the PC." },
        { "done", "Installation is complete.\n\nScan the QR code shown on the PC with your phone." },
        { "adminCancelled", "The app was installed.\n\nThe Windows administrator prompt was canceled, so network setup is not finished. Run setup again." },
        { "lanFailed", "The app was installed, but network setup failed.\n\nCheck the log and run setup again.\n\nLog: {0}" },
        { "updateFailed", "The installer files could not be updated. Close every TaPoard setup window, wait for your antivirus scan to finish, and run setup again." },
        { "payloadMissing", "The installation data was not found." }, { "payloadInvalid", "The installation data is not valid." },
        { "uninstallLink", "Uninstall TaPoard.lnk" },
        { "uninstallConfirm", "Uninstall TaPoard?\nYour buttons and connection settings will also be deleted." },
        { "deleteInvalid", "Could not confirm the folder to remove." }, { "deleting", "TaPoard will be removed." },
        { "next", "Next" }, { "back", "Back" }, { "install", "Install" }, { "cancel", "Cancel" },
        { "installTitle", "Install TaPoard" }, { "destination", "Install to: {0}" },
        { "desktop", "Create a desktop shortcut" }, { "startMenu", "Add to the Start menu" },
        { "startup", "Start automatically when I sign in to Windows" },
        { "startupNote", "When started automatically, TaPoard stays in the notification area and does not open a browser." },
        { "firewall", "Allow TaPoard through the firewall (recommended)" },
        { "firewallConfirm", "Without the firewall rule, your phone cannot connect to TaPoard.\n\nTurn this option off?\n(You can add the rule later in Settings on the PC.)" },
        { "firewallNote", "Lets only TaPoard accept connections from phones on the same router.\nWindows will ask for administrator approval." },
        { "networkTitle", "Check the network type" },
        { "networkGuide", "If Windows treats your network as Public, your phone may not connect even with the firewall rule. On your home router, set it to Private.\n\nTo set it to Private\n1. Open Windows Settings > Network & internet\n2. Select Wi-Fi or Ethernet, then open the network you are connected to\n3. Under Network profile type, choose Private network\n\nKeep Wi-Fi at stations, shops and other public places set to Public." },
        { "openNetwork", "Open Windows network settings" },
        { "publicProfile", "Your current network ({0}) is set to Public. Follow the steps below to set it to Private." },
        { "otherProfile", "Your current network ({0}) is not set to Public. You can use it as it is." },
        { "noProfile", "No network is connected, or its type could not be checked." },
        { "profileFailed", "The network type could not be checked." }, { "separator", ", " },
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
