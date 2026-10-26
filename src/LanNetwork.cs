using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

class NetworkOptions
{
    public string interfaceId { get; set; }
    public string hostName { get; set; }
    public string legacyHostName { get; set; }
}

sealed class LanNetwork : IDisposable
{
    readonly object gate = new object();
    readonly NetworkOptions options;
    readonly Timer changeTimer;
    UdpClient udp;
    bool disposed;
    int diagnosticCount;

    void Diagnostic(string text)
    {
        if (diagnosticCount++ >= 20)
            return;
        try
        {
            File.AppendAllText(
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "mdns-diagnostic.log"),
                DateTime.Now.ToString("s") + " " + text + Environment.NewLine
            );
        }
        catch { }
    }

    IPAddress address,
        mask;
    public string Status { get; private set; }
    public string HostName
    {
        get { return options.hostName; }
    }
    static readonly IPAddress Group = IPAddress.Parse("224.0.0.251");

    public LanNetwork(string file)
    {
        if (File.Exists(file))
            options = new JavaScriptSerializer().Deserialize<NetworkOptions>(File.ReadAllText(file));
        else
        {
            foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
                if (
                    nic.OperationalStatus == OperationalStatus.Up
                    && nic.GetIPProperties().GatewayAddresses.Count > 0
                    && (
                        nic.NetworkInterfaceType == NetworkInterfaceType.Ethernet
                        || nic.NetworkInterfaceType == NetworkInterfaceType.Wireless80211
                    )
                )
                {
                    foreach (var a in nic.GetIPProperties().UnicastAddresses)
                        if (Private(a.Address))
                        {
                            options = new NetworkOptions
                            {
                                interfaceId = nic.Id,
                                hostName = "tapoard-" + Guid.NewGuid().ToString("N").Substring(0, 10) + ".local",
                            };
                            break;
                        }
                    if (options != null)
                        break;
                }
            if (options == null)
                throw new Exception("接続中の家庭内LANが見つかりません。");
            File.WriteAllText(file, new JavaScriptSerializer().Serialize(options));
        }
        if (
            options != null
            && options.hostName != null
            && options.hostName.StartsWith("streamdeck-", StringComparison.OrdinalIgnoreCase)
        )
        {
            options.legacyHostName = options.hostName;
            options.hostName = "tapoard-" + options.hostName.Substring("streamdeck-".Length);
            File.WriteAllText(file, new JavaScriptSerializer().Serialize(options));
        }
        if (
            options == null
            || String.IsNullOrEmpty(options.interfaceId)
            || String.IsNullOrEmpty(options.hostName)
            || !ValidHost(options.hostName)
            || (!String.IsNullOrEmpty(options.legacyHostName) && !ValidHost(options.legacyHostName))
        )
            throw new Exception("network.jsonの設定が不正です。");
        changeTimer = new Timer(
            delegate
            {
                Refresh();
            },
            null,
            Timeout.Infinite,
            Timeout.Infinite
        );
        NetworkChange.NetworkAddressChanged += Changed;
        Refresh();
    }

    static bool ValidHost(string host)
    {
        return System.Text.RegularExpressions.Regex.IsMatch(host, @"^[a-z0-9][a-z0-9-]{0,60}\.local$");
    }

    static bool Private(IPAddress ip)
    {
        byte[] b = ip.GetAddressBytes();
        return b.Length == 4
            && (b[0] == 10 || (b[0] == 172 && b[1] >= 16 && b[1] <= 31) || (b[0] == 192 && b[1] == 168));
    }

    void Changed(object sender, EventArgs e)
    {
        lock (gate)
            if (!disposed)
                changeTimer.Change(1000, Timeout.Infinite);
    }

    void Refresh()
    {
        lock (gate)
        {
            if (disposed)
                return;
            IPAddress next = null,
                nextMask = null;
            try
            {
                foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
                    if (nic.Id == options.interfaceId && nic.OperationalStatus == OperationalStatus.Up)
                        foreach (var a in nic.GetIPProperties().UnicastAddresses)
                            if (Private(a.Address))
                            {
                                next = a.Address;
                                nextMask = a.IPv4Mask;
                                break;
                            }
                if (Object.Equals(address, next) && Object.Equals(mask, nextMask) && udp != null)
                    return;
                if (udp != null)
                {
                    try
                    {
                        Send(udp, BuildAnswer(HostName, address, 0, null), new IPEndPoint(Group, 5353));
                        if (!String.IsNullOrEmpty(options.legacyHostName))
                            Send(
                                udp,
                                BuildAnswer(options.legacyHostName, address, 0, null),
                                new IPEndPoint(Group, 5353)
                            );
                    }
                    catch { }
                    udp.Close();
                    udp = null;
                }
                address = next;
                mask = nextMask;
                if (address == null)
                {
                    Status = "LAN未接続。再接続すると自動復旧します。";
                    return;
                }
                udp = new UdpClient(AddressFamily.InterNetwork);
                udp.ExclusiveAddressUse = false;
                udp.Client.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
                udp.Client.Bind(new IPEndPoint(IPAddress.Any, 5353));
                udp.JoinMulticastGroup(Group, address);
                udp.Client.SetSocketOption(
                    SocketOptionLevel.IP,
                    SocketOptionName.MulticastInterface,
                    address.GetAddressBytes()
                );
                udp.Ttl = 255;
                udp.Client.SetSocketOption(SocketOptionLevel.IP, SocketOptionName.MulticastTimeToLive, 255);
                udp.MulticastLoopback = true;
                udp.BeginReceive(Receive, udp);
                Send(udp, BuildAnswer(HostName, address, 120, null), new IPEndPoint(Group, 5353));
                if (!String.IsNullOrEmpty(options.legacyHostName))
                    Send(udp, BuildAnswer(options.legacyHostName, address, 120, null), new IPEndPoint(Group, 5353));
                Status = "同じLAN内から接続できます。IP変更は自動反映されます。";
            }
            catch (Exception e)
            {
                if (udp != null)
                {
                    udp.Close();
                    udp = null;
                }
                Status = "名前での接続を開始できません。IPのURLを使用してください。 " + e.Message;
            }
        }
    }

    public bool Allows(IPAddress remote, IPAddress local)
    {
        lock (gate)
        {
            return address != null && address.Equals(local) && SameSubnet(remote, address, mask);
        }
    }

    internal static bool SameSubnet(IPAddress a, IPAddress b, IPAddress m)
    {
        if (a == null || b == null || m == null)
            return false;
        byte[] x = a.GetAddressBytes(),
            y = b.GetAddressBytes(),
            z = m.GetAddressBytes();
        if (x.Length != 4 || y.Length != 4 || z.Length != 4)
            return false;
        for (int i = 0; i < 4; i++)
            if ((x[i] & z[i]) != (y[i] & z[i]))
                return false;
        return true;
    }

    public string[] Urls(int port)
    {
        lock (gate)
            return address == null ? new string[0] : new[] { "http://" + address + ":" + port + "/" };
    }

    void Receive(IAsyncResult ar)
    {
        var socket = (UdpClient)ar.AsyncState;
        try
        {
            var from = new IPEndPoint(IPAddress.Any, 0);
            byte[] packet = socket.EndReceive(ar, ref from);
            lock (gate)
            {
                if (disposed || socket != udp)
                    return;
                if (SameSubnet(from.Address, address, mask))
                {
                    bool unicast;
                    byte[] question;
                    string matched = HostName;
                    bool found = Matches(packet, matched, out unicast, out question);
                    if (!found && !String.IsNullOrEmpty(options.legacyHostName))
                    {
                        matched = options.legacyHostName;
                        found = Matches(packet, matched, out unicast, out question);
                    }
                    if (found)
                    {
                        bool legacy = from.Port != 5353;
                        byte[] answer = BuildAnswer(matched, address, legacy ? 10 : 120, legacy ? question : null);
                        if (legacy)
                        {
                            answer[0] = packet[0];
                            answer[1] = packet[1];
                        }
                        var destination = legacy || unicast ? from : new IPEndPoint(Group, 5353);
                        Diagnostic("Query from " + from + " -> " + destination);
                        Send(socket, answer, destination);
                        Diagnostic("Response sent");
                    }
                }
            }
        }
        catch (SocketException) { }
        catch (ObjectDisposedException) { }
        catch (FormatException) { }
        catch (IndexOutOfRangeException) { }
        finally
        {
            lock (gate)
                if (!disposed && socket == udp)
                    try
                    {
                        socket.BeginReceive(Receive, socket);
                    }
                    catch (ObjectDisposedException) { }
                    catch (SocketException) { }
        }
    }

    static void Send(UdpClient client, byte[] bytes, IPEndPoint to)
    {
        client.Send(bytes, bytes.Length, to);
    }

    static int U16(byte[] p, int i)
    {
        if (i + 1 >= p.Length)
            throw new FormatException();
        return (p[i] << 8) | p[i + 1];
    }

    static string Name(byte[] p, ref int index)
    {
        int at = index,
            hops = 0;
        bool jumped = false;
        var parts = new List<string>();
        while (true)
        {
            if (at >= p.Length || ++hops > 128)
                throw new FormatException();
            int n = p[at++];
            if (n == 0)
            {
                if (!jumped)
                    index = at;
                return String.Join(".", parts);
            }
            if ((n & 192) == 192)
            {
                if (at >= p.Length)
                    throw new FormatException();
                int dest = ((n & 63) << 8) | p[at++];
                if (!jumped)
                    index = at;
                jumped = true;
                at = dest;
                continue;
            }
            if (n > 63 || at + n > p.Length)
                throw new FormatException();
            parts.Add(Encoding.ASCII.GetString(p, at, n));
            at += n;
        }
    }

    internal static bool Matches(byte[] p, string host, out bool unicast, out byte[] question)
    {
        unicast = false;
        question = null;
        if (p.Length < 12 || (p[2] & 128) != 0)
            return false;
        int count = U16(p, 4),
            at = 12;
        if (count > 64)
            return false;
        for (int i = 0; i < count; i++)
        {
            string name = Name(p, ref at);
            int type = U16(p, at),
                cls = U16(p, at + 2);
            at += 4;
            if (
                name.Equals(host, StringComparison.OrdinalIgnoreCase)
                && (type == 1 || type == 255)
                && (cls & 32767) == 1
            )
            {
                unicast = (cls & 32768) != 0;
                var q = new List<byte>();
                WriteName(q, host);
                Word(q, type);
                Word(q, 1);
                question = q.ToArray();
                return true;
            }
        }
        return false;
    }

    static void Word(List<byte> b, int n)
    {
        b.Add((byte)(n >> 8));
        b.Add((byte)n);
    }

    static void WriteName(List<byte> b, string name)
    {
        foreach (string label in name.Split('.'))
        {
            b.Add((byte)label.Length);
            b.AddRange(Encoding.ASCII.GetBytes(label));
        }
        b.Add(0);
    }

    internal static byte[] BuildAnswer(string host, IPAddress ip, int ttl, byte[] question)
    {
        var b = new List<byte>();
        Word(b, 0);
        Word(b, 0x8400);
        Word(b, question == null ? 0 : 1);
        Word(b, 1);
        Word(b, 0);
        Word(b, 0);
        if (question != null)
            b.AddRange(question);
        WriteName(b, host);
        Word(b, 1);
        Word(b, question == null ? 0x8001 : 1);
        Word(b, ttl >> 16);
        Word(b, ttl);
        Word(b, 4);
        b.AddRange(ip.GetAddressBytes());
        return b.ToArray();
    }

    public void Dispose()
    {
        lock (gate)
        {
            disposed = true;
            NetworkChange.NetworkAddressChanged -= Changed;
            changeTimer.Dispose();
            if (udp != null)
            {
                try
                {
                    Send(udp, BuildAnswer(HostName, address, 0, null), new IPEndPoint(Group, 5353));
                    if (!String.IsNullOrEmpty(options.legacyHostName))
                        Send(udp, BuildAnswer(options.legacyHostName, address, 0, null), new IPEndPoint(Group, 5353));
                }
                catch { }
                udp.Close();
                udp = null;
            }
        }
    }
}
