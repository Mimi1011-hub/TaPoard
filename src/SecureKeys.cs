using System;
using System.Security.Cryptography;

static class SecureKeys
{
    // 192-bit random value as 48 lowercase hex characters.
    internal static string Hex()
    {
        byte[] b = new byte[24];
        using (var rng = RandomNumberGenerator.Create())
            rng.GetBytes(b);
        return BitConverter.ToString(b).Replace("-", "").ToLowerInvariant();
    }
}
