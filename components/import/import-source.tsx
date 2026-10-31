"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Info, AlertTriangle, Upload, Layers } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  parseDelimited, gridFromSheet, detectLayout, mapRows, toMappedText, templateCsv, columnLetter, dataRowCount,
  type Grid, type GridLayout, type ImportField, type ImportSheet,
} from "@/lib/import-grid";
import { downloadCsv } from "@/lib/download";

const NONE = "none";
const PREVIEW_ROWS = 5;

interface ImportSourceProps<K extends string> {
  /** Used for element ids and the template file name ("promo" → promo-template.csv). */
  id: string;
  fields: readonly ImportField<K>[];
  /** Example rows for the downloadable template, in field order. */
  examples: readonly (readonly string[])[];
  /** Per-field help shown in the column list ("required", "blank uses the catalog"…). */
  hints?: Partial<Record<K, string>>;
  placeholder?: string;
  /**
   * Called with the rows re-written in the canonical layout (titles, fields
   * in order, original row numbers) whenever the input or the mapping
   * changes; null when there's nothing importable yet.
   */
  onChange: (mappedText: string | null) => void;
}

/** Every sheet of a workbook, in workbook order. */
async function readXlsx(file: File): Promise<{ name: string; grid: Grid }[]> {
  const { default: readWorkbook } = await import("read-excel-file/browser");
  return (await readWorkbook(file)).map((sh) => ({ name: sh.sheet, grid: gridFromSheet(sh.data) }));
}

/** Problems that block importing a sheet (no column for a required field) or deserve a look (one column read twice). */
function sheetProblems<K extends string>(layout: GridLayout<K>, fields: readonly ImportField<K>[]) {
  const missing = fields.filter((f) => f.required && layout.mapping[f.key] == null).map((f) => `Pick the column for ${f.label}`);
  const seen = new Map<number, string>();
  const twice: string[] = [];
  for (const f of fields) {
    const c = layout.mapping[f.key];
    if (c == null) continue;
    if (seen.has(c)) twice.push(`${seen.get(c)} and ${f.label} both read column ${columnLetter(c)}`);
    else seen.set(c, f.label);
  }
  return { missing, twice };
}

/**
 * The input half of every spreadsheet import: paste box, file upload (CSV,
 * TSV or .xlsx), column check with per-field column pickers, and a preview
 * of the first rows as they will be read.
 */
export function ImportSource<K extends string>({ id, fields, examples, hints, placeholder, onChange }: ImportSourceProps<K>) {
  // One entry per sheet: a workbook's non-empty sheets, or a single unnamed
  // entry for pasted text, a CSV, or a one-sheet workbook.
  const [sheets, setSheets] = useState<ImportSheet<K>[]>([]);
  const [selected, setSelected] = useState<boolean[]>([]);
  const [active, setActive] = useState(0);
  const [emptySheets, setEmptySheets] = useState(0);
  const [pasted, setPasted] = useState("");
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = (raw: { name?: string; grid: Grid }[]) => {
    const all = raw.map((sh) => ({ ...sh, layout: detectLayout(sh.grid, fields) }));
    const used = all.filter((sh) => dataRowCount(sh.grid, sh.layout) > 0);
    // A workbook with one sheet of data reads like a plain file: no sheet names.
    const list = used.length > 1 ? used : used.map(({ grid, layout }) => ({ grid, layout }));
    const titled = list.map((sh) => sh.layout.headerRow != null);
    setSheets(list);
    setSelected(titled.some(Boolean) ? titled : list.map((_, i) => i === 0));
    setActive(Math.max(0, titled.indexOf(true)));
    setEmptySheets(raw.length > 1 ? raw.length - used.length : 0);
  };

  const handlePaste = (text: string) => {
    setPasted(text);
    setFileName("");
    load(text.trim() ? [{ grid: parseDelimited(text) }] : []);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const lower = file.name.toLowerCase();
    try {
      if (lower.endsWith(".xls")) {
        toast.error("Old .xls files can't be read — save it as .xlsx or CSV in Excel first");
        return;
      }
      const raw = lower.endsWith(".xlsx") ? await readXlsx(file) : [{ grid: parseDelimited(await file.text()) }];
      setPasted("");
      setFileName(file.name);
      load(raw);
    } catch (err) {
      console.error(err);
      toast.error(`Couldn't read ${file.name}`);
    }
  };

  const multi = sheets.length > 1;
  const current = sheets[active] as ImportSheet<K> | undefined;
  const grid = current?.grid ?? null;
  const layout = current?.layout ?? null;
  const width = useMemo(() => Math.max(0, ...(grid ?? []).map((r) => r.length)), [grid]);
  const titles = layout?.headerRow != null && grid ? grid[layout.headerRow] : null;
  const preview = useMemo(
    () => (grid && layout ? mapRows(grid, layout, fields, current?.name).slice(0, PREVIEW_ROWS) : []),
    [grid, layout, fields, current?.name],
  );
  const problems = useMemo(() => sheets.map((sh) => sheetProblems(sh.layout, fields)), [sheets, fields]);
  const chosen = sheets.filter((_, i) => selected[i]);
  const blocked = sheets.some((_, i) => selected[i] && problems[i].missing.length > 0);

  useEffect(() => {
    onChange(chosen.length > 0 && !blocked ? toMappedText(chosen, fields) : null);
    // `chosen`/`blocked` are derived from sheets + selected
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheets, selected, fields, onChange]);

  const setColumn = (key: K, value: string) => {
    if (!current) return;
    const layout2 = { ...current.layout, mapping: { ...current.layout.mapping, [key]: value === NONE ? null : Number(value) } };
    setSheets(sheets.map((sh, i) => (i === active ? { ...sh, layout: layout2 } : sh)));
  };
  const toggle = (i: number, on: boolean) => setSelected(selected.map((v, j) => (j === i ? on : v)));
  const rowsIn = (sh: ImportSheet<K>) => dataRowCount(sh.grid, sh.layout);

  const downloadTemplate = () => downloadCsv(templateCsv(fields, examples), `${id}-template.csv`);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col rounded-md border bg-muted/40 p-3 text-sm gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 font-medium"><Info className="size-4" />Columns</span>
          <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="size-4 mr-1.5" />Download template
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Any file name works. With a title row, columns are matched by their
          titles in any order. Without titles they are read in this order:
        </p>
        <ol className="text-xs text-muted-foreground ml-5 space-y-0.5 list-[upper-alpha]">
          {fields.map((f) => (
            <li key={f.key}>
              <strong>{f.label}</strong>
              {f.required && " — required"}
              {hints?.[f.key] && ` — ${hints[f.key]}`}
            </li>
          ))}
        </ol>
      </div>

      <Field>
        <FieldLabel htmlFor={`${id}-paste`}>Paste from a spreadsheet</FieldLabel>
        <Textarea
          id={`${id}-paste`}
          rows={5}
          value={pasted}
          placeholder={placeholder}
          onChange={(e) => handlePaste(e.target.value)}
          className="font-mono text-xs"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-file`}>Or upload a file</FieldLabel>
        {/* One entry point for the picker and a drop onto the zone. */}
        <button
          type="button"
          className={`w-full border-2 border-dashed rounded-lg p-5 text-center cursor-pointer hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring ${dragOver ? "border-primary bg-muted/50" : ""}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
        >
          <Upload className="size-6 mx-auto mb-1.5 text-muted-foreground" />
          <span className="block text-sm text-muted-foreground">
            {fileName || "Drop an Excel (.xlsx) or CSV file, or click to choose"}
          </span>
        </button>
        <input
          id={`${id}-file`}
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </Field>

      {multi && (
        <div className="flex flex-col gap-2 rounded-md border p-3" data-testid={`${id}-sheets`}>
          <div className="flex items-center gap-1.5 text-sm font-medium"><Layers className="size-4" />Sheets to import</div>
          <p className="text-xs text-muted-foreground">
            This workbook has {sheets.length} sheets with data
            {emptySheets > 0 && ` (${emptySheets} empty ${emptySheets === 1 ? "sheet" : "sheets"} left out)`}.
            Sheets whose titles match are ticked. Select a sheet to check its columns.
          </p>
          <ul className="flex flex-col gap-1">
            {sheets.map((sh, i) => (
              <li key={sh.name} className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm ${i === active ? "bg-muted" : ""}`}>
                <Checkbox
                  checked={!!selected[i]}
                  onCheckedChange={(v) => toggle(i, v === true)}
                  aria-label={`Import sheet ${sh.name}`}
                />
                <button type="button" className="flex-1 text-left hover:underline" onClick={() => setActive(i)}>
                  {sh.name}
                </button>
                <span className="text-xs text-muted-foreground">
                  {rowsIn(sh)} {rowsIn(sh) === 1 ? "row" : "rows"} · {sh.layout.headerRow != null ? "titles found" : "no titles"}
                </span>
                {selected[i] && problems[i].missing.length > 0 && (
                  <span className="flex items-center gap-1 text-xs text-warning"><AlertTriangle className="size-3.5" />needs columns</span>
                )}
              </li>
            ))}
          </ul>
          {chosen.length === 0 && (
            <div className="flex items-center gap-1.5 text-xs text-warning"><AlertTriangle className="size-3.5" />Tick at least one sheet</div>
          )}
        </div>
      )}

      {layout && grid && (
        <div className="flex flex-col gap-3 rounded-md border p-3" data-testid={`${id}-column-check`}>
          <div className="text-sm font-medium">Check the columns{multi && current?.name ? ` — ${current.name}` : ""}</div>
          <p className="text-xs text-muted-foreground">
            {layout.headerRow != null
              ? `Matched by the titles in row ${layout.headerRow + 1}.`
              : "No title row found — columns read in the order above."}
            {layout.dataStart > (layout.headerRow ?? -1) + 1 && ` Rows above row ${layout.dataStart + 1} are skipped.`}
            {" "}Change any column below if it&apos;s wrong.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2">
            {fields.map((f) => {
              const c = layout.mapping[f.key];
              return (
                <label key={f.key} className="flex flex-col gap-1 text-xs">
                  <span className="font-medium">{f.label}{f.required && " *"}</span>
                  <Select value={c == null ? NONE : String(c)} onValueChange={(v) => setColumn(f.key, v)}>
                    <SelectTrigger className="h-8 w-full text-xs" aria-label={`Column for ${f.label}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Not in file</SelectItem>
                      {Array.from({ length: width }, (_, i) => (
                        <SelectItem key={i} value={String(i)}>
                          Column {columnLetter(i)}{titles?.[i] ? ` · ${titles[i]}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              );
            })}
          </div>
          {[...problems[active].missing, ...problems[active].twice].map((m) => (
            <div key={m} className="flex items-center gap-1.5 text-xs text-warning">
              <AlertTriangle className="size-3.5" />{m}
            </div>
          ))}
          {preview.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Row</TableHead>
                    {fields.map((f) => <TableHead key={f.key} className="text-xs">{f.label}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((r) => (
                    <TableRow key={`${r.sourceSheet ?? ""}-${r.sourceRow}`}>
                      <TableCell className="text-xs text-muted-foreground">{r.sourceRow}</TableCell>
                      {fields.map((f) => <TableCell key={f.key} className="text-xs">{r.cells[f.key]}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
