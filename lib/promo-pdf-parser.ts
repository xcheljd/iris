import type { ParsedPromoRow } from "./promo-csv-parser";
import { BRAND_VALUES, type Brand } from "./db/schema";

// A single text item with its position on the page.
// Mirrors what pdfjs-dist returns from getTextContent() — x/y are the page
// coordinates (origin = bottom-left, y grows upward).
export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
}

export interface ParsedPromoPdf {
  rows: ParsedPromoRow[];
  brand: Brand | null;
  promoStart: string | null; // yyyy-MM-dd
  promoEnd: string | null;   // yyyy-MM-dd
  pageCount: number;
  pagesWithoutDiscount: number[]; // 1-indexed pages where the X% OFF header was missing
}

// Matches both Meridian-style (letter-prefix + dash: KX1023-01X) and
// Ashford-style (digit-prefix, no dash: 70Z001) model numbers.
// Requirements: 4–20 chars, alphanumeric + dash only, at least one letter and one digit.
const MODEL_RX = /^(?=[A-Z0-9-]{4,20}$)(?=.*[A-Z])(?=.*[0-9])[A-Z0-9-]+$/;
const PCT_OFF_RX = /(\d+)\s*%\s*OFF/i;
const DATE_RANGE_RX = /(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/;

// Y-tolerance for considering two text items part of the same logical row.
// PDF row centers in the source decks are ~68 units apart; multi-line cells
// span ±7 around the row center, so 25 leaves comfortable margin without
// merging adjacent rows.
const ROW_Y_TOLERANCE = 25;

// X-tolerance for snapping a text item to a column anchor from the header.
const COL_X_TOLERANCE = 40;

export function brandFromFilename(filename: string): Brand | null {
  const lower = filename.toLowerCase();
  for (const b of BRAND_VALUES) {
    if (lower.includes(b.toLowerCase())) return b;
  }
  return null;
}

// "5/19/26" → "2026-05-19". Two-digit years 00–69 → 2000s, 70–99 → 1900s.
export function normalizeDate(input: string): string | null {
  const m = input.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  let year = parseInt(m[3], 10);
  if (m[3].length === 2) year = year >= 70 ? 1900 + year : 2000 + year;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function parseMoney(s: string): number | null {
  const n = parseFloat(s.replace(/[$,]/g, "").trim());
  return isNaN(n) ? null : n;
}

// Group items into rows by y-proximity. Items within ROW_Y_TOLERANCE of an
// existing row's center are merged in; otherwise a new row is started.
// Returns rows sorted top-to-bottom (highest y first).
function groupRowsByY(items: PdfTextItem[]): { centerY: number; items: PdfTextItem[] }[] {
  const sorted = [...items].sort((a, b) => b.y - a.y);
  const rows: { centerY: number; items: PdfTextItem[] }[] = [];
  for (const it of sorted) {
    const row = rows.find((r) => Math.abs(r.centerY - it.y) <= ROW_Y_TOLERANCE);
    if (row) {
      row.items.push(it);
      // Re-center on the running mean so a tall multi-line cell doesn't drag
      // the anchor away from the row's true middle.
      row.centerY = row.items.reduce((s, x) => s + x.y, 0) / row.items.length;
    } else {
      rows.push({ centerY: it.y, items: [it] });
    }
  }
  return rows;
}

// Find the table header row. It's the topmost row containing "MODEL" and
// "MSRP". Returns the row plus the column x-anchors derived from it.
function findHeader(rows: { centerY: number; items: PdfTextItem[] }[]): {
  headerY: number;
  cols: { model: number; collection: number; msrp: number; sale: number };
  discountPercent: number | null;
} | null {
  for (const row of rows) {
    const texts = row.items.map((i) => i.str.trim().toUpperCase());
    if (!texts.includes("MODEL") || !texts.includes("MSRP")) continue;

    const findX = (label: string) =>
      row.items.find((i) => i.str.trim().toUpperCase() === label)?.x;
    const collectionX = findX("COLLECTION");
    const modelX = findX("MODEL");
    const msrpX = findX("MSRP");
    if (modelX == null || collectionX == null || msrpX == null) return null;

    // The sale column is the rightmost header item past MSRP. Its label may
    // be a percent ("60% OFF"), a generic word ("SALE PRICE"), or anything
    // else — we just need its x to know which column the dollar values live
    // in. If the label encodes a percent, capture it as the page's discount.
    const rightOfMsrp = row.items
      .filter((i) => i.x > msrpX + COL_X_TOLERANCE / 2)
      .sort((a, b) => b.x - a.x)[0];
    if (!rightOfMsrp) return null;
    const pctMatch = rightOfMsrp.str.match(PCT_OFF_RX);
    return {
      headerY: row.centerY,
      cols: { model: modelX, collection: collectionX, msrp: msrpX, sale: rightOfMsrp.x },
      discountPercent: pctMatch ? parseInt(pctMatch[1], 10) : null,
    };
  }
  return null;
}

// Assign each item in a row to the nearest column (by x), drop ignored bits
// like a stray "$" sigil that lives ahead of the dollar value in its column.
function rowToCells(
  row: { items: PdfTextItem[] },
  cols: { model: number; collection: number; msrp: number; sale: number },
): { model: string; collection: string; msrp: string; sale: string } {
  const colEntries = Object.entries(cols) as ["model" | "collection" | "msrp" | "sale", number][];
  const buckets: Record<"model" | "collection" | "msrp" | "sale", PdfTextItem[]> = {
    model: [], collection: [], msrp: [], sale: [],
  };
  for (const it of row.items) {
    if (it.str.trim() === "$" || !it.str.trim()) continue;
    let best: typeof colEntries[number] | null = null;
    let bestDist = Infinity;
    for (const entry of colEntries) {
      const d = Math.abs(it.x - entry[1]);
      if (d < bestDist) { bestDist = d; best = entry; }
    }
    if (best && bestDist <= COL_X_TOLERANCE) buckets[best[0]].push(it);
  }
  // Concatenate multi-line cells (collection wraps like "SENTINEL\nTIDE")
  // top-to-bottom: highest y first.
  const join = (its: PdfTextItem[]) =>
    its.sort((a, b) => b.y - a.y).map((i) => i.str.trim()).filter(Boolean).join(" ");
  return {
    model: join(buckets.model),
    collection: join(buckets.collection),
    msrp: join(buckets.msrp),
    sale: join(buckets.sale),
  };
}

export interface ExtractPageResult {
  rows: ParsedPromoRow[];
  discountPercent: number | null;
  dateRange: { start: string; end: string } | null;
}

// Pure extraction from positioned text items for a single page. Exposed for
// unit tests so we don't need a real PDF to verify behavior.
export function extractRowsFromPage(items: PdfTextItem[]): ExtractPageResult {
  const rows = groupRowsByY(items);
  const header = findHeader(rows);

  // Scan the whole page for a date-range string — it may be in the page
  // header above the table or in a separate label.
  let dateRange: { start: string; end: string } | null = null;
  for (const r of rows) {
    const text = r.items.map((i) => i.str).join(" ");
    const m = text.match(DATE_RANGE_RX);
    if (m) {
      const start = normalizeDate(m[1]);
      const end = normalizeDate(m[2]);
      if (start && end) { dateRange = { start, end }; break; }
    }
  }

  if (!header) return { rows: [], discountPercent: null, dateRange };

  const dataRows = rows.filter((r) => r.centerY < header.headerY - ROW_Y_TOLERANCE);
  const parsed: ParsedPromoRow[] = [];
  for (const r of dataRows) {
    const cells = rowToCells(r, header.cols);
    if (!cells.model || !MODEL_RX.test(cells.model.toUpperCase())) continue;
    const msrp = parseMoney(cells.msrp);
    const sale = parseMoney(cells.sale);
    parsed.push({
      modelNumber: cells.model.toUpperCase(),
      collection: cells.collection,
      msrp,
      discountPercent: header.discountPercent,
      discountPrice: sale,
      sizeOneQty: 0,
      sizeTwoQty: 0,
    });
  }
  return { rows: parsed, discountPercent: header.discountPercent, dateRange };
}

// Combine results across pages. The page-level discount % rides along on
// each row, so different pages can carry different percentages.
export function combinePageResults(
  pages: ExtractPageResult[],
  filename: string,
): Omit<ParsedPromoPdf, "pageCount"> {
  const rows: ParsedPromoRow[] = [];
  const pagesWithoutDiscount: number[] = [];
  let firstDate: { start: string; end: string } | null = null;
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    if (p.discountPercent == null && p.rows.length > 0) pagesWithoutDiscount.push(i + 1);
    if (!firstDate && p.dateRange) firstDate = p.dateRange;
    rows.push(...p.rows);
  }
  return {
    rows,
    brand: brandFromFilename(filename),
    promoStart: firstDate?.start ?? null,
    promoEnd: firstDate?.end ?? null,
    pagesWithoutDiscount,
  };
}

// Browser entry point. Loads pdfjs-dist (worker file must be hosted at
// /pdf.worker.min.mjs — see package.json postinstall), walks every page,
// and returns the combined parse.
export async function parsePromoPdf(file: File): Promise<ParsedPromoPdf> {
  const pdfjs = await import("pdfjs-dist");
  if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages: ExtractPageResult[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const items: PdfTextItem[] = [];
    for (const it of tc.items) {
      // pdfjs text items have either a transform array or are marker items
      // (TextMarkedContent) we can ignore.
      const transform = (it as { transform?: number[] }).transform;
      const str = (it as { str?: string }).str;
      if (!transform || typeof str !== "string") continue;
      items.push({ str, x: transform[4], y: transform[5] });
    }
    pages.push(extractRowsFromPage(items));
  }
  const combined = combinePageResults(pages, file.name);
  return { ...combined, pageCount: doc.numPages };
}
