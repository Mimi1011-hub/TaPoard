using System.Collections.Generic;

static class PublicDeckV3
{
    internal static Dictionary<string, object> Create(DeckV3 deck)
    {
        var result = new Dictionary<string, object>();
        result["keepAwake"] = deck.keepAwake;
        result["landscape"] = Orientation(deck.landscape);
        result["portrait"] = Orientation(deck.portrait);
        return result;
    }

    static Dictionary<string, object> Orientation(OrientationV3 orientation)
    {
        var result = new Dictionary<string, object>();
        result["columns"] = orientation.columns;
        result["rows"] = orientation.rows;
        result["faders"] = orientation.faders;
        var pages = new List<object>();
        foreach (PageV3 page in orientation.pages)
        {
            var publicPage = new Dictionary<string, object>();
            publicPage["faders"] = page.faders;
            var items = new List<object>();
            foreach (DeckItem item in page.items)
                items.Add(Item(item));
            publicPage["items"] = items;
            pages.Add(publicPage);
        }
        result["pages"] = pages;
        return result;
    }

    static Dictionary<string, object> Item(DeckItem item)
    {
        var result = new Dictionary<string, object>();
        result["id"] = item.id;
        result["name"] = item.name;
        result["icon"] = item.icon;
        result["iconKey"] = item.iconKey;
        result["iconColor"] = item.iconColor;
        result["customIcon"] = item.customIcon;
        result["type"] = item.type;
        result["action"] = item.action;
        result["category"] = item.category;
        result["deviceId"] = item.deviceId;
        result["deviceTarget"] = item.deviceTarget;
        result["row"] = item.row;
        result["column"] = item.column;
        result["width"] = item.width;
        result["height"] = item.height;
        result["fontSize"] = item.fontSize;
        result["iconScale"] = item.iconScale;
        result["labelOpacity"] = item.labelOpacity;
        result["keyClear"] = item.keyClear;
        result["hideLabel"] = item.hideLabel;
        result["options"] = WidgetRegistry.PublicOptions(item.type, item.options);
        return result;
    }
}
