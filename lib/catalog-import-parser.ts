import { normalizeModel } from "@/lib/normalize";
import { type Brand } from "@/lib/db/schema";
import { canonicalBrand } from "@/lib/brand-match";
import { readDelimited, parseAmount, describeSource, rowKeyOf, SKIP_PICK, type ImportField, type MappedRow } from "./import-grid";

/**
 * Catalog import. Columns are matched by their titles when the file has a
 * title row (any order, common synonyms); without titles they are read in
 * this order:
 *
 *   A  Brand       — one of the store's brands (any capitalisation); blank keeps the existing brand,
 *                    and a misspelt brand is offered as a suggestion
 *   B  Collection  — required
 *   C  Model       — required
 *   D  MSRP        — optional
 */

export type CatalogField = "brand" | "collection" | "model" | "msrp";

export const CATALOG_FIELDS: readonly ImportField<CatalogField>[] = [
  { key: "brand", label: "Brand", synonyms: ["brand", "make", "manufacturer", "maker", "label"] },
  { key: "collection", label: "Collection", required: true, synonyms: ["collection", "line", "series", "family", "range"] },
  { key: "model", label: "Model", required: true, synonyms: ["model", "model #", "model number", "model no", "style", "style #", "sku", "item", "item #", "ref", "reference"] },
  { key: "msrp", label: "MSRP", synonyms: ["msrp", "retail", "retail price", "price", "list", "list price", "srp", "rrp"] },
];

/** Column order without titles (A, B, C, D). */
export const CATALOG_COLUMNS = CATALOG_FIELDS.map((f) => f.label);

export type CatalogImportRow = {
  model: string;
  collection: string;
  /** The sheet's brand when it exactly matches the brand list (any capitals). */
  brand: Brand | null;
  /** The Brand cell as typed — brand suggestions read typos from it. */
  brandText: string;
  msrp: number | null;
  /** 1-based row in the source file. */
  sourceRow: number;
  sourceSheet?: string;
};

export type CatalogParseResult = {
  rows: CatalogImportRow[];
  parseErrors: string[];
};

/** "Aldermoor" / "ALDERMOOR" → "Aldermoor" when it's in `brands`; unknown or blank → null. */
export function parseBrand(raw: string, brands: readonly string[]): Brand | null {
  return canonicalBrand(raw, brands);
}

/** "$1,295.00" → 1295; "1.295,00" → 1295; blank, zero, negative or junk → null. */
export const parsePrice = parseAmount;

/**
 * Without a recognised title row, the first row still reads as titles when
 * its MSRP cell is a word rather than a price ("Make, Line, Style, Cost").
 */
export function catalogTitleLike(cells: Record<CatalogField, string>): boolean {
  return cells.msrp.trim() !== "" && !/\d/.test(cells.msrp);
}

export function parseCatalogRecords(records: MappedRow<CatalogField>[], brands: readonly string[], hasTitleRow = false): CatalogParseResult {
  const parseErrors: string[] = [];
  const out: CatalogImportRow[] = [];
  records.forEach((rec, i) => {
    const { sourceRow, cells } = rec;
    const where = describeSource(rec);
    if (i === 0 && !hasTitleRow && catalogTitleLike(cells)) return;
    const model = normalizeModel(cells.model);
    const collection = cells.collection.trim();
    if (!model || !collection) {
      parseErrors.push(`${where}: missing ${!model ? "model" : "collection"}`);
      return;
    }
    // A brand that isn't in the list is kept as typed (`brandText`); the
    // import's brand suggestions offer the closest listed brand.
    const brand = parseBrand(cells.brand, brands);
    out.push({ model, collection, brand, brandText: cells.brand.trim(), msrp: parsePrice(cells.msrp), sourceRow, ...(rec.sourceSheet ? { sourceSheet: rec.sourceSheet } : {}) });
  });

  if (out.length === 0 && parseErrors.length === 0) {
    parseErrors.push("No catalog rows found. Columns must be Brand, Collection, Model, MSRP.");
  }

  // Every row is kept: a model on more than one row is a duplicate the
  // manager picks between (see catalogDuplicates / applyCatalogPicks).
  return { rows: out, parseErrors };
}

/** Models that appear on more than one row, with every copy in file order. */
export function catalogDuplicates(rows: readonly CatalogImportRow[]): Map<string, CatalogImportRow[]> {
  const byModel = new Map<string, CatalogImportRow[]>();
  for (const r of rows) byModel.set(r.model, [...(byModel.get(r.model) ?? []), r]);
  for (const [m, copies] of byModel) if (copies.length < 2) byModel.delete(m);
  return byModel;
}

/**
 * One row per model: single rows as they are, duplicates by the manager's
 * pick (a copy's `rowKeyOf`, or SKIP_PICK to import none). `missing` lists
 * duplicated models without a valid pick — the import refuses until it's empty.
 */
export function applyCatalogPicks(rows: readonly CatalogImportRow[], picks: Record<string, string>): { rows: CatalogImportRow[]; missing: string[] } {
  const dups = catalogDuplicates(rows);
  const missing = [...dups.keys()].filter((m) => {
    const p = picks[m];
    return !p || (p !== SKIP_PICK && !dups.get(m)!.some((r) => rowKeyOf(r) === p));
  });
  const out = rows.filter((r) => !dups.has(r.model) || picks[r.model] === rowKeyOf(r));
  return { rows: out, missing };
}

/** Pasted text or a CSV file → catalog rows. */
export function parseCatalogRows(text: string, brands: readonly string[]): CatalogParseResult {
  if (text.trim() === "") return { rows: [], parseErrors: ["The file is empty."] };
  const { rows, layout } = readDelimited(text, CATALOG_FIELDS);
  return parseCatalogRecords(rows, brands, layout.headerRow != null);
}
