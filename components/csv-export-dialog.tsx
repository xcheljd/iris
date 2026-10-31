"use client";

import { Download, Copy, FileText, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useFetchOnOpen } from "@/hooks/use-fetch-on-open";
import { downloadCsv } from "@/lib/download";

export type CsvExportResult = { csv: string; rowCount: number; truncated: boolean };
export type CsvScopeOption<M extends string> = { mode: M; label: string };

const plural = (n: number) => `${n.toLocaleString()} row${n === 1 ? "" : "s"}`;

/**
 * The one CSV export popup (Clients, Collections, Matched clients): a preview,
 * Copy and Download. Each caller supplies only what differs: the title, the
 * filename prefix, an optional scope picker or filter summary, and the
 * server action that builds the CSV. `requestKey` names the current request;
 * the popup refetches when it changes and never shows a failed request's
 * predecessor (see useFetchOnOpen).
 */
export function CsvExportDialog<M extends string>({
  open,
  onOpenChange,
  title,
  description,
  filenamePrefix,
  columns,
  emptyText,
  truncatedText,
  requestKey,
  fetchCsv,
  scope,
  children,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  description: string;
  filenamePrefix: string;
  columns: number;
  emptyText: string;
  truncatedText: string;
  requestKey: string;
  fetchCsv: () => Promise<CsvExportResult>;
  /** Shown as radio buttons when there's more than one option. */
  scope?: { options: CsvScopeOption<M>[]; value: NoInfer<M>; onChange(mode: NoInfer<M>): void; idPrefix: string };
  /** Extra context above the preview (e.g. the active filter chips). */
  children?: React.ReactNode;
}) {
  const { data, loading } = useFetchOnOpen(open, requestKey, fetchCsv, (err) => {
    console.error(`[CsvExport:${filenamePrefix}] Failed to build:`, err);
    toast.error("Failed to build CSV export");
  });
  const csv = data?.csv ?? "";
  const rowCount = data?.rowCount ?? 0;
  const disabled = loading || rowCount === 0;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(csv);
      toast.success(`Copied CSV (${plural(rowCount)}) to clipboard`);
    } catch (err) {
      console.error(`[CsvExport:${filenamePrefix}] Clipboard write failed:`, err);
      toast.error("Couldn't copy — your browser blocked clipboard access");
    }
  };

  const handleDownload = () => {
    const filename = `${filenamePrefix}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    downloadCsv(csv, filename);
    toast.success(`Downloaded ${filename} (${rowCount} rows)`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {scope && scope.options.length > 1 && (
          <RadioGroup value={scope.value} onValueChange={(v) => scope.onChange(v as M)} className="flex flex-wrap gap-3">
            {scope.options.map((o) => (
              <div key={o.mode} className="flex items-center gap-1.5">
                <RadioGroupItem value={o.mode} id={`${scope.idPrefix}-${o.mode}`} />
                <label htmlFor={`${scope.idPrefix}-${o.mode}`} className="text-sm cursor-pointer">{o.label}</label>
              </div>
            ))}
          </RadioGroup>
        )}

        {children}

        {data?.truncated && (
          <Alert variant="warning">
            <AlertTriangle className="size-4" />
            <AlertDescription>{truncatedText}</AlertDescription>
          </Alert>
        )}

        <div className="text-xs text-muted-foreground">
          {loading ? "Building CSV…" : `${plural(rowCount)} · ${columns} columns`}
        </div>

        <Textarea
          value={loading ? "" : csv}
          readOnly
          rows={10}
          className="font-mono text-[11px] leading-tight"
          placeholder={loading ? "Building CSV…" : emptyText}
        />

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="outline" onClick={handleCopy} disabled={disabled}>
            {loading ? <Spinner className="mr-2" /> : <Copy className="size-4 mr-2" />}
            Copy
          </Button>
          <Button onClick={handleDownload} disabled={disabled}>
            {loading ? <Spinner className="mr-2" /> : <Download className="size-4 mr-2" />}
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
