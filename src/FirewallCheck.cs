using System;
using System.Collections;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading;

// 3.0: explains why a phone cannot connect and re-adds the TaPoard firewall rules on request.
// Reading needs no administrator rights; the repair runs setup-lan.ps1 behind the UAC prompt.
static class FirewallCheck
{
    static readonly object Sync = new object();
    static string repairState = "idle"; // idle, running, done, cancelled, failed
    static string repairMessage = "";

    internal static object Status(string root)
    {
        string profile = "unknown",
            networks = "";
        try
        {
            ReadNetworks(out profile, out networks);
        }
        catch { }
        bool http = false,
            mdns = false,
            shieldsUp = false,
            checkedRules = false;
        int blocked = 0;
        try
        {
            ReadRules(Path.GetFullPath(Path.Combine(root, "TaPoard.exe")), out http, out mdns, out blocked, out shieldsUp);
            checkedRules = true;
        }
        catch { }
        lock (Sync)
            return new
            {
                profile = profile,
                networks = networks,
                rulesChecked = checkedRules,
                httpRule = http,
                mdnsRule = mdns,
                blockRules = blocked,
                blockAllInbound = shieldsUp,
                scriptAvailable = File.Exists(Path.Combine(root, "setup-lan.ps1")),
                repair = repairState,
                repairMessage = repairMessage,
            };
    }

    internal static void StartRepair(string root)
    {
        string script = Path.Combine(root, "setup-lan.ps1");
        if (!File.Exists(script))
            throw new Exception("許可を追加するスクリプトがありません。インストール版の TaPoard で実行してください。");
        lock (Sync)
        {
            if (repairState == "running")
                return;
            repairState = "running";
            repairMessage = "Windows の確認画面で「はい」を押してください。";
        }
        var t = new Thread(
            delegate()
            {
                string state,
                    message;
                try
                {
                    var start = new ProcessStartInfo(
                        "powershell.exe",
                        "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + script + "\""
                    )
                    {
                        UseShellExecute = true,
                        Verb = "runas",
                        WorkingDirectory = root,
                        WindowStyle = ProcessWindowStyle.Hidden,
                    };
                    using (Process p = Process.Start(start))
                    {
                        p.WaitForExit();
                        if (p.ExitCode == 0)
                        {
                            state = "done";
                            message = "TaPoard の通信を許可し直しました。";
                        }
                        else
                        {
                            state = "failed";
                            message = "許可を追加できませんでした。詳しくは %TEMP%\\TaPoard-install.log を確認してください。";
                        }
                    }
                }
                catch (System.ComponentModel.Win32Exception e)
                {
                    state = e.NativeErrorCode == 1223 ? "cancelled" : "failed";
                    message = e.NativeErrorCode == 1223 ? "管理者の確認がキャンセルされました。" : "許可を追加できませんでした：" + e.Message;
                }
                catch (Exception e)
                {
                    state = "failed";
                    message = "許可を追加できませんでした：" + e.Message;
                }
                lock (Sync)
                {
                    repairState = state;
                    repairMessage = message;
                }
            }
        );
        t.IsBackground = true;
        t.Start();
    }

    // NLM_NETWORK_CATEGORY: 0 public, 1 private, 2 domain. Any connected public network wins,
    // because that is the one that blocks phones.
    static void ReadNetworks(out string profile, out string names)
    {
        profile = "unknown";
        names = "";
        Type type = Type.GetTypeFromCLSID(new Guid("DCB00C01-570F-4A9B-8D69-199FDBA5723B"));
        object manager = Activator.CreateInstance(type);
        object list = Call(manager, "GetNetworks", 1);
        bool sawPrivate = false,
            sawDomain = false,
            sawPublic = false;
        foreach (object network in (IEnumerable)list)
        {
            int category = Convert.ToInt32(Call(network, "GetCategory"));
            string name = Convert.ToString(Call(network, "GetName"));
            names += (names.Length > 0 ? "、" : "") + name;
            if (category == 0) sawPublic = true;
            else if (category == 1) sawPrivate = true;
            else if (category == 2) sawDomain = true;
        }
        profile = sawPublic ? "public" : sawPrivate ? "private" : sawDomain ? "domain" : "unknown";
    }

    static void ReadRules(string program, out bool http, out bool mdns, out int blocked, out bool blockAll)
    {
        http = mdns = blockAll = false;
        blocked = 0;
        Type type = Type.GetTypeFromProgID("HNetCfg.FwPolicy2");
        object policy = Activator.CreateInstance(type);
        // NET_FW_PROFILE2_PUBLIC = 4
        blockAll = Convert.ToBoolean(type.InvokeMember("BlockAllInboundTraffic", BindingFlags.GetProperty, null, policy, new object[] { 4 }));
        object rules = Get(policy, "Rules");
        foreach (object rule in (IEnumerable)rules)
        {
            string name = Convert.ToString(Get(rule, "Name"));
            bool enabled = Convert.ToBoolean(Get(rule, "Enabled"));
            if (!enabled)
                continue;
            if (name == "TaPoard-LAN-HTTP")
                http = true;
            else if (name == "TaPoard-LAN-mDNS")
                mdns = true;
            int direction = Convert.ToInt32(Get(rule, "Direction")),
                action = Convert.ToInt32(Get(rule, "Action"));
            if (direction == 1 && action == 0)
            {
                string app = Convert.ToString(Get(rule, "ApplicationName"));
                if (!String.IsNullOrEmpty(app) && String.Equals(Environment.ExpandEnvironmentVariables(app), program, StringComparison.OrdinalIgnoreCase))
                    blocked++;
            }
        }
    }

    static object Call(object target, string method, params object[] args)
    {
        return target.GetType().InvokeMember(method, BindingFlags.InvokeMethod, null, target, args);
    }

    static object Get(object target, string property)
    {
        return target.GetType().InvokeMember(property, BindingFlags.GetProperty, null, target, null);
    }
}
