import { normalizeModel } from "@/lib/normalize";
import { type Brand } from "@/lib/db/schema";

/**
 * Parser for the RVX "Selling Analysis By Style" export — an Office 2003
 * SpreadsheetML workbook (XML, not real .xlsx). One row per Vendor Style
 * (already de-duped by RVX). We map:
 *   Vendor Style  -> model      (normalizeModel)
 *   Sub-Class Code -> collection (strip the "XXX-" code prefix)
 *   Class Code    -> brand      (classCodeToBrand)
 *   Retail Price  -> msrp
 *
 * Header-driven (columns located by name, not fixed index) so RVX column
 * reordering doesn't silently corrupt the mapping. Sparse cells use
 * ss:Index; a cell without ss:Index advances one column from the prior.
 */

export type CatalogImportRow = {
  model: string;
  collection: string;
  brand: Brand | null;
  msrp: number | null;
};

export type CatalogParseResult = {
  rows: CatalogImportRow[];
  parseErrors: string[];
};

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'",
};
function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m]);
}

/** Map a RVX Class Code (e.g. "ASH-ASHFORD", "CHM -CHAMBERLAIN") to a Brand. */
export function classCodeToBrand(classCode: string): Brand | null {
  const prefix = classCode.split("-", 1)[0].trim().toUpperCase();
  if (!prefix) return null;
  if (prefix === "ASH") return "Ashford";
  if (prefix === "CHM") return "Chamberlain";
  if (prefix === "VOS") return "Voss";
  if (prefix === "KIN") return "Kinetic";
  // Option B: non-watch classes carry no brand.
  if (prefix === "JWL" || prefix === "CLO" || prefix === "100") return null;
  // Everything else is a Meridian line (Solaris, Automatic, Retail
  // Exclusive, Quartz, and licensed Disney/Star Wars/Marvel).
  return "Meridian";
}

/** "PR4-SENTINEL DEEP" -> "SENTINEL DEEP"; "120-ORION" -> "ORION". */
export function stripSubClassPrefix(subClass: string): string {
  return subClass.replace(/^[^-]+-/, "").trim();
}

function parsePrice(raw: string): number | null {
  const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

type Cell = { col: number; value: string };

function rowCells(rowXml: string): Cell[] {
  const cells: Cell[] = [];
  let idx = 0; // 1-based column of the *next* cell
  const cellRe = /<Cell\b([^>]*)>([\s\S]*?)<\/Cell>|<Cell\b([^>]*)\/>/g;
  let m: RegExpExecArray | null;
  while ((m = cellRe.exec(rowXml))) {
    const attrs = m[1] ?? m[3] ?? "";
    const inner = m[2] ?? "";
    const si = /ss:Index\s*=\s*"(\d+)"/.exec(attrs);
    if (si) idx = parseInt(si[1], 10);
    else idx += 1;
    const dm = /<Data\b[^>]*>([\s\S]*?)<\/Data>/.exec(inner);
    cells.push({ col: idx, value: dm ? decodeXml(dm[1]).trim() : "" });
  }
  return cells;
}

export function parseRvxCatalogXml(xml: string): CatalogParseResult {
  const parseErrors: string[] = [];
  const rowsXml = xml.match(/<Row\b[^>]*>[\s\S]*?<\/Row>/g);
  if (!rowsXml || rowsXml.length === 0) {
    return { rows: [], parseErrors: ["No rows found — is this a RVX SpreadsheetML export?"] };
  }

  // Locate the header row (the one whose cells include "Vendor Style").
  let header: Map<string, number> | null = null;
  const want = { model: "Vendor Style", coll: "Sub-Class Code", brand: "Class Code", msrp: "Retail Price" };
  let colModel = 0, colColl = 0, colBrand = 0, colMsrp = 0;

  const out: CatalogImportRow[] = [];
  let dataRowNum = 0;

  for (const rx of rowsXml) {
    const cells = rowCells(rx);
    if (!header) {
      const byName = new Map<string, number>();
      for (const c of cells) if (c.value) byName.set(c.value, c.col);
      if (byName.has(want.model)) {
        header = byName;
        colModel = byName.get(want.model)!;
        colColl = byName.get(want.coll) ?? 0;
        colBrand = byName.get(want.brand) ?? 0;
        colMsrp = byName.get(want.msrp) ?? 0;
        if (!colColl || !colBrand) {
          return { rows: [], parseErrors: [`Header missing expected columns (need "${want.coll}" and "${want.brand}")`] };
        }
      }
      continue;
    }
    dataRowNum += 1;
    const get = (col: number) => (col ? cells.find((c) => c.col === col)?.value ?? "" : "");
    const styleRaw = get(colModel);
    if (!styleRaw) continue; // subtotal / blank style rows
    const model = normalizeModel(styleRaw);
    const collection = stripSubClassPrefix(get(colColl));
    if (!model || !collection) {
      parseErrors.push(`Row ${dataRowNum}: missing model or collection (style="${styleRaw}")`);
      continue;
    }
    out.push({
      model,
      collection,
      brand: classCodeToBrand(get(colBrand)),
      msrp: colMsrp ? parsePrice(get(colMsrp)) : null,
    });
  }

  if (!header) return { rows: [], parseErrors: ['No header row (could not find a "Vendor Style" column)'] };

  // RVX emits one row per (style, color-code) tuple. With a wider client
  // filter the same Vendor Style can repeat across colors — the model
  // catalog is keyed by Vendor Style alone, so dedupe here and prefer
  // whichever copy has the most information (non-null brand, then msrp).
  const byModel = new Map<string, CatalogImportRow>();
  for (const r of out) {
    const cur = byModel.get(r.model);
    if (!cur) { byModel.set(r.model, r); continue; }
    const score = (x: CatalogImportRow) => (x.brand ? 2 : 0) + (x.msrp != null ? 1 : 0);
    if (score(r) > score(cur)) byModel.set(r.model, r);
  }
  return { rows: [...byModel.values()], parseErrors };
}
