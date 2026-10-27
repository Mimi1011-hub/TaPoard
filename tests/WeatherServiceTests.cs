using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;

class WeatherServiceTests
{
    static void Check(bool value, string message)
    {
        if (!value) throw new Exception("FAIL " + message);
        Console.WriteLine("PASS " + message);
    }

    static void Main()
    {
        string directory = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "weather-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        var changed = new ManualResetEvent(false);
        DateTime now = new DateTime(2026, 10, 27, 12, 0, 0, DateTimeKind.Utc);
        WeatherService.Clock = delegate { return now; };
        var searched = new List<string>();
        WeatherService.Downloader = delegate(string url)
        {
            if (url.Contains("geocoding-api") && url.Contains(Uri.EscapeDataString("府中")))
                return "{\"results\":[{\"name\":\"府中\",\"latitude\":35.67,\"longitude\":139.48},{\"name\":\"壊れた候補\",\"latitude\":\"x\"},{\"name\":\"府中町\",\"admin1\":\"広島県\",\"latitude\":34.39,\"longitude\":132.5,\"timezone\":\"Asia/Tokyo\"}]}";
            if (url.Contains("geocoding-api")) searched.Add(Uri.UnescapeDataString(url.Substring(url.IndexOf("&name=") + 6)));
            if (url.Contains("geocoding-api") && (url.EndsWith(Uri.EscapeDataString("東京")) || url.EndsWith(Uri.EscapeDataString("東京市"))))
                return "{\"generationtime_ms\":0.1}";
            if (url.Contains("geocoding-api") && url.EndsWith(Uri.EscapeDataString("東京都")))
                return "{\"results\":[{\"name\":\"東京都\",\"admin1\":\"東京都\",\"latitude\":35.69,\"longitude\":139.69,\"timezone\":\"Asia/Tokyo\",\"population\":9733276}]}";
            if (url.Contains("geocoding-api") && url.EndsWith(Uri.EscapeDataString("横浜")))
                return "{\"results\":[{\"name\":\"横浜\",\"admin1\":\"青森県\",\"latitude\":41.08,\"longitude\":141.25,\"timezone\":\"Asia/Tokyo\",\"population\":4412},{\"name\":\"横浜\",\"admin1\":\"長崎県\",\"latitude\":32.9,\"longitude\":129.9,\"timezone\":\"Asia/Tokyo\"},{\"name\":\"横浜市\",\"admin1\":\"神奈川県\",\"latitude\":35.44,\"longitude\":139.64,\"timezone\":\"Asia/Tokyo\",\"population\":3777491}]}";
            if (url.Contains("geocoding-api") && url.Contains(Uri.EscapeDataString("存在しない")))
                return "{\"generationtime_ms\":0.1}";
            if (url.Contains("geocoding-api"))
                return "{\"results\":[{\"name\":\"札幌\",\"admin1\":\"北海道\",\"country\":\"日本\",\"latitude\":43.06,\"longitude\":141.35,\"timezone\":\"Asia/Tokyo\"}]}";
            return "{\"current\":{\"temperature_2m\":12.4,\"weather_code\":2},\"daily\":{\"time\":[\"2026-10-27\",\"2026-10-28\",\"2026-10-29\"],\"weather_code\":[2,61,3],\"temperature_2m_max\":[15.1,13.2,16.3],\"temperature_2m_min\":[8.4,7.1,9.2],\"precipitation_probability_max\":[20,80,30]}}";
        };
        var settings = new Settings { weatherName = "札幌", weatherLatitude = 43.06, weatherLongitude = 141.35, weatherTimezone = "Asia/Tokyo" };
        try
        {
            WeatherService.Initialize(directory, delegate { changed.Set(); });
            var locations = WeatherService.Search("札幌");
            Check(locations.Length == 1 && locations[0].timezone == "Asia/Tokyo", "geocoding results are normalized on the PC");
            searched.Clear();
            var tokyo = WeatherService.Search("東京");
            Check(tokyo.Length == 1 && tokyo[0].name == "東京都" && String.Join(",", searched.ToArray()) == "東京,東京市,東京都", "a short Japanese name is retried with 市 then 都");
            var yokohama = WeatherService.Search("横浜");
            Check(yokohama.Length == 3 && yokohama[0].name == "横浜市" && yokohama[1].region == "青森県" && yokohama[2].region == "長崎県", "candidates are sorted by population, unknown last");
            searched.Clear();
            Check(WeatherService.Search("存在しない").Length == 0 && searched.Count == 5, "an unknown name tries each suffix once and returns no candidates");
            searched.Clear();
            WeatherService.Search("Sapporo");
            Check(searched.Count == 1, "romaji queries are not retried with Japanese suffixes");
            var mixed = WeatherService.Search("府中");
            Check(mixed.Length == 2 && mixed[0].timezone == "auto" && mixed[1].name == "府中町", "a malformed candidate is skipped and a missing timezone falls back to auto");
            WeatherService.SetActive(true, settings);
            Check(changed.WaitOne(2000), "visible weather subscription fetches asynchronously");
            var weather = WeatherService.PublicSnapshot(settings);
            Check(weather.available && weather.temperature == 12.4 && weather.precipitation == 20, "current forecast is parsed");
            Check(weather.days.Length == 3 && weather.days[1].code == 61 && weather.days[1].precipitation == 80, "three-day forecast is retained");
            Check(File.Exists(Path.Combine(directory, "weather-cache.json")), "forecast cache is saved outside settings");
            WeatherService.SetActive(false, settings);
            Check(!WeatherService.PublicSnapshot(settings).active, "weather acquisition stops without subscribers");
            bool rejected = false;
            try { WeatherService.ValidateLocation("bad", 100, 0, "Asia/Tokyo"); } catch { rejected = true; }
            Check(rejected, "invalid client coordinates are rejected");
        }
        finally
        {
            WeatherService.Stop();
            if (Directory.Exists(directory)) Directory.Delete(directory, true);
        }
    }
}
