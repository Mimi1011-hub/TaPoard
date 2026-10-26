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
}

static class DeckLayout
{
    internal const int MaxPages = 40;

    internal static string OrientationName(bool portrait)
    {
        return portrait ? "portrait" : "landscape";
    }

    internal static int Columns(Settings s, bool portrait)
    {
        return portrait ? s.portraitColumns : s.landscapeColumns;
    }

    internal static int Rows(Settings s, bool portrait)
    {
        return portrait ? s.portraitRows : s.landscapeRows;
    }

    internal static ControlLayout GetControls(Settings s, bool portrait)
    {
        return portrait
            ? new ControlLayout
            {
                speakerSlot = s.portraitSpeakerSlot,
                micSlot = s.portraitMicSlot,
                speakerSize = s.portraitSpeakerSize,
                micSize = s.portraitMicSize,
            }
            : new ControlLayout
            {
                speakerSlot = s.landscapeSpeakerSlot,
                micSlot = s.landscapeMicSlot,
                speakerSize = s.landscapeSpeakerSize,
                micSize = s.landscapeMicSize,
            };
    }

    internal static void SetControls(Settings s, bool portrait, ControlLayout c)
    {
        if (portrait)
        {
            s.portraitSpeakerSlot = c.speakerSlot;
            s.portraitMicSlot = c.micSlot;
            s.portraitSpeakerSize = c.speakerSize;
            s.portraitMicSize = c.micSize;
        }
        else
        {
            s.landscapeSpeakerSlot = c.speakerSlot;
            s.landscapeMicSlot = c.micSlot;
            s.landscapeSpeakerSize = c.speakerSize;
            s.landscapeMicSize = c.micSize;
        }
    }

    internal static TilePosition Position(AppEntry a, bool portrait)
    {
        return portrait ? a.portrait : a.landscape;
    }

    static void SetPosition(AppEntry a, bool portrait, TilePosition p)
    {
        if (portrait)
            a.portrait = p;
        else
            a.landscape = p;
    }

    internal static TilePosition At(int page, int slot, int columns)
    {
        return new TilePosition
        {
            page = page,
            row = slot / columns,
            column = slot % columns,
        };
    }

    internal static void MigrateGrid(Settings s)
    {
        int oldColumns = s.columns >= 3 && s.columns <= 8 ? s.columns : 5;
        int oldRows = s.rows >= 2 && s.rows <= 5 ? s.rows : 3;
        if (!GridCountValid(s.landscapeColumns))
            s.landscapeColumns = Math.Max(oldColumns, oldRows);
        if (!GridCountValid(s.landscapeRows))
            s.landscapeRows = Math.Min(oldColumns, oldRows);
        if (!GridCountValid(s.portraitColumns))
            s.portraitColumns = Math.Min(oldColumns, oldRows);
        if (!GridCountValid(s.portraitRows))
            s.portraitRows = Math.Max(oldColumns, oldRows);
        s.columns = s.landscapeColumns;
        s.rows = s.landscapeRows;
    }

    static bool GridCountValid(int count)
    {
        return count >= 2 && count <= 8;
    }

    static int NormalizeSize(int size)
    {
        return size == 2 ? 2 : 1;
    }

    // Copies legacy shared fader settings into an orientation the first time it is seen.
    internal static void MigrateControls(Settings s)
    {
        if (s.landscapeSpeakerSize == 0)
            SetControls(s, false, LegacyControls(s));
        if (s.portraitSpeakerSize == 0)
            SetControls(s, true, LegacyControls(s));
        s.landscapeSpeakerSize = NormalizeSize(s.landscapeSpeakerSize);
        s.landscapeMicSize = NormalizeSize(s.landscapeMicSize);
        s.portraitSpeakerSize = NormalizeSize(s.portraitSpeakerSize);
        s.portraitMicSize = NormalizeSize(s.portraitMicSize);
    }

    static ControlLayout LegacyControls(Settings s)
    {
        return new ControlLayout
        {
            speakerSlot = s.speakerSlot,
            micSlot = s.micSlot,
            speakerSize = NormalizeSize(s.speakerSize),
            micSize = NormalizeSize(s.micSize),
        };
    }

    internal static void Migrate(Settings s)
    {
        MigrateGrid(s);
        MigrateControls(s);
        if (s.pageCount < 1)
            s.pageCount = 1;
        if (s.landscapePageCount < 1)
            s.landscapePageCount = s.pageCount;
        if (s.portraitPageCount < 1)
            s.portraitPageCount = s.pageCount;
        foreach (var a in s.apps)
        {
            if (a.size == 0)
                a.size = 1;
            if (a.fontSize == 0)
                a.fontSize = 11;
            if (a.iconScale == 0)
                a.iconScale = 82;
            if (!a.labelOpacity.HasValue)
                a.labelOpacity = 45;
        }
        foreach (bool portrait in new[] { false, true })
            PlaceUnpositioned(s, portrait);
        s.landscapePageCount = Math.Max(s.landscapePageCount, RequiredPages(s, "landscape"));
        s.portraitPageCount = Math.Max(s.portraitPageCount, RequiredPages(s, "portrait"));
    }

    // Keeps existing positions and puts each entry without one into the first free cell.
    static void PlaceUnpositioned(Settings s, bool portrait)
    {
        var occupied = new HashSet<string>();
        int cols = Columns(s, portrait),
            rows = Rows(s, portrait);
        string orientation = OrientationName(portrait);
        foreach (var a in s.apps)
        {
            if (a.orientation != orientation)
                continue;
            var p = Position(a, portrait);
            if (p != null)
                Mark(occupied, p, a.size, cols, rows, s, portrait);
        }
        foreach (var a in s.apps)
        {
            if (a.orientation != orientation || Position(a, portrait) != null)
                continue;
            TilePosition p = FindFirstFree(occupied, a.size, cols, rows, s, portrait);
            if (p == null)
                throw new Exception("配置する空き枠がありません。");
            SetPosition(a, portrait, p);
            Mark(occupied, p, a.size, cols, rows, s, portrait);
        }
    }

    static TilePosition FindFirstFree(HashSet<string> occupied, int size, int cols, int rows, Settings s, bool portrait)
    {
        for (int page = 0; page < MaxPages; page++)
        for (int slot = 0; slot < cols * rows; slot++)
        {
            var candidate = At(page, slot, cols);
            if (Fits(occupied, candidate, size, cols, rows, s, portrait))
                return candidate;
        }
        return null;
    }

    // Re-places faders and buttons after the grid of one orientation changed size.
    internal static void Reflow(Settings s, string orientation, int oldColumns)
    {
        bool portrait = orientation == "portrait";
        int cols = Columns(s, portrait),
            rows = Rows(s, portrait);
        var controls = new HashSet<string>();
        var c = GetControls(s, portrait);
        int previousColumns = Math.Max(1, oldColumns);
        TilePosition speaker = FindControl(
            controls,
            c.speakerSlot / previousColumns,
            c.speakerSlot % previousColumns,
            c.speakerSize,
            cols,
            rows
        );
        MarkControl(controls, speaker, c.speakerSize);
        TilePosition mic = FindControl(
            controls,
            c.micSlot / previousColumns,
            c.micSlot % previousColumns,
            c.micSize,
            cols,
            rows
        );
        MarkControl(controls, mic, c.micSize);
        c.speakerSlot = speaker.row * cols + speaker.column;
        c.micSlot = mic.row * cols + mic.column;
        SetControls(s, portrait, c);

        var occupied = new HashSet<string>();
        foreach (var a in s.apps)
        {
            if (a.orientation != orientation)
                continue;
            var original = Position(a, portrait);
            TilePosition placed;
            if (original != null && Fits(occupied, original, a.size, cols, rows, s, portrait))
                placed = original;
            else
                placed = FindNearest(occupied, original, a.size, cols, rows, s, portrait);
            SetPosition(a, portrait, placed);
            Mark(occupied, placed, a.size, cols, rows, s, portrait);
        }
        if (portrait)
            s.portraitPageCount = Math.Max(s.portraitPageCount, RequiredPages(s, orientation));
        else
            s.landscapePageCount = Math.Max(s.landscapePageCount, RequiredPages(s, orientation));
    }

    static TilePosition FindControl(
        HashSet<string> occupied,
        int wantedRow,
        int wantedColumn,
        int size,
        int cols,
        int rows
    )
    {
        TilePosition best = null;
        int score = int.MaxValue;
        for (int y = 0; y + size <= rows; y++)
        for (int x = 0; x + size <= cols; x++)
        {
            if (!AreaFree(occupied, 0, y, x, size))
                continue;
            int candidate = Math.Abs(y - wantedRow) + Math.Abs(x - wantedColumn);
            if (candidate < score)
            {
                score = candidate;
                best = new TilePosition
                {
                    page = 0,
                    row = y,
                    column = x,
                };
            }
        }
        if (best == null)
            throw new Exception("フェーダーを配置できる空き枠がありません。");
        return best;
    }

    static bool AreaFree(HashSet<string> occupied, int page, int row, int column, int size)
    {
        for (int y = row; y < row + size; y++)
        for (int x = column; x < column + size; x++)
            if (occupied.Contains(Cell(page, y, x)))
                return false;
        return true;
    }

    static void MarkArea(HashSet<string> occupied, int page, int row, int column, int size)
    {
        for (int y = row; y < row + size; y++)
        for (int x = column; x < column + size; x++)
            occupied.Add(Cell(page, y, x));
    }

    static void MarkControl(HashSet<string> occupied, TilePosition p, int size)
    {
        MarkArea(occupied, 0, p.row, p.column, size);
    }

    static TilePosition FindNearest(
        HashSet<string> occupied,
        TilePosition original,
        int size,
        int cols,
        int rows,
        Settings s,
        bool portrait
    )
    {
        TilePosition best = null;
        int score = int.MaxValue;
        int wantedPage = original == null ? 0 : original.page;
        int wantedRow = original == null ? 0 : original.row;
        int wantedColumn = original == null ? 0 : original.column;
        for (int page = 0; page < MaxPages; page++)
        for (int y = 0; y + size <= rows; y++)
        for (int x = 0; x + size <= cols; x++)
        {
            var candidate = new TilePosition
            {
                page = page,
                row = y,
                column = x,
            };
            if (!Fits(occupied, candidate, size, cols, rows, s, portrait))
                continue;
            int value = Math.Abs(page - wantedPage) * 1000 + Math.Abs(y - wantedRow) * 10 + Math.Abs(x - wantedColumn);
            if (value < score)
            {
                score = value;
                best = candidate;
            }
        }
        if (best == null)
            throw new Exception("配置する空き枠がありません。");
        return best;
    }

    static string Cell(int page, int row, int col)
    {
        return page + ":" + row + ":" + col;
    }

    static bool Fits(HashSet<string> occupied, TilePosition p, int size, int cols, int rows, Settings s, bool portrait)
    {
        if (
            p.page < 0
            || p.page >= MaxPages
            || p.row < 0
            || p.column < 0
            || p.row + size > rows
            || p.column + size > cols
        )
            return false;
        var c = GetControls(s, portrait);
        for (int y = p.row; y < p.row + size; y++)
        for (int x = p.column; x < p.column + size; x++)
        {
            if (
                ControlCell(c.speakerSlot, c.speakerSize, y, x, cols, rows)
                || ControlCell(c.micSlot, c.micSize, y, x, cols, rows)
                || occupied.Contains(Cell(p.page, y, x))
            )
                return false;
        }
        return true;
    }

    static void Mark(HashSet<string> occupied, TilePosition p, int size, int cols, int rows, Settings s, bool portrait)
    {
        if (!Fits(occupied, p, size, cols, rows, s, portrait))
            throw new Exception("ボタンが重なるか枠からはみ出します。縦・横の配置を確認し、空き枠へ移動してください。");
        MarkArea(occupied, p.page, p.row, p.column, size);
    }

    internal static int RequiredPages(Settings s, string orientation)
    {
        int count = 1;
        bool portrait = orientation == "portrait";
        foreach (var a in s.apps)
            if (a.orientation == orientation)
            {
                var p = Position(a, portrait);
                if (p != null)
                    count = Math.Max(count, p.page + 1);
            }
        return count;
    }

    internal static int Pages(Settings s, string orientation)
    {
        return Math.Max(
            orientation == "portrait" ? s.portraitPageCount : s.landscapePageCount,
            RequiredPages(s, orientation)
        );
    }

    static bool ControlCell(int slot, int size, int row, int column, int cols, int rows)
    {
        int top = slot / cols,
            left = slot % cols;
        return top >= 0
            && left >= 0
            && top + size <= rows
            && left + size <= cols
            && row >= top
            && row < top + size
            && column >= left
            && column < left + size;
    }

    static bool ControlsValid(Settings s, int cols, int rows, bool portrait)
    {
        var c = GetControls(s, portrait);
        int sy = c.speakerSlot / cols,
            sx = c.speakerSlot % cols,
            my = c.micSlot / cols,
            mx = c.micSlot % cols;
        if (sy + c.speakerSize > rows || sx + c.speakerSize > cols || my + c.micSize > rows || mx + c.micSize > cols)
            return false;
        return !(sy < my + c.micSize && sy + c.speakerSize > my && sx < mx + c.micSize && sx + c.speakerSize > mx);
    }

    static bool TileSizeValid(int size)
    {
        return size == 1 || size == 2;
    }

    internal static void Validate(Settings s)
    {
        if (s.pageCount < 1 || s.pageCount > MaxPages)
            throw new Exception("ページ数は1～40です。");
        if (
            s.landscapePageCount < 1
            || s.landscapePageCount > MaxPages
            || s.portraitPageCount < 1
            || s.portraitPageCount > MaxPages
        )
            throw new Exception("縦・横のページ数はそれぞれ1～40です。");
        if (
            !TileSizeValid(s.landscapeSpeakerSize)
            || !TileSizeValid(s.landscapeMicSize)
            || !TileSizeValid(s.portraitSpeakerSize)
            || !TileSizeValid(s.portraitMicSize)
        )
            throw new Exception("フェーダーサイズは1×1または2×2です。");
        foreach (bool portrait in new[] { false, true })
            if (!ControlsValid(s, Columns(s, portrait), Rows(s, portrait), portrait))
                throw new Exception(
                    (portrait ? "縦" : "横")
                        + "配置でフェーダー同士が重なるか枠からはみ出します。先に空き枠へ移動してください。"
                );
        if (
            !GridCountValid(s.landscapeColumns)
            || !GridCountValid(s.portraitColumns)
            || !GridCountValid(s.landscapeRows)
            || !GridCountValid(s.portraitRows)
        )
            throw new Exception("縦・横の枠数が範囲外です。");
        foreach (var a in s.apps)
        {
            if (!TileSizeValid(a.size))
                throw new Exception("ボタンサイズは1×1または2×2です。");
            if (
                a.fontSize < 8
                || a.fontSize > 28
                || a.iconScale < 20
                || a.iconScale > 100
                || !a.labelOpacity.HasValue
                || a.labelOpacity.Value < 0
                || a.labelOpacity.Value > 100
            )
                throw new Exception("文字・アイコンの表示設定が範囲外です。");
        }
        foreach (bool portrait in new[] { false, true })
        {
            var occupied = new HashSet<string>();
            string orientation = OrientationName(portrait);
            foreach (var a in s.apps)
            {
                if (a.orientation != orientation)
                    continue;
                var p = Position(a, portrait);
                if (p == null)
                    throw new Exception("ボタンの配置がありません。");
                Mark(occupied, p, a.size, Columns(s, portrait), Rows(s, portrait), s, portrait);
            }
        }
    }
}
