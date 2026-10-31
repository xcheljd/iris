import { describe, it, expect } from "vitest";
import { parsePromoRows as parsePromoRowsWith, parsePercent, fillDiscount, priceIssues, PROMO_COLUMNS } from "@/lib/promo-import-parser";
import { toMappedText, parseDelimited, detectLayout } from "@/lib/import-grid";
import { PROMO_FIELDS } from "@/lib/promo-import-parser";
import { SAMPLE_BRANDS } from "@/lib/db/schema";
const parsePromoRows = (t: string) => parsePromoRowsWith(t, SAMPLE_BRANDS);

describe("PROMO_COLUMNS", () => {
  it("is A Brand, B Collection, C Model, D MSRP, E Sale price, F Discount %", () => {
    expect(PROMO_COLUMNS).toEqual(["Brand", "Collection", "Model", "MSRP", "Sale price", "Discount %"]);
  });
});

describe("parsePercent", () => {
  it("reads whole numbers, percent signs and fractions", () => {
    expect(parsePercent("30")).toBe(30);
    expect(parsePercent("25%")).toBe(25);
    expect(parsePercent("0.3")).toBe(30);
  });
  it("reads decimal-comma percents", () => {
    expect(parsePercent("12,5%")).toBe(12.5);
  });
  it("returns null for blank, zero, junk, negative or 100+", () => {
    expect(parsePercent("-20%")).toBeNull();
    expect(parsePercent("100%")).toBeNull();
    expect(parsePercent("")).toBeNull();
    expect(parsePercent("0")).toBeNull();
    expect(parsePercent("n/a")).toBeNull();
    expect(parsePercent("150")).toBeNull();
  });
});

describe("parsePromoRows", () => {
  it("reads pasted rows by column position", () => {
    const { rows, parseErrors } = parsePromoRows("Aldermoor\tDRIFTWOOD\tad-8404\t$1,295.00\t$1,036.00\t20\n");
    expect(parseErrors).toEqual([]);
    expect(rows).toMatchObject([
      { modelNumber: "AD-8404", collection: "DRIFTWOOD", brand: "Aldermoor", msrp: 1295, discountPrice: 1036, discountPercent: 20 },
    ]);
  });

  it("computes the discount % from MSRP and sale price", () => {
    const { rows } = parsePromoRows(",SUNDRIFT,MV-2110-GLD,4150,3735,\n");
    expect(rows[0].discountPercent).toBe(10);
  });

  it("computes the sale price from MSRP and discount %", () => {
    const { rows } = parsePromoRows("Vellamy,RIPTIDE,VL-525,895,,25%\n");
    expect(rows[0].discountPrice).toBe(671.25);
  });

  it("leaves brand, collection and MSRP blank for the catalog to fill", () => {
    const { rows } = parsePromoRows(",,CW-220,,,15\n");
    expect(rows).toMatchObject([
      { modelNumber: "CW-220", collection: "", brand: null, msrp: null, discountPrice: null, discountPercent: 15 },
    ]);
  });

  it("skips a title row whatever the titles say", () => {
    const { rows } = parsePromoRows("Make,Line,Style,Retail,Sale,Off\nAldermoor,DRIFTWOOD,AD-8404,1295,,20\n");
    expect(rows.map((r) => r.modelNumber)).toEqual(["AD-8404"]);
  });

  it("reports rows without a model and keeps an unlisted brand as typed", () => {
    const { rows, parseErrors } = parsePromoRows("Aldermoor,DRIFTWOOD,AD-8404,1295,,20\nAldermoor,ORBIT,,100,,\nNonesuch,ORBIT,MV-2122-SLV,3550,,10\n");
    expect(rows).toHaveLength(2);
    expect(parseErrors).toEqual(["Row 2: no model — skipped"]);
    // An unlisted brand isn't a parse warning: the import's brand suggestions handle it.
    expect(rows[1]).toMatchObject({ brand: null, brandText: "Nonesuch", warnings: [] });
  });

  it("reports an empty file", () => {
    expect(parsePromoRows("\n").parseErrors).toEqual(["The file is empty."]);
  });

  it("reads the common sheet: MSRP then sale price, no % column", () => {
    const { rows } = parsePromoRows("Aldermoor\tDRIFTWOOD\tAD-8404\t500\t250\n");
    expect(rows[0]).toMatchObject({ msrp: 500, discountPrice: 250, discountPercent: 50, warnings: [] });
  });

  it("matches titled columns in any order, under a sheet heading", () => {
    const { rows } = parsePromoRows("Memorial Day Sale\nStyle #,Retail,Promo Price,Make\nAD-8404,500,250,Aldermoor\n");
    expect(rows).toEqual([{
      modelNumber: "AD-8404", collection: "", brand: "Aldermoor", brandText: "Aldermoor", msrp: 500,
      discountPrice: 250, discountPercent: 50, sourceRow: 3, warnings: [],
    }]);
  });

  it("reads a semicolon CSV with decimal commas", () => {
    const { rows } = parsePromoRows("Aldermoor;DRIFTWOOD;AD-8404;1295,00;1036,00;20\n");
    expect(rows[0]).toMatchObject({ msrp: 1295, discountPrice: 1036, discountPercent: 20 });
  });

  it("keeps every copy of a repeated model for the manager to pick", () => {
    const { rows } = parsePromoRows("Aldermoor,DRIFTWOOD,AD-8404,500,250,\nAldermoor,DRIFTWOOD,AD-8404,500,200,\n");
    expect(rows.map((r) => [r.sourceRow, r.discountPrice, r.warnings])).toEqual([[1, 250, []], [2, 200, []]]);
  });

  it("keeps a quoted line break inside a cell", () => {
    const { rows } = parsePromoRows('Aldermoor,"DEEP\nSTAR",AD-8404,500,250,\n');
    expect(rows[0]).toMatchObject({ collection: "DEEP\nSTAR", modelNumber: "AD-8404" });
  });

  it("warns about negative amounts, bad percents and Excel-shortened models", () => {
    const { rows } = parsePromoRows("Aldermoor,DRIFTWOOD,1.23E+05,-500,,150%\n");
    expect(rows[0].warnings).toEqual([
      'MSRP "-500" is negative — ignored',
      'discount % "150%" isn\'t between 0 and 100 — ignored',
      'model "1.23E+05" looks like a number Excel shortened — check it',
    ]);
  });

  it("skips a totals row with a note instead of importing it", () => {
    const { rows, parseErrors } = parsePromoRows("Aldermoor,DRIFTWOOD,AD-8404,500,250,\n,,,500,250,\n");
    expect(rows).toHaveLength(1);
    expect(parseErrors).toEqual(["Row 2: no model — skipped"]);
  });
});

describe("fillDiscount", () => {
  it("computes the % from a catalog MSRP when the sheet left MSRP blank", () => {
    expect(fillDiscount(500, 250, null)).toEqual({ discountPrice: 250, discountPercent: 50 });
  });
  it("computes the sale price from the %", () => {
    expect(fillDiscount(895, null, 25)).toEqual({ discountPrice: 671.25, discountPercent: 25 });
  });
  it("leaves both alone without an MSRP", () => {
    expect(fillDiscount(null, 250, null)).toEqual({ discountPrice: 250, discountPercent: null });
  });
});

describe("priceIssues", () => {
  it("flags a sale price at or above MSRP", () => {
    expect(priceIssues(500, 600, null)).toEqual(["sale price $600.00 is not below MSRP $500.00"]);
  });
  it("flags a sale price and % that disagree by more than a point", () => {
    expect(priceIssues(500, 250, 30)).toEqual(["sale price $250.00 is 50% off, but the discount column says 30%"]);
    expect(priceIssues(499, 250, 50)).toEqual([]);
  });
  it("flags a tiny % that was probably meant as a fraction", () => {
    expect(priceIssues(500, null, 0.5)).toEqual(["discount of 0.5% is unusually small — did you mean 50%?"]);
  });
});

describe("parsePromoRows across sheets", () => {
  const sheet = (name: string, text: string) => {
    const grid = parseDelimited(text);
    return { name, grid, layout: detectLayout(grid, PROMO_FIELDS) };
  };
  it("names the sheet in errors and keeps a model from both sheets", () => {
    const text = toMappedText([
      sheet("Vellamy", "Style,Retail,Promo Price\nVL-525,500,250\n,500,250\n"),
      sheet("Aldermoor", "Retail,Style,Promo Price\n500,AD-8404,250\n895,VL-525,600\n"),
    ], PROMO_FIELDS);
    const { rows, parseErrors } = parsePromoRows(text);
    expect(parseErrors).toEqual(["Vellamy sheet, row 3: no model — skipped"]);
    expect(rows.map((r) => [r.sourceSheet, r.sourceRow, r.modelNumber])).toEqual([
      ["Vellamy", 2, "VL-525"], ["Aldermoor", 2, "AD-8404"], ["Aldermoor", 3, "VL-525"],
    ]);
  });
});
