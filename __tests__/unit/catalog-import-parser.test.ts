import { describe, it, expect } from "vitest";
import {
  parseCatalogRows as parseCatalogRowsWith,
  parseBrand as parseBrandWith,
  parsePrice,
  CATALOG_COLUMNS,
  catalogDuplicates,
  applyCatalogPicks,
} from "@/lib/catalog-import-parser";
import { detectSeparator, SKIP_PICK } from "@/lib/import-grid";
import { SAMPLE_BRANDS } from "@/lib/db/schema";
const parseCatalogRows = (t: string) => parseCatalogRowsWith(t, SAMPLE_BRANDS);
const parseBrand = (t: string) => parseBrandWith(t, SAMPLE_BRANDS);

describe("CATALOG_COLUMNS", () => {
  it("is A Brand, B Collection, C Model, D MSRP", () => {
    expect(CATALOG_COLUMNS).toEqual(["Brand", "Collection", "Model", "MSRP"]);
  });
});

describe("parseBrand", () => {
  it("matches known brands in any capitalisation", () => {
    expect(parseBrand("Aldermoor")).toBe("Aldermoor");
    expect(parseBrand("  COASTWELL ")).toBe("Coastwell");
    expect(parseBrand("keelstone")).toBe("Keelstone");
  });
  it("returns null for blank or unknown brands", () => {
    expect(parseBrand("")).toBeNull();
    expect(parseBrand("Nonesuch")).toBeNull();
  });
});

describe("parsePrice", () => {
  it("parses currency text", () => {
    expect(parsePrice("$1,295.00")).toBe(1295);
    expect(parsePrice("425")).toBe(425);
  });
  it("returns null for blank, zero or junk", () => {
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("0")).toBeNull();
    expect(parsePrice("n/a")).toBeNull();
  });
});

describe("detectSeparator", () => {
  it("picks tab for pasted spreadsheet rows", () => {
    expect(detectSeparator("Aldermoor\tDRIFTWOOD\tAD-8404\t1295")).toBe("\t");
  });
  it("picks comma or semicolon for CSV files", () => {
    expect(detectSeparator("Aldermoor,DRIFTWOOD,AD-8404,1295")).toBe(",");
    expect(detectSeparator("Aldermoor;DRIFTWOOD;AD-8404;1295,00")).toBe(";");
  });
});

describe("parseCatalogRows", () => {
  it("reads pasted rows by column position, no titles needed", () => {
    const { rows, parseErrors } = parseCatalogRows(
      "Aldermoor\tDriftwood\tad-8404\t$1,295.00\nVellamy\tRIPTIDE\tVL-525\t\n",
    );
    expect(parseErrors).toEqual([]);
    expect(rows).toMatchObject([
      { model: "AD-8404", collection: "Driftwood", brand: "Aldermoor", msrp: 1295 },
      { model: "VL-525", collection: "RIPTIDE", brand: "Vellamy", msrp: null },
    ]);
  });

  it("skips a title row whatever the titles say", () => {
    const { rows } = parseCatalogRows("Make,Line,Style #,Price\nCoastwell,HARBOR,CW-220,695\n");
    expect(rows).toMatchObject([{ model: "CW-220", collection: "HARBOR", brand: "Coastwell", msrp: 695 }]);
  });

  it("handles quoted CSV fields and blank lines", () => {
    const { rows } = parseCatalogRows('\nMaravista,"STARLIGHT & FRIENDS",MV-4119-BLK,"1,995.00"\n\n');
    expect(rows).toMatchObject([{ model: "MV-4119-BLK", collection: "STARLIGHT & FRIENDS", brand: "Maravista", msrp: 1995 }]);
  });

  it("keeps a blank or unlisted brand as null, with the typed text for suggestions", () => {
    const { rows, parseErrors } = parseCatalogRows(",SUNDRIFT,MV-2110-GLD,4150\nNonesuch,ORBIT,MV-2122-SLV,3550\n");
    expect(rows.map((r) => [r.brand, r.brandText])).toEqual([[null, ""], [null, "Nonesuch"]]);
    expect(parseErrors).toEqual([]);
  });

  it("reports rows missing a model or collection", () => {
    const { rows, parseErrors } = parseCatalogRows("Aldermoor,,AD-8404,100\nAldermoor,DRIFTWOOD,,100\n");
    expect(rows).toHaveLength(0);
    expect(parseErrors).toEqual([
      "Row 1: missing collection",
      "Row 2: missing model",
    ]);
  });

  it("keeps every copy of a repeated model for the manager to pick", () => {
    const { rows } = parseCatalogRows(",DRIFTWOOD,AD-8404,\nAldermoor,DRIFTWOOD,AD-8404,1295\nVellamy,RIDGE,VS-1,10\n");
    expect(rows.map((r) => [r.model, r.sourceRow])).toEqual([["AD-8404", 1], ["AD-8404", 2], ["VS-1", 3]]);
    expect([...catalogDuplicates(rows).keys()]).toEqual(["AD-8404"]);
  });

  it("applies duplicate picks: a chosen copy, skip, or missing", () => {
    const { rows } = parseCatalogRows(",DRIFTWOOD,AD-8404,\nAldermoor,DRIFTWOOD,AD-8404,1295\nVellamy,RIDGE,VS-1,10\nVellamy,RIDGE,VS-1,12\n");
    expect(applyCatalogPicks(rows, {}).missing).toEqual(["AD-8404", "VS-1"]);
    const picked = applyCatalogPicks(rows, { "AD-8404": "#2", "VS-1": SKIP_PICK });
    expect(picked.missing).toEqual([]);
    expect(picked.rows.map((r) => [r.model, r.msrp])).toEqual([["AD-8404", 1295]]);
    expect(applyCatalogPicks(rows, { "AD-8404": "#9", "VS-1": "#3" }).missing).toEqual(["AD-8404"]);
  });

  it("reports an empty file", () => {
    expect(parseCatalogRows("   \n").parseErrors).toEqual(["The file is empty."]);
  });
});
