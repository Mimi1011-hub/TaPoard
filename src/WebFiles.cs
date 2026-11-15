using System;
using System.Collections.Generic;
using System.IO;

static class WebFiles
{
    static readonly HashSet<string> Extensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        ".html", ".js", ".css", ".json", ".png", ".svg",
    };

    internal static string ResolveV4(string webRoot, string path)
    {
        if (String.IsNullOrEmpty(webRoot) || String.IsNullOrEmpty(path))
            return null;
        string relative;
        if (path == "/v4" || path == "/v4/")
            relative = "index.html";
        else
        {
            if (!path.StartsWith("/v4/", StringComparison.Ordinal))
                return null;
            relative = path.Substring(4);
        }
        if (relative.Length == 0 || relative.Contains("..") || relative.Contains("//"))
            return null;
        foreach (char c in relative)
            if (!(c >= 'A' && c <= 'Z') && !(c >= 'a' && c <= 'z') && !(c >= '0' && c <= '9') && c != '.' && c != '_' && c != '-' && c != '/')
                return null;
        foreach (string part in relative.Split('/'))
            if (part.Length == 0 || part[0] == '.')
                return null;
        if (!Extensions.Contains(Path.GetExtension(relative)))
            return null;
        string root = Path.GetFullPath(Path.Combine(webRoot, "v4"));
        string full = Path.GetFullPath(Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar)));
        string prefix = root.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
        if (!full.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) || !File.Exists(full))
            return null;
        return full;
    }

    internal static string ContentType(string file)
    {
        switch (Path.GetExtension(file).ToLowerInvariant())
        {
            case ".js": return "application/javascript";
            case ".json": return "application/json";
            case ".css": return "text/css";
            case ".png": return "image/png";
            case ".svg": return "image/svg+xml";
            case ".html": return "text/html";
            default: return null;
        }
    }
}
