export interface RvxRawRow {
  storeId: string;
  customerId: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  spend: number | null;
}

export interface RvxParseResult {
  rows: RvxRawRow[];
  reportStartDate: Date;
  reportEndDate: Date;
  parseErrors: string[];
}

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

function parseDateRange(line: string): { start: Date; end: Date } | null {
  // e.g. "FROM 01/01/25 TO 12/31/25" or "FROM 01/01/2025 TO 12/31/2025"
  const match = line.match(/FROM\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+TO\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (!match) return null;
  const parseDate = (s: string): Date => {
    const [m, d, y] = s.split("/");
    const year = y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
    return new Date(year, parseInt(m, 10) - 1, parseInt(d, 10));
  };
  return { start: parseDate(match[1]), end: parseDate(match[2]) };
}

export function parseRvxCsv(csvText: string): RvxParseResult {
  const parseErrors: string[] = [];
  const lines = csvText.split(/\r?\n/);

  // Row 1: date range
  const dateRange = parseDateRange(lines[1] ?? "");
  if (!dateRange) {
    parseErrors.push(`Could not parse date range from row 2: "${lines[1]}"`);
  }

  // Row 3 (index 3): column headers
  const headerLine = lines[3] ?? "";
  const headers = splitCsvLine(headerLine).map((h) => h.toUpperCase());

  const col = (name: string) => headers.indexOf(name);
  const storeCol = col("STORE #");
  const custCol = col("CUST #");
  const firstCol = col("FIRST NAME");
  const lastCol = col("LAST NAME");
  const phoneCol = col("TELEPHONE");
  const emailCol = col("EMAIL ADDRESS");
  const spendCol = col("TOTAL SALES");

  if (storeCol === -1 || custCol === -1 || firstCol === -1) {
    parseErrors.push("Missing required columns (STORE #, CUST #, FIRST NAME) in header row");
    return {
      rows: [],
      reportStartDate: dateRange?.start ?? new Date(),
      reportEndDate: dateRange?.end ?? new Date(),
      parseErrors,
    };
  }

  const rows: RvxRawRow[] = [];

  for (let i = 4; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim() === "" || /^,+$/.test(line.trim())) continue;

    const fields = splitCsvLine(line);
    const storeId = fields[storeCol] ?? "";
    const customerId = fields[custCol] ?? "";
    const firstName = fields[firstCol] ?? "";

    if (!storeId || !customerId || !firstName) continue;

    const rawPhone = phoneCol !== -1 ? (fields[phoneCol] ?? "") : "";
    const rawEmail = emailCol !== -1 ? (fields[emailCol] ?? "") : "";
    const rawSpend = spendCol !== -1 ? (fields[spendCol] ?? "") : "";

    const spendNum = parseFloat(rawSpend.replace(/[$,]/g, ""));

    rows.push({
      storeId,
      customerId,
      firstName: firstName.trim(),
      lastName: lastCol !== -1 && fields[lastCol] ? fields[lastCol].trim() || null : null,
      phone: normalizePhone(rawPhone),
      email: rawEmail.trim().toLowerCase() || null,
      spend: isNaN(spendNum) ? null : spendNum,
    });
  }

  return {
    rows,
    reportStartDate: dateRange?.start ?? new Date(),
    reportEndDate: dateRange?.end ?? new Date(),
    parseErrors,
  };
}

function dedupeKey(row: RvxRawRow): string {
  return [
    row.firstName.toLowerCase(),
    row.lastName?.toLowerCase() ?? "",
    row.phone ?? "",
    row.email?.toLowerCase() ?? "",
  ].join("|");
}

export function findWithinImportDuplicates(rows: RvxRawRow[]): Map<string, RvxRawRow[]> {
  const groups = new Map<string, RvxRawRow[]>();
  for (const row of rows) {
    const key = dedupeKey(row);
    const group = groups.get(key);
    if (group) {
      group.push(row);
    } else {
      groups.set(key, [row]);
    }
  }
  // Keep only actual duplicates
  for (const [key, group] of groups) {
    if (group.length < 2) groups.delete(key);
  }
  return groups;
}

function countNonNull(row: RvxRawRow): number {
  return [row.lastName, row.phone, row.email, row.spend].filter((v) => v !== null).length;
}

export function selectBestRecord(group: RvxRawRow[]): RvxRawRow {
  return group.reduce((best, cur) => {
    const bestScore = countNonNull(best);
    const curScore = countNonNull(cur);
    if (curScore > bestScore) return cur;
    if (curScore === bestScore && (cur.spend ?? 0) > (best.spend ?? 0)) return cur;
    return best;
  });
}

export function serializeDuplicatesToCsv(rows: RvxRawRow[]): string {
  const header = "STORE #,CUST #,FIRST NAME,LAST NAME,TELEPHONE,EMAIL ADDRESS,TOTAL SALES";
  const dataLines = rows.map((r) => {
    const fields = [
      r.storeId,
      r.customerId,
      r.firstName,
      r.lastName ?? "",
      r.phone ?? "",
      r.email ?? "",
      r.spend !== null ? r.spend.toFixed(2) : "",
    ];
    return fields.map((f) => (f.includes(",") ? `"${f}"` : f)).join(",");
  });
  return [header, ...dataLines].join("\n");
}
