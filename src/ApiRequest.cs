using System.Collections.Generic;
using System.IO;
using System.Net;

sealed class ApiRequest
{
    internal Stream stream;
    internal string method;
    internal string target;
    internal string path;
    internal Dictionary<string, string> headers;
    internal IPAddress remote;
    internal bool local;
    internal string auth;
    internal bool isAdmin;
    internal bool allowed;
    internal Dictionary<string, object> input;
    internal string json;
}
