import { toCsv } from "./csv";
import { readDelimited, describeSource, type ImportField, type MappedRow } from "./import-grid";

/**
 * Prospect import. Columns are matched by title when the file has a title
 * row (any order, common synonyms); without titles they are read in order:
 *
 *   A  First name  — required
 *   B  Last name
 *   C  Phone       — any format; stored as digits
 *   D  Email
 *   E  Customer #  — optional; matches rows already imported from earlier files
 */

export type ProspectField = "firstName" | "lastName" | "phone" | "email" | "customerId";

export const PROSPECT_FIELDS: readonly ImportField<ProspectField>[] = [
  { key: "firstName", label: "First name", required: true, synonyms: ["first name", "first", "firstname", "given name", "fname", "name"] },
  { key: "lastName", label: "Last name", synonyms: ["last name", "last", "lastname", "surname", "family name", "lname"] },
  { key: "phone", label: "Phone", synonyms: ["phone", "phone #", "phone number", "mobile", "cell", "cell phone", "telephone", "tel"] },
  { key: "email", label: "Email", synonyms: ["email", "e-mail", "email address", "mail"] },
  { key: "customerId", label: "Customer #", synonyms: ["customer #", "customer", "customer id", "customer number", "cust", "cust #", "client #", "client id", "account", "account #", "id"] },
];

export interface ProspectImportRow {
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  customerId: string | null;
}

export interface ProspectParseResult {
  rows: ProspectImportRow[];
  parseErrors: string[];
}

/** Column order without titles (A–E). */
export const PROSPECT_COLUMNS = PROSPECT_FIELDS.map((f) => f.label);

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

/** Without a recognised title row, the first row reads as titles when it names a column and holds no contact data. */
function prospectTitleLike(c: Record<ProspectField, string>): boolean {
  return !c.email.includes("@") && !/\d/.test(c.phone) && /name/i.test(c.firstName);
}

export function parseProspectRecords(records: MappedRow<ProspectField>[], hasTitleRow = false): ProspectParseResult {
  const parseErrors: string[] = [];
  const rows: ProspectImportRow[] = [];
  records.forEach((rec, i) => {
    const { cells } = rec;
    const where = describeSource(rec);
    if (i === 0 && !hasTitleRow && prospectTitleLike(cells)) return;
    const firstName = cells.firstName.trim();
    if (!firstName) {
      parseErrors.push(`${where}: missing first name`);
      return;
    }
    const email = cells.email.trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) parseErrors.push(`${where}: email "${email}" doesn't look valid — imported as is`);
    rows.push({
      firstName,
      lastName: cells.lastName.trim() || null,
      phone: normalizePhone(cells.phone),
      email: email || null,
      customerId: cells.customerId.trim() || null,
    });
  });

  if (rows.length === 0 && parseErrors.length === 0) {
    parseErrors.push("No prospect rows found. Columns must be First name, Last name, Phone, Email, Customer #.");
  }
  return { rows, parseErrors };
}

/** Pasted text or a CSV file → prospect rows. */
export function parseProspectCsv(text: string): ProspectParseResult {
  if (text.trim() === "") return { rows: [], parseErrors: ["The file is empty."] };
  const { rows, layout } = readDelimited(text, PROSPECT_FIELDS);
  return parseProspectRecords(rows, layout.headerRow != null);
}

export function dedupeKey(row: ProspectImportRow): string {
  const key = [
    row.firstName.toLowerCase(),
    row.lastName?.toLowerCase() ?? "",
    row.phone ?? "",
    row.email?.toLowerCase() ?? "",
  ];
  // With no contact info the name alone would merge two different customers
  // (two contactless "John Smith"s); the customer number keeps them apart.
  if (!row.phone && !row.email) key.push(row.customerId ?? "");
  return key.join("|");
}

export function findWithinImportDuplicates(rows: ProspectImportRow[]): Map<string, ProspectImportRow[]> {
  const groups = new Map<string, ProspectImportRow[]>();
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

function countNonNull(row: ProspectImportRow): number {
  return [row.lastName, row.phone, row.email, row.customerId].filter((v) => v !== null).length;
}

/** The most complete row of a duplicate group; ties keep the first. */
export function selectBestRecord(group: ProspectImportRow[]): ProspectImportRow {
  return group.reduce((best, cur) => (countNonNull(cur) > countNonNull(best) ? cur : best));
}

/** Duplicate rows with titles, in the same A–E order the import reads, so the file can be fixed and re-imported. */
export function serializeDuplicatesToCsv(rows: ProspectImportRow[]): string {
  return toCsv([...PROSPECT_COLUMNS], rows.map((r) => [
    r.firstName,
    r.lastName ?? "",
    r.phone ?? "",
    r.email ?? "",
    r.customerId ?? "",
  ]));
}
