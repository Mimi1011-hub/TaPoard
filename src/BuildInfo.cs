using System.Reflection;

static class BuildInfo
{
    internal const string ReleaseVersion = "2.1";

    internal static string DisplayVersion
    {
        get
        {
            object[] attributes = Assembly.GetExecutingAssembly()
                .GetCustomAttributes(typeof(AssemblyInformationalVersionAttribute), false);
            if (attributes.Length == 1)
            {
                string value = ((AssemblyInformationalVersionAttribute)attributes[0]).InformationalVersion;
                if (!string.IsNullOrWhiteSpace(value))
                    return value;
            }
            return ReleaseVersion + "+source";
        }
    }
}
