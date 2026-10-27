using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;

class WeatherDay
{
    public string date { get; set; }
    public int code { get; set; }
    public double maximum { get; set; }
    public double minimum { get; set; }
    public int precipitation { get; set; }
}

class WeatherSnapshot
{
    public bool active { get; set; }
    public bool configured { get; set; }
    public string location { get; set; }
    public bool available { get; set; }
    public bool stale { get; set; }
    public string error { get; set; }
    public long updatedAt { get; set; }
    public double temperature { get; set; }
    public int code { get; set; }
    public int precipitation { get; set; }
    public WeatherDay[] days { get; set; }
    public string attribution { get; set; }
}

class WeatherLocationResult
{
    public string name { get; set; }
    public string region { get; set; }
    public string country { get; set; }
    public double latitude { get; set; }
    public double longitude { get; set; }
    public string timezone { get; set; }
}

// A single cached Open-Meteo request serves every phone. Network work runs on a
// thread-pool thread and is started only while a weather widget is visible.
static class WeatherService
{
    const int RefreshMinutes = 20;
    const int RetryMinutes = 5;
    static readonly object Sync = new object();
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    static readonly Regex TimezonePattern = new Regex("\\A[A-Za-z0-9_+.-]+(?:/[A-Za-z0-9_+.-]+)*\\z", RegexOptions.Compiled);
    internal static Func<string, string> Downloader = Download;
    internal static Func<DateTime> Clock = delegate { return DateTime.UtcNow; };
    static Action changed;
    static string cachePath;
    static bool active, fetching;
    static DateTime lastAttempt = DateTime.MinValue;
    static string locationKey = "";
    static WeatherSnapshot snapshot = Empty(false, "");

    internal static void Initialize(string dataDirectory, Action onChanged)
    {
        lock (Sync)
        {
            changed = onChanged;
            cachePath = Path.Combine(dataDirectory, "weather-cache.json");
            LoadCacheLocked();
        }
    }

    internal static void SetActive(bool value, Settings settings)
    {
        lock (Sync)
        {
            active = value;
            ConfigureLocked(settings);
            snapshot.active = active;
            ScheduleLocked();
        }
    }

    internal static void Configure(Settings settings)
    {
        lock (Sync)
        {
            ConfigureLocked(settings);
            ScheduleLocked();
        }
    }

    internal static void Stop()
    {
        lock (Sync) { active = false; changed = null; }
    }

    internal static object PublicLocation(Settings settings)
    {
        return new
        {
            name = settings.weatherName ?? "",
            latitude = settings.weatherLatitude,
            longitude = settings.weatherLongitude,
            timezone = settings.weatherTimezone ?? "",
            configured = IsConfigured(settings),
        };
    }

    internal static WeatherSnapshot PublicSnapshot(Settings settings)
    {
        lock (Sync)
        {
            ConfigureLocked(settings);
            ScheduleLocked();
            return new WeatherSnapshot
            {
                active = active,
                configured = IsConfigured(settings),
                location = settings.weatherName ?? "",
                available = snapshot.available,
                stale = snapshot.available && Clock().Subtract(FromUnix(snapshot.updatedAt)).TotalMinutes >= RefreshMinutes,
                error = snapshot.error,
                updatedAt = snapshot.updatedAt,
                temperature = snapshot.temperature,
                code = snapshot.code,
                precipitation = snapshot.precipitation,
                days = snapshot.days ?? new WeatherDay[0],
                attribution = "Weather data by Open-Meteo.com",
            };
        }
    }

    internal static WeatherLocationResult[] Search(string query)
    {
        query = (query ?? "").Trim();
        if (query.Length < 2 || query.Length > 80) throw new Exception("地域名は2～80文字で入力してください。");
        string url = "https://geocoding-api.open-meteo.com/v1/search?count=8&language=ja&format=json&name=" + Uri.EscapeDataString(query);
        var root = Json.DeserializeObject(Downloader(url)) as Dictionary<string, object>;
        var result = new List<WeatherLocationResult>();
        object raw;
        var items = root != null && root.TryGetValue("results", out raw) ? raw as object[] : null;
        foreach (object item in items ?? new object[0])
        {
            var entry = item as Dictionary<string, object>;
            if (entry == null) continue;
            // One malformed candidate must not hide the others; a missing timezone is left to Open-Meteo.
            try
            {
                var location = new WeatherLocationResult
                {
                    name = Text(entry, "name"),
                    region = Text(entry, "admin1"),
                    country = Text(entry, "country"),
                    latitude = Number(entry, "latitude"),
                    longitude = Number(entry, "longitude"),
                    timezone = Text(entry, "timezone"),
                };
                if (String.IsNullOrWhiteSpace(location.timezone)) location.timezone = "auto";
                ValidateLocation(location.name, location.latitude, location.longitude, location.timezone);
                result.Add(location);
            }
            catch { }
        }
        return result.ToArray();
    }

    internal static void ValidateLocation(string name, double latitude, double longitude, string timezone)
    {
        if (String.IsNullOrWhiteSpace(name) || name.Length > 100) throw new Exception("地域名が正しくありません。");
        if (Double.IsNaN(latitude) || Double.IsInfinity(latitude) || latitude < -90 || latitude > 90
            || Double.IsNaN(longitude) || Double.IsInfinity(longitude) || longitude < -180 || longitude > 180)
            throw new Exception("地域の座標が正しくありません。");
        if (String.IsNullOrWhiteSpace(timezone) || timezone.Length > 80 || !TimezonePattern.IsMatch(timezone))
            throw new Exception("地域のタイムゾーンが正しくありません。");
    }

    static void ConfigureLocked(Settings settings)
    {
        string key = IsConfigured(settings) ? LocationKey(settings) : "";
        if (key == locationKey) return;
        locationKey = key;
        lastAttempt = DateTime.MinValue;
        if (!snapshot.available || snapshot.location != key)
            snapshot = Empty(active, key);
    }

    static void ScheduleLocked()
    {
        if (!active || fetching || String.IsNullOrEmpty(locationKey)) return;
        DateTime now = Clock();
        if (lastAttempt != DateTime.MinValue && now.Subtract(lastAttempt).TotalMinutes < RetryMinutes) return;
        if (snapshot.available && now.Subtract(FromUnix(snapshot.updatedAt)).TotalMinutes < RefreshMinutes) return;
        fetching = true;
        lastAttempt = now;
        ThreadPool.QueueUserWorkItem(delegate { Fetch(); });
    }

    static void Fetch()
    {
        string key;
        lock (Sync) key = locationKey;
        WeatherSnapshot next;
        try { next = ParseForecast(key, Downloader(ForecastUrl(key))); }
        catch
        {
            lock (Sync)
            {
                fetching = false;
                if (key != locationKey) return;
                snapshot.error = "天気を更新できませんでした。";
                snapshot.stale = snapshot.available;
            }
            Notify();
            return;
        }
        lock (Sync)
        {
            fetching = false;
            if (key != locationKey) return;
            next.active = active;
            snapshot = next;
            SaveCacheLocked();
        }
        Notify();
    }

    static WeatherSnapshot ParseForecast(string key, string json)
    {
        var root = Json.DeserializeObject(json) as Dictionary<string, object>;
        var current = Object(root, "current");
        var daily = Object(root, "daily");
        var dates = Array(daily, "time");
        var codes = Array(daily, "weather_code");
        var maximums = Array(daily, "temperature_2m_max");
        var minimums = Array(daily, "temperature_2m_min");
        var precipitation = Array(daily, "precipitation_probability_max");
        var days = new List<WeatherDay>();
        int count = Math.Min(3, dates.Length);
        for (int i = 0; i < count; i++)
            days.Add(new WeatherDay { date = Convert.ToString(dates[i]), code = Integer(codes, i), maximum = Rounded(maximums, i), minimum = Rounded(minimums, i), precipitation = Integer(precipitation, i) });
        if (current == null || days.Count == 0) throw new Exception("予報データが不足しています。");
        return new WeatherSnapshot
        {
            configured = true,
            location = key,
            available = true,
            stale = false,
            error = "",
            updatedAt = ToUnix(Clock()),
            temperature = Math.Round(Number(current, "temperature_2m"), 1),
            code = Convert.ToInt32(Number(current, "weather_code")),
            precipitation = days[0].precipitation,
            days = days.ToArray(),
            attribution = "Weather data by Open-Meteo.com",
        };
    }

    static string ForecastUrl(string key)
    {
        string[] parts = key.Split('|');
        return "https://api.open-meteo.com/v1/forecast?latitude=" + parts[0] + "&longitude=" + parts[1]
            + "&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=3&timezone="
            + Uri.EscapeDataString(parts[2]);
    }

    static string LocationKey(Settings settings)
    {
        return settings.weatherLatitude.ToString("0.#####", CultureInfo.InvariantCulture) + "|"
            + settings.weatherLongitude.ToString("0.#####", CultureInfo.InvariantCulture) + "|" + settings.weatherTimezone;
    }

    static bool IsConfigured(Settings settings)
    {
        return settings != null && !String.IsNullOrWhiteSpace(settings.weatherName) && !String.IsNullOrWhiteSpace(settings.weatherTimezone);
    }

    static string Download(string url)
    {
        ServicePointManager.SecurityProtocol |= (SecurityProtocolType)3072;
        var request = (HttpWebRequest)WebRequest.Create(url);
        request.UserAgent = "TaPoard/2.0 (+https://open-meteo.com/)";
        request.Timeout = 8000;
        request.ReadWriteTimeout = 8000;
        using (var response = request.GetResponse())
        using (var stream = response.GetResponseStream())
        using (var reader = new StreamReader(stream, Encoding.UTF8)) return reader.ReadToEnd();
    }

    static void Notify() { Action callback; lock (Sync) callback = changed; if (callback != null) callback(); }
    static long ToUnix(DateTime value) { return new DateTimeOffset(value.ToUniversalTime()).ToUnixTimeMilliseconds(); }
    static DateTime FromUnix(long value) { return value > 0 ? DateTimeOffset.FromUnixTimeMilliseconds(value).UtcDateTime : DateTime.MinValue; }
    static WeatherSnapshot Empty(bool isActive, string key) { return new WeatherSnapshot { active = isActive, location = key, days = new WeatherDay[0], attribution = "Weather data by Open-Meteo.com" }; }
    static Dictionary<string, object> Object(Dictionary<string, object> source, string key) { object value; return source != null && source.TryGetValue(key, out value) ? value as Dictionary<string, object> : null; }
    static object[] Array(Dictionary<string, object> source, string key) { object value; return source != null && source.TryGetValue(key, out value) ? value as object[] ?? new object[0] : new object[0]; }
    static string Text(Dictionary<string, object> source, string key) { object value; return source != null && source.TryGetValue(key, out value) ? Convert.ToString(value) : ""; }
    static double Number(Dictionary<string, object> source, string key) { object value; if (source == null || !source.TryGetValue(key, out value)) throw new Exception("数値がありません。"); return Convert.ToDouble(value, CultureInfo.InvariantCulture); }
    static int Integer(object[] source, int index) { return source != null && index < source.Length && source[index] != null ? Convert.ToInt32(source[index], CultureInfo.InvariantCulture) : 0; }
    static double Rounded(object[] source, int index) { return source != null && index < source.Length && source[index] != null ? Math.Round(Convert.ToDouble(source[index], CultureInfo.InvariantCulture), 1) : 0; }

    static void LoadCacheLocked()
    {
        try { if (File.Exists(cachePath)) snapshot = Json.Deserialize<WeatherSnapshot>(File.ReadAllText(cachePath, Encoding.UTF8)) ?? snapshot; }
        catch { snapshot = Empty(false, ""); }
        locationKey = snapshot.location ?? "";
    }

    static void SaveCacheLocked()
    {
        if (String.IsNullOrEmpty(cachePath)) return;
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(cachePath));
            string temporary = cachePath + ".tmp";
            File.WriteAllText(temporary, Json.Serialize(snapshot), new UTF8Encoding(false));
            if (File.Exists(cachePath)) File.Replace(temporary, cachePath, null); else File.Move(temporary, cachePath);
        }
        catch { }
    }
}
