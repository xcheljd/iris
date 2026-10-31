import { describe, it, expect } from "vitest";
import {
  parseDelimited, gridFromSheet, detectLayout, mapRows, toMappedText, readDelimited,
  columnLetter, parseAmount, isNegative, templateCsv, describeSource, dataRowCount, type ImportField,
} from "@/lib/import-grid";

type F = "brand" | "model" | "msrp";
const FIELDS: readonly ImportField<F>[] = [
  { key: "brand", label: "Brand", synonyms: ["brand", "make"] },
  { key: "model", label: "Model", required: true, synonyms: ["model", "style"] },
  { key: "msrp", label: "MSRP", synonyms: ["msrp", "retail"] },
];

describe("parseDelimited", () => {
  it("keeps a quoted line break inside one cell", () => {
    expect(parseDelimited('Aldermoor,"DEEP\nSTAR",AD-8404\nVellamy,RIDGE,VL-525\n')).toEqual([
      ["Aldermoor", "DEEP\nSTAR", "AD-8404"],
      ["Vellamy", "RIDGE", "VL-525"],
    ]);
  });
  it("handles doubled quotes, separators in quotes and CRLF", () => {
    expect(parseDelimited('"O""Neil","a, b"\r\nx,y\r\n')).toEqual([['O"Neil', "a, b"], ["x", "y"]]);
  });
  it("keeps blank lines so row numbers match the spreadsheet", () => {
    expect(parseDelimited("a,b\n\nc,d\n")).toEqual([["a", "b"], [""], ["c", "d"]]);
  });
  it("detects tab and semicolon separators", () => {
    expect(parseDelimited("a\tb\n")).toEqual([["a", "b"]]);
    expect(parseDelimited("a;1,5\n")).toEqual([["a", "1,5"]]);
  });
});

describe("gridFromSheet", () => {
  it("turns .xlsx cell values into text", () => {
    expect(gridFromSheet([["Model", 123456, 0.5, null, new Date(Date.UTC(2026, 4, 25)), 0.1 + 0.2]])).toEqual([
      ["Model", "123456", "0.5", "", "2026-05-25", "0.3"],
    ]);
  });
});

describe("detectLayout", () => {
  it("matches titles in any order and skips a sheet heading above them", () => {
    const grid = parseDelimited("Memorial Day Sale\nRetail,Style,Make\n500,AD-8404,Aldermoor\n");
    const layout = detectLayout(grid, FIELDS);
    expect(layout).toMatchObject({ headerRow: 1, dataStart: 2, mapping: { brand: 2, model: 1, msrp: 0 } });
    expect(mapRows(grid, layout, FIELDS)).toEqual([
      { sourceRow: 3, cells: { brand: "Aldermoor", model: "AD-8404", msrp: "500" } },
    ]);
  });
  it("falls back to column order and skips a one-cell heading", () => {
    const layout = detectLayout(parseDelimited("Spring promo\nAldermoor,AD-8404,500\n"), FIELDS);
    expect(layout).toMatchObject({ headerRow: null, dataStart: 1, mapping: { brand: 0, model: 1, msrp: 2 } });
  });
  it("marks a title column absent when the file doesn't have it", () => {
    const layout = detectLayout(parseDelimited("Style,Retail\nAD-8404,500\n"), FIELDS);
    expect(layout.mapping).toEqual({ brand: null, model: 0, msrp: 1 });
  });
});

describe("toMappedText", () => {
  it("re-writes mapped rows in field order and keeps their original row numbers", () => {
    const grid = parseDelimited("Heading\nRetail,Style\n\n500,AD-8404\n");
    const text = toMappedText([{ grid, layout: detectLayout(grid, FIELDS) }], FIELDS);
    expect(text).toBe("Source row,Brand,Model,MSRP\n4,,AD-8404,500\n");
    expect(readDelimited(text, FIELDS).rows).toEqual([
      { sourceRow: 4, cells: { brand: "", model: "AD-8404", msrp: "500" } },
    ]);
  });
});

describe("parseAmount", () => {
  it("reads US and decimal-comma money", () => {
    expect(parseAmount("$1,295.00")).toBe(1295);
    expect(parseAmount("1295")).toBe(1295);
    expect(parseAmount("1.295,00")).toBe(1295);
    expect(parseAmount("1295,5")).toBe(1295.5);
    expect(parseAmount("€ 89,90")).toBe(89.9);
  });
  it("rejects blank, zero, negative and junk", () => {
    for (const v of ["", "0", "-20", "(20)", "n/a"]) expect(parseAmount(v)).toBeNull();
  });
  it("isNegative spots minus signs and accounting brackets", () => {
    expect(isNegative("-20%")).toBe(true);
    expect(isNegative("($20.00)")).toBe(true);
    expect(isNegative("20")).toBe(false);
  });
});

describe("helpers", () => {
  it("columnLetter", () => {
    expect([0, 5, 25, 26, 27].map(columnLetter)).toEqual(["A", "F", "Z", "AA", "AB"]);
  });
  it("templateCsv writes titles then examples", () => {
    expect(templateCsv(FIELDS, [["Aldermoor", "AD-8404", "1,295.00"]])).toBe('Brand,Model,MSRP\nAldermoor,AD-8404,"1,295.00"\n');
  });
});

describe("multi-sheet", () => {
  const sheet = (name: string, text: string) => {
    const grid = parseDelimited(text);
    return { name, grid, layout: detectLayout(grid, FIELDS) };
  };

  it("writes every sheet with its name, matching each sheet's own column order", () => {
    const text = toMappedText([
      sheet("Vellamy", "Make,Style,Retail\nVellamy,VL-525,895\n"),
      sheet("Aldermoor", "Promo list\nRetail,Style\n500,AD-8404\n"),
    ], FIELDS);
    expect(text).toBe("Source sheet,Source row,Brand,Model,MSRP\nVellamy,2,Vellamy,VL-525,895\nAldermoor,3,,AD-8404,500\n");
    expect(readDelimited(text, FIELDS).rows).toEqual([
      { sourceRow: 2, sourceSheet: "Vellamy", cells: { brand: "Vellamy", model: "VL-525", msrp: "895" } },
      { sourceRow: 3, sourceSheet: "Aldermoor", cells: { brand: "", model: "AD-8404", msrp: "500" } },
    ]);
  });

  it("describes a row with its sheet", () => {
    expect(describeSource({ sourceRow: 7 })).toBe("Row 7");
    expect(describeSource({ sourceRow: 7, sourceSheet: "Vellamy" })).toBe("Vellamy sheet, row 7");
  });

  it("counts data rows below the titles", () => {
    const s = sheet("Notes", "Model,MSRP\n\nIX1,1\nIX2,2\n");
    expect(dataRowCount(s.grid, s.layout)).toBe(2);
    const empty = sheet("Blank", "");
    expect(dataRowCount(empty.grid, empty.layout)).toBe(0);
  });
});
