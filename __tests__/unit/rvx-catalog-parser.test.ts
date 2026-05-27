import { describe, it, expect } from "vitest";
import {
  parseRvxCatalogXml,
  classCodeToBrand,
  stripSubClassPrefix,
} from "@/lib/rvx-catalog-parser";

// Compact fixture mirroring the real RVX "Selling Analysis By Style"
// SpreadsheetML: header row located by the "Vendor Style" cell, sparse
// cells via ss:Index, a blank-style subtotal row, a malformed price.
const FIXTURE = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Report"><Table>
<Row><Cell><Data ss:Type="String">May 19, 2026</Data></Cell></Row>
<Row><Cell><Data>Selling Analysis By Style</Data></Cell></Row>
<Row>
 <Cell ss:Index="2"><Data>Department</Data></Cell>
 <Cell><Data>Class Code</Data></Cell>
 <Cell><Data>Sub-Class Code</Data></Cell>
 <Cell><Data>Season Code</Data></Cell>
 <Cell><Data>Vendor Style</Data></Cell>
 <Cell ss:Index="33"><Data>Retail Price</Data></Cell>
</Row>
<Row>
 <Cell ss:Index="2"><Data>01-MENS</Data></Cell>
 <Cell><Data>1EC-SOLARIS</Data></Cell>
 <Cell><Data>120-ORION</Data></Cell>
 <Cell><Data>F19</Data></Cell>
 <Cell><Data>kx1015-01x</Data></Cell>
 <Cell ss:Index="33"><Data>425.00</Data></Cell>
</Row>
<Row>
 <Cell ss:Index="3"><Data>ASH-ASHFORD</Data></Cell>
 <Cell><Data>SUT-BELGRAVE</Data></Cell>
 <Cell ss:Index="6"><Data>70Z004</Data></Cell>
 <Cell ss:Index="33"><Data>$500</Data></Cell>
</Row>
<Row>
 <Cell ss:Index="3"><Data>CHM -CHAMBERLAIN</Data></Cell>
 <Cell><Data>MAN-FC MANUFACTURE</Data></Cell>
 <Cell ss:Index="6"><Data>FC-220</Data></Cell>
 <Cell ss:Index="33"><Data>1995.00</Data></Cell>
</Row>
<Row>
 <Cell ss:Index="3"><Data>VOS -VOSS</Data></Cell>
 <Cell><Data>APN-VOSS RIDGELINE</Data></Cell>
 <Cell ss:Index="6"><Data>AL-525</Data></Cell>
</Row>
<Row>
 <Cell ss:Index="3"><Data>KIN-KINETIC</Data></Cell>
 <Cell><Data>SPA-SPACEVIEW</Data></Cell>
 <Cell ss:Index="6"><Data>2ES6A001</Data></Cell>
 <Cell ss:Index="33"><Data>bad-price</Data></Cell>
</Row>
<Row>
 <Cell ss:Index="3"><Data>JWL-JEWELRY</Data></Cell>
 <Cell><Data>MAJ-MARC ANTHONY JEWELRY</Data></Cell>
 <Cell ss:Index="6"><Data>BVB1009-SBSTNA</Data></Cell>
 <Cell ss:Index="33"><Data>250</Data></Cell>
</Row>
<Row>
 <Cell ss:Index="3"><Data>DIS-DISNEY</Data></Cell>
 <Cell><Data>MIC-MICKEY &amp; FRIENDS</Data></Cell>
 <Cell ss:Index="6"><Data>KX1019-01X</Data></Cell>
 <Cell ss:Index="33"><Data>295.00</Data></Cell>
</Row>
<Row>
 <Cell ss:Index="3"><Data>1EC-SOLARIS</Data></Cell>
 <Cell><Data>120-ORION</Data></Cell>
 <Cell ss:Index="6"><Data></Data></Cell>
 <Cell ss:Index="33"><Data>999</Data></Cell>
</Row>
</Table></Worksheet></Workbook>`;

describe("classCodeToBrand", () => {
  it("maps watch brands", () => {
    expect(classCodeToBrand("ASH-ASHFORD")).toBe("Ashford");
    expect(classCodeToBrand("CHM -CHAMBERLAIN")).toBe("Chamberlain");
    expect(classCodeToBrand("VOS -VOSS")).toBe("Voss");
    expect(classCodeToBrand("KIN-KINETIC")).toBe("Kinetic");
  });
  it("non-watch classes carry no brand (option B)", () => {
    expect(classCodeToBrand("JWL-JEWELRY")).toBeNull();
    expect(classCodeToBrand("CLO-CLOCKS")).toBeNull();
    expect(classCodeToBrand("100-ACCESSORIES")).toBeNull();
  });
  it("licensed + other Meridian lines map to Meridian", () => {
    expect(classCodeToBrand("DIS-DISNEY")).toBe("Meridian");
    expect(classCodeToBrand("1EC-SOLARIS")).toBe("Meridian");
    expect(classCodeToBrand("AUT-AUTOMATIC")).toBe("Meridian");
    expect(classCodeToBrand("6GL-RETAIL EXCLUSIVE")).toBe("Meridian");
  });
});

describe("stripSubClassPrefix", () => {
  it("strips the code prefix", () => {
    expect(stripSubClassPrefix("120-ORION")).toBe("ORION");
    expect(stripSubClassPrefix("PR4-SENTINEL DEEP")).toBe("SENTINEL DEEP");
  });
});

describe("parseRvxCatalogXml", () => {
  const { rows, parseErrors } = parseRvxCatalogXml(FIXTURE);

  it("parses one row per non-blank vendor style", () => {
    expect(rows).toHaveLength(7); // 8 data rows − 1 blank-style
  });
  it("uppercases the model and strips the collection prefix", () => {
    expect(rows[0]).toEqual({ model: "KX1015-01X", collection: "ORION", brand: "Meridian", msrp: 425 });
  });
  it("maps brand by class code and parses price (incl. $ and bad values)", () => {
    expect(rows.find((r) => r.model === "70Z004")).toEqual({
      model: "70Z004", collection: "BELGRAVE", brand: "Ashford", msrp: 500,
    });
    const fc = rows.find((r) => r.model === "FC-220")!;
    expect(fc.brand).toBe("Chamberlain");
    expect(fc.msrp).toBe(1995);
    const al = rows.find((r) => r.model === "AL-525")!;
    expect(al).toEqual({ model: "AL-525", collection: "VOSS RIDGELINE", brand: "Voss", msrp: null });
    const acc = rows.find((r) => r.model === "2ES6A001")!;
    expect(acc.brand).toBe("Kinetic");
    expect(acc.msrp).toBeNull(); // "bad-price" → null
  });
  it("decodes XML entities and applies the brand rules", () => {
    expect(rows.find((r) => r.model === "BVB1009-SBSTNA")!.brand).toBeNull(); // jewelry
    const disney = rows.find((r) => r.model === "KX1019-01X")!;
    expect(disney.brand).toBe("Meridian");
    expect(disney.collection).toBe("MICKEY & FRIENDS");
  });
  it("skips the blank-style subtotal row without error", () => {
    expect(rows.some((r) => r.model === "")).toBe(false);
    expect(parseErrors).toHaveLength(0);
  });
  it("reports an error when there is no header", () => {
    const res = parseRvxCatalogXml("<Workbook><Worksheet><Table><Row><Cell><Data>x</Data></Cell></Row></Table></Worksheet></Workbook>");
    expect(res.rows).toHaveLength(0);
    expect(res.parseErrors.length).toBeGreaterThan(0);
  });
});
