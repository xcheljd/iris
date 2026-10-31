"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { createSmartList } from "@/lib/actions";
import { CLIENT_SOURCE_VALUES } from "@/lib/db/schema";
import { toast } from "sonner";

interface CreateListDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
}

export function CreateListDialog({ open, onOpenChange }: CreateListDialogProps) {
  const [name, setName] = useState("");
  const [heatLevel, setHeatLevel] = useState<string>("__none__");
  const [source, setSource] = useState<string>("__none__");
  const [onEmailList, setOnEmailList] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleCreate = () => {
    if (!name.trim()) return;
    const filters: Record<string, unknown> = {};
    if (heatLevel !== "__none__") filters.heatLevel = heatLevel;
    if (source !== "__none__") filters.source = source;
    if (onEmailList) filters.onEmailList = true;

    startTransition(async () => {
      const result = await createSmartList(name.trim(), filters);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Smart list created");
        setName("");
        setHeatLevel("__none__");
        setSource("__none__");
        setOnEmailList(false);
        onOpenChange(false);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Smart List</DialogTitle>
          <DialogDescription>Define filters to automatically populate your list.</DialogDescription>
        </DialogHeader>
        <FieldGroup className="gap-4 py-2">
          <Field>
            <FieldLabel htmlFor="list-name">Name</FieldLabel>
            <Input id="list-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. VIP Clients" />
          </Field>
          <FieldSeparator>Filters</FieldSeparator>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="cl-heatLevel">Heat Level</FieldLabel>
              <Select value={heatLevel} onValueChange={setHeatLevel}>
                <SelectTrigger id="cl-heatLevel"><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Any</SelectItem>
                  <SelectItem value="hot">Hot</SelectItem>
                  <SelectItem value="warm">Warm</SelectItem>
                  <SelectItem value="cold">Cold</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="cl-source">Source</FieldLabel>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger id="cl-source"><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Any</SelectItem>
                  {CLIENT_SOURCE_VALUES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field orientation="horizontal">
            <Checkbox
              id="email-list-filter"
              checked={onEmailList}
              onCheckedChange={(checked) => setOnEmailList(!!checked)}
            />
            <FieldLabel htmlFor="email-list-filter" className="text-sm font-normal cursor-pointer">
              On email list only
            </FieldLabel>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!name.trim() || isPending}>
            {isPending ? "Creating..." : "Create List"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
