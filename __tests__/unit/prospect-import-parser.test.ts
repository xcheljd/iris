import { describe, it, expect } from "vitest";
import {
  parseProspectCsv,
  findWithinImportDuplicates,
  selectBestRecord,
  serializeDuplicatesToCsv,
  PROSPECT_COLUMNS,
  type ProspectImportRow,
} from "@/lib/prospect-import-parser";
import { splitCsvLine } from "@/lib/csv-parser";

describe("PROSPECT_COLUMNS", () => {
  it("is A First name, B Last name, C Phone, D Email, E Customer #", () => {
    expect(PROSPECT_COLUMNS).toEqual(["First name", "Last name", "Phone", "Email", "Customer #"]);
  });
});

describe("parseProspectCsv", () => {
  it("reads rows by column position, no titles needed", () => {
    const { rows, parseErrors } = parseProspectCsv("Alice,Smith,(702) 555-0141,Alice@Example.com,C001\n");
    expect(parseErrors).toEqual([]);
    expect(rows).toEqual([
      { firstName: "Alice", lastName: "Smith", phone: "7025550141", email: "alice@example.com", customerId: "C001" },
    ]);
  });

  it("reads tab-separated rows pasted from a spreadsheet", () => {
    const { rows } = parseProspectCsv("Bo\tYates\t702-555-0102\tbo@example.com\n");
    expect(rows).toEqual([
      { firstName: "Bo", lastName: "Yates", phone: "7025550102", email: "bo@example.com", customerId: null },
    ]);
  });

  it("skips a title row whatever the titles say", () => {
    const { rows } = parseProspectCsv("First Name,Surname,Mobile,E-mail,Cust\nAda,Byron,,,\n");
    expect(rows.map((r) => r.firstName)).toEqual(["Ada"]);
  });

  it("keeps a first data row that has a phone or email", () => {
    const { rows } = parseProspectCsv("Name,Test,5550001111,,\n");
    expect(rows).toHaveLength(1);
  });

  it("turns empty cells into null", () => {
    const { rows } = parseProspectCsv("Ada,,,,\n");
    expect(rows[0]).toEqual({ firstName: "Ada", lastName: null, phone: null, email: null, customerId: null });
  });

  it("reports rows without a first name and skips spacer rows", () => {
    const { rows, parseErrors } = parseProspectCsv("Ada,Byron,,,\n,,,,\n,Smith,5550001111,,\n\n");
    expect(rows).toHaveLength(1);
    expect(parseErrors).toEqual(["Row 3: missing first name"]);
  });

  it("handles quoted fields and escaped quotes", () => {
    const { rows } = parseProspectCsv('"Smith, Jr.","O""Neil",,,\n');
    expect(rows[0].firstName).toBe("Smith, Jr.");
    expect(rows[0].lastName).toBe('O"Neil');
  });

  it("reports an empty file", () => {
    expect(parseProspectCsv(" \n").parseErrors).toEqual(["The file is empty."]);
  });
});

function makeRow(overrides: Partial<ProspectImportRow> = {}): ProspectImportRow {
  return {
    firstName: "Alice",
    lastName: "Smith",
    phone: "5551234567",
    email: "alice@example.com",
    customerId: "C001",
    ...overrides,
  };
}

describe("findWithinImportDuplicates", () => {
  it("returns an empty map when there are no duplicates", () => {
    const rows = [makeRow({ email: "a@example.com" }), makeRow({ firstName: "Bob", email: "b@example.com" })];
    expect(findWithinImportDuplicates(rows).size).toBe(0);
  });

  it("groups rows with the same name and contact details", () => {
    const rows = [makeRow({ customerId: "C001" }), makeRow({ customerId: "C002" }), makeRow({ customerId: "C003" })];
    const groups = findWithinImportDuplicates(rows);
    expect(groups.size).toBe(1);
    expect([...groups.values()][0]).toHaveLength(3);
  });

  it("ignores case in the first name", () => {
    expect(findWithinImportDuplicates([makeRow({ firstName: "alice" }), makeRow()]).size).toBe(1);
  });

  // Regression (B13): name alone merged two different contactless customers.
  it("keeps contactless rows with different customer numbers apart", () => {
    const rows = [
      makeRow({ customerId: "C001", phone: null, email: null }),
      makeRow({ customerId: "C002", phone: null, email: null }),
    ];
    expect(findWithinImportDuplicates(rows).size).toBe(0);
  });

  it("still groups a contactless customer repeated under the same number", () => {
    const rows = [
      makeRow({ customerId: "C001", phone: null, email: null }),
      makeRow({ customerId: "C001", phone: null, email: null }),
    ];
    expect(findWithinImportDuplicates(rows).size).toBe(1);
  });
});

describe("selectBestRecord", () => {
  it("picks the row with the most filled-in fields", () => {
    const sparse = makeRow({ lastName: null, phone: null, customerId: null });
    const rich = makeRow();
    expect(selectBestRecord([sparse, rich])).toBe(rich);
    expect(selectBestRecord([rich, sparse])).toBe(rich);
  });

  it("keeps the first row on a tie", () => {
    const a = makeRow({ customerId: "C001" });
    const b = makeRow({ customerId: "C002" });
    expect(selectBestRecord([a, b])).toBe(a);
  });
});

describe("serializeDuplicatesToCsv", () => {
  it("writes the A–E column titles, then one line per row", () => {
    const csv = serializeDuplicatesToCsv([makeRow(), makeRow({ customerId: null, phone: null })]);
    const lines = csv.split("\n").filter(Boolean);
    expect(lines[0]).toBe("First name,Last name,Phone,Email,Customer #");
    expect(lines[1]).toBe("Alice,Smith,5551234567,alice@example.com,C001");
    expect(lines[2]).toBe("Alice,Smith,,alice@example.com,");
  });

  it("round-trips through the parser", () => {
    const row = makeRow({ firstName: "Smith, John" });
    const { rows } = parseProspectCsv(serializeDuplicatesToCsv([row]));
    expect(rows).toEqual([row]);
  });

  // Regression: only commas triggered quoting, so an embedded quote or newline
  // broke the row and a leading "=" opened as a spreadsheet formula.
  it("escapes embedded quotes and newlines", () => {
    const csv = serializeDuplicatesToCsv([makeRow({ firstName: 'Ana "AJ"', lastName: "Line1\nLine2" })]);
    expect(csv).toContain('"Ana ""AJ"""');
    expect(csv).toContain('"Line1\nLine2"');
    expect(splitCsvLine(csv.split("\n")[1])[0]).toBe('Ana "AJ"');
  });

  it("neutralizes values that would open as a formula", () => {
    const fields = splitCsvLine(
      serializeDuplicatesToCsv([makeRow({ firstName: '=HYPERLINK("x")', lastName: "@SUM(A1)" })]).split("\n")[1],
    );
    expect(fields[0]).toBe("'=HYPERLINK(\"x\")");
    expect(fields[1]).toBe("'@SUM(A1)");
  });
});
