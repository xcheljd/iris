"use client";

import { useState, useRef, useMemo, useCallback } from "react";
import { ImportSource } from "@/components/import/import-source";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DatePicker } from "@/components/date-picker";
import { FileSpreadsheet, Upload, AlertCircle, CheckCircle2, CalendarDays, AlertTriangle } from "lucide-react";
import { importPromos, resolvePromoRows, type PromoImportRow, type ResolvedPromoRow, type ExistingPromo } from "@/lib/actions/promos";
import { DuplicatePicker, unpicked, SKIP, type DupGroup, type DupPicks, type DupShortcut } from "@/components/import/duplicate-picker";
import { rowKeyOf } from "@/lib/import-grid";
import { toast } from "sonner";
import { format } from "date-fns";
import { parsePromoRows, PROMO_FIELDS, type PromoParseResult, type ParsedPromoRow } from "@/lib/promo-import-parser";
import { useBrands, BrandsProvider } from "@/components/brands-provider";
import { NewBrandsPanel } from "@/components/import/new-brands-panel";
import { findNewBrands, type NewBrand } from "@/lib/new-brands";
import { useBrandAssignment, BrandPicker, BrandRowCheckbox, BrandAssignBar, type BrandAssignRow } from "@/components/import/brand-assign";
import { formatMoney } from "@/lib/utils";
import { MoneyCell, PercentCell } from "@/components/data-table/cells";
import { EmptyState } from "@/components/empty-state";

interface ImportPromoDialogProps {
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
}

export function ImportPromoDialog({ open, onOpenChangeAction }: ImportPromoDialogProps) {
  const brandList = useBrands();
  const router = useRouter();
  // Remounts the input panel on reset so its paste box and file are cleared.
  const [sourceKey, setSourceKey] = useState(0);
  const [parsed, setParsed] = useState<PromoParseResult | null>(null);
  // Brands the file names that aren't listed yet; ticked ones are added on import.
  const [newBrands, setNewBrands] = useState<NewBrand[]>([]);
  const [tickedBrands, setTickedBrands] = useState<string[]>([]);
  const previewBrands = useMemo(
    () => [...brandList, ...tickedBrands].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    [brandList, tickedBrands],
  );
  const [text, setText] = useState("");
  const [resolved, setResolved] = useState<ResolvedPromoRow[] | null>(null);
  // Promos already in Iris for the file's models, and the manager's duplicate picks.
  const [existing, setExisting] = useState<Record<string, ExistingPromo[]>>({});
  const [dupPicks, setDupPicks] = useState<DupPicks>({});
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [promoStart, setPromoStart] = useState<Date | undefined>(undefined);
  const [promoEnd, setPromoEnd] = useState<Date | undefined>(undefined);
  // Brand picking for rows the catalog has no brand for (keyed by model).
  const assignRows = useMemo<BrandAssignRow[]>(() => {
    const byModel = new Map<string, BrandAssignRow>();
    for (const r of resolved ?? []) {
      if (!byModel.has(r.modelNumber)) byModel.set(r.modelNumber, { key: r.modelNumber, needsBrand: !r.catalogBrand, suggestion: r.suggestion });
    }
    return [...byModel.values()];
  }, [resolved]);
  const assign = useBrandAssignment(assignRows);

  // Bumped on every analyze and on reset, so a resolve still running when the
  // dialog closes can't land its result in the next session.
  const requestIdRef = useRef(0);

  const handleSource = useCallback((mapped: string | null) => { setText(mapped ?? ""); }, []);

  // Parsed row (source row number + cell warnings) by its place in the file.
  const parsedByKey = useMemo(
    () => new Map<string, ParsedPromoRow>((parsed?.rows ?? []).map((r) => [rowKeyOf(r), r])),
    [parsed],
  );
  // A row with no collection from the sheet or the catalog can't be stored.
  const skipped = (r: ResolvedPromoRow) => !(r.catalogCollection ?? r.fileCollection);
  const rowWarnings = useCallback(
    (r: ResolvedPromoRow) => [
      ...(skipped(r) ? ["no collection in your sheet or the catalog — this row will be skipped"] : []),
      ...(parsedByKey.get(r.rowKey)?.warnings ?? []),
      ...r.priceIssues,
    ],
    [parsedByKey],
  );

  // ---- Duplicates: a model on more than one row, or a row for a model that
  // already has a promo for the dates being picked. Every one needs a pick.
  const startStr = promoStart ? format(promoStart, "yyyy-MM-dd") : null;
  const endStr = promoEnd ? format(promoEnd, "yyyy-MM-dd") : null;
  const dup = useMemo(() => {
    const rows = (resolved ?? []).filter((r) => !skipped(r));
    const byModel = new Map<string, ResolvedPromoRow[]>();
    for (const r of rows) byModel.set(r.modelNumber, [...(byModel.get(r.modelNumber) ?? []), r]);
    const groups: DupGroup[] = [];
    const pct = new Map<string, number | null>();
    const existingOf = new Map<string, ExistingPromo[]>();
    const money = (n: number | null) => (n == null ? "" : formatMoney(n));
    const pctText = (n: number | null) => (n == null ? "" : `${n}%`);
    for (const [model, copies] of byModel) {
      const same = (existing[model] ?? []).filter((p) => (p.promoStart ?? null) === startStr && (p.promoEnd ?? null) === endStr);
      if (copies.length < 2 && same.length === 0) continue;
      existingOf.set(model, same);
      const brandOf = (r: ResolvedPromoRow) => r.catalogBrand ?? assign.choice(r.modelNumber).brand ?? "";
      groups.push({
        key: model,
        label: model,
        canSkip: same.length === 0,
        copies: [
          ...same.map((p) => {
            pct.set(`existing:${p.id}`, p.discountPercent);
            return {
              id: `existing:${p.id}`,
              title: "In Iris now",
              fields: [
                { label: "Brand", value: p.brand ?? "" }, { label: "Collection", value: p.collection },
                { label: "MSRP", value: money(p.msrp) }, { label: "Sale", value: money(p.discountPrice) }, { label: "Off", value: pctText(p.discountPercent) },
              ],
            };
          }),
          ...copies.map((r) => {
            const src = parsedByKey.get(r.rowKey);
            pct.set(r.rowKey, r.discountPercent);
            return {
              id: r.rowKey,
              title: src?.sourceSheet ? `${src.sourceSheet} sheet · row ${src.sourceRow}` : `Row ${src?.sourceRow ?? "?"}`,
              fields: [
                { label: "Brand", value: brandOf(r) }, { label: "Collection", value: r.catalogCollection ?? r.fileCollection },
                { label: "MSRP", value: money(r.fileMsrp ?? r.catalogMsrp) }, { label: "Sale", value: money(r.discountPrice) }, { label: "Off", value: pctText(r.discountPercent) },
              ],
            };
          }),
        ],
      });
    }
    // Picks a copy by discount; null when two copies tie on it (someone has to check).
    const byDiscount = (dir: 1 | -1) => (g: DupGroup) => {
      const scored = g.copies.map((c) => ({ id: c.id, v: pct.get(c.id) ?? null })).filter((c) => c.v != null) as { id: string; v: number }[];
      if (scored.length < 2) return null;
      const best = Math.max(...scored.map((c) => c.v * dir));
      const top = scored.filter((c) => c.v * dir === best);
      return top.length === 1 ? top[0].id : null;
    };
    const shortcuts: DupShortcut[] = [
      { id: "bigger", label: "Keep the bigger discount", pick: byDiscount(1) },
      { id: "smaller", label: "Keep the smaller discount", pick: byDiscount(-1) },
      { id: "existing", label: "Keep what's in Iris", pick: (g) => g.copies.find((c) => c.id.startsWith("existing:"))?.id ?? null },
      { id: "new", label: "Use the new row (replace)", pick: (g) => {
        const fileCopies = g.copies.filter((c) => !c.id.startsWith("existing:"));
        return g.copies.length > fileCopies.length && fileCopies.length === 1 ? fileCopies[0].id : null;
      } },
      { id: "skip", label: "Skip — import neither", pick: (g) => (g.canSkip ? SKIP : null) },
    ];
    // Which rows import, and which existing promos they replace.
    const inGroup = new Map(groups.map((g) => [g.key, g]));
    const included = rows.filter((r) => !inGroup.has(r.modelNumber) || dupPicks[r.modelNumber] === r.rowKey);
    const replaceIds = groups.flatMap((g) => {
      const pick = dupPicks[g.key];
      return pick && !pick.startsWith("existing:") && pick !== SKIP ? (existingOf.get(g.key) ?? []).map((p) => p.id) : [];
    });
    return { groups, shortcuts, included, replaceIds, left: unpicked(groups, dupPicks).length };
  }, [resolved, existing, startStr, endStr, dupPicks, parsedByKey, assign]);

  /** Why a row won't import because of a duplicate pick (null when it imports). */
  const dupNote = (r: ResolvedPromoRow): string | null => {
    const g = dup.groups.find((x) => x.key === r.modelNumber);
    if (!g) return null;
    const pick = dupPicks[r.modelNumber];
    if (!pick || unpicked([g], dupPicks).length) return "duplicate — pick a copy in Duplicates above";
    if (pick === r.rowKey) return null;
    if (pick === SKIP) return "skipped — duplicate";
    if (pick.startsWith("existing:")) return "not imported — keeping the promo already in Iris";
    return "not imported — another copy was picked";
  };

  /** `ticks` = re-run after the new-brand ticks changed; omitted = a fresh analyze. */
  const handleAnalyze = async (ticks?: string[]) => {
    if (!text.trim()) return;
    const requestId = ++requestIdRef.current;
    const isStale = () => requestId !== requestIdRef.current;
    setIsParsing(true);
    try {
      const base = parsePromoRows(text, brandList);
      const found = findNewBrands(base.rows.map((r) => r.brandText), brandList);
      const extra = ticks ?? found.filter((b) => !b.closeTo).map((b) => b.name);
      setNewBrands(found);
      setTickedBrands(extra);
      const parseResult = extra.length ? parsePromoRows(text, [...brandList, ...extra]) : base;
      setParsed(parseResult);
      if (parseResult.rows.length === 0) {
        toast.error(parseResult.parseErrors[0] ?? "No promo rows found");
        return;
      }
      if (!ticks) { assign.reset(); setDupPicks({}); }
      const resolveResult = await resolvePromoRows(parseResult.rows, { extraBrands: extra });
      if (isStale()) return;
      if ("error" in resolveResult) {
        toast.error(resolveResult.error);
        return;
      }
      setResolved(resolveResult.resolved);
      setExisting(resolveResult.existing ?? {});
    } catch (err) {
      if (isStale()) return;
      console.error(err);
      toast.error("Failed to read the promo rows");
      setParsed(null);
      setResolved(null);
    } finally {
      if (!isStale()) setIsParsing(false);
    }
  };

  const counts = useMemo(() => {
    if (!resolved) return { total: 0, ready: 0, uncatalogued: 0, conflicts: 0, msrpLow: 0 };
    let ready = 0, uncatalogued = 0, conflicts = 0, msrpLow = 0;
    const imports = new Set(dup.included.map((r) => r.rowKey));
    for (const r of resolved) {
      if (skipped(r)) { conflicts++; continue; }
      if (!imports.has(r.rowKey)) continue;
      const effectiveBrand = r.catalogBrand ?? assign.choice(r.modelNumber).brand;
      if (!effectiveBrand) uncatalogued++;
      else if (r.collectionMismatch || r.msrpLow || r.sheetBrandMismatch || rowWarnings(r).length > 0) conflicts++;
      else ready++;
      if (r.msrpLow) msrpLow++;
    }
    return { total: imports.size, ready, uncatalogued, conflicts, msrpLow };
  }, [resolved, assign, rowWarnings, dup]);

  const handleImport = async () => {
    if (!resolved || resolved.length === 0 || dup.left > 0) return;
    setIsImporting(true);
    try {
      const rows: PromoImportRow[] = dup.included.map((r) => ({
        modelNumber: r.modelNumber,
        collection: r.fileCollection,
        brand: r.catalogBrand ? null : assign.choice(r.modelNumber).brand,
        brandSuggested: !r.catalogBrand && assign.choice(r.modelNumber).suggested,
        msrp: r.fileMsrp,
        discountPercent: r.discountPercent,
        discountPrice: r.discountPrice,
      }));
      const result = await importPromos(rows, startStr, endStr, { saveBrandsToCatalog: assign.saveToCatalog, addBrands: tickedBrands, replacePromoIds: dup.replaceIds });
      if ("error" in result) { toast.error(result.error); return; }
      if (result.imported === 0) {
        toast.error("No promos imported");
        return;
      }
      const nullBrandCount = counts.uncatalogued;
      toast.success(
        `Imported ${result.imported} promo${result.imported !== 1 ? "s" : ""} · ` +
        `${result.matchedClients} client${result.matchedClients !== 1 ? "s" : ""} matched` +
        (nullBrandCount > 0 ? ` · ${nullBrandCount} with no brand (flagged for review)` : "") +
        (result.replaced > 0 ? ` · ${result.replaced} existing ${result.replaced === 1 ? "promo" : "promos"} replaced` : "") +
        (result.brandsAdded > 0 ? ` · ${result.brandsAdded} ${result.brandsAdded === 1 ? "brand" : "brands"} added to your list` : "") +
        (result.brandsSaved > 0 ? ` · ${result.brandsSaved} ${result.brandsSaved === 1 ? "brand" : "brands"} saved to the catalog` : ""),
      );
      handleReset();
      onOpenChangeAction(false);
      router.refresh();
    } catch { toast.error("Failed to import promos"); }
    finally { setIsImporting(false); }
  };

  const handleReset = () => {
    requestIdRef.current++;
    setIsParsing(false);
    setParsed(null); setResolved(null); setText(""); setSourceKey((k) => k + 1);
    setPromoStart(undefined); setPromoEnd(undefined);
    setNewBrands([]); setTickedBrands([]);
    setExisting({}); setDupPicks({});
    assign.reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleReset(); onOpenChangeAction(v); }}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-5" />
            Import Promo List
          </DialogTitle>
          <DialogDescription>
            Paste rows from a spreadsheet or upload an Excel or CSV file. Brand and collection come from the catalog when the model is known.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">

        {/* Kept mounted behind the preview so Back returns to the same input. */}
          <div className={parsed ? "hidden" : "flex flex-col gap-4"}>
            <ImportSource
              key={sourceKey}
              id="promo"
              fields={PROMO_FIELDS}
              hints={{
                brand: "blank uses the catalog",
                collection: "blank uses the catalog",
                msrp: "blank uses the catalog",
                sale: "or leave blank and give a discount %",
                percent: "optional; 50, 50% and .5 all mean 50%",
              }}
              examples={[["Aldermoor", "DRIFTWOOD", "AD-8404", "500.00", "250.00", ""], ["Vellamy", "RIPTIDE", "VL-525", "895.00", "", "25%"]]}
              placeholder={"Aldermoor\tDRIFTWOOD\tAD-8404\t500\t250"}
              onChange={handleSource}
            />
            <Separator />
            <Button onClick={() => handleAnalyze()} disabled={!text.trim() || isParsing}>
              <Upload className="size-4 mr-2" />
              {isParsing ? "Analyzing…" : "Analyze"}
            </Button>
          </div>
        <BrandsProvider brands={previewBrands}>
        {!parsed ? null : !resolved || resolved.length === 0 ? (
          <EmptyState
            icon={AlertCircle}
            title="No promo rows detected"
            description={parsed.parseErrors[0] ?? "Columns must be Brand, Collection, Model, MSRP, Sale price, Discount %."}
            action={{ label: "Back", onClick: () => { setParsed(null); setResolved(null); } }}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="flex items-center gap-1.5 text-success">
                <CheckCircle2 className="size-4" />
                {counts.ready} ready
              </span>
              {counts.uncatalogued > 0 && (
                <span className="flex items-center gap-1.5 text-warning">
                  <AlertCircle className="size-4" />
                  {counts.uncatalogued} need a brand
                </span>
              )}
              {counts.conflicts > 0 && (
                <span className="flex items-center gap-1.5 text-warning">
                  <AlertTriangle className="size-4" />
                  {counts.conflicts} flagged
                </span>
              )}

            </div>

            {parsed.parseErrors.length > 0 && (
              <div className="flex items-start gap-2 text-xs text-warning">
                <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
                <ul className="list-disc ml-4">
                  {parsed.parseErrors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
              <Field className="flex-1">
                <FieldLabel>Promo Start</FieldLabel>
                <DatePicker date={promoStart} onSelectAction={setPromoStart} disabledDays={promoEnd && { after: promoEnd }} className="w-full" />
              </Field>
              <div className="flex items-center pb-2 text-muted-foreground">—</div>
              <Field className="flex-1">
                <FieldLabel>Promo End</FieldLabel>
                <DatePicker date={promoEnd} onSelectAction={setPromoEnd} disabledDays={promoStart && { before: promoStart }} className="w-full" />
              </Field>
              {(promoStart || promoEnd) && (
                <Button variant="ghost" size="sm" className="mb-0.5" onClick={() => { setPromoStart(undefined); setPromoEnd(undefined); }}>
                  Clear
                </Button>
              )}
            </div>

            <NewBrandsPanel
              brands={newBrands}
              ticked={tickedBrands}
              listEmpty={brandList.length === 0}
              disabled={isParsing}
              onToggle={(name, on) => handleAnalyze(on ? [...tickedBrands, name] : tickedBrands.filter((n) => n !== name))}
            />

            <DuplicatePicker groups={dup.groups} picks={dupPicks} onChange={setDupPicks} shortcuts={dup.shortcuts} />

            <BrandAssignBar assign={assign} noun="promos" />

            <Separator />

            {(promoStart || promoEnd) && (
              <div className="flex items-center gap-2 text-sm">
                <CalendarDays className="size-4 text-muted-foreground" />
                <span>Promo period: {promoStart ? format(promoStart, "MMM d") : "?"} — {promoEnd ? format(promoEnd, "MMM d, yyyy") : "?"}</span>
              </div>
            )}

            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {assign.needing.length > 0 && <TableHead className="w-8"><span className="sr-only">Select</span></TableHead>}
                    <TableHead className="w-12">Row</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Collection</TableHead>
                    <TableHead className="text-right">MSRP</TableHead>
                    <TableHead className="text-right">Discount %</TableHead>
                    <TableHead className="text-right">Sale</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resolved.filter((r) => assign.visible(r.modelNumber)).map((r, i) => {
                    const effectiveCollection = r.catalogCollection ?? r.fileCollection;
                    const warnings = rowWarnings(r);
                    const note = dupNote(r);
                    return (
                      <TableRow key={r.rowKey} className={note && !note.startsWith("duplicate —") ? "opacity-50" : undefined}>
                        {assign.needing.length > 0 && (
                          <TableCell>
                            {!r.catalogBrand && <BrandRowCheckbox rowKey={r.modelNumber} assign={assign} label={r.modelNumber} />}
                          </TableCell>
                        )}
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {(() => {
                            const src = parsedByKey.get(r.rowKey);
                            if (!src) return i + 1;
                            return src.sourceSheet ? `${src.sourceSheet} · ${src.sourceRow}` : src.sourceRow;
                          })()}
                        </TableCell>
                        <TableCell className="font-medium">
                          <div>{r.modelNumber}</div>
                          {note && (
                            <div className="flex items-start gap-1 text-xs font-normal text-warning">
                              <AlertTriangle className="size-3 mt-0.5 shrink-0" />{note}
                            </div>
                          )}
                          {warnings.map((w) => (
                            <div key={w} className="flex items-start gap-1 text-xs font-normal text-warning">
                              <AlertTriangle className="size-3 mt-0.5 shrink-0" />{w}
                            </div>
                          ))}
                        </TableCell>
                        <TableCell>
                          {r.catalogBrand ? (
                            <>
                              <div>{r.catalogBrand}</div>
                              {r.sheetBrandMismatch && (
                                <div className="text-xs text-warning">your sheet says {r.sheetBrandMismatch} — catalog brand used</div>
                              )}
                            </>
                          ) : (
                            <BrandPicker rowKey={r.modelNumber} assign={assign} suggestion={r.suggestion} label={r.modelNumber} />
                          )}
                        </TableCell>
                        <TableCell>
                          <div>{effectiveCollection}</div>
                          {r.collectionMismatch && (
                            <div className="text-xs tracking-wide text-warning">File said: {r.fileCollection}</div>
                          )}
                        </TableCell>
                        <MoneyCell
                          value={r.fileMsrp ?? r.catalogMsrp}
                          note={
                            r.msrpLow ? (
                              <div className="text-xs tracking-wide text-warning">below catalog {formatMoney(r.catalogMsrp)}</div>
                            ) : null
                          }
                        />
                        <PercentCell value={r.discountPercent} />
                        <MoneyCell value={r.discountPrice} />
                      </TableRow>
                    );
                  })}
                  {resolved.every((r) => !assign.visible(r.modelNumber)) && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground text-sm">
                        No rows match this filter
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setParsed(null); setResolved(null); }}>Back</Button>
              <Button onClick={handleImport} disabled={isImporting || counts.total === 0 || dup.left > 0}>
                {isImporting
                  ? "Importing..."
                  : dup.left > 0
                    ? `Pick ${dup.left} ${dup.left === 1 ? "duplicate" : "duplicates"} first`
                    : `Import ${counts.total} ${counts.total === 1 ? "promo" : "promos"}`}
              </Button>
            </DialogFooter>
          </div>
        )}
        </BrandsProvider>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
