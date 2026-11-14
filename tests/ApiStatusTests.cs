using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;

public static class ApiStatusTests
{
    static void Assert(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }

    static void Set(string name, object value)
    {
        if (name == "config") { Program.State.Config = (Settings)value; return; }
        typeof(Program).GetField(name, BindingFlags.Static | BindingFlags.NonPublic).SetValue(null, value);
    }

    static int Request(string method, string path, string token, string body)
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        int port = ((IPEndPoint)listener.LocalEndpoint).Port;
        Exception failure = null;
        var server = new Thread(
            delegate()
            {
                try
                {
                    TcpClient client = listener.AcceptTcpClient();
                    typeof(Program).GetMethod("Handle", BindingFlags.NonPublic | BindingFlags.Static).Invoke(null, new object[] { client });
                }
                catch (Exception e) { failure = e; }
                finally { listener.Stop(); }
            }
        );
        server.IsBackground = true;
        server.Start();

        string responseText;
        using (var client = new TcpClient())
        {
            client.ReceiveTimeout = 10000;
            client.SendTimeout = 10000;
            client.Connect(IPAddress.Loopback, port);
            byte[] bodyBytes = body == null ? new byte[0] : Encoding.UTF8.GetBytes(body);
            string headers = method + " " + path + " HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n";
            if (token != null) headers += "Authorization: Bearer " + token + "\r\n";
            if (body != null) headers += "Content-Type: application/json\r\nContent-Length: " + bodyBytes.Length + "\r\n";
            byte[] headerBytes = Encoding.ASCII.GetBytes(headers + "\r\n");
            NetworkStream stream = client.GetStream();
            stream.Write(headerBytes, 0, headerBytes.Length);
            if (bodyBytes.Length > 0) stream.Write(bodyBytes, 0, bodyBytes.Length);
            using (var reader = new StreamReader(stream, Encoding.UTF8)) responseText = reader.ReadToEnd();
        }
        if (!server.Join(12000)) throw new Exception("Test server timeout");
        if (failure != null) throw failure;
        string firstLine = responseText.Split(new[] { "\r\n" }, StringSplitOptions.None)[0];
        return Convert.ToInt32(firstLine.Split(' ')[1]);
    }

    static void Check(string method, string path, string token, string body, int expected)
    {
        int actual = Request(method, path, token, body);
        Assert(actual == expected, method + " " + path + " expected " + expected + ", got " + actual);
        Console.WriteLine("PASS " + method + " " + path + " (" + actual + ")");
    }

    public static int Main()
    {
        try
        {
            Set(
                "config",
                new Settings
                {
                    schemaVersion = 2,
                    token = "phone-token",
                    pairingKey = "short-token",
                    apps = new List<AppEntry>(),
                    devices = new List<PairedDevice>(),
                }
            );
            Set("admin", "admin-token");
            Program.UseStore(new FakeSettingsStore());

            Check("GET", "/api/state", null, null, 401);
            Check("GET", "/api/ping", "phone-token", null, 200);
            Check("GET", "/api/settings", "phone-token", null, 404);
            Check("POST", "/api/rotate", "phone-token", "{}", 403);
            Check("PUT", "/api/ping", "phone-token", null, 404);
            Check("GET", "/api/nothing", "phone-token", null, 404);
            Check("POST", "/api/nothing", "phone-token", "{}", 403);
            Check("GET", "/api/presets", "admin-token", null, 200);

            Console.WriteLine("PASS ApiStatusTests");
            return 0;
        }
        catch (Exception e)
        {
            Console.Error.WriteLine(e);
            return 1;
        }
    }
}
