"use client";

import { useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DatePicker } from "@/components/date-picker";
import { FileSpreadsheet, Upload, AlertCircle, CheckCircle2, CalendarDays, FileText, AlertTriangle } from "lucide-react";
import { importPromos, resolvePromoRows, type PromoImportRow, type ResolvedPromoRow } from "@/lib/actions/promos";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { parsePromoPdf, type ParsedPromoPdf } from "@/lib/promo-pdf-parser";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BRAND_VALUES, type Brand } from "@/lib/db/schema";
import { formatMoney } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";

interface ImportPromoDialogProps {
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
}

export function ImportPromoDialog({ open, onOpenChangeAction }: ImportPromoDialogProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [parsed, setParsed] = useState<ParsedPromoPdf | null>(null);
  const [resolved, setResolved] = useState<ResolvedPromoRow[] | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [promoStart, setPromoStart] = useState<Date | undefined>(undefined);
  const [promoEnd, setPromoEnd] = useState<Date | undefined>(undefined);
  // Manager-assigned brand overrides for uncatalogued rows, keyed by model.
  const [brandOverrides, setBrandOverrides] = useState<Record<string, Brand>>({});
  // Filename brand hint, used as the default in the bulk-assign helper.
  const [filenameBrand, setFilenameBrand] = useState<Brand | "">("");
  const [bulkBrand, setBulkBrand] = useState<Brand | "">("");

  const handleFile = async (file: File) => {
    setIsParsing(true);
    setFileName(file.name);
    try {
      const parseResult = await parsePromoPdf(file);
      setParsed(parseResult);
      setFilenameBrand(parseResult.brand ?? "");
      setBulkBrand(parseResult.brand ?? "");
      if (parseResult.promoStart) setPromoStart(parseISO(parseResult.promoStart));
      if (parseResult.promoEnd) setPromoEnd(parseISO(parseResult.promoEnd));
      if (parseResult.rows.length === 0) {
        toast.error("No promo rows found in the PDF");
        return;
      }
      const resolveResult = await resolvePromoRows(parseResult.rows);
      if ("error" in resolveResult) {
        toast.error(resolveResult.error);
        return;
      }
      setResolved(resolveResult.resolved);
    } catch (err) {
      console.error(err);
      toast.error("Failed to parse PDF");
      setParsed(null);
      setResolved(null);
    } finally {
      setIsParsing(false);
    }
  };

  const counts = useMemo(() => {
    if (!resolved) return { total: 0, ready: 0, uncatalogued: 0, conflicts: 0, msrpLow: 0 };
    let ready = 0, uncatalogued = 0, conflicts = 0, msrpLow = 0;
    for (const r of resolved) {
      const effectiveBrand = r.catalogBrand ?? brandOverrides[r.modelNumber] ?? null;
      if (r.isUncatalogued && !effectiveBrand) uncatalogued++;
      else if (r.collectionMismatch || r.msrpLow) conflicts++;
      else ready++;
      if (r.msrpLow) msrpLow++;
    }
    return { total: resolved.length, ready, uncatalogued, conflicts, msrpLow };
  }, [resolved, brandOverrides]);

  const applyBulkBrand = () => {
    if (!resolved || !bulkBrand) return;
    const next = { ...brandOverrides };
    let count = 0;
    for (const r of resolved) {
      if (r.isUncatalogued && !next[r.modelNumber]) {
        next[r.modelNumber] = bulkBrand;
        count++;
      }
    }
    setBrandOverrides(next);
    toast.success(`Assigned ${bulkBrand} to ${count} uncatalogued ${count === 1 ? "row" : "rows"}`);
  };

  const handleImport = async () => {
    if (!resolved || resolved.length === 0) return;
    setIsImporting(true);
    try {
      const startStr = promoStart ? format(promoStart, "yyyy-MM-dd") : null;
      const endStr = promoEnd ? format(promoEnd, "yyyy-MM-dd") : null;
      const rows: PromoImportRow[] = resolved.map((r) => ({
        modelNumber: r.modelNumber,
        collection: r.pdfCollection,
        brand: brandOverrides[r.modelNumber] ?? null,
        msrp: r.pdfMsrp,
        discountPercent: r.discountPercent,
        discountPrice: r.discountPrice,
      }));
      const result = await importPromos(rows, startStr, endStr);
      if ("error" in result) { toast.error(result.error); return; }
      if (result.imported === 0) {
        toast.error("No promos imported");
        return;
      }
      const nullBrandCount = counts.uncatalogued;
      toast.success(
        `Imported ${result.imported} promo${result.imported !== 1 ? "s" : ""} · ` +
        `${result.matchedClients} client${result.matchedClients !== 1 ? "s" : ""} matched` +
        (nullBrandCount > 0 ? ` · ${nullBrandCount} with no brand (flagged for review)` : ""),
      );
      handleReset();
      onOpenChangeAction(false);
      router.refresh();
    } catch { toast.error("Failed to import promos"); }
    finally { setIsImporting(false); }
  };

  const handleReset = () => {
    setParsed(null); setResolved(null); setFileName("");
    setPromoStart(undefined); setPromoEnd(undefined);
    setBrandOverrides({}); setFilenameBrand(""); setBulkBrand("");
    if (fileInputRef.current) fileInputRef.current.value = "";
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
            Brand and collection come from the catalog. Per-page discounts are read from the PDF.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">

        {!parsed ? (
          <div className="flex flex-col gap-4">
            <Field>
              <FieldLabel>Promo PDF</FieldLabel>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
                <Button onClick={() => fileInputRef.current?.click()} disabled={isParsing}>
                  <Upload className="size-4 mr-2" />
                  {isParsing ? "Parsing PDF…" : "Choose PDF"}
                </Button>
                {fileName && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <FileText className="size-3.5" /> {fileName}
                  </span>
                )}
              </div>
              <FieldDescription>
                Each page&apos;s &quot;X% OFF&quot; header sets the discount for rows on that page.
              </FieldDescription>
            </Field>
          </div>
        ) : !resolved || resolved.length === 0 ? (
          <EmptyState
            icon={AlertCircle}
            title="No promo rows detected"
            description={"Make sure the PDF has columns for MODEL, COLLECTION, MSRP, and an “X% OFF” sale column."}
            action={{ label: "Try Another File", onClick: handleReset }}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="flex items-center gap-1.5 text-green-600">
                <CheckCircle2 className="size-4" />
                {counts.ready} ready
              </span>
              {counts.uncatalogued > 0 && (
                <span className="flex items-center gap-1.5 text-yellow-600">
                  <AlertCircle className="size-4" />
                  {counts.uncatalogued} uncatalogued
                </span>
              )}
              {counts.conflicts > 0 && (
                <span className="flex items-center gap-1.5 text-amber-600">
                  <AlertTriangle className="size-4" />
                  {counts.conflicts} flagged
                </span>
              )}
              <span className="text-muted-foreground">· {parsed.pageCount} page{parsed.pageCount !== 1 ? "s" : ""}</span>
            </div>

            {parsed.pagesWithoutDiscount.length > 0 && (
              <div className="flex items-start gap-2 text-xs text-yellow-600">
                <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
                <span>
                  No &quot;% OFF&quot; header on page{parsed.pagesWithoutDiscount.length !== 1 ? "s" : ""}{" "}
                  {parsed.pagesWithoutDiscount.join(", ")} — those rows import with no discount %.
                </span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
              <Field className="flex-1">
                <FieldLabel>Promo Start</FieldLabel>
                <DatePicker date={promoStart} onSelectAction={setPromoStart} className="w-full" />
              </Field>
              <div className="flex items-center pb-2 text-muted-foreground">—</div>
              <Field className="flex-1">
                <FieldLabel>Promo End</FieldLabel>
                <DatePicker date={promoEnd} onSelectAction={setPromoEnd} className="w-full" />
              </Field>
              {(promoStart || promoEnd) && (
                <Button variant="ghost" size="sm" className="mb-0.5" onClick={() => { setPromoStart(undefined); setPromoEnd(undefined); }}>
                  Clear
                </Button>
              )}
            </div>

            {counts.uncatalogued > 0 && (
              <div className="flex flex-col border rounded-md p-3 bg-yellow-50/50 dark:bg-yellow-950/20 gap-2">
                <div className="text-sm font-medium">Assign brand to uncatalogued rows</div>
                <p className="text-xs text-muted-foreground">
                  {counts.uncatalogued} model{counts.uncatalogued !== 1 ? "s aren't" : " isn't"} in the catalog yet
                  {filenameBrand && ` — defaulting to "${filenameBrand}" from the filename`}. Pick a brand and apply,
                  or import as-is to leave them as brand-null for later review.
                </p>
                <div className="flex items-center gap-2">
                  <Select value={bulkBrand || undefined} onValueChange={(v) => setBulkBrand(v as Brand)}>
                    <SelectTrigger className="sm:w-64"><SelectValue placeholder="Select brand" /></SelectTrigger>
                    <SelectContent>
                      {BRAND_VALUES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={applyBulkBrand} disabled={!bulkBrand}>
                    Apply to {counts.uncatalogued} {counts.uncatalogued === 1 ? "row" : "rows"}
                  </Button>
                  {Object.keys(brandOverrides).length > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => setBrandOverrides({})}>
                      Clear overrides
                    </Button>
                  )}
                </div>
              </div>
            )}

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
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Collection</TableHead>
                    <TableHead className="text-right">MSRP</TableHead>
                    <TableHead className="text-right">Discount %</TableHead>
                    <TableHead className="text-right">Sale</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resolved.slice(0, 50).map((r, i) => {
                    const effectiveBrand = r.catalogBrand ?? brandOverrides[r.modelNumber] ?? null;
                    const brandStatus =
                      r.catalogBrand ? "catalog" :
                      brandOverrides[r.modelNumber] ? "override" : "missing";
                    const effectiveCollection = r.catalogCollection ?? r.pdfCollection;
                    return (
                      <TableRow key={`${r.modelNumber}-${i}`}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">{r.modelNumber}</TableCell>
                        <TableCell>
                          <span className={
                            brandStatus === "catalog" ? "" :
                            brandStatus === "override" ? "text-amber-600" :
                            "text-yellow-600 italic"
                          }>
                            {effectiveBrand ?? "needs brand"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div>{effectiveCollection}</div>
                          {r.collectionMismatch && (
                            <div className="text-[10px] text-amber-600">PDF said: {r.pdfCollection}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(r.pdfMsrp ?? r.catalogMsrp)}
                          {r.msrpLow && (
                            <div className="text-[10px] text-amber-600">below catalog {formatMoney(r.catalogMsrp)}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.discountPercent != null ? `${r.discountPercent}%` : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(r.discountPrice)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {resolved.length > 50 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground text-sm">
                        ...and {resolved.length - 50} more rows
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleReset}>Back</Button>
              <Button onClick={handleImport} disabled={isImporting || resolved.length === 0}>
                {isImporting
                  ? "Importing..."
                  : `Import ${resolved.length} ${resolved.length === 1 ? "promo" : "promos"}`}
              </Button>
            </DialogFooter>
          </div>
        )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
