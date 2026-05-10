"use client";

import { useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { banClient, unsubscribeClient, createApprovalRequest, deleteClient } from "@/lib/actions";
import { toast } from "sonner";
import { Ban, Bell, MailX, Trash2 } from "lucide-react";

interface ApprovalActionDialogProps {
  clientName: string;
  children: React.ReactNode;
  managerIcon: React.ReactNode;
  managerTitle: string;
  managerDescription: React.ReactNode;
  managerBody?: React.ReactNode;
  managerActionLabel: string;
  managerPendingLabel: string;
  onManagerAction: () => Promise<void>;
  managerSuccessMessage: string;
  managerErrorMessage?: string;
  associateTitle: string;
  associateDescription: string;
  associateReasonLabel: string;
  associatePlaceholder: string;
  onApprovalRequest: (reason: string) => Promise<void>;
  approvalSuccessMessage: string;
  approvalErrorMessage?: string;
}

function ApprovalActionDialog({
  clientName,
  children,
  managerIcon,
  managerTitle,
  managerDescription,
  managerBody,
  managerActionLabel,
  managerPendingLabel,
  onManagerAction,
  managerSuccessMessage,
  managerErrorMessage = "Action failed",
  associateTitle,
  associateDescription,
  associateReasonLabel,
  associatePlaceholder,
  onApprovalRequest,
  approvalSuccessMessage,
  approvalErrorMessage = "Failed to submit request",
}: ApprovalActionDialogProps) {
  const { data: session } = useSession();
  const isManager = session?.user?.role === "manager";
  const [open, setOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [pending, start] = useTransition();

  const handleManagerAction = () => {
    start(async () => {
      try {
        await onManagerAction();
        toast.success(managerSuccessMessage);
        setOpen(false);
      } catch {
        toast.error(managerErrorMessage);
      }
    });
  };

  const handleApprovalRequest = () => {
    start(async () => {
      try {
        await onApprovalRequest(reportReason);
        toast.success(approvalSuccessMessage);
        setReportReason("");
        setOpen(false);
      } catch {
        toast.error(approvalErrorMessage);
      }
    });
  };

  if (!isManager) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              {associateTitle}
            </DialogTitle>
            <DialogDescription>{associateDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border p-3 text-sm">
              <span className="font-medium">{clientName}</span>
            </div>
            <div className="space-y-2">
              <Label>{associateReasonLabel}</Label>
              <Textarea
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder={associatePlaceholder}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!reportReason.trim() || pending}
              onClick={handleApprovalRequest}
            >
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {managerIcon}
            {managerTitle}
          </DialogTitle>
          <DialogDescription>{managerDescription}</DialogDescription>
        </DialogHeader>
        {managerBody && <div className="space-y-4 py-2">{managerBody}</div>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="destructive" disabled={pending} onClick={handleManagerAction}>
            {pending ? managerPendingLabel : managerActionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Ban Customer ──────────────────────────────────────────────────────── */

export function BanCustomerDialog({
  clientId,
  clientName,
  children,
}: {
  clientId: string;
  clientName: string;
  children: React.ReactNode;
}) {
  const [category, setCategory] = useState<"Reselling" | "Gift Card Fraud" | "Other">("Other");
  const [reason, setReason] = useState("");

  return (
    <ApprovalActionDialog
      clientName={clientName}
      managerIcon={<Ban className="h-5 w-5" />}
      managerTitle="Ban Customer"
      managerDescription={
        <>Ban <strong>{clientName}</strong> from doing business with the store. This action will change their status to &quot;banned&quot;.</>
      }
      managerBody={
        <>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as "Reselling" | "Gift Card Fraud" | "Other")}
            >
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
        </>
      }
      managerActionLabel="Ban Customer"
      managerPendingLabel="Banning…"
      onManagerAction={async () => {
        await banClient(clientId, category, reason);
        setReason("");
        setCategory("Other");
      }}
      managerSuccessMessage={`${clientName} has been banned`}
      managerErrorMessage="Failed to ban customer"
      associateTitle="Request Ban Approval"
      associateDescription="Only managers can ban customers. Describe the issue and your manager will review this request."
      associateReasonLabel="Reason for ban request"
      associatePlaceholder="Describe why this customer should be banned…"
      onApprovalRequest={async (r) => {
        const result = await createApprovalRequest("ban", clientId, r, { category });
        if ("error" in result) throw new Error(result.error);
      }}
      approvalSuccessMessage={`Ban request for ${clientName} sent to your manager`}
      approvalErrorMessage="Failed to submit ban request"
    >
      {children}
    </ApprovalActionDialog>
  );
}

/* ── Unsubscribe Customer ──────────────────────────────────────────────── */

export function UnsubscribeCustomerDialog({
  clientId,
  clientName,
  children,
}: {
  clientId: string;
  clientName: string;
  children: React.ReactNode;
}) {
  return (
    <ApprovalActionDialog
      clientName={clientName}
      managerIcon={<MailX className="h-5 w-5" />}
      managerTitle="Unsubscribe Customer"
      managerDescription={
        <>Remove <strong>{clientName}</strong> from the email list and mark them as unsubscribed. They will no longer receive marketing emails.</>
      }
      managerActionLabel="Unsubscribe"
      managerPendingLabel="Unsubscribing…"
      onManagerAction={async () => { await unsubscribeClient(clientId); }}
      managerSuccessMessage={`${clientName} has been unsubscribed`}
      managerErrorMessage="Failed to unsubscribe customer"
      associateTitle="Request Unsubscribe Approval"
      associateDescription="Only managers can unsubscribe customers. Describe the issue and your manager will review this request."
      associateReasonLabel="Reason for unsubscribe request"
      associatePlaceholder="Describe why this customer should be unsubscribed…"
      onApprovalRequest={async (r) => {
        const result = await createApprovalRequest("unsubscribe", clientId, r);
        if ("error" in result) throw new Error(result.error);
      }}
      approvalSuccessMessage={`Unsubscribe request for ${clientName} sent to your manager`}
      approvalErrorMessage="Failed to submit unsubscribe request"
    >
      {children}
    </ApprovalActionDialog>
  );
}

/* ── Delete Customer ───────────────────────────────────────────────────── */

export function DeleteCustomerDialog({
  clientId,
  clientName,
  children,
}: {
  clientId: string;
  clientName: string;
  children: React.ReactNode;
}) {
  return (
    <ApprovalActionDialog
      clientName={clientName}
      managerIcon={<Trash2 className="h-5 w-5" />}
      managerTitle="Delete Client"
      managerDescription={
        <>Are you sure you want to delete <strong>{clientName}</strong>? This hides the client from all views. It can be restored by a manager from Settings.</>
      }
      managerActionLabel="Delete"
      managerPendingLabel="Deleting…"
      onManagerAction={async () => {
        const r = await deleteClient(clientId);
        if (r?.error) throw new Error(r.error);
        window.location.href = "/clients";
      }}
      managerSuccessMessage="Client deleted"
      managerErrorMessage="Failed to delete client"
      associateTitle="Request Delete Approval"
      associateDescription="Only managers can delete clients. Describe the reason and your manager will review this request."
      associateReasonLabel="Reason for deletion request"
      associatePlaceholder="Describe why this client should be deleted…"
      onApprovalRequest={async (r) => {
        const result = await createApprovalRequest("delete", clientId, r);
        if ("error" in result) throw new Error(result.error);
      }}
      approvalSuccessMessage={`Delete request for ${clientName} sent to your manager`}
      approvalErrorMessage="Failed to submit delete request"
    >
      {children}
    </ApprovalActionDialog>
  );
}
