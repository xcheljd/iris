export interface ParsedPromoRow {
  modelNumber: string;
  collection: string;
  msrp: number | null;
  discountPercent: number | null;
  discountPrice: number | null;
}

export const KNOWN_HEADERS: Record<string, string[]> = {
  modelNumber: ["model", "model number", "model no", "model#", "sku", "style", "item", "style number", "style no", "part number", "part no"],
  collection: ["collection", "brand", "line", "series", "category", "type", "group", "family"],
  msrp: ["msrp", "list price", "price", "retail", "retail price", "original price", "regular price", "unit price"],
  discountPercent: ["discount", "discount %", "pct", "percent", "off", "% off", "discount pct", "disc", "disc %"],
  discountPrice: ["sale price", "sale", "your price", "promo price", "discounted price", "net price", "final price", "our price", "special price", "promotional price"],
};

export function findColumnMapping(headers: string[]): Record<string, number> | null {
  const mapping: Record<string, number> = {};
  const normalizedHeaders = headers.map((h) => h.toLowerCase().trim().replace(/[^a-z0-9 ]/g, ""));
  for (const [field, patterns] of Object.entries(KNOWN_HEADERS)) {
    for (const pattern of patterns) {
      const idx = normalizedHeaders.findIndex((h) => h === pattern || h.includes(pattern));
      if (idx !== -1 && !(idx in mapping)) {
        mapping[field] = idx;
        break;
      }
    }
  }
  if (!("modelNumber" in mapping) && !("collection" in mapping)) return null;
  return mapping;
}

export function parsePasteData(raw: string): { rows: ParsedPromoRow[]; mapping: Record<string, number> | null; headers: string[] } {
  const lines = raw.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { rows: [], mapping: null, headers: [] };

  const detectSeparator = (line: string) => {
    const tab = (line.match(/\t/g) || []).length;
    const comma = (line.match(/,/g) || []).length;
    const pipe = (line.match(/\|/g) || []).length;
    if (tab >= comma && tab >= pipe) return "\t";
    if (pipe > comma) return "|";
    return comma > 0 ? "," : "\t";
  };

  const sep = detectSeparator(lines[0]);
  const allRows = lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^["']|["']$/g, "")));
  const firstRow = allRows[0];
  const isHeader = firstRow.some((cell) => {
    const lower = cell.toLowerCase();
    return Object.values(KNOWN_HEADERS).flat().some((pattern) => lower.includes(pattern));
  });

  let headers: string[];
  let dataRows: string[][];
  if (isHeader) { headers = firstRow; dataRows = allRows.slice(1); }
  else { headers = firstRow.map((_, i) => `Column ${i + 1}`); dataRows = allRows; }

  const mapping = findColumnMapping(firstRow);
  if (!mapping) return { rows: [], mapping: null, headers: [] };

  const parseNum = (v: string) => { const n = parseFloat(v.replace(/[$,%]/g, "").trim()); return isNaN(n) ? null : n; };
  const parsed = dataRows.map((row) => {
    const modelNumber = mapping.modelNumber !== undefined ? (row[mapping.modelNumber] || "").trim() : "";
    const collection = mapping.collection !== undefined ? (row[mapping.collection] || "").trim() : "";
    const msrpRaw = mapping.msrp !== undefined ? (row[mapping.msrp] || "").trim() : "";
    const discPctRaw = mapping.discountPercent !== undefined ? (row[mapping.discountPercent] || "").trim() : "";
    const discPriceRaw = mapping.discountPrice !== undefined ? (row[mapping.discountPrice] || "").trim() : "";
    if (!modelNumber && !collection) return null;
    return { modelNumber, collection, msrp: parseNum(msrpRaw), discountPercent: parseNum(discPctRaw), discountPrice: parseNum(discPriceRaw) };
  }).filter((r): r is ParsedPromoRow => r !== null);

  return { rows: parsed, mapping, headers };
}
