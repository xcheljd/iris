import { describe, it, expect } from "vitest";
import { suggestBrand, buildCollectionBrands } from "@/lib/brand-suggest";

const BRANDS = ["Aldermoor", "Coastwell", "Maravista", "Vellamy"];
const COLLECTIONS = buildCollectionBrands([
  { collection: "DRIFTWOOD", brand: "Aldermoor" },
  { collection: "Riptide", brand: "Vellamy" },
  { collection: "SHARED", brand: "Aldermoor" },
  { collection: "SHARED", brand: "Vellamy" },
  { collection: "NOBRAND", brand: null },
]);
const suggest = (row: Parameters<typeof suggestBrand>[0]) => suggestBrand(row, BRANDS, COLLECTIONS);

describe("suggestBrand", () => {
  it("uses the sheet's brand, fixing capitals", () => {
    expect(suggest({ brandText: "aldermoor" })).toEqual({ brand: "Aldermoor", source: "sheet", reason: "from your sheet", conflict: [] });
  });

  it("corrects a typo in the sheet's brand and says what it read", () => {
    expect(suggest({ brandText: "Aldremoor" })).toMatchObject({ brand: "Aldermoor", source: "sheet-typo", reason: 'your sheet says "Aldremoor"' });
  });

  it("suggests the one brand a collection belongs to", () => {
    expect(suggest({ collection: "riptide" })).toMatchObject({ brand: "Vellamy", source: "collection", reason: "riptide is filed under Vellamy" });
  });

  it("ignores a collection filed under more than one brand", () => {
    expect(suggest({ collection: "SHARED" })).toEqual({ brand: null, source: null, reason: null, conflict: [] });
  });

  it("uses the workbook sheet's name", () => {
    expect(suggest({ sheetName: "Coastwell" })).toMatchObject({ brand: "Coastwell", source: "sheet-name", reason: "on the Coastwell sheet" });
  });

  it("agreeing hints give the strongest one's reason", () => {
    expect(suggest({ brandText: "Aldermoor", collection: "DRIFTWOOD", sheetName: "Aldermoor" })).toMatchObject({ brand: "Aldermoor", source: "sheet" });
  });

  it("disagreeing hints give no suggestion and list both", () => {
    const s = suggest({ collection: "DRIFTWOOD", sheetName: "Vellamy" });
    expect(s.brand).toBeNull();
    expect(s.conflict).toEqual(["Aldermoor", "Vellamy"]);
    expect(s.reason).toBe("hints disagree: Aldermoor (DRIFTWOOD is filed under Aldermoor), Vellamy (on the Vellamy sheet)");
  });

  it("says when the sheet's brand isn't in the list and nothing else helps", () => {
    expect(suggest({ brandText: "Nonesuch" })).toEqual({
      brand: null, source: null, reason: 'your sheet says "Nonesuch", which isn\'t in the brand list', conflict: [],
    });
  });

  it("never guesses from the model number", () => {
    expect(suggest({})).toEqual({ brand: null, source: null, reason: null, conflict: [] });
  });
});
