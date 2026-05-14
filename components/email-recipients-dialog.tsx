"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Mail, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getEmailRecipients, type ClientEmailFilters, type EmailRecipientsResult } from "@/lib/actions/email-recipients";

interface EmailRecipientsDialogProps {
  open: boolean;
  /** Method signature dodges the Next TS plugin's false-positive serialization warning. */
  onOpenChange(open: boolean): void;
  /** Current Clients-page filter state. Applied to the clients bucket only. */
  filters: ClientEmailFilters;
}

export function EmailRecipientsDialog({ open, onOpenChange, filters }: EmailRecipientsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<EmailRecipientsResult | null>(null);
  const [includeClients, setIncludeClients] = useState(true);
  const [includeProspects, setIncludeProspects] = useState(true);

  // Fetch on open; refetch when filters change while open
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    getEmailRecipients(filters)
      .then((result) => {
        if (cancelled) return;
        setData(result);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[EmailRecipientsDialog] Failed to fetch:", err);
        toast.error("Failed to load email recipients");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, filters]);

  // Compute the deduped union of selected buckets
  const { mergedEmails, mergedCount } = useMemo(() => {
    if (!data) return { mergedEmails: [], mergedCount: 0 };
    const seen = new Set<string>();
    if (includeClients) for (const e of data.clients.emails) seen.add(e);
    if (includeProspects) for (const e of data.prospects.emails) seen.add(e);
    const merged = Array.from(seen).sort();
    return { mergedEmails: merged, mergedCount: merged.length };
  }, [data, includeClients, includeProspects]);

  const csv = mergedEmails.join(", ");
  const copyDisabled = loading || mergedCount === 0;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(csv);
      toast.success(`Copied ${mergedCount} email${mergedCount === 1 ? "" : "s"} to clipboard`);
    } catch (err) {
      console.error("[EmailRecipientsDialog] Clipboard write failed:", err);
      toast.error("Couldn't copy — your browser blocked clipboard access");
    }
  };

  const activeFilterChips = describeFilters(filters);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Recipients
          </DialogTitle>
          <DialogDescription>
            Comma-separated list of opted-in emails. Paste into your promo blast tool.
          </DialogDescription>
        </DialogHeader>

        {activeFilterChips.length > 0 && (
          <div className="rounded-md border bg-muted/30 p-3 text-xs">
            <div className="text-muted-foreground mb-1.5">Clients filtered by:</div>
            <div className="flex flex-wrap gap-1.5">
              {activeFilterChips.map((chip) => (
                <Badge key={chip} variant="secondary" className="font-normal">{chip}</Badge>
              ))}
            </div>
            <div className="text-muted-foreground mt-2">
              Prospects are not affected by the Clients filter.
            </div>
          </div>
        )}

        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <Checkbox
              checked={includeClients}
              onCheckedChange={(v) => setIncludeClients(v === true)}
              disabled={loading}
            />
            <span className="text-sm flex-1">Clients</span>
            <Badge variant="outline">
              {loading ? "…" : data?.clients.count ?? 0}
            </Badge>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <Checkbox
              checked={includeProspects}
              onCheckedChange={(v) => setIncludeProspects(v === true)}
              disabled={loading}
            />
            <span className="text-sm flex-1">Prospects (active, with email)</span>
            <Badge variant="outline">
              {loading ? "…" : data?.prospects.count ?? 0}
            </Badge>
          </label>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{loading ? "Loading…" : `${mergedCount} unique email${mergedCount === 1 ? "" : "s"}`}</span>
          </div>
          <Textarea
            value={loading ? "" : csv}
            readOnly
            rows={6}
            className="font-mono text-xs"
            placeholder={loading ? "Loading…" : "No matching recipients"}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCopy} disabled={copyDisabled}>
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            Copy {mergedCount > 0 ? mergedCount : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function describeFilters(f: ClientEmailFilters): string[] {
  const chips: string[] = [];
  if (f.q && f.q.trim()) chips.push(`Search: "${f.q.trim()}"`);
  if (f.nameQ && f.nameQ.trim()) chips.push(`Name: "${f.nameQ.trim()}"`);
  if (f.contactQ && f.contactQ.trim()) chips.push(`Contact: "${f.contactQ.trim()}"`);
  if (f.heat && f.heat !== "any") chips.push(`Heat: ${f.heat}`);
  if (f.owner && f.owner !== "any") {
    chips.push(`Owner: ${f.owner === "__none__" ? "Unassigned" : f.owner}`);
  }
  if (f.tags && f.tags.length > 0) {
    const mode = f.tagMode === "all" ? "all of" : "any of";
    chips.push(`Tags (${mode}): ${f.tags.join(", ")}`);
  }
  const dateRange = (from?: number, to?: number) => {
    if (!from && !to) return null;
    const fromStr = from ? format(new Date(from * 1000), "MMM d, yyyy") : "—";
    const toStr = to ? format(new Date(to * 1000), "MMM d, yyyy") : "—";
    return `${fromStr} → ${toStr}`;
  };
  const lastContact = dateRange(f.lastContactFrom, f.lastContactTo);
  if (lastContact) chips.push(`Last Contact: ${lastContact}`);
  const created = dateRange(f.createdFrom, f.createdTo);
  if (created) chips.push(`Created: ${created}`);
  return chips;
}
