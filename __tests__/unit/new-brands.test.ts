import { describe, it, expect } from "vitest";
import { findNewBrands, cleanBrandNames } from "@/lib/new-brands";

describe("findNewBrands", () => {
  it("builds a first brand list from a file, most-used first", () => {
    expect(findNewBrands(["Vellamy", "Aldermoor", "Aldermoor", "aldermoor", "", null, "Vellamy", "Aldermoor"], [])).toEqual([
      { name: "Aldermoor", rows: 4, closeTo: null },
      { name: "Vellamy", rows: 2, closeTo: null },
    ]);
  });

  it("uses the most common spelling of a name", () => {
    expect(findNewBrands(["Aldermoor", "Aldermoor", "ALDERMOOR"], [])[0].name).toBe("Aldermoor");
  });

  it("skips brands already listed, in any capitals", () => {
    expect(findNewBrands(["vellamy", "Keelstone"], ["Vellamy"])).toEqual([{ name: "Keelstone", rows: 1, closeTo: null }]);
  });

  it("flags a typo of a listed brand", () => {
    expect(findNewBrands(["Vellammy"], ["Vellamy"])).toEqual([{ name: "Vellammy", rows: 1, closeTo: "Vellamy" }]);
  });

  it("flags the rarer of two near-identical new names", () => {
    expect(findNewBrands(["Aldermoor", "Aldermoor", "Aldremoor"], [])).toEqual([
      { name: "Aldermoor", rows: 2, closeTo: null },
      { name: "Aldremoor", rows: 1, closeTo: "Aldermoor" },
    ]);
  });

  it("ignores names too long to be a brand", () => {
    expect(findNewBrands(["x".repeat(61)], [])).toEqual([]);
  });
});

describe("cleanBrandNames", () => {
  it("trims, drops blanks and repeats", () => {
    expect(cleanBrandNames([" Vellamy ", "vellamy", "", "  ", "Keelstone"])).toEqual(["Vellamy", "Keelstone"]);
  });
});
