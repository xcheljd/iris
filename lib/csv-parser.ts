export function detectSeparator(line: string): "\t" | "|" | "," {
  const tab = (line.match(/\t/g) || []).length;
  const comma = (line.match(/,/g) || []).length;
  const pipe = (line.match(/\|/g) || []).length;
  if (tab >= comma && tab >= pipe) return "\t";
  if (pipe > comma) return "|";
  return comma > 0 ? "," : "\t";
}

// RFC-4180-compliant split; handles quoted fields containing the separator.
export function splitCsvLine(line: string, sep: string = ","): string[] {
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
    } else if (ch === sep && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}
