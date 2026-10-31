"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { createSmartList } from "@/lib/actions";
import { toast } from "sonner";
import type { ClientFilterParams } from "@/lib/client-filter-conds";

interface SaveCurrentFilterDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** The Clients-page filters to save. */
  filters: ClientFilterParams;
  /** Pre-computed chip strings describing the filters (rendered as Badges). */
  activeFilterChips: string[];
}

export function SaveCurrentFilterDialog({
  open,
  onOpenChange,
  filters,
  activeFilterChips,
}: SaveCurrentFilterDialogProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    if (!name.trim()) return;
    startTransition(async () => {
      const result = await createSmartList(
        name.trim(),
        // ClientFilterParams is already plain JSON-safe — store as is
        filters as Record<string, unknown>,
        { isShared },
      );
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Smart list created");
        setName("");
        setIsShared(false);
        onOpenChange(false);
        // Navigate the user to the newly-created list
        router.push(`/smart-lists?list=${encodeURIComponent(result.id)}`);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save Filter as Smart List</DialogTitle>
          <DialogDescription>
            Save the current Clients-page filters as a reusable Smart List.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className="gap-4 py-2">
          <Field>
            <FieldLabel htmlFor="save-list-name">Name</FieldLabel>
            <Input
              id="save-list-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Hot VIPs in Q2"
              autoFocus
            />
          </Field>

          {activeFilterChips.length > 0 && (
            <div className="rounded-md border bg-muted/30 p-3 text-xs">
              <div className="text-muted-foreground mb-1.5">Filters to save:</div>
              <div className="flex flex-wrap gap-1.5">
                {activeFilterChips.map((chip) => (
                  <Badge key={chip} variant="secondary" className="font-normal">{chip}</Badge>
                ))}
              </div>
            </div>
          )}

          <Field orientation="horizontal">
            <Checkbox
              id="save-list-shared"
              checked={isShared}
              onCheckedChange={(c) => setIsShared(c === true)}
            />
            <FieldLabel htmlFor="save-list-shared" className="text-sm font-normal cursor-pointer">
              Share this list with the team
            </FieldLabel>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || isPending}>
            {isPending ? "Saving…" : "Save List"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
