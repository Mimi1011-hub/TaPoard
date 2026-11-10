using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

// Minimal HTTP/1.1 server: one request per connection, then close.
partial class Program
{
    const string JsonType = "application/json";
    const string ContentSecurityPolicy =
        "default-src 'self'; style-src 'self'; img-src 'self' data:; media-src data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'";

    // Files under web\ that are served without authentication.
    static readonly HashSet<string> PublicFiles = new HashSet<string>
    {
        "/",
        "/settings",
        "/pc-window",
        "/pc-window.js",
        "/app.js",
        "/qrcode.js",
        "/nosleep.min.js",
        "/style.css",
        "/manifest.webmanifest",
        "/icon-32.png",
        "/icon-180.png",
        "/icon-192.png",
        "/icon-512.png",
    };

    sealed class Request
    {
        internal Stream stream;
        internal string method;
        internal string target; // path including the query string
        internal string path;
        internal Dictionary<string, string> headers;
        internal IPAddress remote;
        internal bool local; // from this PC
        internal string auth;
        internal bool isAdmin; // the PC settings page
        internal bool allowed; // any paired phone or the settings page
    }

    static void Accept(TcpListener listener)
    {
        try
        {
            while (true)
            {
                var c = listener.AcceptTcpClient();
                var remote = ((IPEndPoint)c.Client.RemoteEndPoint).Address;
                var local = ((IPEndPoint)c.Client.LocalEndPoint).Address;
                if (!IPAddress.IsLoopback(remote) && !lan.Allows(remote, local))
                {
                    c.Close();
                    continue;
                }
                ThreadPool.QueueUserWorkItem(
                    delegate
                    {
                        Handle(c);
                    }
                );
            }
        }
        catch (SocketException) { }
        catch (ObjectDisposedException) { }
    }

    static void Handle(TcpClient c)
    {
        using (c)
        {
            c.ReceiveTimeout = 4000;
            c.SendTimeout = 4000;
            try
            {
                var r = ReadRequest(c);
                if (r == null)
                    return;
                if (r.method == "GET" && PublicFiles.Contains(r.path))
                {
                    ServeFile(r.stream, r.path);
                    return;
                }
                Authenticate(r);
                Route(r);
            }
            catch (Exception e)
            {
                try
                {
                    ReplyJson(c.GetStream(), 400, new { error = e.Message });
                }
                catch { }
            }
        }
    }

    // Reads the request line and headers. Returns null for a malformed request line.
    static Request ReadRequest(TcpClient c)
    {
        var s = c.GetStream();
        string[] req = Line(s).Split(' ');
        if (req.Length != 3)
            return null;
        var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        string line;
        int total = 0;
        while ((line = Line(s)) != "")
        {
            total += line.Length;
            if (total > 16384)
                throw new Exception();
            int i = line.IndexOf(':');
            if (i > 0)
                headers[line.Substring(0, i)] = line.Substring(i + 1).Trim();
        }
        var remote = ((IPEndPoint)c.Client.RemoteEndPoint).Address;
        return new Request
        {
            stream = s,
            method = req[0],
            target = req[1],
            path = req[1].Split('?')[0],
            headers = headers,
            remote = remote,
            local = IPAddress.IsLoopback(remote),
        };
    }

    static void Authenticate(Request r)
    {
        r.headers.TryGetValue("Authorization", out r.auth);
        r.isAdmin = r.local && r.auth == "Bearer " + admin;
        lock (Gate)
            r.allowed =
                r.isAdmin
                || r.auth == "Bearer " + config.token
                || r.auth == "Bearer " + config.pairingKey
                || Pairing.Authorized(config, r.auth);
    }

    static void ServeFile(Stream s, string path)
    {
        string file =
            path == "/" || path == "/settings" ? "index.html"
            : path == "/pc-window" ? "pc-window.html"
            : path.Substring(1);
        string type =
            file.EndsWith("js") ? "application/javascript"
            : file.EndsWith("css") ? "text/css"
            : file.EndsWith("webmanifest") ? "application/manifest+json"
            : file.EndsWith("png") ? "image/png"
            : "text/html";
        if (type == "image/png")
            ReplyBytes(s, 200, type, File.ReadAllBytes(Path.Combine(Root, "web", file)));
        else
            Reply(s, 200, type, File.ReadAllText(Path.Combine(Root, "web", file)));
    }

    static string Line(Stream s)
    {
        var b = new List<byte>();
        int v;
        while ((v = s.ReadByte()) != -1)
        {
            if (v == 10)
                return Encoding.ASCII.GetString(b.ToArray()).TrimEnd('\r');
            b.Add((byte)v);
            if (b.Count > 8192)
                throw new Exception("Header too large");
        }
        throw new IOException();
    }

    static string QueryValue(string target, string name)
    {
        int q = target.IndexOf('?');
        if (q < 0)
            return null;
        foreach (string part in target.Substring(q + 1).Split('&'))
        {
            string[] pair = part.Split(new[] { '=' }, 2);
            if (Uri.UnescapeDataString(pair[0]) == name)
                return pair.Length > 1 ? Uri.UnescapeDataString(pair[1]) : "";
        }
        return null;
    }

    static void ReplyJson(Stream s, int code, object body)
    {
        Reply(s, code, JsonType, Json(body));
    }

    static void Reply(Stream s, int code, string type, string body)
    {
        WriteResponse(
            s,
            code,
            type + "; charset=utf-8",
            Encoding.UTF8.GetBytes(body),
            "Content-Security-Policy: " + ContentSecurityPolicy + "\r\n"
        );
    }

    static void ReplyBytes(Stream s, int code, string type, byte[] body)
    {
        WriteResponse(s, code, type, body, "");
    }

    static void WriteResponse(Stream s, int code, string contentType, byte[] body, string extraHeaders)
    {
        byte[] h = Encoding.ASCII.GetBytes(
            "HTTP/1.1 "
                + code
                + " "
                + (code == 200 ? "OK" : "Error")
                + "\r\nContent-Type: "
                + contentType
                + "\r\nContent-Length: "
                + body.Length
                + "\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\n"
                + extraHeaders
                + "\r\n"
        );
        s.Write(h, 0, h.Length);
        s.Write(body, 0, body.Length);
    }

    // Reads a JSON body. Rejects other content types, cross-site origins and bodies over 2 MB.
    static Dictionary<string, object> ReadInput(Stream s, Dictionary<string, string> headers)
    {
        string type,
            origin,
            host,
            len;
        int n;
        if (
            !headers.TryGetValue("Content-Type", out type)
            || !type.StartsWith("application/json", StringComparison.OrdinalIgnoreCase)
        )
            throw new Exception("JSONで送信してください。");
        if (headers.TryGetValue("Origin", out origin))
        {
            Uri uri;
            if (
                !Uri.TryCreate(origin, UriKind.Absolute, out uri)
                || !headers.TryGetValue("Host", out host)
                || uri.Authority != host
                || uri.Scheme != "http"
            )
                throw new Exception("別サイトからのリクエストは許可されていません。");
        }
        if (!headers.TryGetValue("Content-Length", out len) || !int.TryParse(len, out n) || n < 0 || n > 2097152)
            throw new Exception("データが大きすぎます。");
        byte[] body = new byte[n];
        int read = 0;
        while (read < n)
        {
            int k = s.Read(body, read, n - read);
            if (k == 0)
                throw new IOException();
            read += k;
        }
        return new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(body));
    }
}
