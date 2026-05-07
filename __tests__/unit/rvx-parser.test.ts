import { describe, it, expect } from "vitest";
import {
  parseRvxCsv,
  findWithinImportDuplicates,
  selectBestRecord,
  serializeDuplicatesToCsv,
  type RvxRawRow,
} from "@/lib/rvx-parser";

// Minimal valid CSV for most tests
function buildCsv(dataRows: string[], options?: { dateRow?: string; headerRow?: string }): string {
  const dateRow = options?.dateRow ?? "FROM 01/01/25 TO 12/31/25";
  const headerRow =
    options?.headerRow ?? "STORE #,CUST #,FIRST NAME,LAST NAME,TELEPHONE,EMAIL ADDRESS,TOTAL SALES";
  return ["SALES BY CUSTOMER", dateRow, "", headerRow, ...dataRows].join("\n");
}

describe("parseRvxCsv", () => {
  describe("date range parsing", () => {
    it("parses 2-digit year dates from row 1", () => {
      const csv = buildCsv([], { dateRow: "FROM 01/01/25 TO 12/31/25" });
      const { reportStartDate, reportEndDate, parseErrors } = parseRvxCsv(csv);
      expect(parseErrors).toHaveLength(0);
      expect(reportStartDate.getFullYear()).toBe(2025);
      expect(reportStartDate.getMonth()).toBe(0);
      expect(reportStartDate.getDate()).toBe(1);
      expect(reportEndDate.getFullYear()).toBe(2025);
      expect(reportEndDate.getMonth()).toBe(11);
      expect(reportEndDate.getDate()).toBe(31);
    });

    it("parses 4-digit year dates from row 1", () => {
      const csv = buildCsv([], { dateRow: "FROM 03/15/2025 TO 09/30/2025" });
      const { reportStartDate, reportEndDate } = parseRvxCsv(csv);
      expect(reportStartDate.getFullYear()).toBe(2025);
      expect(reportStartDate.getMonth()).toBe(2);
      expect(reportEndDate.getMonth()).toBe(8);
    });

    it("adds a parse error when date range is missing", () => {
      const csv = buildCsv([], { dateRow: "no dates here" });
      const { parseErrors } = parseRvxCsv(csv);
      expect(parseErrors.length).toBeGreaterThan(0);
      expect(parseErrors[0]).toMatch(/date range/i);
    });
  });

  describe("column header validation", () => {
    it("returns error and empty rows when required columns are missing", () => {
      const csv = buildCsv([], { headerRow: "STORE #,FIRST NAME" }); // missing CUST #
      const { rows, parseErrors } = parseRvxCsv(csv);
      expect(rows).toHaveLength(0);
      expect(parseErrors.some((e) => /missing required columns/i.test(e))).toBe(true);
    });
  });

  describe("data row parsing", () => {
    it("parses a well-formed data row", () => {
      const csv = buildCsv(["100,CUST001,John,Doe,734-788-5355,john@example.com,1500.00"]);
      const { rows, parseErrors } = parseRvxCsv(csv);
      expect(parseErrors).toHaveLength(0);
      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row.storeId).toBe("100");
      expect(row.customerId).toBe("CUST001");
      expect(row.firstName).toBe("John");
      expect(row.lastName).toBe("Doe");
      expect(row.phone).toBe("7347885355");
      expect(row.email).toBe("john@example.com");
      expect(row.spend).toBe(1500);
    });

    it("skips rows with missing storeId", () => {
      const csv = buildCsv([",CUST001,John,Doe,,,", "100,CUST002,Jane,,,,"]);
      const { rows } = parseRvxCsv(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0].customerId).toBe("CUST002");
    });

    it("skips rows with missing firstName", () => {
      const csv = buildCsv(["100,CUST001,,Doe,,,"]);
      const { rows } = parseRvxCsv(csv);
      expect(rows).toHaveLength(0);
    });

    it("skips blank and all-comma rows", () => {
      const csv = buildCsv(["100,CUST001,Alice,,,", "", ",,,,,,"]);
      const { rows } = parseRvxCsv(csv);
      expect(rows).toHaveLength(1);
    });

    it("lowercases email addresses", () => {
      const csv = buildCsv(["100,CUST001,John,,, JOHN@EXAMPLE.COM,"]);
      const { rows } = parseRvxCsv(csv);
      expect(rows[0].email).toBe("john@example.com");
    });

    it("returns null for empty email", () => {
      const csv = buildCsv(["100,CUST001,John,,,,"]);
      const { rows } = parseRvxCsv(csv);
      expect(rows[0].email).toBeNull();
    });

    it("returns null for null lastName (empty field)", () => {
      const csv = buildCsv(["100,CUST001,John,,,,"]);
      const { rows } = parseRvxCsv(csv);
      expect(rows[0].lastName).toBeNull();
    });

    it("parses spend with dollar sign and commas", () => {
      const csv = buildCsv(["100,CUST001,John,,,,\"$1,234.56\""]);
      const { rows } = parseRvxCsv(csv);
      expect(rows[0].spend).toBe(1234.56);
    });

    it("returns null spend for empty field", () => {
      const csv = buildCsv(["100,CUST001,John,,,,"]);
      const { rows } = parseRvxCsv(csv);
      expect(rows[0].spend).toBeNull();
    });

    it("handles multiple data rows", () => {
      const csv = buildCsv([
        "100,C001,Alice,Smith,555-1111,alice@example.com,100.00",
        "100,C002,Bob,Jones,555-2222,bob@example.com,200.00",
        "100,C003,Carol,,,carol@example.com,",
      ]);
      const { rows } = parseRvxCsv(csv);
      expect(rows).toHaveLength(3);
    });
  });

  describe("phone normalization", () => {
    it("strips dashes from phone numbers", () => {
      const csv = buildCsv(["100,C001,Alice,,734-788-5355,,"]);
      const { rows } = parseRvxCsv(csv);
      expect(rows[0].phone).toBe("7347885355");
    });

    it("strips parentheses and spaces from phone numbers", () => {
      const csv = buildCsv(["100,C001,Alice,,(321) 333-8100,,"]);
      const { rows } = parseRvxCsv(csv);
      expect(rows[0].phone).toBe("3213338100");
    });

    it("returns null for empty phone field", () => {
      const csv = buildCsv(["100,C001,Alice,,,,"]);
      const { rows } = parseRvxCsv(csv);
      expect(rows[0].phone).toBeNull();
    });

    it("returns already-digits-only phone unchanged", () => {
      const csv = buildCsv(["100,C001,Alice,,3213338100,,"]);
      const { rows } = parseRvxCsv(csv);
      expect(rows[0].phone).toBe("3213338100");
    });
  });

  describe("quoted CSV fields", () => {
    it("handles quoted fields containing commas", () => {
      const csv = buildCsv([`100,C001,"Smith, John",,,,`]);
      const { rows } = parseRvxCsv(csv);
      // "Smith, John" is in the firstName column (index 2)
      expect(rows[0].firstName).toBe("Smith, John");
    });

    it("handles escaped double quotes inside quoted fields", () => {
      const csv = buildCsv([`100,C001,John,"O""Brien",,,"$500.00"`]);
      const { rows } = parseRvxCsv(csv);
      expect(rows[0].lastName).toBe('O"Brien');
    });
  });
});

// ─── findWithinImportDuplicates ───────────────────────────────────────────────

function makeRow(overrides: Partial<RvxRawRow> = {}): RvxRawRow {
  return {
    storeId: "100",
    customerId: "C001",
    firstName: "Alice",
    lastName: "Smith",
    phone: "5551234567",
    email: "alice@example.com",
    spend: 100,
    ...overrides,
  };
}

describe("findWithinImportDuplicates", () => {
  it("returns empty map when no duplicates", () => {
    const rows = [
      makeRow({ customerId: "C001", email: "a@example.com" }),
      makeRow({ customerId: "C002", firstName: "Bob", email: "b@example.com" }),
    ];
    const result = findWithinImportDuplicates(rows);
    expect(result.size).toBe(0);
  });

  it("detects exact duplicate rows", () => {
    const row1 = makeRow({ customerId: "C001" });
    const row2 = makeRow({ customerId: "C002" }); // same name/phone/email
    const result = findWithinImportDuplicates([row1, row2]);
    expect(result.size).toBe(1);
    const [group] = [...result.values()];
    expect(group).toHaveLength(2);
  });

  it("groups three identical rows together", () => {
    const rows = [
      makeRow({ customerId: "C001" }),
      makeRow({ customerId: "C002" }),
      makeRow({ customerId: "C003" }),
    ];
    const result = findWithinImportDuplicates(rows);
    expect(result.size).toBe(1);
    const [group] = [...result.values()];
    expect(group).toHaveLength(3);
  });

  it("does not include unique rows in the result", () => {
    const rows = [
      makeRow({ customerId: "C001", firstName: "Alice" }),
      makeRow({ customerId: "C002", firstName: "Alice" }), // dupe
      makeRow({ customerId: "C003", firstName: "Unique", phone: "9999999999", email: "u@u.com" }),
    ];
    const result = findWithinImportDuplicates(rows);
    expect(result.size).toBe(1);
  });

  it("deduplication key is case-insensitive for firstName", () => {
    const rows = [
      makeRow({ customerId: "C001", firstName: "alice" }),
      makeRow({ customerId: "C002", firstName: "Alice" }),
    ];
    const result = findWithinImportDuplicates(rows);
    expect(result.size).toBe(1);
  });

  it("treats null fields as empty string in key", () => {
    const rows = [
      makeRow({ customerId: "C001", phone: null, email: null }),
      makeRow({ customerId: "C002", phone: null, email: null }),
    ];
    const result = findWithinImportDuplicates(rows);
    expect(result.size).toBe(1);
  });
});

// ─── selectBestRecord ─────────────────────────────────────────────────────────

describe("selectBestRecord", () => {
  it("picks the row with the most non-null fields", () => {
    const sparse = makeRow({ lastName: null, phone: null, email: null, spend: null });
    const rich = makeRow({ lastName: "Smith", phone: "5551234567", email: "a@a.com", spend: 200 });
    expect(selectBestRecord([sparse, rich])).toBe(rich);
    expect(selectBestRecord([rich, sparse])).toBe(rich);
  });

  it("uses highest spend as tiebreaker when field counts are equal", () => {
    const low = makeRow({ spend: 100 });
    const high = makeRow({ spend: 500 });
    expect(selectBestRecord([low, high])).toBe(high);
    expect(selectBestRecord([high, low])).toBe(high);
  });

  it("returns the only element from a single-item group", () => {
    const row = makeRow();
    expect(selectBestRecord([row])).toBe(row);
  });

  it("picks by spend when all fields are equal but spend differs", () => {
    const a = makeRow({ customerId: "C001", spend: 50 });
    const b = makeRow({ customerId: "C002", spend: 300 });
    expect(selectBestRecord([a, b])).toBe(b);
  });

  it("handles null spend (treated as 0) in tiebreaker", () => {
    const withSpend = makeRow({ spend: 10 });
    const noSpend = makeRow({ spend: null });
    expect(selectBestRecord([withSpend, noSpend])).toBe(withSpend);
  });
});

// ─── serializeDuplicatesToCsv ─────────────────────────────────────────────────

describe("serializeDuplicatesToCsv", () => {
  it("produces a header row as the first line", () => {
    const csv = serializeDuplicatesToCsv([makeRow()]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("STORE #,CUST #,FIRST NAME,LAST NAME,TELEPHONE,EMAIL ADDRESS,TOTAL SALES");
  });

  it("serializes a single row correctly", () => {
    const row = makeRow({
      storeId: "100",
      customerId: "C001",
      firstName: "Alice",
      lastName: "Smith",
      phone: "5551234567",
      email: "alice@example.com",
      spend: 99.5,
    });
    const csv = serializeDuplicatesToCsv([row]);
    const lines = csv.split("\n");
    expect(lines[1]).toBe("100,C001,Alice,Smith,5551234567,alice@example.com,99.50");
  });

  it("replaces null fields with empty strings", () => {
    const row = makeRow({ lastName: null, phone: null, email: null, spend: null });
    const csv = serializeDuplicatesToCsv([row]);
    const lines = csv.split("\n");
    const fields = lines[1].split(",");
    expect(fields[3]).toBe(""); // lastName
    expect(fields[4]).toBe(""); // phone
    expect(fields[5]).toBe(""); // email
    expect(fields[6]).toBe(""); // spend
  });

  it("quotes fields containing commas", () => {
    const row = makeRow({ firstName: "Smith, John" });
    const csv = serializeDuplicatesToCsv([row]);
    expect(csv).toContain('"Smith, John"');
  });

  it("produces correct number of data lines", () => {
    const rows = [makeRow({ customerId: "C1" }), makeRow({ customerId: "C2" }), makeRow({ customerId: "C3" })];
    const csv = serializeDuplicatesToCsv(rows);
    const lines = csv.split("\n").filter(Boolean);
    expect(lines).toHaveLength(4); // 1 header + 3 data
  });

  it("handles empty array (header only)", () => {
    const csv = serializeDuplicatesToCsv([]);
    const lines = csv.split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
  });
});
