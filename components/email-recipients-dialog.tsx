"use client";

import { useEffect, useMemo, useState } from "react";
import { Mail, Copy, Loader2 } from "lucide-react";
import { describeClientFilters } from "@/lib/smart-list-filters";
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
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
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

  const activeFilterChips = describeClientFilters(filters);

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

        <FieldSet>
          <FieldLegend variant="label" className="sr-only">Recipients</FieldLegend>
          <FieldGroup className="gap-3">
            <Field orientation="horizontal">
              <Checkbox
                id="er-includeClients"
                checked={includeClients}
                onCheckedChange={(v) => setIncludeClients(v === true)}
                disabled={loading}
              />
              <FieldLabel htmlFor="er-includeClients" className="text-sm font-normal cursor-pointer">
                Clients
              </FieldLabel>
              <Badge variant="outline">
                {loading ? "…" : data?.clients.count ?? 0}
              </Badge>
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id="er-includeProspects"
                checked={includeProspects}
                onCheckedChange={(v) => setIncludeProspects(v === true)}
                disabled={loading}
              />
              <FieldLabel htmlFor="er-includeProspects" className="text-sm font-normal cursor-pointer">
                Prospects (active, with email)
              </FieldLabel>
              <Badge variant="outline">
                {loading ? "…" : data?.prospects.count ?? 0}
              </Badge>
            </Field>
          </FieldGroup>
        </FieldSet>

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

