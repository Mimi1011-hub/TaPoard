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

    // 12 characters that are easy to read aloud (no 0/1/I/O).
    internal static string Short()
    {
        const string chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
        byte[] b = new byte[12];
        using (var rng = RandomNumberGenerator.Create())
            rng.GetBytes(b);
        var value = new char[b.Length];
        for (int i = 0; i < b.Length; i++)
            value[i] = chars[b[i] & 31];
        return new string(value);
    }
}
