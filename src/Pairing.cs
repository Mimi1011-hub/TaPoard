using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;

class PairedDevice
{
    public string id { get; set; }
    public string name { get; set; }
    public string credentialHash { get; set; }
    public string created { get; set; }
}

class PairRequest
{
    internal string id,
        secret,
        code,
        name,
        address,
        token;
    internal DateTime expires;
    internal bool denied;
}

// Accessed only while holding Program.Gate. No timer or background polling on the PC.
static class Pairing
{
    internal static readonly List<PairRequest> Pending = new List<PairRequest>();
    static readonly List<KeyValuePair<string, DateTime>> Starts = new List<KeyValuePair<string, DateTime>>();
    internal static long Revision = 1;

    internal static string Random()
    {
        return SecureKeys.Hex();
    }

    internal static string Hash(string value)
    {
        using (var hash = SHA256.Create())
            return BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(value ?? ""))).Replace("-", "");
    }

    internal static void Prune()
    {
        if (Pending.RemoveAll(p => p.expires <= DateTime.UtcNow) > 0)
            Revision++;
        Starts.RemoveAll(x => x.Value <= DateTime.UtcNow.AddMinutes(-5));
    }

    internal static PairRequest Start(string name, string address)
    {
        Prune();
        if (Pending.Count >= 8 || Starts.Count >= 30 || Starts.FindAll(x => x.Key == address).Count >= 3)
            throw new Exception("接続リクエストが多いため、5分ほど待ってください。");
        if (String.IsNullOrWhiteSpace(name) || name.Length > 60)
            throw new Exception("端末名を1～60文字で入力してください。");
        string code;
        do
        {
            byte[] b = new byte[4];
            using (var rng = RandomNumberGenerator.Create())
                rng.GetBytes(b);
            code = (BitConverter.ToUInt32(b, 0) % 1000000).ToString("D6");
        } while (Pending.Exists(p => p.code == code));
        var request = new PairRequest
        {
            id = Random(),
            secret = Random(),
            code = code,
            name = name.Trim(),
            address = address,
            expires = DateTime.UtcNow.AddMinutes(3),
        };
        Pending.Add(request);
        Starts.Add(new KeyValuePair<string, DateTime>(address, DateTime.UtcNow));
        Revision++;
        return request;
    }

    internal static PairRequest Find(string id)
    {
        Prune();
        var p = Pending.Find(x => x.id == id);
        if (p == null)
            throw new Exception("接続リクエストの期限が切れました。もう一度リクエストしてください。");
        return p;
    }

    internal static object Poll(string id, string secret)
    {
        var p = Find(id);
        if (String.IsNullOrEmpty(secret) || p.secret != secret)
            throw new Exception("接続リクエストを確認できません。");
        return new
        {
            status = p.denied ? "denied"
            : p.token == null ? "pending"
            : "approved",
            token = p.denied ? null : p.token,
        };
    }

    internal static void Decide(Settings s, string id, string code, bool approve)
    {
        var p = Find(id);
        if (p.code != code || p.denied)
            throw new Exception("確認番号が一致しないか、既に拒否されています。");
        if (p.token != null)
            return;
        if (approve)
        {
            if (s.devices.Count >= 30)
                throw new Exception("登録端末は30台以内です。使わない端末を解除してください。");
            p.token = Random();
            s.devices.Add(
                new PairedDevice
                {
                    id = p.id,
                    name = p.name,
                    credentialHash = Hash(p.token),
                    created = DateTime.UtcNow.ToString("o"),
                }
            );
        }
        else
            p.denied = true;
        Revision++;
    }

    internal static bool Authorized(Settings s, string auth)
    {
        if (auth == null || !auth.StartsWith("Bearer ") || auth.Length > 128)
            return false;
        string hash = Hash(auth.Substring(7));
        return s.devices.Exists(d => d.credentialHash == hash);
    }

    internal static void Revoke(Settings s, string id)
    {
        s.devices.RemoveAll(d => d.id == id);
        foreach (var p in Pending)
            if (p.id == id)
            {
                p.denied = true;
                p.token = null;
            }
        Revision++;
    }

    internal static object View(Settings s)
    {
        Prune();
        return new
        {
            pending = Pending
                .FindAll(p => p.token == null && !p.denied)
                .ConvertAll(p => new
                {
                    id = p.id,
                    name = p.name,
                    code = p.code,
                    address = p.address,
                    expires = p.expires.ToString("o"),
                }),
            devices = s.devices.ConvertAll(d => new
            {
                id = d.id,
                name = d.name,
                created = d.created,
            }),
            revision = Revision,
        };
    }
}
