using System;
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
        WeatherService.Downloader = delegate(string url)
        {
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
