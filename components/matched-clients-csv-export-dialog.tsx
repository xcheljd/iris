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
import { exportMatchedClientsCsv, type MatchedClientsCsvExportResult, type MatchedClientsCsvScope } from "@/lib/actions/matched-clients-csv-export";
import { LIST_QUERY_LIMIT } from "@/lib/constants";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  owners: string[];
  matchTypes: string[];
  brands: string[];
}

type Mode = MatchedClientsCsvScope["mode"];

export function MatchedClientsCsvExportDialog({ open, onOpenChange, owners, matchTypes, brands }: Props) {
  const hasFilter = owners.length > 0 || matchTypes.length > 0 || brands.length > 0;
  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (owners.length) parts.push(`Assoc: ${owners.join(", ")}`);
    if (matchTypes.length) parts.push(`Match: ${matchTypes.join(", ")}`);
    if (brands.length) parts.push(`Brand: ${brands.join(", ")}`);
    return parts.join(" · ");
  }, [owners, matchTypes, brands]);

  const options = useMemo(() => {
    const o: { mode: Mode; label: string }[] = [{ mode: "all", label: "All matched clients" }];
    if (hasFilter) o.push({ mode: "filter", label: `Current filter (${filterSummary})` });
    return o;
  }, [hasFilter, filterSummary]);

  const [mode, setMode] = useState<Mode>("all");
  useEffect(() => {
    if (!options.some((o) => o.mode === mode)) setMode("all");
  }, [options, mode]);

  const scope: MatchedClientsCsvScope =
    mode === "filter" && hasFilter ? { mode: "filter", owners, matchTypes, brands } : { mode: "all" };

  // Stable string keys so new array identities per render don't loop the fetch.
  const ownersKey = owners.join("|");
  const typesKey = matchTypes.join("|");
  const brandsKey = brands.join("|");

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<MatchedClientsCsvExportResult | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    exportMatchedClientsCsv(scope)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => {
        if (cancelled) return;
        console.error("[MatchedClientsCsvExport] Failed:", err);
        toast.error("Failed to build CSV export");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, ownersKey, typesKey, brandsKey]);

  const csv = data?.csv ?? "";
  const rowCount = data?.rowCount ?? 0;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(csv);
      toast.success(`Copied CSV (${rowCount} row${rowCount === 1 ? "" : "s"}) to clipboard`);
    } catch (err) {
      console.error("[MatchedClientsCsvExport] Clipboard failed:", err);
      toast.error("Couldn't copy — your browser blocked clipboard access");
    }
  };

  const handleDownload = () => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `matched-clients-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Downloaded matched-clients-${stamp}.csv (${rowCount} rows)`);
  };

  const disabled = loading || rowCount === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5" />
            Export Matched Clients to CSV
          </DialogTitle>
          <DialogDescription>
            One row per client · matched promo. Download as a file or copy to clipboard.
          </DialogDescription>
        </DialogHeader>

        {options.length > 1 && (
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} className="flex flex-wrap gap-3">
            {options.map((o) => (
              <div key={o.mode} className="flex items-center gap-1.5">
                <RadioGroupItem value={o.mode} id={`matched-export-${o.mode}`} />
                <label htmlFor={`matched-export-${o.mode}`} className="text-sm cursor-pointer">{o.label}</label>
              </div>
            ))}
          </RadioGroup>
        )}

        {data?.truncated && (
          <Alert variant="warning">
            <AlertTriangle className="size-4" />
            <AlertDescription>
              Capped at {LIST_QUERY_LIMIT.toLocaleString()} rows. Narrow the scope for a complete export.
            </AlertDescription>
          </Alert>
        )}

        <div className="text-xs text-muted-foreground">
          {loading ? "Building CSV…" : `${rowCount.toLocaleString()} row${rowCount === 1 ? "" : "s"} · 13 columns`}
        </div>

        <Textarea
          value={loading ? "" : csv}
          readOnly
          rows={10}
          className="font-mono text-[11px] leading-tight"
          placeholder={loading ? "Building CSV…" : "No matched clients in this scope"}
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
