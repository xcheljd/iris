"use client";

import { useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import {
  Dialog,
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

/* ── Ban Customer ──────────────────────────────────────────────── */

export function BanCustomerDialog({
  clientId,
  clientName,
  children,
}: {
  clientId: string;
  clientName: string;
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const isManager = session?.user?.role === "manager";
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<"Reselling" | "Gift Card Fraud" | "Other">("Other");
  const [reason, setReason] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [pending, start] = useTransition();

  const handleBan = () => {
    start(async () => {
      await banClient(clientId, category, reason);
      toast.success(`${clientName} has been banned`);
      setOpen(false);
      setReason("");
      setCategory("Other");
    });
  };

  // Associates see a "report to manager" dialog
  if (!isManager) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <div onClick={() => setOpen(true)} className="contents">
          {children}
        </div>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Request Ban Approval
            </DialogTitle>
            <DialogDescription>
              Only managers can ban customers. Describe the issue and your
              manager will review this request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border p-3 text-sm">
              <span className="font-medium">{clientName}</span>
            </div>
            <div className="space-y-2">
              <Label>Reason for ban request</Label>
              <Textarea
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="Describe why this customer should be banned…"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!reportReason.trim() || pending}
              onClick={() => {
                start(async () => {
                  try {
                    await createApprovalRequest("ban", clientId, reportReason, { category });
                    toast.success(`Ban request for ${clientName} sent to your manager`);
                    setReportReason("");
                    setOpen(false);
                  } catch {
                    toast.error("Failed to submit ban request");
                  }
                });
              }}
            >
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Managers see the full ban form
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div onClick={() => setOpen(true)} className="contents">
        {children}
      </div>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5" />
            Ban Customer
          </DialogTitle>
          <DialogDescription>
            Ban <strong>{clientName}</strong> from doing business with the store.
            This action will change their status to &quot;banned&quot;.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={category}
              onValueChange={(v) =>
                setCategory(v as "Reselling" | "Gift Card Fraud" | "Other")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Reselling">Reselling</SelectItem>
                <SelectItem value="Gift Card Fraud">
                  Gift Card Fraud
                </SelectItem>
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={handleBan}
          >
            {pending ? "Banning…" : "Ban Customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Unsubscribe Customer ──────────────────────────────────────── */

export function UnsubscribeCustomerDialog({
  clientId,
  clientName,
  children,
}: {
  clientId: string;
  clientName: string;
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const isManager = session?.user?.role === "manager";
  const [open, setOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [pending, start] = useTransition();

  const handleUnsubscribe = () => {
    start(async () => {
      await unsubscribeClient(clientId);
      toast.success(`${clientName} has been unsubscribed`);
      setOpen(false);
    });
  };

  // Associates see a "report to manager" dialog
  if (!isManager) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <div onClick={() => setOpen(true)} className="contents">
          {children}
        </div>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Request Unsubscribe Approval
            </DialogTitle>
            <DialogDescription>
              Only managers can unsubscribe customers. Describe the issue and
              your manager will review this request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border p-3 text-sm">
              <span className="font-medium">{clientName}</span>
            </div>
            <div className="space-y-2">
              <Label>Reason for unsubscribe request</Label>
              <Textarea
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="Describe why this customer should be unsubscribed…"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!reportReason.trim() || pending}
              onClick={() => {
                start(async () => {
                  try {
                    await createApprovalRequest("unsubscribe", clientId, reportReason);
                    toast.success(`Unsubscribe request for ${clientName} sent to your manager`);
                    setReportReason("");
                    setOpen(false);
                  } catch {
                    toast.error("Failed to submit unsubscribe request");
                  }
                });
              }}
            >
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Managers see a confirmation dialog
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div onClick={() => setOpen(true)} className="contents">
        {children}
      </div>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MailX className="h-5 w-5" />
            Unsubscribe Customer
          </DialogTitle>
          <DialogDescription>
            Remove <strong>{clientName}</strong> from the email list and mark
            them as unsubscribed. They will no longer receive marketing emails.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={handleUnsubscribe}
          >
            {pending ? "Unsubscribing…" : "Unsubscribe"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Delete Customer ──────────────────────────────────────────────── */

export function DeleteCustomerDialog({
  clientId,
  clientName,
  children,
}: {
  clientId: string;
  clientName: string;
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const isManager = session?.user?.role === "manager";
  const [open, setOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [pending, start] = useTransition();

  // Associates see a "request approval" dialog
  if (!isManager) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <div onClick={() => setOpen(true)} className="contents">
          {children}
        </div>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Request Delete Approval
            </DialogTitle>
            <DialogDescription>
              Only managers can delete clients. Describe the reason and your
              manager will review this request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border p-3 text-sm">
              <span className="font-medium">{clientName}</span>
            </div>
            <div className="space-y-2">
              <Label>Reason for deletion request</Label>
              <Textarea
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="Describe why this client should be deleted…"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!reportReason.trim() || pending}
              onClick={() => {
                start(async () => {
                  try {
                    await createApprovalRequest("delete", clientId, reportReason);
                    toast.success(`Delete request for ${clientName} sent to your manager`);
                    setReportReason("");
                    setOpen(false);
                  } catch {
                    toast.error("Failed to submit delete request");
                  }
                });
              }}
            >
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Managers see a confirmation dialog
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div onClick={() => setOpen(true)} className="contents">
        {children}
      </div>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Delete Client
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{clientName}</strong>? This
            hides the client from all views. It can be restored by a manager from
            Settings.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => {
              start(async () => {
                try {
                  await deleteClient(clientId);
                  toast.success("Client deleted");
                  setOpen(false);
                  window.location.href = "/clients";
                } catch {
                  toast.error("Failed to delete client");
                }
              });
            }}
          >
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
