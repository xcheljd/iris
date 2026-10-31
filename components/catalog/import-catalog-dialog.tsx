"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MonoCell } from "@/components/data-table/cells";
import { FileSpreadsheet, Upload, AlertCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import { analyzeCatalogImport, importCatalog, type CatalogImportAnalysis } from "@/lib/actions";
import { CATALOG_FIELDS } from "@/lib/catalog-import-parser";
import { ImportSource } from "@/components/import/import-source";
import { NewBrandsPanel } from "@/components/import/new-brands-panel";
import { DuplicatePicker, unpicked, SKIP, type DupGroup, type DupPicks, type DupShortcut } from "@/components/import/duplicate-picker";
import { formatMoney } from "@/lib/utils";
import { useBrands, BrandsProvider } from "@/components/brands-provider";
import { useBrandAssignment, BrandPicker, BrandRowCheckbox, BrandAssignBar, type BrandAssignRow } from "@/components/import/brand-assign";
import type { CatalogBrandAssignment } from "@/lib/actions/catalog-import";
import { toast } from "sonner";

interface ImportCatalogDialogProps {
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
}

export function ImportCatalogDialog({ open, onOpenChangeAction }: ImportCatalogDialogProps) {
  const router = useRouter();
  const [text, setText] = useState("");
  // Remounts the input panel on reset so its paste box and file are cleared.
  const [sourceKey, setSourceKey] = useState(0);
  const [analysis, setAnalysis] = useState<CatalogImportAnalysis | null>(null);
  const [busy, setBusy] = useState(false);

  const assignRows = useMemo<BrandAssignRow[]>(
    () => (analysis?.brandRows ?? []).map((r) => ({ key: r.model, needsBrand: true, suggestion: r.suggestion })),
    [analysis],
  );
  const assign = useBrandAssignment(assignRows);

  const brandList = useBrands();
  // New brands named in the file; ticked ones are added to the list on import.
  const [tickedBrands, setTickedBrands] = useState<string[]>([]);
  const previewBrands = useMemo(
    () => [...brandList, ...tickedBrands].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    [brandList, tickedBrands],
  );

  // Models on more than one row: the manager picks a copy for each.
  const [dupPicks, setDupPicks] = useState<DupPicks>({});
  const dup = useMemo(() => {
    const money = (n: number | null) => (n == null ? "" : formatMoney(n));
    const groups: DupGroup[] = (analysis?.duplicates ?? []).map((d) => ({
      key: d.model,
      label: d.model + (d.current ? ` (in catalog: ${[d.current.collection, d.current.brand, money(d.current.msrp)].filter(Boolean).join(" · ")})` : " (new)"),
      canSkip: true,
      copies: d.copies.map((c) => ({
        id: c.id,
        title: c.sourceSheet ? `${c.sourceSheet} sheet · row ${c.sourceRow}` : `Row ${c.sourceRow}`,
        fields: [
          { label: "Brand", value: c.brand ?? c.brandText },
          { label: "Collection", value: c.collection },
          { label: "MSRP", value: money(c.msrp) },
        ],
      })),
    }));
    const copiesOf = new Map((analysis?.duplicates ?? []).map((d) => [d.model, d.copies]));
    const score = (c: { brand: string | null; msrp: number | null }) => (c.brand ? 2 : 0) + (c.msrp != null ? 1 : 0);
    const shortcuts: DupShortcut[] = [
      { id: "complete", label: "Keep the most complete row", pick: (g) => {
        const cs = copiesOf.get(g.key) ?? [];
        const best = Math.max(...cs.map(score));
        const top = cs.filter((c) => score(c) === best);
        return top.length === 1 ? top[0].id : null;
      } },
      { id: "first", label: "Keep the first row", pick: (g) => g.copies[0]?.id ?? null },
      { id: "last", label: "Keep the last row", pick: (g) => g.copies.at(-1)?.id ?? null },
      { id: "skip", label: "Skip — import neither", pick: () => SKIP },
    ];
    return { groups, shortcuts, left: unpicked(groups, dupPicks).length };
  }, [analysis, dupPicks]);

  const reset = () => { setText(""); setAnalysis(null); setTickedBrands([]); setDupPicks({}); setSourceKey((k) => k + 1); assign.reset(); };
  const handleSource = useCallback((mapped: string | null) => { setText(mapped ?? ""); }, []);

  /** `ticks` = re-run after the new-brand ticks changed; omitted = a fresh analyze. */
  const handleAnalyze = async (ticks?: string[]) => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      let res = await analyzeCatalogImport(text, { extraBrands: ticks ?? [] });
      if ("error" in res) { toast.error(res.error); return; }
      let extra = ticks;
      if (!extra) {
        // First pass: tick every new brand that doesn't look like a typo, then
        // re-analyze so suggestions and brand rows count them as listed.
        extra = res.newBrands.filter((b) => !b.closeTo).map((b) => b.name);
        if (extra.length) {
          res = await analyzeCatalogImport(text, { extraBrands: extra });
          if ("error" in res) { toast.error(res.error); return; }
        }
        assign.reset();
        setDupPicks({});
      }
      setTickedBrands(extra);
      setAnalysis(res);
    } catch { toast.error("Failed to analyze the file"); }
    finally { setBusy(false); }
  };

  const handleImport = async () => {
    if (!analysis) return;
    setBusy(true);
    try {
      const picks: Record<string, CatalogBrandAssignment> = {};
      for (const r of analysis.brandRows) {
        const c = assign.choice(r.model);
        if (c.brand) picks[r.model] = { brand: c.brand, suggested: c.suggested };
      }
      const res = await importCatalog(text, picks, { addBrands: tickedBrands, duplicatePicks: dupPicks });
      if ("error" in res) { toast.error(res.error); return; }
      toast.success(`Catalog imported — ${res.created} new, ${res.updated} updated` +
        (res.brandsAdded > 0 ? ` · ${res.brandsAdded} ${res.brandsAdded === 1 ? "brand" : "brands"} added to your list` : ""));
      reset();
      onOpenChangeAction(false);
      router.refresh();
    } catch { toast.error("Catalog import failed"); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChangeAction(v); }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-5" />
            Import Catalog
          </DialogTitle>
          <DialogDescription>
            Paste rows from a spreadsheet or upload an Excel or CSV file. The import is
            authoritative — model collection, brand, and MSRP are overwritten.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
        {/* Kept mounted behind the preview so Back returns to the same input. */}
          <div className={analysis ? "hidden" : "flex flex-col gap-4"}>
            <ImportSource
              key={sourceKey}
              id="catalog"
              fields={CATALOG_FIELDS}
              hints={{ brand: "blank keeps the current brand", msrp: "optional" }}
              examples={[["Aldermoor", "DRIFTWOOD", "AD-8404", "1295.00"], ["Vellamy", "RIPTIDE", "VL-525", "895.00"]]}
              placeholder={"Aldermoor\tDRIFTWOOD\tAD-8404\t1295"}
              onChange={handleSource}
            />
            <Separator />
            <Button onClick={() => handleAnalyze()} disabled={!text.trim() || busy}>
              <Upload className="size-4 mr-2" />
              {busy ? "Analyzing…" : "Analyze"}
            </Button>
          </div>
        <BrandsProvider brands={previewBrands}>
        {analysis && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="size-5" />
              <span className="font-medium">
                {analysis.total} models parsed — {analysis.newCount} new,{" "}
                {analysis.updatedCount} updated, {analysis.unchangedCount} unchanged
              </span>
            </div>
            {analysis.prevCuratedCount > 0 &&
             analysis.prevCuratedMissingFromFile > analysis.prevCuratedCount * 0.3 && (
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm flex items-start gap-2">
                <AlertTriangle className="size-4 mt-0.5 shrink-0 text-warning" />
                <div className="flex flex-col gap-1">
                  <div className="font-medium text-warning">
                    This file is missing {analysis.prevCuratedMissingFromFile} of {analysis.prevCuratedCount} previously-imported models.
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Looks narrower than your last import. Check that the file lists
                    your whole catalog. You can still import
                    this file; the missing models stay in the catalog untouched.
                  </p>
                </div>
              </div>
            )}
            {analysis.parseErrors.length > 0 && (
              <div className="text-xs text-warning flex items-start gap-2">
                <AlertCircle className="size-4 mt-0.5 shrink-0" />
                <div>
                  {analysis.parseErrors.length} parse warning(s):
                  <ul className="list-disc ml-4">
                    {analysis.parseErrors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              </div>
            )}
            <NewBrandsPanel
              brands={analysis.newBrands}
              ticked={tickedBrands}
              listEmpty={brandList.length === 0}
              disabled={busy}
              onToggle={(name, on) => handleAnalyze(on ? [...tickedBrands, name] : tickedBrands.filter((n) => n !== name))}
            />
            <DuplicatePicker groups={dup.groups} picks={dupPicks} onChange={setDupPicks} shortcuts={dup.shortcuts} />
            {analysis.brandRows.length > 0 && (
              <div className="flex flex-col gap-2">
                <BrandAssignBar assign={assign} noun="models" showSave={false} />
                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8"><span className="sr-only">Select</span></TableHead>
                        <TableHead className="w-12">Row</TableHead>
                        <TableHead>Model</TableHead>
                        <TableHead>Collection</TableHead>
                        <TableHead>Brand</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analysis.brandRows.filter((r) => assign.visible(r.model)).map((r) => (
                        <TableRow key={r.model}>
                          <TableCell><BrandRowCheckbox rowKey={r.model} assign={assign} label={r.model} /></TableCell>
                          <TableCell className="text-muted-foreground whitespace-nowrap">{r.sourceSheet ? `${r.sourceSheet} · ${r.sourceRow}` : r.sourceRow}</TableCell>
                          <MonoCell value={r.model} />
                          <TableCell>{r.collection}</TableCell>
                          <TableCell><BrandPicker rowKey={r.model} assign={assign} suggestion={r.suggestion} label={r.model} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
            {analysis.collectionChanges.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">
                  Collection changes ({analysis.collectionChanges.length} shown):
                </p>
                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Model</TableHead>
                        <TableHead>Current</TableHead>
                        <TableHead>Import</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analysis.collectionChanges.slice(0, 25).map((c) => (
                        <TableRow key={c.model}>
                          <MonoCell value={c.model} />
                          <TableCell>{c.from}</TableCell>
                          <TableCell className="font-medium">{c.to}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setAnalysis(null)} disabled={busy}>Back</Button>
              <Button onClick={handleImport} disabled={busy || dup.left > 0}>
                {busy ? "Importing…" : dup.left > 0
                  ? `Pick ${dup.left} ${dup.left === 1 ? "duplicate" : "duplicates"} first`
                  : `Import ${analysis.total - (analysis.duplicates ?? []).filter((d) => dupPicks[d.model] === SKIP).length} models`}
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
