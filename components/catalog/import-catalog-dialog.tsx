"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileSpreadsheet, Upload, AlertCircle, CheckCircle2, Info, AlertTriangle } from "lucide-react";
import { analyzeCatalogRvx, importCatalogRvx, type CatalogImportAnalysis } from "@/lib/actions";
import { toast } from "sonner";

interface ImportCatalogDialogProps {
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
}

export function ImportCatalogDialog({ open, onOpenChangeAction }: ImportCatalogDialogProps) {
  const router = useRouter();
  const [xml, setXml] = useState("");
  const [fileName, setFileName] = useState("");
  const [analysis, setAnalysis] = useState<CatalogImportAnalysis | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => { setXml(""); setFileName(""); setAnalysis(null); };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setXml(text);
    setFileName(file.name);
    setAnalysis(null);
  };

  const handleAnalyze = async () => {
    if (!xml.trim()) return;
    setBusy(true);
    try {
      const res = await analyzeCatalogRvx(xml);
      if ("error" in res) { toast.error(res.error); return; }
      setAnalysis(res);
    } catch { toast.error("Failed to analyze the file"); }
    finally { setBusy(false); }
  };

  const handleImport = async () => {
    if (!analysis) return;
    setBusy(true);
    try {
      const res = await importCatalogRvx(xml);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success(`Catalog imported — ${res.created} new, ${res.updated} updated`);
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
            <FileSpreadsheet className="h-5 w-5" />
            Import Catalog (RVX Selling Analysis)
          </DialogTitle>
          <DialogDescription>
            Upload the RVX &quot;Selling Analysis By Style&quot; export. RVX is
            authoritative — model collection, brand, and MSRP are overwritten.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
        {!analysis ? (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1.5">
              <div className="flex items-center gap-1.5 font-medium">
                <Info className="h-4 w-4" />
                Before exporting from RVX
              </div>
              <p className="text-xs text-muted-foreground">
                In the <em>Selling Analysis By Style</em> report, set these
                filters so every available SKU is included:
              </p>
              <ul className="text-xs text-muted-foreground list-disc ml-5 space-y-0.5">
                <li><strong>Client: All</strong> — required; otherwise the export is scoped to one client/division</li>
                <li><strong>Suppress Zeros: No</strong> — includes zero-activity carryover</li>
                <li><strong>Stores: All</strong> — if RVX prompts for a store</li>
                <li><strong>Date range: widest available</strong> — catches long-tail / clearance styles</li>
              </ul>
            </div>
            <div className="space-y-2">
              <Label>RVX export file (.xls / .xml)</Label>
              <input
                type="file"
                accept=".xls,.xml,application/xml,text/xml"
                onChange={(e) => handleFile(e.target.files?.[0])}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm"
              />
              {fileName && (
                <p className="text-xs text-muted-foreground">Loaded: {fileName}</p>
              )}
            </div>
            <Separator />
            <Button onClick={handleAnalyze} disabled={!xml.trim() || busy}>
              <Upload className="h-4 w-4 mr-2" />
              {busy ? "Analyzing…" : "Analyze"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-500">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">
                {analysis.total} models parsed — {analysis.newCount} new,{" "}
                {analysis.updatedCount} updated, {analysis.unchangedCount} unchanged
              </span>
            </div>
            {analysis.prevCuratedCount > 0 &&
             analysis.prevCuratedMissingFromFile > analysis.prevCuratedCount * 0.3 && (
              <div className="rounded-md border border-yellow-500/40 bg-yellow-50/60 dark:bg-yellow-950/20 p-3 text-sm flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-yellow-600" />
                <div className="space-y-1">
                  <div className="font-medium text-yellow-700 dark:text-yellow-400">
                    This file is missing {analysis.prevCuratedMissingFromFile} of {analysis.prevCuratedCount} previously-imported models.
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Looks narrower than your last import. Re-check the RVX filters —
                    especially <strong>Client = All</strong>. You can still import
                    this file; the missing models stay in the catalog untouched.
                  </p>
                </div>
              </div>
            )}
            {analysis.parseErrors.length > 0 && (
              <div className="text-xs text-yellow-500 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  {analysis.parseErrors.length} parse warning(s):
                  <ul className="list-disc ml-4">
                    {analysis.parseErrors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              </div>
            )}
            {analysis.collectionChanges.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  Collection changes ({analysis.collectionChanges.length} shown):
                </p>
                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Model</TableHead>
                        <TableHead>Current</TableHead>
                        <TableHead>RVX</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analysis.collectionChanges.slice(0, 25).map((c) => (
                        <TableRow key={c.model}>
                          <TableCell className="font-mono text-sm">{c.model}</TableCell>
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
              <Button onClick={handleImport} disabled={busy}>
                {busy ? "Importing…" : `Import ${analysis.total} models`}
              </Button>
            </DialogFooter>
          </div>
        )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
