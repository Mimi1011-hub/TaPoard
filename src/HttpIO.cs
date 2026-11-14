using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;

static class HttpIO
{
    internal const string JsonType = "application/json";
    const string ContentSecurityPolicy =
        "default-src 'self'; style-src 'self'; img-src 'self' data:; media-src data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'";

    internal static string Json(object value)
    {
        return new JavaScriptSerializer().Serialize(value);
    }

    internal static string QueryValue(string target, string name)
    {
        int q = target.IndexOf('?');
        if (q < 0) return null;
        foreach (string part in target.Substring(q + 1).Split('&'))
        {
            string[] pair = part.Split(new[] { '=' }, 2);
            if (Uri.UnescapeDataString(pair[0]) == name)
                return pair.Length > 1 ? Uri.UnescapeDataString(pair[1]) : "";
        }
        return null;
    }

    internal static void ReplyJson(Stream stream, int code, object body)
    {
        Reply(stream, code, JsonType, Json(body));
    }

    internal static void Reply(Stream stream, int code, string type, string body)
    {
        WriteResponse(stream, code, type + "; charset=utf-8", Encoding.UTF8.GetBytes(body),
            "Content-Security-Policy: " + ContentSecurityPolicy + "\r\n");
    }

    internal static void ReplyBytes(Stream stream, int code, string type, byte[] body)
    {
        WriteResponse(stream, code, type, body, "");
    }

    internal static void WriteResponse(Stream stream, int code, string contentType, byte[] body, string extraHeaders)
    {
        byte[] headers = Encoding.ASCII.GetBytes("HTTP/1.1 " + code + " " + (code == 200 ? "OK" : "Error")
            + "\r\nContent-Type: " + contentType + "\r\nContent-Length: " + body.Length
            + "\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\n"
            + extraHeaders + "\r\n");
        stream.Write(headers, 0, headers.Length);
        stream.Write(body, 0, body.Length);
    }

    internal static Dictionary<string, object> ReadInput(Stream stream, Dictionary<string, string> headers)
    {
        string type, origin, host, length;
        int count;
        if (!headers.TryGetValue("Content-Type", out type) || !type.StartsWith("application/json", StringComparison.OrdinalIgnoreCase))
            throw new Exception("JSONで送信してください。");
        if (headers.TryGetValue("Origin", out origin))
        {
            Uri uri;
            if (!Uri.TryCreate(origin, UriKind.Absolute, out uri) || !headers.TryGetValue("Host", out host)
                || uri.Authority != host || uri.Scheme != "http")
                throw new Exception("別サイトからのリクエストは許可されていません。");
        }
        if (!headers.TryGetValue("Content-Length", out length) || !int.TryParse(length, out count) || count < 0 || count > 2097152)
            throw new Exception("データが大きすぎます。");
        byte[] body = new byte[count];
        int read = 0;
        while (read < count)
        {
            int amount = stream.Read(body, read, count - read);
            if (amount == 0) throw new IOException();
            read += amount;
        }
        return new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(body));
    }
}
