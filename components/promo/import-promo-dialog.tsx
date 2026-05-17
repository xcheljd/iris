"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DatePicker } from "@/components/date-picker";
import { FileSpreadsheet, Upload, AlertCircle, CheckCircle2, CalendarDays } from "lucide-react";
import { importPromos } from "@/lib/actions";
import { toast } from "sonner";
import { format } from "date-fns";
import { type ParsedPromoRow as ParsedRow, parsePasteData } from "@/lib/promo-csv-parser";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BRAND_VALUES, type Brand } from "@/lib/db/schema";

interface ImportPromoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportPromoDialog({ open, onOpenChange }: ImportPromoDialogProps) {
  const router = useRouter();
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<{ rows: ParsedRow[]; mapping: Record<string, number> | null; headers: string[] } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [promoStart, setPromoStart] = useState<Date | undefined>(undefined);
  const [promoEnd, setPromoEnd] = useState<Date | undefined>(undefined);
  const [brand, setBrand] = useState<Brand | "">("");

  const handleParse = () => {
    if (!rawText.trim()) return;
    const result = parsePasteData(rawText);
    setParsed(result);
  };

  const handleImport = async () => {
    if (!parsed || parsed.rows.length === 0) return;
    if (!brand) { toast.error("Pick a brand for this import"); return; }
    setIsImporting(true);
    try {
      const startStr = promoStart ? format(promoStart, "yyyy-MM-dd") : null;
      const endStr = promoEnd ? format(promoEnd, "yyyy-MM-dd") : null;
      const result = await importPromos(parsed.rows, brand, startStr, endStr);
      if ("error" in result) { toast.error(result.error); return; }
      if (result.imported === 0) {
        toast.error("No promos imported — check the pasted data");
        return;
      }
      toast.success(
        `Imported ${result.imported} promo watch${result.imported !== 1 ? "es" : ""} · ` +
        `${result.matchedClients} client${result.matchedClients !== 1 ? "s" : ""} matched`,
      );
      setRawText(""); setParsed(null); setPromoStart(undefined); setPromoEnd(undefined); setBrand("");
      onOpenChange(false);
      router.refresh();
    } catch { toast.error("Failed to import promos"); }
    finally { setIsImporting(false); }
  };

  const handleReset = () => { setRawText(""); setParsed(null); };

  const handleSample = () => {
    setRawText("Model Number\tCollection\tMSRP\tDiscount %\tSale Price\nHX1009-01X\tSolaris\t395\t25\t296.25\nNR-710-12L\tMechanical\t275\t20\t220\nCA7060-87L\tWeekender\t350\t30\t245");
    const today = new Date();
    const end = new Date(today); end.setDate(end.getDate() + 7);
    setPromoStart(today);
    setPromoEnd(end);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleReset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import Promo List
          </DialogTitle>
          <DialogDescription>
            Paste tab-delimited data from Excel. Headers are auto-detected.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">

        {!parsed ? (
          <div className="space-y-4">
            {/* Promo Date Range */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
              <div className="space-y-2 flex-1">
                <Label>Promo Start</Label>
                <DatePicker
                  date={promoStart}
                  onSelect={setPromoStart}
                  className="w-full"
                />
              </div>
              <div className="flex items-center pb-2 text-muted-foreground">—</div>
              <div className="space-y-2 flex-1">
                <Label>Promo End</Label>
                <DatePicker
                  date={promoEnd}
                  onSelect={setPromoEnd}
                  className="w-full"
                />
              </div>
              {(promoStart || promoEnd) && (
                <Button variant="ghost" size="sm" className="mb-0.5" onClick={() => { setPromoStart(undefined); setPromoEnd(undefined); }}>
                  Clear
                </Button>
              )}
            </div>
            <div className="space-y-2">
              <Label>Brand *</Label>
              <Select value={brand || undefined} onValueChange={(v) => setBrand(v as Brand)}>
                <SelectTrigger className="sm:w-64"><SelectValue placeholder="Select the brand for this paste" /></SelectTrigger>
                <SelectContent>
                  {BRAND_VALUES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">One brand per paste (one Excel sheet per brand).</p>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>Paste your data</Label>
              <Textarea placeholder="Paste Excel data here (tab-delimited)..." value={rawText} onChange={(e) => setRawText(e.target.value)} rows={8} className="font-mono text-sm" />
              <p className="text-xs text-muted-foreground">
                Copy rows from Excel and paste directly. Columns auto-detected: Model Number, Collection, MSRP, Discount %, Sale Price.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleParse} disabled={!rawText.trim()}>
                <Upload className="h-4 w-4 mr-2" />
                Parse Data
              </Button>
              <Button variant="outline" onClick={handleSample}>
                Load Sample
              </Button>
            </div>
          </div>
        ) : !parsed.mapping ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-yellow-500">
              <AlertCircle className="h-5 w-5" />
              <span className="font-medium">Could not detect columns</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Make sure your data has headers like: Model Number, Collection, MSRP, Discount %, Sale Price.
            </p>
            <Button variant="outline" onClick={handleReset}>Try Again</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-500">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Detected {Object.keys(parsed.mapping).length} columns — {parsed.rows.length} rows parsed</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Column mapping: {Object.entries(parsed.mapping).map(([k, v]) => `${k} → "${parsed.headers[v]}"`).join(" | ")}
            </div>
            {(promoStart || promoEnd) && (
              <div className="flex items-center gap-2 text-sm">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <span>Promo period: {promoStart ? format(promoStart, "MMM d") : "?"} — {promoEnd ? format(promoEnd, "MMM d, yyyy") : "?"}</span>
              </div>
            )}
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Model Number</TableHead>
                    <TableHead>Collection</TableHead>
                    <TableHead className="text-right">MSRP</TableHead>
                    <TableHead className="text-right">Discount %</TableHead>
                    <TableHead className="text-right">Sale Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.rows.slice(0, 20).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{row.modelNumber}</TableCell>
                      <TableCell>{row.collection}</TableCell>
                      <TableCell className="text-right">{row.msrp != null ? `$${row.msrp.toFixed(2)}` : "—"}</TableCell>
                      <TableCell className="text-right">{row.discountPercent != null ? `${row.discountPercent}%` : "—"}</TableCell>
                      <TableCell className="text-right">{row.discountPrice != null ? `$${row.discountPrice.toFixed(2)}` : "—"}</TableCell>
                    </TableRow>
                  ))}
                  {parsed.rows.length > 20 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground text-sm">
                        ...and {parsed.rows.length - 20} more rows
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleReset}>Back</Button>
              <Button onClick={handleImport} disabled={isImporting || parsed.rows.length === 0}>
                {isImporting ? "Importing..." : `Import ${parsed.rows.length} Promos`}
              </Button>
            </DialogFooter>
          </div>
        )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
