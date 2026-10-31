import { canonicalBrand, closestBrand } from "./brand-match";

/**
 * Brand suggestions for imported rows the catalog has no brand for. Pure —
 * shared by the promo and catalog imports (server side, where the catalog is).
 *
 * Hints, strongest first:
 *   1. the sheet's Brand column — exact, or the closest listed brand for a typo
 *   2. the row's collection, when the catalog files that collection under
 *      exactly one brand
 *   3. the workbook sheet's name ("Aldermoor" sheet)
 * When the hints point at different brands nothing is suggested and the row
 * is flagged as a conflict. Model numbers are deliberately not used: every
 * store's numbering is different.
 */

export type BrandHintSource = "sheet" | "sheet-typo" | "collection" | "sheet-name";

export interface BrandSuggestion {
  brand: string | null;
  source: BrandHintSource | null;
  /** Shown under the brand in the preview. */
  reason: string | null;
  /** Brands the hints disagree between (empty when they agree). */
  conflict: string[];
}

export interface BrandHintInput {
  /** The sheet's Brand cell as typed. */
  brandText?: string | null;
  collection?: string | null;
  sheetName?: string | null;
}

/** Upper-cased collection → the brands the catalog files it under. */
export type CollectionBrands = Map<string, Set<string>>;

export function buildCollectionBrands(rows: Iterable<{ collection: string | null; brand: string | null }>): CollectionBrands {
  const out: CollectionBrands = new Map();
  for (const r of rows) {
    if (!r.collection?.trim() || !r.brand) continue;
    const k = r.collection.trim().toUpperCase();
    if (!out.has(k)) out.set(k, new Set());
    out.get(k)!.add(r.brand);
  }
  return out;
}

export function suggestBrand(row: BrandHintInput, brands: readonly string[], collectionBrands: CollectionBrands): BrandSuggestion {
  const hints: { brand: string; source: BrandHintSource; reason: string }[] = [];
  const typed = row.brandText?.trim() ?? "";
  if (typed) {
    const exact = canonicalBrand(typed, brands);
    const close = exact ?? closestBrand(typed, brands);
    if (exact) hints.push({ brand: exact, source: "sheet", reason: "from your sheet" });
    else if (close) hints.push({ brand: close, source: "sheet-typo", reason: `your sheet says "${typed}"` });
  }
  const coll = row.collection?.trim().toUpperCase();
  const owners = coll ? collectionBrands.get(coll) : undefined;
  if (owners && owners.size === 1) {
    const [b] = owners;
    hints.push({ brand: b, source: "collection", reason: `${row.collection!.trim()} is filed under ${b}` });
  }
  if (row.sheetName) {
    const b = canonicalBrand(row.sheetName, brands) ?? closestBrand(row.sheetName, brands);
    if (b) hints.push({ brand: b, source: "sheet-name", reason: `on the ${row.sheetName} sheet` });
  }

  const distinct = [...new Set(hints.map((h) => h.brand))];
  if (distinct.length > 1) {
    return { brand: null, source: null, reason: `hints disagree: ${hints.map((h) => `${h.brand} (${h.reason})`).join(", ")}`, conflict: distinct };
  }
  if (hints.length === 0) {
    const reason = typed ? `your sheet says "${typed}", which isn't in the brand list` : null;
    return { brand: null, source: null, reason, conflict: [] };
  }
  return { brand: hints[0].brand, source: hints[0].source, reason: hints[0].reason, conflict: [] };
}
