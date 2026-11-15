using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

static class CustomActions
{
    internal const int MaxTextLength = 32768;

    internal static void ValidateUrl(string value)
    {
        Uri uri;
        if (
            String.IsNullOrWhiteSpace(value)
            || value.Length > 2048
            || !Uri.TryCreate(value, UriKind.Absolute, out uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
        )
            throw new Exception(Text.Get("source.customactions.url"));
    }

    internal static void ValidateText(string value)
    {
        if (String.IsNullOrEmpty(value))
            throw new Exception(Text.Get("source.customactions.1"));
        if (value.Length > MaxTextLength)
            throw new Exception(Text.Get("source.customactions.2"));
    }

    internal static void OpenUrl(string value)
    {
        ValidateUrl(value);
        Process.Start(new ProcessStartInfo(value) { UseShellExecute = true });
    }

    internal static void CopyText(string value)
    {
        ValidateText(value);
        Exception error = null;
        var thread = new Thread(
            new ThreadStart(
                delegate
                {
                    for (int attempt = 0; attempt < 5; attempt++)
                    {
                        try
                        {
                            Clipboard.SetText(value);
                            error = null;
                            return;
                        }
                        catch (ExternalException e)
                        {
                            error = e;
                            Thread.Sleep(50);
                        }
                        catch (Exception e)
                        {
                            error = e;
                            return;
                        }
                    }
                }
            )
        );
        thread.SetApartmentState(ApartmentState.STA);
        thread.IsBackground = true;
        thread.Start();
        if (!thread.Join(2000))
            throw new Exception(Text.Get("source.customactions.3"));
        if (error != null)
            throw new Exception(Text.Get("source.customactions.4"));
    }
}
