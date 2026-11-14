// Callers must hold Program.Gate.
sealed class PageUndo
{
    string beforeJson;
    string afterSignature;
    string rememberedOrientation;
    int rememberedPage;

    internal void Remember(string beforeJson, Settings after, string orientation, int page)
    {
        this.beforeJson = beforeJson;
        afterSignature = Signature(after);
        rememberedOrientation = orientation;
        rememberedPage = page;
    }

    internal bool TryTake(Settings current, out Settings restored, out string orientation, out int page)
    {
        restored = null;
        orientation = null;
        page = 0;
        if (beforeJson == null || Signature(current) != afterSignature)
            return false;
        restored = IconPacks.Serializer().Deserialize<Settings>(beforeJson);
        orientation = rememberedOrientation;
        page = rememberedPage;
        Clear();
        return true;
    }

    internal void Clear()
    {
        beforeJson = null;
        afterSignature = null;
        rememberedOrientation = null;
        rememberedPage = 0;
    }

    internal static string Signature(Settings s)
    {
        var devices = s.devices;
        s.devices = null;
        try { return IconPacks.Serializer().Serialize(s); }
        finally { s.devices = devices; }
    }
}
