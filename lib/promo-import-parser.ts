import { normalizeModel } from "@/lib/normalize";
import { type Brand } from "@/lib/db/schema";
import { readDelimited, parseAmount, isNegative, describeSource, type ImportField, type MappedRow } from "./import-grid";
import { parseBrand } from "./catalog-import-parser";

/**
 * Promo import. Same input rules as the catalog import: columns are matched
 * by title when the file has a title row, otherwise read in this order (A–D
 * match the catalog layout, so one spreadsheet can feed both):
 *
 *   A  Brand       — blank: the catalog's brand is used
 *   B  Collection  — blank: the catalog's collection is used
 *   C  Model       — required
 *   D  MSRP        — blank: the catalog's MSRP is used
 *   E  Sale price  — optional
 *   F  Discount %  — optional; "30", "30%" or "0.3" all mean 30%
 *
 * When only one of E/F is given and an MSRP is known (from the file or the
 * catalog), the other is computed (`fillDiscount`).
 */

export type PromoField = "brand" | "collection" | "model" | "msrp" | "sale" | "percent";

export const PROMO_FIELDS: readonly ImportField<PromoField>[] = [
  { key: "brand", label: "Brand", synonyms: ["brand", "make", "manufacturer", "maker", "label"] },
  { key: "collection", label: "Collection", synonyms: ["collection", "line", "series", "family", "range"] },
  { key: "model", label: "Model", required: true, synonyms: ["model", "model #", "model number", "model no", "style", "style #", "sku", "item", "item #", "ref", "reference"] },
  { key: "msrp", label: "MSRP", synonyms: ["msrp", "retail", "retail price", "price", "list", "list price", "srp", "rrp", "regular price", "reg price", "original price"] },
  { key: "sale", label: "Sale price", synonyms: ["sale", "sale price", "promo price", "promo", "discounted", "discounted price", "discount price", "net", "net price", "special", "special price", "now"] },
  { key: "percent", label: "Discount %", synonyms: ["discount %", "discount", "% off", "off", "percent off", "pct", "pct off", "discount percent", "%"] },
];

/** Column order without titles (A–F). */
export const PROMO_COLUMNS = PROMO_FIELDS.map((f) => f.label);

export interface ParsedPromoRow {
  modelNumber: string;
  collection: string;
  /** The sheet's brand when it exactly matches the brand list (any capitals). */
  brand: Brand | null;
  /** The Brand cell as typed — the import's brand suggestions read typos from it. */
  brandText: string;
  msrp: number | null;
  discountPercent: number | null;
  discountPrice: number | null;
  /** 1-based row in the source file. */
  sourceRow: number;
  /** Workbook sheet, for multi-sheet imports. */
  sourceSheet?: string;
  /** Problems with this row's own cells (bad %, negative amounts, duplicate). */
  warnings: string[];
}

export interface PromoParseResult {
  rows: ParsedPromoRow[];
  parseErrors: string[];
}

/** "30" / "30%" / "12,5%" → 30 / 30 / 12.5; "0.3" → 30; blank, zero, negative, 100+ or junk → null. */
export function parsePercent(raw: string): number | null {
  if (isNegative(raw)) return null;
  const n = parseAmount(raw.replace("%", ""));
  if (n == null) return null;
  const pct = n < 1 && !raw.includes("%") ? n * 100 : n;
  return pct < 100 ? Math.round(pct * 100) / 100 : null;
}

const pctOf = (msrp: number, price: number) => Math.round((1 - price / msrp) * 1000) / 10;
const priceOf = (msrp: number, pct: number) => Math.round(msrp * (1 - pct / 100) * 100) / 100;

/** Computes whichever of sale price / discount % is missing, when an MSRP is known. */
export function fillDiscount(
  msrp: number | null, price: number | null, pct: number | null,
): { discountPrice: number | null; discountPercent: number | null } {
  if (msrp != null && price != null && pct == null && price < msrp) return { discountPrice: price, discountPercent: pctOf(msrp, price) };
  if (msrp != null && pct != null && price == null) return { discountPrice: priceOf(msrp, pct), discountPercent: pct };
  return { discountPrice: price, discountPercent: pct };
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Price problems worth a look before importing. `msrp` is the effective MSRP (file or catalog). */
export function priceIssues(msrp: number | null, price: number | null, pct: number | null): string[] {
  const out: string[] = [];
  if (msrp != null && price != null && price >= msrp) out.push(`sale price ${money(price)} is not below MSRP ${money(msrp)}`);
  if (msrp != null && price != null && pct != null && price < msrp && Math.abs(pctOf(msrp, price) - pct) > 1) {
    out.push(`sale price ${money(price)} is ${pctOf(msrp, price)}% off, but the discount column says ${pct}%`);
  }
  if (pct != null && pct < 1) out.push(`discount of ${pct}% is unusually small — did you mean ${Math.round(pct * 100)}%?`);
  return out;
}

/** Without a recognised title row, the first row reads as titles when its price cells hold no digits. */
function promoTitleLike(cells: Record<PromoField, string>): boolean {
  return !/\d/.test(cells.msrp + cells.sale + cells.percent) && (cells.msrp + cells.sale + cells.percent).trim() !== "";
}

export function parsePromoRecords(records: MappedRow<PromoField>[], brands: readonly string[], hasTitleRow = false): PromoParseResult {
  const parseErrors: string[] = [];
  // Every row is kept, repeats included: a model on two rows (or two sheets)
  // is a duplicate the manager picks between in the import dialog.
  const rows: ParsedPromoRow[] = [];
  records.forEach((rec, i) => {
    const { sourceRow, cells } = rec;
    const where = describeSource(rec);
    if (i === 0 && !hasTitleRow && promoTitleLike(cells)) return;
    const modelNumber = normalizeModel(cells.model);
    if (!modelNumber) {
      const totals = Object.values<string>(cells).some((c) => /\btotals?\b/i.test(c));
      parseErrors.push(`${where}: ${totals ? "looks like a totals row" : "no model"} — skipped`);
      return;
    }
    const warnings: string[] = [];
    const brand = parseBrand(cells.brand, brands);
    for (const [label, raw] of [["MSRP", cells.msrp], ["sale price", cells.sale], ["discount %", cells.percent]] as const) {
      if (isNegative(raw)) warnings.push(`${label} "${raw.trim()}" is negative — ignored`);
    }
    const pctRaw = cells.percent.trim();
    const pctParsed = parsePercent(pctRaw);
    if (pctRaw && pctParsed == null && !isNegative(pctRaw)) warnings.push(`discount % "${pctRaw}" isn't between 0 and 100 — ignored`);
    if (/e\+\d/i.test(cells.model)) warnings.push(`model "${cells.model.trim()}" looks like a number Excel shortened — check it`);

    // Price checks (sale ≥ MSRP, sale vs % mismatch) run after catalog
    // resolution, against the effective MSRP — see resolvePromoRows.
    const msrp = parseAmount(cells.msrp);
    const filled = fillDiscount(msrp, parseAmount(cells.sale), pctParsed);

    rows.push({
      modelNumber, collection: cells.collection.trim(), brand, brandText: cells.brand.trim(), msrp, ...filled, sourceRow,
      ...(rec.sourceSheet ? { sourceSheet: rec.sourceSheet } : {}), warnings,
    });
  });

  if (rows.length === 0 && parseErrors.length === 0) {
    parseErrors.push("No promo rows found. Columns must be Brand, Collection, Model, MSRP, Sale price, Discount %.");
  }
  return { rows, parseErrors };
}

/** Pasted text or a CSV file → promo rows. */
export function parsePromoRows(text: string, brands: readonly string[]): PromoParseResult {
  if (text.trim() === "") return { rows: [], parseErrors: ["The file is empty."] };
  const { rows, layout } = readDelimited(text, PROMO_FIELDS);
  return parsePromoRecords(rows, brands, layout.headerRow != null);
}
