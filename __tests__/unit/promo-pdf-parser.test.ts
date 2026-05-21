import { describe, it, expect } from "vitest";
import {
  brandFromFilename,
  normalizeDate,
  extractRowsFromPage,
  combinePageResults,
  type PdfTextItem,
} from "@/lib/promo-pdf-parser";

// Build a synthetic page of positioned text items matching the layout of the
// Meridian promo PDF used in production: header row at y=696, data rows at
// y=655, 587, 518; columns at x ≈ 145 (MODEL), 309 (COLLECTION),
// 386 ($-sigil) / 406 (MSRP value), 445 ($-sigil) / 465 (sale value).
function buildPage(opts: {
  pctOff: number | null;
  saleHeaderLabel?: string; // override the sale-column header label (default: "X% OFF")
  dateRange?: string;
  rows: { model: string; collection: string; msrp: string; sale: string; collection2?: string }[];
}): PdfTextItem[] {
  const items: PdfTextItem[] = [];
  if (opts.dateRange) items.push({ str: opts.dateRange, x: 115, y: 711 });
  items.push({ str: "MODEL", x: 156, y: 696 });
  items.push({ str: "PHOTO", x: 246, y: 696 });
  items.push({ str: "COLLECTION", x: 309, y: 696 });
  items.push({ str: "MSRP", x: 397, y: 696 });
  const saleLabel = opts.saleHeaderLabel ?? (opts.pctOff != null ? `${opts.pctOff}% OFF` : null);
  if (saleLabel) items.push({ str: saleLabel, x: 451, y: 696 });
  let y = 655;
  for (const r of opts.rows) {
    items.push({ str: r.model, x: 145, y });
    if (r.collection2) {
      items.push({ str: r.collection, x: 311, y: y + 7 });
      items.push({ str: r.collection2, x: 313, y: y - 7 });
    } else {
      items.push({ str: r.collection, x: 321, y });
    }
    items.push({ str: "$", x: 386, y });
    items.push({ str: r.msrp, x: 406, y });
    items.push({ str: "$", x: 445, y });
    items.push({ str: r.sale, x: 465, y });
    y -= 68;
  }
  return items;
}

describe("brandFromFilename", () => {
  it("matches known brand names case-insensitively", () => {
    expect(brandFromFilename("MERIDIAN SALE 5.19-6.1 MEMORIAL DAY.pdf")).toBe("Meridian");
    expect(brandFromFilename("ashford-promo.pdf")).toBe("Ashford");
    expect(brandFromFilename("Chamberlain Q3.pdf")).toBe("Chamberlain");
  });
  it("returns null when no known brand appears", () => {
    expect(brandFromFilename("random-watches.pdf")).toBeNull();
  });
});

describe("normalizeDate", () => {
  it("expands 2-digit years using a 70-cutoff", () => {
    expect(normalizeDate("5/19/26")).toBe("2026-05-19");
    expect(normalizeDate("12/31/69")).toBe("2069-12-31");
    expect(normalizeDate("1/1/70")).toBe("1970-01-01");
  });
  it("accepts 4-digit years", () => {
    expect(normalizeDate("5/19/2026")).toBe("2026-05-19");
  });
  it("rejects garbage", () => {
    expect(normalizeDate("not-a-date")).toBeNull();
    expect(normalizeDate("13/40/26")).toBeNull();
  });
});

describe("extractRowsFromPage", () => {
  it("extracts rows with the page-level discount %", () => {
    const items = buildPage({
      pctOff: 60,
      dateRange: "5/19/26 - 6/1/26",
      rows: [
        { model: "KX1003-01X", collection: "RIVIERA", msrp: "525.00", sale: "210.00" },
        { model: "LX1004-01X", collection: "RIVIERA", msrp: "425.00", sale: "170.00" },
      ],
    });
    const out = extractRowsFromPage(items);
    expect(out.discountPercent).toBe(60);
    expect(out.dateRange).toEqual({ start: "2026-05-19", end: "2026-06-01" });
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0]).toMatchObject({
      modelNumber: "KX1003-01X",
      collection: "RIVIERA",
      msrp: 525,
      discountPercent: 60,
      discountPrice: 210,
    });
  });

  it("joins multi-line collection cells in the right reading order", () => {
    const items = buildPage({
      pctOff: 40,
      rows: [
        { model: "LX1008-01X", collection: "SENTINEL", collection2: "TIDE", msrp: "895.00", sale: "537.00" },
      ],
    });
    const out = extractRowsFromPage(items);
    expect(out.rows[0].collection).toBe("SENTINEL TIDE");
    expect(out.rows[0].discountPercent).toBe(40);
  });

  it("returns no rows but still reports dateRange when the header is missing", () => {
    const items: PdfTextItem[] = [
      { str: "5/19/26 - 6/1/26", x: 115, y: 711 },
      { str: "KX1003-01X", x: 145, y: 655 },
    ];
    const out = extractRowsFromPage(items);
    expect(out.rows).toHaveLength(0);
    expect(out.discountPercent).toBeNull();
    expect(out.dateRange).toEqual({ start: "2026-05-19", end: "2026-06-01" });
  });

  it("skips rows whose model column doesn't match the model-number shape", () => {
    const items = buildPage({
      pctOff: 60,
      rows: [
        { model: "TOTAL", collection: "", msrp: "100.00", sale: "60.00" }, // footer row
        { model: "KX1003-01X", collection: "RIVIERA", msrp: "525.00", sale: "210.00" },
      ],
    });
    const out = extractRowsFromPage(items);
    expect(out.rows.map((r) => r.modelNumber)).toEqual(["KX1003-01X"]);
  });
});

describe("combinePageResults", () => {
  it("merges pages, keeps per-page discount %, and notes pages without %", () => {
    const p1 = extractRowsFromPage(
      buildPage({ pctOff: 60, dateRange: "5/19/26 - 6/1/26", rows: [
        { model: "KX1003-01X", collection: "RIVIERA", msrp: "525.00", sale: "210.00" },
      ] }),
    );
    const p2 = extractRowsFromPage(
      buildPage({ pctOff: 40, rows: [
        { model: "LX1008-01X", collection: "SENTINEL", msrp: "895.00", sale: "537.00" },
      ] }),
    );
    const p3 = extractRowsFromPage(
      buildPage({ pctOff: null, saleHeaderLabel: "SALE PRICE", rows: [
        { model: "IX1018-01X", collection: "RIVIERA", msrp: "550.00", sale: "330.00" },
      ] }),
    );
    const out = combinePageResults([p1, p2, p3], "MERIDIAN SALE 5.19-6.1 MEMORIAL DAY.pdf");
    expect(out.rows).toHaveLength(3);
    expect(out.rows[0].discountPercent).toBe(60);
    expect(out.rows[1].discountPercent).toBe(40);
    expect(out.rows[2].discountPercent).toBeNull();
    expect(out.brand).toBe("Meridian");
    expect(out.promoStart).toBe("2026-05-19");
    expect(out.promoEnd).toBe("2026-06-01");
    expect(out.pagesWithoutDiscount).toEqual([3]);
  });
});
