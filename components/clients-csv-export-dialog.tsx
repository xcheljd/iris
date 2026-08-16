"use client";

import { useEffect, useState } from "react";
import { Download, Copy, FileText, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { exportClientsCsv, type ClientsCsvExportResult } from "@/lib/actions/clients-csv-export";
import { describeClientFilters } from "@/lib/smart-list-filters";
import { LIST_QUERY_LIMIT } from "@/lib/constants";
import type { ClientFilterParams } from "@/lib/client-filter-conds";

interface ClientsCsvExportDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  filters: ClientFilterParams;
}

export function ClientsCsvExportDialog({
  open,
  onOpenChange,
  filters,
}: ClientsCsvExportDialogProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ClientsCsvExportResult | null>(null);

  // Fetch on open / filter change
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    exportClientsCsv(filters)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[ClientsCsvExport] Failed to fetch:", err);
        toast.error("Failed to build CSV export");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, filters]);

  const activeFilterChips = describeClientFilters(filters);
  const csv = data?.csv ?? "";
  const rowCount = data?.rowCount ?? 0;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(csv);
      toast.success(`Copied CSV (${rowCount} row${rowCount === 1 ? "" : "s"}) to clipboard`);
    } catch (err) {
      console.error("[ClientsCsvExport] Clipboard write failed:", err);
      toast.error("Couldn't copy — your browser blocked clipboard access");
    }
  };

  const handleDownload = () => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `clients-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Downloaded clients-${stamp}.csv (${rowCount} rows)`);
  };

  const disabled = loading || rowCount === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5" />
            Export Clients to CSV
          </DialogTitle>
          <DialogDescription>
            Comma-separated export of clients matching your current filters. Download as a file or copy to clipboard.
          </DialogDescription>
        </DialogHeader>

        {activeFilterChips.length > 0 && (
          <div className="rounded-md border bg-muted/30 p-3 text-xs">
            <div className="text-muted-foreground mb-1.5">Filtered by:</div>
            <div className="flex flex-wrap gap-1.5">
              {activeFilterChips.map((chip) => (
                <Badge key={chip} variant="secondary" className="font-normal">{chip}</Badge>
              ))}
            </div>
          </div>
        )}

        {data?.truncated && (
          <Alert variant="warning">
            <AlertTriangle className="size-4" />
            <AlertDescription>
              The export was capped at {LIST_QUERY_LIMIT.toLocaleString()} rows. Tighten your filters for a complete export.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {loading
              ? "Building CSV…"
              : `${rowCount.toLocaleString()} row${rowCount === 1 ? "" : "s"} · 17 columns`}
          </span>
        </div>

        <Textarea
          value={loading ? "" : csv}
          readOnly
          rows={10}
          className="font-mono text-[11px] leading-tight"
          placeholder={loading ? "Building CSV…" : "No matching clients"}
        />

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="outline" onClick={handleCopy} disabled={disabled}>
            {loading ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Copy className="size-4 mr-2" />}
            Copy
          </Button>
          <Button onClick={handleDownload} disabled={disabled}>
            {loading ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Download className="size-4 mr-2" />}
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
