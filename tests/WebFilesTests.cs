using System;
using System.IO;
using System.Text;

public static class WebFilesTests
{
    static void Assert(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }

    public static int Main()
    {
        string root = Path.Combine(Path.GetTempPath(), "tapoard-web-files-" + Guid.NewGuid().ToString("N"));
        try
        {
            string v4 = Path.Combine(root, "v4");
            Directory.CreateDirectory(Path.Combine(v4, "core"));
            File.WriteAllText(Path.Combine(v4, "index.html"), "index");
            File.WriteAllText(Path.Combine(v4, "core", "api.js"), "api");
            File.WriteAllText(Path.Combine(v4, "x.exe"), "no");
            Assert(WebFiles.ResolveV4(root, "/v4/") == Path.Combine(v4, "index.html"), "v4 slash resolves index");
            Assert(WebFiles.ResolveV4(root, "/v4") == Path.Combine(v4, "index.html"), "v4 resolves index");
            Assert(WebFiles.ResolveV4(root, "/v4/core/api.js") == Path.Combine(v4, "core", "api.js"), "module resolves");
            string[] rejected = { "/v4/../app.js", "/v4/%2e%2e/app.js", "/v4/a\\b.js", "/v4/.hidden.js", "/v4/x.exe", "/v4/none.js", "/app.js" };
            foreach (string path in rejected)
                Assert(WebFiles.ResolveV4(root, path) == null, "rejects " + path);
            Assert(WebFiles.ContentType("x.html") == "text/html", "html content type");
            Assert(WebFiles.ContentType("x.js") == "application/javascript", "module content type");
            Assert(WebFiles.ContentType("x.css") == "text/css", "css content type");
            Assert(WebFiles.ContentType("x.json") == "application/json", "json content type");
            Assert(WebFiles.ContentType("x.png") == "image/png", "png content type");
            Assert(WebFiles.ContentType("x.svg") == "image/svg+xml", "svg content type");
            MemoryStream response = new MemoryStream();
            HttpIO.Reply(response, 200, "text/html", "ok");
            string headers = Encoding.ASCII.GetString(response.ToArray());
            Assert(headers.Contains("img-src 'self' data: blob:"), "CSP allows blob images");
            Assert(headers.Contains("script-src 'self'"), "CSP keeps scripts restricted to self");
            Assert(HttpIO.ContentSecurityPolicy == Program.ContentSecurityPolicy, "HTTP implementations share the CSP");
            Console.WriteLine("PASS WebFilesTests");
            return 0;
        }
        catch (Exception e)
        {
            Console.Error.WriteLine(e);
            return 1;
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, true);
        }
    }
}
