using System;
using System.Collections.Generic;

class TilePosition
{
    public int page { get; set; }
    public int row { get; set; }
    public int column { get; set; }
}

// Speaker/microphone fader placement for one orientation.
struct ControlLayout
{
    public int speakerSlot;
    public int micSlot;
    public int speakerSize;
    public int micSize;
    public int speakerRow;
    public int speakerColumn;
    public int speakerWidth;
    public int speakerHeight;
    public int micRow;
    public int micColumn;
    public int micWidth;
    public int micHeight;
}

static class DeckLayout
{
    internal const int MaxPages = 40;

    internal static string OrientationName(bool portrait) { return portrait ? "portrait" : "landscape"; }
    internal static int Columns(Settings s, bool portrait) { return portrait ? s.portraitColumns : s.landscapeColumns; }
    internal static int Rows(Settings s, bool portrait) { return portrait ? s.portraitRows : s.landscapeRows; }
    internal static TilePosition Position(AppEntry a, bool portrait) { return portrait ? a.portrait : a.landscape; }
    internal static int Width(AppEntry a) { return a.width > 0 ? a.width : a.size == 2 ? 2 : 1; }
    internal static int Height(AppEntry a) { return a.height > 0 ? a.height : a.size == 2 ? 2 : 1; }
    static int Positive(int value, int fallback) { return value > 0 ? value : fallback > 0 ? fallback : 1; }

    static ControlPlacement Placement(Settings s, bool portrait, bool mic)
    {
        return portrait ? (mic ? s.portraitMic : s.portraitSpeaker) : (mic ? s.landscapeMic : s.landscapeSpeaker);
    }

    static void SetPlacement(Settings s, bool portrait, bool mic, ControlPlacement value)
    {
        if (portrait) { if (mic) s.portraitMic = value; else s.portraitSpeaker = value; }
        else { if (mic) s.landscapeMic = value; else s.landscapeSpeaker = value; }
    }

    internal static List<ControlPage> ControlPages(Settings s, bool portrait)
    {
        var pages = portrait ? s.portraitControlPages : s.landscapeControlPages;
        if (pages == null)
        {
            pages = new List<ControlPage>();
            if (portrait) s.portraitControlPages = pages; else s.landscapeControlPages = pages;
        }
        return pages;
    }

    static ControlPage FindPage(Settings s, bool portrait, int page)
    {
        foreach (var entry in ControlPages(s, portrait)) if (entry != null && entry.page == page) return entry;
        return null;
    }

    internal static bool Off(Settings s, bool portrait, bool mic)
    {
        return portrait ? (mic ? s.portraitMicOff : s.portraitSpeakerOff) : (mic ? s.landscapeMicOff : s.landscapeSpeakerOff);
    }

    // 3.1: removes a fader from every page of one orientation, or brings it back on every page.
    internal static void SetOff(Settings s, bool portrait, bool mic, bool off)
    {
        if (portrait) { if (mic) s.portraitMicOff = off; else s.portraitSpeakerOff = off; }
        else { if (mic) s.landscapeMicOff = off; else s.landscapeSpeakerOff = off; }
        foreach (var entry in ControlPages(s, portrait))
        {
            if (entry == null) continue;
            if (mic) entry.micHidden = off; else entry.speakerHidden = off;
        }
        if (!off)
        {
            // Pages whose buttons now sit where the fader was keep it hidden.
            string orientation = OrientationName(portrait);
            for (int page = 0; page < Pages(s, orientation); page++)
            {
                var place = PagePlacement(s, portrait, mic, page);
                if (place == null) continue;
                bool blocked = s.apps.Exists(a => a.orientation == orientation && Position(a, portrait) != null && Position(a, portrait).page == page
                    && Overlap(Position(a, portrait).row, Position(a, portrait).column, Width(a), Height(a), place.row, place.column, place.width, place.height));
                var other = PagePlacement(s, portrait, !mic, page);
                if (other != null && Overlap(other.row, other.column, other.width, other.height, place.row, place.column, place.width, place.height)) blocked = true;
                if (!blocked) continue;
                var entry = FindPage(s, portrait, page);
                if (entry == null)
                {
                    entry = new ControlPage { page = page, speaker = Placement(s, portrait, false), mic = Placement(s, portrait, true), speakerHidden = Off(s, portrait, false), micHidden = Off(s, portrait, true) };
                    ControlPages(s, portrait).Add(entry);
                }
                if (mic) entry.micHidden = true; else entry.speakerHidden = true;
            }
            ControlPages(s, portrait).Sort((a, b) => a.page.CompareTo(b.page));
        }
        ControlPages(s, portrait).RemoveAll(entry => entry != null && !entry.speakerHidden && !entry.micHidden && Same(entry.speaker, Placement(s, portrait, false)) && Same(entry.mic, Placement(s, portrait, true)) && !Off(s, portrait, false) && !Off(s, portrait, true));
    }

    // The fader as shown on one page, or null when that page hides it.
    internal static ControlPlacement PagePlacement(Settings s, bool portrait, bool mic, int page)
    {
        var entry = FindPage(s, portrait, page);
        if (entry == null) return Off(s, portrait, mic) ? null : Placement(s, portrait, mic);
        if (mic ? entry.micHidden : entry.speakerHidden) return null;
        var own = mic ? entry.mic : entry.speaker;
        if (own == null && Off(s, portrait, mic)) return null;
        return own ?? Placement(s, portrait, mic);
    }

    internal static ControlLayout GetPageControls(Settings s, bool portrait, int page, out bool speakerHidden, out bool micHidden)
    {
        var entry = FindPage(s, portrait, page);
        speakerHidden = entry != null ? entry.speakerHidden || (entry.speaker == null && Off(s, portrait, false)) : Off(s, portrait, false);
        micHidden = entry != null ? entry.micHidden || (entry.mic == null && Off(s, portrait, true)) : Off(s, portrait, true);
        int columns = Columns(s, portrait);
        var speaker = (entry != null ? entry.speaker : null) ?? Placement(s, portrait, false);
        var mic = (entry != null ? entry.mic : null) ?? Placement(s, portrait, true);
        return Layout(speaker, mic, columns);
    }

    // Stores one page's faders; a page that matches the shared placement is dropped again.
    internal static void SetPageControls(Settings s, bool portrait, int page, ControlLayout c, bool speakerHidden, bool micHidden)
    {
        if (page < 0 || page >= MaxPages) throw new Exception("ページ番号が正しくありません。");
        int columns = Math.Max(1, Columns(s, portrait));
        var speaker = FromLayout(c.speakerRow, c.speakerColumn, c.speakerSlot, c.speakerWidth, c.speakerHeight, c.speakerSize, columns);
        var mic = FromLayout(c.micRow, c.micColumn, c.micSlot, c.micWidth, c.micHeight, c.micSize, columns);
        var pages = ControlPages(s, portrait);
        pages.RemoveAll(entry => entry == null || entry.page == page);
        if (!speakerHidden && !micHidden && !Off(s, portrait, false) && !Off(s, portrait, true) && Same(speaker, Placement(s, portrait, false)) && Same(mic, Placement(s, portrait, true))) return;
        if (speakerHidden == Off(s, portrait, false) && micHidden == Off(s, portrait, true) && Same(speaker, Placement(s, portrait, false)) && Same(mic, Placement(s, portrait, true))) return;
        pages.Add(new ControlPage { page = page, speaker = speaker, mic = mic, speakerHidden = speakerHidden, micHidden = micHidden });
        pages.Sort((a, b) => a.page.CompareTo(b.page));
    }

    static bool Same(ControlPlacement a, ControlPlacement b)
    {
        return a != null && b != null && a.row == b.row && a.column == b.column && a.width == b.width && a.height == b.height;
    }

    static ControlPlacement FromLayout(int row, int column, int slot, int width, int height, int size, int columns)
    {
        return new ControlPlacement
        {
            row = row >= 0 ? row : slot / columns, column = column >= 0 ? column : slot % columns,
            width = Positive(width, size), height = Positive(height, size),
        };
    }

    static ControlLayout Layout(ControlPlacement speaker, ControlPlacement mic, int columns)
    {
        return new ControlLayout
        {
            speakerSlot = speaker.row * columns + speaker.column, micSlot = mic.row * columns + mic.column,
            speakerSize = speaker.width == speaker.height ? speaker.width : 1, micSize = mic.width == mic.height ? mic.width : 1,
            speakerRow = speaker.row, speakerColumn = speaker.column, speakerWidth = speaker.width, speakerHeight = speaker.height,
            micRow = mic.row, micColumn = mic.column, micWidth = mic.width, micHeight = mic.height,
        };
    }

    internal static ControlLayout GetControls(Settings s, bool portrait)
    {
        MigrateControls(s);
        return Layout(Placement(s, portrait, false), Placement(s, portrait, true), Columns(s, portrait));
    }

    internal static void SetControls(Settings s, bool portrait, ControlLayout c)
    {
        int columns = Math.Max(1, Columns(s, portrait));
        SetPlacement(s, portrait, false, new ControlPlacement
        {
            row = c.speakerRow >= 0 ? c.speakerRow : c.speakerSlot / columns,
            column = c.speakerColumn >= 0 ? c.speakerColumn : c.speakerSlot % columns,
            width = Positive(c.speakerWidth, c.speakerSize), height = Positive(c.speakerHeight, c.speakerSize),
        });
        SetPlacement(s, portrait, true, new ControlPlacement
        {
            row = c.micRow >= 0 ? c.micRow : c.micSlot / columns,
            column = c.micColumn >= 0 ? c.micColumn : c.micSlot % columns,
            width = Positive(c.micWidth, c.micSize), height = Positive(c.micHeight, c.micSize),
        });
        MirrorLegacy(s, portrait);
    }

    static void MirrorLegacy(Settings s, bool portrait)
    {
        int columns = Math.Max(1, Columns(s, portrait)); var speaker = Placement(s, portrait, false); var mic = Placement(s, portrait, true);
        int speakerSize = speaker.width == speaker.height && speaker.width <= 2 ? speaker.width : 1;
        int micSize = mic.width == mic.height && mic.width <= 2 ? mic.width : 1;
        if (portrait)
        {
            s.portraitSpeakerSlot = speaker.row * columns + speaker.column; s.portraitMicSlot = mic.row * columns + mic.column;
            s.portraitSpeakerSize = speakerSize; s.portraitMicSize = micSize;
        }
        else
        {
            s.landscapeSpeakerSlot = speaker.row * columns + speaker.column; s.landscapeMicSlot = mic.row * columns + mic.column;
            s.landscapeSpeakerSize = speakerSize; s.landscapeMicSize = micSize;
        }
    }

    internal static TilePosition At(int page, int slot, int columns) { return new TilePosition { page = page, row = slot / columns, column = slot % columns }; }
    static bool GridCountValid(int value) { return value >= 2 && value <= 8; }
    static int LegacySize(int value) { return value == 2 ? 2 : 1; }

    internal static void MigrateGrid(Settings s)
    {
        int oldColumns = GridCountValid(s.columns) ? s.columns : 5, oldRows = GridCountValid(s.rows) ? s.rows : 3;
        if (!GridCountValid(s.landscapeColumns)) s.landscapeColumns = Math.Max(oldColumns, oldRows);
        if (!GridCountValid(s.landscapeRows)) s.landscapeRows = Math.Min(oldColumns, oldRows);
        if (!GridCountValid(s.portraitColumns)) s.portraitColumns = Math.Min(oldColumns, oldRows);
        if (!GridCountValid(s.portraitRows)) s.portraitRows = Math.Max(oldColumns, oldRows);
        s.columns = s.landscapeColumns; s.rows = s.landscapeRows;
    }

    internal static void MigrateControls(Settings s)
    {
        MigrateGrid(s);
        foreach (bool portrait in new[] { false, true })
        {
            int columns = Columns(s, portrait);
            int speakerSlot = portrait ? s.portraitSpeakerSlot : s.landscapeSpeakerSlot, micSlot = portrait ? s.portraitMicSlot : s.landscapeMicSlot;
            int speakerSize = portrait ? s.portraitSpeakerSize : s.landscapeSpeakerSize, micSize = portrait ? s.portraitMicSize : s.landscapeMicSize;
            if (speakerSize == 0) { speakerSlot = s.speakerSlot; speakerSize = s.speakerSize; }
            if (micSize == 0) { micSlot = s.micSlot; micSize = s.micSize; }
            // Same repair as 1.05: new or legacy files may leave both faders on slot 0.
            int total = Math.Max(2, columns * Rows(s, portrait));
            if (speakerSlot < 0 || speakerSlot >= total) speakerSlot = 0;
            if (micSlot < 0 || micSlot >= total || micSlot == speakerSlot) micSlot = speakerSlot == 0 ? 1 : 0;
            if (Placement(s, portrait, false) == null) SetPlacement(s, portrait, false, new ControlPlacement { row = Math.Max(0, speakerSlot) / columns, column = Math.Max(0, speakerSlot) % columns, width = LegacySize(speakerSize), height = LegacySize(speakerSize) });
            if (Placement(s, portrait, true) == null) SetPlacement(s, portrait, true, new ControlPlacement { row = Math.Max(0, micSlot) / columns, column = Math.Max(0, micSlot) % columns, width = LegacySize(micSize), height = LegacySize(micSize) });
            MirrorLegacy(s, portrait);
        }
    }

    internal static void Migrate(Settings s)
    {
        MigrateGrid(s); MigrateControls(s);
        if (s.pageCount < 1) s.pageCount = 1;
        if (s.landscapePageCount < 1) s.landscapePageCount = s.pageCount;
        if (s.portraitPageCount < 1) s.portraitPageCount = s.pageCount;
        foreach (var app in s.apps)
        {
            if (app.width <= 0) app.width = app.size == 2 ? 2 : 1;
            if (app.height <= 0) app.height = app.size == 2 ? 2 : 1;
            app.size = app.width == app.height && app.width <= 2 ? app.width : 1;
            if (app.fontSize == 0) app.fontSize = 11;
            if (app.iconScale == 0) app.iconScale = 82;
            if (!app.labelOpacity.HasValue) app.labelOpacity = 45;
        }
        foreach (bool portrait in new[] { false, true }) PlaceUnpositioned(s, portrait);
        s.landscapePageCount = Math.Max(s.landscapePageCount, RequiredPages(s, "landscape")); s.portraitPageCount = Math.Max(s.portraitPageCount, RequiredPages(s, "portrait"));
    }

    static void SetPosition(AppEntry app, bool portrait, TilePosition value) { if (portrait) app.portrait = value; else app.landscape = value; }
    static string Cell(int page, int row, int column) { return page + ":" + row + ":" + column; }
    static bool AreaFree(HashSet<string> occupied, int page, int row, int column, int width, int height)
    {
        for (int y = row; y < row + height; y++) for (int x = column; x < column + width; x++) if (occupied.Contains(Cell(page, y, x))) return false; return true;
    }
    static void MarkArea(HashSet<string> occupied, int page, int row, int column, int width, int height)
    {
        for (int y = row; y < row + height; y++) for (int x = column; x < column + width; x++) occupied.Add(Cell(page, y, x));
    }
    static bool Overlap(int ar, int ac, int aw, int ah, int br, int bc, int bw, int bh) { return ar < br + bh && ar + ah > br && ac < bc + bw && ac + aw > bc; }

    static bool Fits(HashSet<string> occupied, TilePosition p, int width, int height, int columns, int rows, Settings s, bool portrait)
    {
        if (p == null || p.page < 0 || p.page >= MaxPages || p.row < 0 || p.column < 0 || p.row + height > rows || p.column + width > columns) return false;
        var speaker = PagePlacement(s, portrait, false, p.page); var mic = PagePlacement(s, portrait, true, p.page);
        if (speaker != null && Overlap(p.row, p.column, width, height, speaker.row, speaker.column, speaker.width, speaker.height)) return false;
        if (mic != null && Overlap(p.row, p.column, width, height, mic.row, mic.column, mic.width, mic.height)) return false;
        return AreaFree(occupied, p.page, p.row, p.column, width, height);
    }

    static void Mark(HashSet<string> occupied, TilePosition p, int width, int height, int columns, int rows, Settings s, bool portrait)
    {
        if (!Fits(occupied, p, width, height, columns, rows, s, portrait)) throw new Exception("ボタンが重なるか枠からはみ出します。縦・横の配置を確認し、空き枠へ移動してください。");
        MarkArea(occupied, p.page, p.row, p.column, width, height);
    }

    static TilePosition FindSpace(HashSet<string> occupied, int width, int height, int columns, int rows, Settings s, bool portrait, TilePosition wanted)
    {
        TilePosition best = null; int score = int.MaxValue;
        for (int page = 0; page < MaxPages; page++) for (int row = 0; row + height <= rows; row++) for (int column = 0; column + width <= columns; column++)
        {
            var candidate = new TilePosition { page = page, row = row, column = column };
            if (!Fits(occupied, candidate, width, height, columns, rows, s, portrait)) continue;
            int value = wanted == null ? page * 1000 + row * 10 + column : Math.Abs(page - wanted.page) * 1000 + Math.Abs(row - wanted.row) * 10 + Math.Abs(column - wanted.column);
            if (value < score) { score = value; best = candidate; }
        }
        if (best == null) throw new Exception("配置する空き枠がありません。"); return best;
    }

    static void PlaceUnpositioned(Settings s, bool portrait)
    {
        int columns = Columns(s, portrait), rows = Rows(s, portrait); string orientation = OrientationName(portrait); var occupied = new HashSet<string>();
        foreach (var app in s.apps) if (app.orientation == orientation && Position(app, portrait) != null) Mark(occupied, Position(app, portrait), Width(app), Height(app), columns, rows, s, portrait);
        foreach (var app in s.apps) if (app.orientation == orientation && Position(app, portrait) == null) { var p = FindSpace(occupied, Width(app), Height(app), columns, rows, s, portrait, null); SetPosition(app, portrait, p); Mark(occupied, p, Width(app), Height(app), columns, rows, s, portrait); }
    }

    static ControlPlacement FindControl(HashSet<string> occupied, ControlPlacement wanted, int columns, int rows)
    {
        ControlPlacement best = null; int score = int.MaxValue;
        for (int row = 0; row + wanted.height <= rows; row++) for (int column = 0; column + wanted.width <= columns; column++)
        {
            if (!AreaFree(occupied, 0, row, column, wanted.width, wanted.height)) continue; int value = Math.Abs(row - wanted.row) * 10 + Math.Abs(column - wanted.column);
            if (value < score) { score = value; best = new ControlPlacement { row = row, column = column, width = wanted.width, height = wanted.height }; }
        }
        if (best == null) throw new Exception("フェーダーを配置できる空き枠がありません。"); return best;
    }

    internal static void Reflow(Settings s, string orientation, int oldColumns)
    {
        bool portrait = orientation == "portrait"; int columns = Columns(s, portrait), rows = Rows(s, portrait); var controls = new HashSet<string>();
        var speaker = FindControl(controls, Placement(s, portrait, false), columns, rows); MarkArea(controls, 0, speaker.row, speaker.column, speaker.width, speaker.height);
        var mic = FindControl(controls, Placement(s, portrait, true), columns, rows); MarkArea(controls, 0, mic.row, mic.column, mic.width, mic.height);
        SetPlacement(s, portrait, false, speaker); SetPlacement(s, portrait, true, mic); MirrorLegacy(s, portrait);
        foreach (var entry in ControlPages(s, portrait))
        {
            var pageControls = new HashSet<string>();
            if (entry.speaker != null) { entry.speaker = FindControl(pageControls, entry.speaker, columns, rows); MarkArea(pageControls, 0, entry.speaker.row, entry.speaker.column, entry.speaker.width, entry.speaker.height); }
            else if (!entry.speakerHidden) MarkArea(pageControls, 0, speaker.row, speaker.column, speaker.width, speaker.height);
            if (entry.mic != null) entry.mic = FindControl(pageControls, entry.mic, columns, rows);
        }
        var occupied = new HashSet<string>();
        foreach (var app in s.apps) if (app.orientation == orientation)
        {
            var original = Position(app, portrait); var placed = Fits(occupied, original, Width(app), Height(app), columns, rows, s, portrait) ? original : FindSpace(occupied, Width(app), Height(app), columns, rows, s, portrait, original);
            SetPosition(app, portrait, placed); Mark(occupied, placed, Width(app), Height(app), columns, rows, s, portrait);
        }
        if (portrait) s.portraitPageCount = Math.Max(s.portraitPageCount, RequiredPages(s, orientation)); else s.landscapePageCount = Math.Max(s.landscapePageCount, RequiredPages(s, orientation));
    }

    // 3.1: removes one page of one orientation. Its buttons and fader overrides go; later pages move up.
    // Returns how many buttons were removed.
    internal static int DeletePage(Settings s, string orientation, int page)
    {
        bool portrait = orientation == "portrait";
        int pages = Pages(s, orientation);
        if (pages <= 1) throw new Exception("最後の1ページは削除できません。");
        if (page < 0 || page >= pages) throw new Exception("ページ番号が正しくありません。");
        int removed = s.apps.RemoveAll(app => app.orientation == orientation && Position(app, portrait) != null && Position(app, portrait).page == page);
        foreach (var app in s.apps)
        {
            if (app.orientation != orientation) continue;
            var position = Position(app, portrait);
            if (position != null && position.page > page) position.page--;
        }
        var controlPages = ControlPages(s, portrait);
        controlPages.RemoveAll(entry => entry == null || entry.page == page);
        foreach (var entry in controlPages) if (entry.page > page) entry.page--;
        if (portrait) s.portraitPageCount = pages - 1;
        else
        {
            s.landscapePageCount = pages - 1;
            s.pageCount = pages - 1;
        }
        return removed;
    }

    // 3.1 presets: places new buttons of one orientation in reading order from firstPage on, around the
    // buttons and faders already there. A page that fills up continues on the next one.
    internal static void PlaceFrom(Settings s, string orientation, List<AppEntry> added, int firstPage)
    {
        bool portrait = orientation == "portrait"; int columns = Columns(s, portrait), rows = Rows(s, portrait); var occupied = new HashSet<string>();
        foreach (var app in s.apps) if (app.orientation == orientation && Position(app, portrait) != null && !added.Contains(app)) MarkArea(occupied, Position(app, portrait).page, Position(app, portrait).row, Position(app, portrait).column, Width(app), Height(app));
        foreach (var app in added)
        {
            TilePosition found = null;
            for (int page = firstPage; page < MaxPages && found == null; page++) for (int row = 0; row + Height(app) <= rows && found == null; row++) for (int column = 0; column + Width(app) <= columns && found == null; column++)
            {
                var candidate = new TilePosition { page = page, row = row, column = column };
                if (Fits(occupied, candidate, Width(app), Height(app), columns, rows, s, portrait)) found = candidate;
            }
            if (found == null) throw new Exception("配置する空き枠がありません。");
            SetPosition(app, portrait, found); MarkArea(occupied, found.page, found.row, found.column, Width(app), Height(app));
        }
        int pages = RequiredPages(s, orientation);
        if (portrait) s.portraitPageCount = Math.Max(s.portraitPageCount, pages); else { s.landscapePageCount = Math.Max(s.landscapePageCount, pages); s.pageCount = s.landscapePageCount; }
    }

    internal static int RequiredPages(Settings s, string orientation)
    {
        int count = 1; bool portrait = orientation == "portrait"; foreach (var app in s.apps) if (app.orientation == orientation && Position(app, portrait) != null) count = Math.Max(count, Position(app, portrait).page + 1); return count;
    }
    internal static int Pages(Settings s, string orientation) { return Math.Max(orientation == "portrait" ? s.portraitPageCount : s.landscapePageCount, RequiredPages(s, orientation)); }
    static bool ControlDimensionsValid(ControlPlacement p) { return p != null && ((p.width == 1 && p.height == 1) || (p.width == 2 && p.height == 2) || (p.width == 3 && p.height == 1) || (p.width == 4 && p.height == 1) || (p.width == 3 && p.height == 2) || (p.width == 4 && p.height == 2)); }
    static bool ControlFits(ControlPlacement p, int columns, int rows)
    {
        return ControlDimensionsValid(p) && p.row >= 0 && p.column >= 0 && p.row + p.height <= rows && p.column + p.width <= columns;
    }

    static bool PairValid(ControlPlacement a, ControlPlacement b, int columns, int rows)
    {
        if (a != null && !ControlFits(a, columns, rows)) return false;
        if (b != null && !ControlFits(b, columns, rows)) return false;
        return a == null || b == null || !Overlap(a.row, a.column, a.width, a.height, b.row, b.column, b.width, b.height);
    }

    static bool ControlsValid(Settings s, bool portrait)
    {
        int columns = Columns(s, portrait), rows = Rows(s, portrait); var a = Placement(s, portrait, false); var b = Placement(s, portrait, true);
        if (a == null || b == null || !PairValid(a, b, columns, rows)) return false;
        var seen = new HashSet<int>();
        foreach (var entry in ControlPages(s, portrait))
        {
            if (entry == null || entry.page < 0 || entry.page >= MaxPages || !seen.Add(entry.page)) return false;
            if (!PairValid(PagePlacement(s, portrait, false, entry.page), PagePlacement(s, portrait, true, entry.page), columns, rows)) return false;
        }
        return true;
    }

    internal static void Validate(Settings s)
    {
        if (s.pageCount < 1 || s.pageCount > MaxPages || s.landscapePageCount < 1 || s.landscapePageCount > MaxPages || s.portraitPageCount < 1 || s.portraitPageCount > MaxPages) throw new Exception("縦・横のページ数はそれぞれ1～40です。");
        if (!GridCountValid(s.landscapeColumns) || !GridCountValid(s.landscapeRows) || !GridCountValid(s.portraitColumns) || !GridCountValid(s.portraitRows)) throw new Exception("縦・横の枠数は2～8です。");
        foreach (bool portrait in new[] { false, true }) if (!ControlsValid(s, portrait)) throw new Exception((portrait ? "縦" : "横") + "配置でフェーダー同士が重なるか枠からはみ出します。先に空き枠へ移動してください。");
        foreach (var app in s.apps)
        {
            WidgetRegistry.ValidateDimensions(app);
            if (app.fontSize < 8 || app.fontSize > 28 || app.iconScale < 20 || app.iconScale > 100 || !app.labelOpacity.HasValue || app.labelOpacity.Value < 0 || app.labelOpacity.Value > 100 || (app.keyClear.HasValue && (app.keyClear.Value < 0 || app.keyClear.Value > 100))) throw new Exception("文字・アイコンの表示設定が範囲外です。");
        }
        foreach (bool portrait in new[] { false, true })
        {
            var occupied = new HashSet<string>(); string orientation = OrientationName(portrait);
            foreach (var app in s.apps) if (app.orientation == orientation) Mark(occupied, Position(app, portrait), Width(app), Height(app), Columns(s, portrait), Rows(s, portrait), s, portrait);
        }
    }
}
