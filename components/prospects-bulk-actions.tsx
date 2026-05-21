"use client";

import { useState, useTransition } from "react";
import { MailX, XCircle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { bulkRejectProspects, bulkUnsubscribeProspects } from "@/lib/actions/bulk-prospects";

interface ProspectsBulkToolbarProps {
  selectedIds: string[];
  onClearAction(): void;
}

type DialogKind = "reject" | "unsubscribe" | null;

export function ProspectsBulkToolbar({ selectedIds, onClearAction }: ProspectsBulkToolbarProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [, startTransition] = useTransition();

  const count = selectedIds.length;
  if (count === 0) return null;

  const close = () => setDialog(null);

  const runBulk = (
    action: () => Promise<{ ok: number; error?: string }>,
    successLabel: (ok: number) => string,
  ) => {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(successLabel(result.ok));
        onClearAction();
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
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            onClick={() => setDialog("unsubscribe")}
            className="text-destructive focus:text-destructive"
          >
            <MailX className="h-4 w-4 mr-2" />Unsubscribe…
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setDialog("reject")}
            className="text-destructive focus:text-destructive"
          >
            <XCircle className="h-4 w-4 mr-2" />Reject…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button variant="ghost" size="sm" onClick={onClearAction}>Clear</Button>

      {dialog === "unsubscribe" && (
        <ConfirmDialog
          open
          onOpenChangeAction={(o) => !o && close()}
          title={`Unsubscribe ${count} prospect${count === 1 ? "" : "s"}?`}
          description="They'll be marked as unsubscribed. Their email is added to the unsubscribe list."
          confirmLabel="Unsubscribe"
          variant="destructive"
          onConfirmAction={() =>
            runBulk(
              () => bulkUnsubscribeProspects(selectedIds),
              (ok) => `Unsubscribed ${ok} prospect${ok === 1 ? "" : "s"}`,
            )
          }
        />
      )}

      {dialog === "reject" && (
        <ConfirmDialog
          open
          onOpenChangeAction={(o) => !o && close()}
          title={`Reject ${count} prospect${count === 1 ? "" : "s"}?`}
          description="They'll be moved to the Rejected tab. This can't be undone from the UI."
          confirmLabel="Reject"
          variant="destructive"
          onConfirmAction={() =>
            runBulk(
              () => bulkRejectProspects(selectedIds),
              (ok) => `Rejected ${ok} prospect${ok === 1 ? "" : "s"}`,
            )
          }
        />
      )}
    </div>
  );
}
