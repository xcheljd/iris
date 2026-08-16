"use client";

import { useState, useTransition } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, UserCheck, X, BellOff } from "lucide-react";
import { toast } from "sonner";
import { rejectProspect, unsubscribeProspect } from "@/lib/actions";
import { GraduateProspectDialog } from "@/components/graduate-prospect-dialog";
import type { ProspectListRow } from "@/lib/queries";

interface ProspectActionsMenuProps {
  prospect: ProspectListRow;
}

export function ProspectActionsMenu({ prospect }: ProspectActionsMenuProps) {
  const [graduateOpen, setGraduateOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleReject = () => {
    startTransition(async () => {
      try {
        await rejectProspect(prospect.id);
        toast.success("Prospect rejected");
      } catch {
        toast.error("Failed to reject prospect");
      }
    });
  };

  const handleUnsubscribe = () => {
    startTransition(async () => {
      try {
        await unsubscribeProspect(prospect.id);
        toast.success("Prospect unsubscribed");
      } catch {
        toast.error("Failed to unsubscribe prospect");
      }
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="size-8 p-0" disabled={pending}>
            <MoreHorizontal className="size-4" />
            <span className="sr-only">Actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setGraduateOpen(true)}>
            <UserCheck className="size-4 mr-2" />
            Graduate to Client
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleUnsubscribe} disabled={pending}>
            <BellOff className="size-4 mr-2" />
            Unsubscribe
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={handleReject}
            disabled={pending}
            className="text-destructive focus:text-destructive"
          >
            <X className="size-4 mr-2" />
            Reject
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <GraduateProspectDialog
        prospect={prospect}
        open={graduateOpen}
        onOpenChangeAction={setGraduateOpen}
      />
    </>
  );
}
