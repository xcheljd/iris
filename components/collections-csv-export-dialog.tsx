"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Copy, FileText, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { exportCollectionsCsv, type CollectionsCsvExportResult, type CollectionsCsvScope } from "@/lib/actions/collections-csv-export";
import { LIST_QUERY_LIMIT } from "@/lib/constants";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  selectedCollection: string | null;
  searchQuery: string;
}

type Mode = CollectionsCsvScope["mode"];

export function CollectionsCsvExportDialog({ open, onOpenChange, selectedCollection, searchQuery }: Props) {
  const trimmedQuery = searchQuery.trim();
  const options = useMemo(() => {
    const o: { mode: Mode; label: string }[] = [{ mode: "all", label: "All collections" }];
    if (selectedCollection) o.push({ mode: "selected", label: `Selected: ${selectedCollection}` });
    if (trimmedQuery) o.push({ mode: "filter", label: `Current filter: "${trimmedQuery}"` });
    return o;
  }, [selectedCollection, trimmedQuery]);

  const [mode, setMode] = useState<Mode>("all");
  // Reset to a still-valid mode whenever the dialog opens / options change.
  useEffect(() => {
    if (!options.some((o) => o.mode === mode)) setMode("all");
  }, [options, mode]);

  const scope: CollectionsCsvScope =
    mode === "selected" && selectedCollection ? { mode: "selected", collection: selectedCollection }
    : mode === "filter" && trimmedQuery ? { mode: "filter", query: trimmedQuery }
    : { mode: "all" };

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CollectionsCsvExportResult | null>(null);

  const scopeMode = scope.mode;
  const scopeCollection = (scope as { collection?: string }).collection;
  const scopeQuery = (scope as { query?: string }).query;
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    exportCollectionsCsv(scope)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => {
        if (cancelled) return;
        console.error("[CollectionsCsvExport] Failed:", err);
        toast.error("Failed to build CSV export");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // scope is destructured into stable primitives above so the effect
    // doesn't refire on every render. `scope` itself is intentionally
    // excluded — its object identity changes per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scopeMode, scopeCollection, scopeQuery]);

  const csv = data?.csv ?? "";
  const rowCount = data?.rowCount ?? 0;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(csv);
      toast.success(`Copied CSV (${rowCount} row${rowCount === 1 ? "" : "s"}) to clipboard`);
    } catch (err) {
      console.error("[CollectionsCsvExport] Clipboard failed:", err);
      toast.error("Couldn't copy — your browser blocked clipboard access");
    }
  };

  const handleDownload = () => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `collections-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Downloaded collections-${stamp}.csv (${rowCount} rows)`);
  };

  const disabled = loading || rowCount === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5" />
            Export Collection Interest to CSV
          </DialogTitle>
          <DialogDescription>
            One row per client · collection · model. Download as a file or copy to clipboard.
          </DialogDescription>
        </DialogHeader>

        {options.length > 1 && (
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} className="flex flex-wrap gap-3">
            {options.map((o) => (
              <div key={o.mode} className="flex items-center gap-1.5">
                <RadioGroupItem value={o.mode} id={`coll-export-${o.mode}`} />
                <label htmlFor={`coll-export-${o.mode}`} className="text-sm cursor-pointer">{o.label}</label>
              </div>
            ))}
          </RadioGroup>
        )}

        {data?.truncated && (
          <Alert variant="warning">
            <AlertTriangle className="size-4" />
            <AlertDescription>
              Capped at {LIST_QUERY_LIMIT.toLocaleString()} clients. Narrow the scope for a complete export.
            </AlertDescription>
          </Alert>
        )}

        <div className="text-xs text-muted-foreground">
          {loading ? "Building CSV…" : `${rowCount.toLocaleString()} row${rowCount === 1 ? "" : "s"} · 8 columns`}
        </div>

        <Textarea
          value={loading ? "" : csv}
          readOnly
          rows={10}
          className="font-mono text-[11px] leading-tight"
          placeholder={loading ? "Building CSV…" : "No collection interest matches this scope"}
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
