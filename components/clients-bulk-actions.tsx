"use client";

import { useState, useTransition } from "react";
import {
  Tag as TagIcon,
  User,
  Mail,
  Ban,
  MailX,
  Trash2,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandEmpty } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  bulkAddTags,
  bulkRemoveTags,
  bulkReassignOwner,
  bulkSetEmailList,
  bulkDeleteClients,
  bulkBanClients,
  bulkUnsubscribeClients,
} from "@/lib/actions/bulk-clients";
import { cn } from "@/lib/utils";

interface BulkActionsToolbarProps {
  selectedIds: string[];
  onClear(): void;
  allTags: { name: string; usageCount: number }[];
  /** Owner picker options — same shape as the Owner column filter. */
  owners: { id: string; name: string }[];
  isManager: boolean;
}

type DialogKind =
  | { kind: "addTags" }
  | { kind: "removeTags" }
  | { kind: "reassignOwner" }
  | { kind: "emailListOn" }
  | { kind: "emailListOff" }
  | { kind: "ban" }
  | { kind: "unsubscribe" }
  | { kind: "delete" }
  | null;

export function BulkActionsToolbar({
  selectedIds,
  onClear,
  allTags,
  owners,
  isManager,
}: BulkActionsToolbarProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [, startTransition] = useTransition();

  const count = selectedIds.length;
  if (count === 0) return null;

  const close = () => setDialog(null);

  const runBulk = async <T,>(
    action: () => Promise<{ ok: number; error?: string }>,
    successLabel: (ok: number) => string,
    onSuccess?: () => T,
  ) => {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(successLabel(result.ok));
        onSuccess?.();
        onClear();
        router.refresh();
        close();
      }
    });
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <Badge variant="secondary">{count} selected</Badge>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            Actions
            <ChevronDown className="h-4 w-4 ml-1 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onClick={() => setDialog({ kind: "addTags" })}>
            <TagIcon className="h-4 w-4 mr-2" />Add tags…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDialog({ kind: "removeTags" })}>
            <TagIcon className="h-4 w-4 mr-2" />Remove tags…
          </DropdownMenuItem>
          {isManager && (
            <DropdownMenuItem onClick={() => setDialog({ kind: "reassignOwner" })}>
              <User className="h-4 w-4 mr-2" />Reassign owner…
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setDialog({ kind: "emailListOn" })}>
            <Mail className="h-4 w-4 mr-2" />Mark as opted in
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDialog({ kind: "emailListOff" })}>
            <Mail className="h-4 w-4 mr-2" />Mark as opted out
          </DropdownMenuItem>
          {isManager && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setDialog({ kind: "ban" })}
                className="text-destructive focus:text-destructive"
              >
                <Ban className="h-4 w-4 mr-2" />Ban…
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setDialog({ kind: "unsubscribe" })}
                className="text-destructive focus:text-destructive"
              >
                <MailX className="h-4 w-4 mr-2" />Unsubscribe…
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setDialog({ kind: "delete" })}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />Delete…
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button variant="ghost" size="sm" onClick={onClear}>Clear</Button>

      {/* Add tags */}
      {dialog?.kind === "addTags" && (
        <TagPickerDialog
          title={`Add tags to ${count} client${count === 1 ? "" : "s"}`}
          description="Tags will be added to each selected client. Duplicates are ignored."
          allTags={allTags}
          confirmLabel="Add tags"
          onConfirm={(tags) =>
            runBulk(
              () => bulkAddTags(selectedIds, tags),
              (ok) => `Added ${tags.length} tag${tags.length === 1 ? "" : "s"} to ${ok} client${ok === 1 ? "" : "s"}`,
            )
          }
          onCancel={close}
        />
      )}

      {/* Remove tags */}
      {dialog?.kind === "removeTags" && (
        <TagPickerDialog
          title={`Remove tags from ${count} client${count === 1 ? "" : "s"}`}
          description="Tags will be removed from each selected client where present."
          allTags={allTags}
          confirmLabel="Remove tags"
          destructive
          onConfirm={(tags) =>
            runBulk(
              () => bulkRemoveTags(selectedIds, tags),
              (ok) => `Removed tags from ${ok} client${ok === 1 ? "" : "s"}`,
            )
          }
          onCancel={close}
        />
      )}

      {/* Reassign owner */}
      {dialog?.kind === "reassignOwner" && (
        <ReassignOwnerDialog
          count={count}
          owners={owners}
          onConfirm={(employeeId) =>
            runBulk(
              () => bulkReassignOwner(selectedIds, employeeId),
              (ok) => `Reassigned ${ok} client${ok === 1 ? "" : "s"}`,
            )
          }
          onCancel={close}
        />
      )}

      {/* Email-list toggle (confirmed via ConfirmDialog) */}
      {dialog?.kind === "emailListOn" && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && close()}
          title={`Mark ${count} as opted in?`}
          description="These clients will be added to the email list and included in promo blasts."
          confirmLabel="Mark opted in"
          onConfirm={() =>
            runBulk(
              () => bulkSetEmailList(selectedIds, true),
              (ok) => `Marked ${ok} client${ok === 1 ? "" : "s"} as opted in`,
            )
          }
        />
      )}
      {dialog?.kind === "emailListOff" && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && close()}
          title={`Mark ${count} as opted out?`}
          description="These clients will be removed from the email list. (Use Unsubscribe if they explicitly asked off.)"
          confirmLabel="Mark opted out"
          onConfirm={() =>
            runBulk(
              () => bulkSetEmailList(selectedIds, false),
              (ok) => `Marked ${ok} client${ok === 1 ? "" : "s"} as opted out`,
            )
          }
        />
      )}

      {/* Ban */}
      {dialog?.kind === "ban" && (
        <BanDialog
          count={count}
          onConfirm={(category, reason) =>
            runBulk(
              () => bulkBanClients(selectedIds, category, reason),
              (ok) => `Banned ${ok} client${ok === 1 ? "" : "s"}`,
            )
          }
          onCancel={close}
        />
      )}

      {/* Unsubscribe */}
      {dialog?.kind === "unsubscribe" && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && close()}
          title={`Unsubscribe ${count} client${count === 1 ? "" : "s"}?`}
          description="They'll be marked as unsubscribed and removed from the email list. Their email is added to the unsubscribe list."
          confirmLabel="Unsubscribe"
          variant="destructive"
          onConfirm={() =>
            runBulk(
              () => bulkUnsubscribeClients(selectedIds),
              (ok) => `Unsubscribed ${ok} client${ok === 1 ? "" : "s"}`,
            )
          }
        />
      )}

      {/* Delete */}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && close()}
          title={`Delete ${count} client${count === 1 ? "" : "s"}?`}
          description="They'll be soft-deleted and hidden from views. Managers can restore them from Settings."
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={() =>
            runBulk(
              () => bulkDeleteClients(selectedIds),
              (ok) => `Deleted ${ok} client${ok === 1 ? "" : "s"}`,
            )
          }
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tag picker dialog (used for Add tags and Remove tags)                       */
/* -------------------------------------------------------------------------- */

function TagPickerDialog({
  title,
  description,
  allTags,
  confirmLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  allTags: { name: string; usageCount: number }[];
  confirmLabel: string;
  destructive?: boolean;
  onConfirm(tags: string[]): void;
  onCancel(): void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (name: string) =>
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name],
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Command className="border rounded-md">
          <CommandInput placeholder="Search tags…" />
          <CommandList className="max-h-64">
            <CommandEmpty>No tags found.</CommandEmpty>
            <CommandGroup>
              {allTags.map((tag) => {
                const isSel = selected.includes(tag.name);
                return (
                  <CommandItem
                    key={tag.name}
                    value={tag.name}
                    onSelect={() => toggle(tag.name)}
                    className="flex items-center gap-2"
                  >
                    <div
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded border",
                        isSel ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30",
                      )}
                    >
                      {isSel && <span className="text-[10px]">✓</span>}
                    </div>
                    <span className="flex-1 truncate">{tag.name}</span>
                    {tag.usageCount > 0 && (
                      <Badge variant="secondary" className="text-[10px]">{tag.usageCount}</Badge>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={selected.length === 0}
            onClick={() => onConfirm(selected)}
          >
            {confirmLabel} ({selected.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Reassign owner dialog                                                       */
/* -------------------------------------------------------------------------- */

function ReassignOwnerDialog({
  count,
  owners,
  onConfirm,
  onCancel,
}: {
  count: number;
  owners: { id: string; name: string }[];
  onConfirm(employeeId: string | null): void;
  onCancel(): void;
}) {
  const [value, setValue] = useState<string>(""); // "" = unset, "__none__" = unassigned, else employee id
  const [open, setOpen] = useState(false);

  const selected = owners.find((o) => o.id === value);
  const label = value === "__none__" ? "Unassigned" : selected?.name ?? "Pick an owner";

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reassign {count} client{count === 1 ? "" : "s"}</DialogTitle>
          <DialogDescription>Pick a new owner or leave unassigned.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label>Owner</Label>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-between font-normal">
                {label}
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start">
              <Command>
                <CommandInput placeholder="Search owners…" />
                <CommandList>
                  <CommandEmpty>No results.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="Unassigned"
                      onSelect={() => { setValue("__none__"); setOpen(false); }}
                    >
                      Unassigned
                    </CommandItem>
                    {owners.map((o) => (
                      <CommandItem
                        key={o.id}
                        value={o.name}
                        onSelect={() => { setValue(o.id); setOpen(false); }}
                      >
                        {o.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button
            disabled={!value}
            onClick={() => onConfirm(value === "__none__" ? null : value)}
          >
            Reassign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Ban dialog                                                                  */
/* -------------------------------------------------------------------------- */

function BanDialog({
  count,
  onConfirm,
  onCancel,
}: {
  count: number;
  onConfirm(category: "Reselling" | "Gift Card Fraud" | "Other", reason: string): void;
  onCancel(): void;
}) {
  const [category, setCategory] = useState<"Reselling" | "Gift Card Fraud" | "Other">("Other");
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ban {count} client{count === 1 ? "" : "s"}</DialogTitle>
          <DialogDescription>
            The same category and reason will be applied to every selected client.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Reselling">Reselling</SelectItem>
                <SelectItem value="Gift Card Fraud">Gift Card Fraud</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe the reason for banning…"
              rows={3}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={acknowledged}
              onCheckedChange={(c) => setAcknowledged(c === true)}
            />
            <span>I understand this will ban all {count} selected clients.</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || !acknowledged}
            onClick={() => onConfirm(category, reason.trim())}
          >
            Ban {count}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
