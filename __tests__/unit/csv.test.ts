import { describe, it, expect } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";

describe("csvCell", () => {
  it("passes plain values through", () => {
    expect(csvCell("Solaris")).toBe("Solaris");
    expect(csvCell("")).toBe("");
  });

  it("RFC-4180 quotes values with comma, quote, or newline", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('he said "hi"')).toBe('"he said ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("neutralizes formula-injection prefixes", () => {
    expect(csvCell("=cmd()")).toBe("'=cmd()");
    expect(csvCell("+1 (555) 000")).toBe("'+1 (555) 000");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("quotes AND prefixes when a risky value also needs quoting", () => {
    expect(csvCell("=1,2")).toBe('"\'=1,2"');
  });

  it("toCsv joins header + rows with escaping", () => {
    expect(toCsv(["A", "B"], [["x", "y,z"], ["=p", "q"]]))
      .toBe('A,B\nx,"y,z"\n\'=p,q');
  });
});
