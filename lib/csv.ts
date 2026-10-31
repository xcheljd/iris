/**
 * Format one CSV cell: RFC-4180 quoting **plus** spreadsheet
 * formula-injection neutralization.
 *
 * - Wrap in double quotes and double any embedded `"` when the value
 *   contains `,`, `"`, CR or LF.
 * - When the value's first character is one of `= + - @` or a leading
 *   TAB/CR (Excel/Sheets treat these as formulas), prefix a single
 *   quote so spreadsheets render it as literal text.
 *
 * Shared so exports stay consistent. (Follow-up: migrate
 * lib/actions/clients-csv-export.ts onto this.)
 */
export function csvCell(value: string): string {
  if (value === "") return "";
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) {
    v = `'${v}`;
  }
  if (/[",\n\r]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

/** Join a header + rows array into CSV text (LF-separated). */
export function toCsv(header: string[], rows: string[][]): string {
  return [header, ...rows].map((cols) => cols.map(csvCell).join(",")).join("\n");
}
