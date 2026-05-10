"use client";

import { useState, useEffect, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Merge } from "lucide-react";
import { patchClientFromFormMerge } from "@/lib/actions";
import { toast } from "sonner";
import type { ClientFormData } from "@/components/client-form";
import { type MergeableClient, initChoices, buildMergePatch, ResolutionPanel } from "./resolution-panel";

export function MergeFromFormDialog({
  existingClientId,
  formData,
  productsOfInterest,
  open,
  onOpenChange,
  onMerged,
}: {
  existingClientId: string;
  formData: ClientFormData;
  productsOfInterest: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMerged: (winnerId: string) => void;
}) {
  const [existingClient, setExistingClient] = useState<MergeableClient | null>(null);
  const [choices, setChoices] = useState<Record<string, "a" | "b">>({});
  const [finalNotes, setFinalNotes] = useState("");
  const [pending, start] = useTransition();

  const toDateStr = (v: Date | string | null | undefined): string | null => {
    if (!v) return null;
    if (v instanceof Date) return v.toISOString().split("T")[0];
    return v;
  };

  const formSnapshot: MergeableClient = {
    id: "new",
    firstName: formData.firstName,
    lastName: formData.lastName || null,
    phone: formData.phone || null,
    email: formData.email || null,
    birthday: toDateStr(formData.birthday),
    anniversary: toDateStr(formData.anniversary),
    customerId: formData.customerId || null,
    source: formData.source || undefined,
    onEmailList: formData.onEmailList,
    notes: formData.notes || null,
    productsOfInterest,
    tags: formData.tags,
  };

  useEffect(() => {
    if (!open || !existingClientId) return;
    fetch(`/api/clients/${existingClientId}`)
      .then((r) => r.json())
      .then((data: MergeableClient) => {
        setExistingClient(data);
        setChoices(initChoices(data, formSnapshot));
        setFinalNotes(data.notes ?? formSnapshot.notes ?? "");
      })
      .catch(() => toast.error("Failed to load client data. Please try again."));
  // formSnapshot is stable for a given open session; only re-fetch on id change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existingClientId]);

  const handleMerge = () => {
    if (!existingClient) return;
    start(async () => {
      try {
        const patch = buildMergePatch(existingClient, formSnapshot, choices, finalNotes);
        await patchClientFromFormMerge(existingClientId, patch);
        toast.success("Records merged successfully");
        onOpenChange(false);
        onMerged(existingClientId);
      } catch {
        toast.error("Failed to merge records");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl flex flex-col max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5" />
            Merge with Existing Record
          </DialogTitle>
          <DialogDescription>
            Choose the winning value for each conflicting field. Products and tags will be combined.
          </DialogDescription>
        </DialogHeader>

        {!existingClient ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <ScrollArea className="flex-1 min-h-0 py-2">
            <div className="pr-4">
              <ResolutionPanel
                clientA={existingClient}
                clientB={formSnapshot}
                labelA={`${existingClient.firstName} ${existingClient.lastName ?? ""} (existing)`}
                labelB="New Entry (form)"
                choices={choices}
                setChoices={setChoices}
                finalNotes={finalNotes}
                setFinalNotes={setFinalNotes}
              />
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="pt-2 border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={pending || !existingClient} onClick={handleMerge}>
            {pending ? "Merging…" : "Merge Records"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
