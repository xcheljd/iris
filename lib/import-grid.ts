/**
 * Shared engine behind every spreadsheet import (catalog, promos, prospects).
 *
 * 1. Input becomes a grid of strings: pasted spreadsheet text, a CSV/TSV file
 *    (`parseDelimited`) or an .xlsx sheet (`gridFromSheet`).
 * 2. `detectLayout` looks for a title row in the first rows. Titles are
 *    matched against each field's synonyms, so columns can be in any order;
 *    rows above the title row (a sheet heading, a date line) are skipped.
 *    Without a title row the fields are read in their documented A, B, C…
 *    order.
 * 3. The caller may override the mapping (the import dialog's column
 *    pickers), then `mapRows` turns the grid into records that keep their
 *    1-based row number in the source file for error messages.
 */

export type Grid = string[][];

export interface ImportField<K extends string = string> {
  key: K;
  label: string;
  required?: boolean;
  /** Title spellings that identify this column (compared case- and punctuation-insensitively). */
  synonyms: readonly string[];
}

/** Field key → 0-based column index, or null when the file has no such column. */
export type ColumnMapping<K extends string = string> = Record<K, number | null>;

export interface GridLayout<K extends string = string> {
  /** 0-based index of the title row, or null when the file has none. */
  headerRow: number | null;
  /** 0-based index of the first data row. */
  dataStart: number;
  mapping: ColumnMapping<K>;
  /**
   * Column holding each row's number in the original file, when the text
   * was produced by `toMappedText` (the dialog re-sends mapped rows).
   */
  rowColumn?: number | null;
  /** Column holding each row's sheet name (multi-sheet workbooks), likewise. */
  sheetColumn?: number | null;
}

export interface MappedRow<K extends string = string> {
  /** 1-based row number in the source file (or sheet). */
  sourceRow: number;
  /** Workbook sheet the row came from; absent for pasted text, CSV and single-sheet files. */
  sourceSheet?: string;
  cells: Record<K, string>;
}

/** "Row 7", or "Vellamy sheet, row 7" for a row from a multi-sheet workbook. */
export function describeSource(r: { sourceRow: number; sourceSheet?: string }): string {
  return r.sourceSheet ? `${r.sourceSheet} sheet, row ${r.sourceRow}` : `Row ${r.sourceRow}`;
}

/** The duplicate pick meaning "import none of the copies". */
export const SKIP_PICK = "__skip";

/** A row's identity in its file: "Vellamy#7", or "#7" without a sheet. */
export function rowKeyOf(r: { sourceRow: number; sourceSheet?: string | null }): string {
  return `${r.sourceSheet ?? ""}#${r.sourceRow}`;
}

/** One sheet of an import: a workbook sheet, or the whole of a paste/CSV (no name). */
export interface ImportSheet<K extends string = string> {
  name?: string;
  grid: Grid;
  layout: GridLayout<K>;
}

/** Tab for pasted spreadsheet text, otherwise whichever of , or ; appears more. */
export function detectSeparator(line: string): string {
  if (line.includes("\t")) return "\t";
  // Commas inside decimal-comma numbers ("1295,00") don't count as separators.
  const commas = (line.replace(/\d,\d{1,2}(?!\d)/g, "").match(/,/g) ?? []).length;
  const semis = (line.match(/;/g) ?? []).length;
  return semis > 0 && semis >= commas ? ";" : ",";
}

/**
 * RFC 4180 reader: quoted fields may hold the separator, doubled quotes and
 * line breaks. Every source line keeps its slot (blank lines become empty
 * rows), so grid index + 1 is the row number a spreadsheet shows.
 */
export function parseDelimited(text: string, sep?: string): Grid {
  const src = text.replace(/^\uFEFF/, "");
  // Detect from the busiest of the first lines: a sheet heading on line 1
  // ("Spring sale") has no separators to go by.
  const sample = src.split(/\r?\n/).slice(0, 10)
    .reduce((best, l) => ((l.match(/[\t,;]/g) ?? []).length > (best.match(/[\t,;]/g) ?? []).length ? l : best), "");
  const s = sep ?? detectSeparator(sample);
  const rows: Grid = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"' && field.trim() === "") {
      field = "";
      inQuotes = true;
    } else if (ch === s) {
      row.push(field.trim()); field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field.trim()); rows.push(row);
      row = []; field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) { row.push(field.trim()); rows.push(row); }
  return rows;
}

function cellText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) {
    const y = v.getUTCFullYear(), m = String(v.getUTCMonth() + 1).padStart(2, "0"), d = String(v.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number") {
    // Keep integers exact (model numbers like 123456) and trim float noise.
    return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  }
  return String(v).trim();
}

/** Data rows a sheet holds below its title row (0 for an empty sheet). */
export function dataRowCount(grid: Grid, layout: GridLayout): number {
  let n = 0;
  for (let r = layout.dataStart; r < grid.length; r++) if (grid[r].some((c) => c !== "")) n++;
  return n;
}

/** An .xlsx sheet (rows of numbers, strings, dates, booleans, nulls) as a string grid. */
export function gridFromSheet(data: readonly (readonly unknown[])[]): Grid {
  return data.map((r) => r.map(cellText));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%#]/g, "");

function matchField<K extends string>(title: string, fields: readonly ImportField<K>[]): K | null {
  const t = norm(title);
  if (!t) return null;
  for (const f of fields) if (norm(f.label) === t || f.synonyms.some((syn) => norm(syn) === t)) return f.key;
  return null;
}

const nonEmpty = (r: string[] | undefined) => (r ?? []).filter((c) => c !== "").length;

/** Positional mapping: the n-th field reads column n. */
export function positionalMapping<K extends string>(fields: readonly ImportField<K>[]): ColumnMapping<K> {
  return Object.fromEntries(fields.map((f, i) => [f.key, i])) as ColumnMapping<K>;
}

/**
 * A row is the title row when at least two of its cells name a field (or one,
 * for single-field files). Only the first `scan` rows are searched.
 */
export function detectLayout<K extends string>(grid: Grid, fields: readonly ImportField<K>[], scan = 10): GridLayout<K> {
  const need = Math.min(2, fields.length);
  for (let r = 0; r < Math.min(scan, grid.length); r++) {
    const mapping = Object.fromEntries(fields.map((f) => [f.key, null])) as ColumnMapping<K>;
    let hits = 0;
    grid[r].forEach((cell, c) => {
      const key = matchField(cell, fields);
      if (key && mapping[key] == null) { mapping[key] = c; hits++; }
    });
    if (hits >= need) {
      const at = (title: string) => { const i = grid[r].findIndex((cell) => cell === title); return i >= 0 ? i : null; };
      return { headerRow: r, dataStart: r + 1, mapping, rowColumn: at(SOURCE_ROW_TITLE), sheetColumn: at(SOURCE_SHEET_TITLE) };
    }
  }
  // No titles: skip leading lines with fewer than two filled cells (a sheet
  // heading such as "Memorial Day Sale"), then read columns in order.
  let dataStart = 0;
  while (dataStart < grid.length && dataStart < scan && nonEmpty(grid[dataStart]) < Math.min(2, fields.length)) dataStart++;
  if (dataStart >= grid.length) dataStart = 0;
  return { headerRow: null, dataStart, mapping: positionalMapping(fields) };
}

/** Grid → records keyed by field, skipping blank rows. */
export function mapRows<K extends string>(grid: Grid, layout: GridLayout<K>, fields: readonly ImportField<K>[], sheetName?: string): MappedRow<K>[] {
  const out: MappedRow<K>[] = [];
  for (let r = layout.dataStart; r < grid.length; r++) {
    const row = grid[r];
    if (nonEmpty(row) === 0) continue;
    const cells = {} as Record<K, string>;
    for (const f of fields) {
      const c = layout.mapping[f.key];
      cells[f.key] = c == null ? "" : (row[c] ?? "");
    }
    const rc = layout.rowColumn;
    const fromFile = rc == null ? NaN : parseInt(row[rc] ?? "", 10);
    const sheet = layout.sheetColumn == null ? sheetName : (row[layout.sheetColumn] || undefined);
    out.push({ sourceRow: Number.isFinite(fromFile) ? fromFile : r + 1, ...(sheet ? { sourceSheet: sheet } : {}), cells });
  }
  return out;
}

/** Text → mapped records in one step (paste box, CSV files, tests). */
export function readDelimited<K extends string>(text: string, fields: readonly ImportField<K>[]): { rows: MappedRow<K>[]; layout: GridLayout<K>; grid: Grid } {
  const grid = parseDelimited(text);
  const layout = detectLayout(grid, fields);
  return { rows: mapRows(grid, layout, fields), layout, grid };
}

/** Titles of the extra columns `toMappedText` writes with each row's origin. */
export const SOURCE_ROW_TITLE = "Source row";
export const SOURCE_SHEET_TITLE = "Source sheet";

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/**
 * Re-writes one or more sheets in the canonical layout — titles, then one
 * column per field in field order, plus each row's original row number (and
 * sheet name for named sheets) — so the server can parse the manager's
 * confirmed column mapping without knowing about it.
 */
export function toMappedText<K extends string>(sheets: readonly ImportSheet<K>[], fields: readonly ImportField<K>[]): string {
  const named = sheets.some((sh) => sh.name);
  const lines = [[...(named ? [SOURCE_SHEET_TITLE] : []), SOURCE_ROW_TITLE, ...fields.map((f) => f.label)]];
  for (const sh of sheets) {
    for (const { sourceRow, cells } of mapRows(sh.grid, sh.layout, fields)) {
      lines.push([...(named ? [sh.name ?? ""] : []), String(sourceRow), ...fields.map((f) => cells[f.key])]);
    }
  }
  return lines.map((l) => l.map(csvCell).join(",")).join("\n") + "\n";
}

/** Column letter for a 0-based index: 0 → A, 25 → Z, 26 → AA. */
export function columnLetter(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/**
 * Money/number text → number. Accepts "$1,295.00", "1295", and decimal-comma
 * forms "1.295,00" / "1295,5" (a comma followed by one or two final digits is
 * a decimal mark; followed by three it's a thousands separator).
 * Returns null for blank, zero, negative or junk.
 */
export function parseAmount(raw: string): number | null {
  const t = raw.trim();
  if (!t || /^-|^\(.*\)$/.test(t.replace(/[$\s€£]/g, ""))) return null;
  let digits = t.replace(/[^0-9.,]/g, "");
  if (/,\d{1,2}$/.test(digits)) digits = digits.replace(/\./g, "").replace(",", ".");
  else digits = digits.replace(/,/g, "");
  const n = parseFloat(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** True when the text is a negative amount ("-20", "(20)", "-20%"). */
export function isNegative(raw: string): boolean {
  const t = raw.trim().replace(/[$\s€£]/g, "");
  return /^-\d|^\(\d.*\)$/.test(t);
}

/** The CSV a "Download template" button saves: titles plus example rows. */
export function templateCsv(fields: readonly ImportField[], examples: readonly (readonly string[])[]): string {
  return [fields.map((f) => f.label), ...examples].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
