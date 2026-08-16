"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import {
  ShieldCheck,
  Ban,
  MailX,
  Trash2,
  Clock,
  CheckCircle2,
  XCircle,
  User,
} from "lucide-react";
import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { reviewApprovalRequest } from "@/lib/actions";
import { toast } from "sonner";
import { daysAgo } from "@/lib/utils";

interface ApprovalRequest {
  request: {
    id: string;
    type: "ban" | "unsubscribe" | "delete";
    clientId: string;
    requestorId: string;
    reason: string;
    status: "pending" | "approved" | "rejected";
    reviewedById: string | null;
    reviewedAt: Date | null;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
  };
  clientName: string;
  requestorName: string;
}

interface ApprovalsContentProps {
  requests: ApprovalRequest[];
}

function getTypeBadge(type: ApprovalRequest["request"]["type"]) {
  switch (type) {
    case "ban":
      return <Badge variant="destructive">Ban</Badge>;
    case "unsubscribe":
      return (
        <Badge className="bg-orange-600 hover:bg-orange-600/90 text-white">
          Unsubscribe
        </Badge>
      );
    case "delete":
      return (
        <Badge variant="destructive">Delete</Badge>
      );
  }
}



function getRelativeTimeString(createdAt: Date): string {
  const days = daysAgo(createdAt);
  if (days === null) return "";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

export function ApprovalsContent({ requests: initialRequests }: ApprovalsContentProps) {
  const [requests, setRequests] = useState(initialRequests);
  const [confirmAction, setConfirmAction] = useState<{
    id: string;
    action: "approve" | "reject";
    clientName: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleReview = (id: string, approved: boolean) => {
    startTransition(async () => {
      const result = await reviewApprovalRequest(id, approved);
      if (result?.error) {
        toast.error(result.error);
      } else {
        setRequests((prev) => prev.filter((r) => r.request.id !== id));
        toast.success(approved ? "Request approved" : "Request rejected");
      }
      setConfirmAction(null);
    });
  };

  const banCount = requests.filter((r) => r.request.type === "ban").length;
  const unsubscribeCount = requests.filter(
    (r) => r.request.type === "unsubscribe"
  ).length;
  const deleteCount = requests.filter((r) => r.request.type === "delete").length;

  return (
    <>
      <Topbar title="Approvals" />
      <div className="flex-1 p-4 md:p-6" data-tour="approvals">
        <div className="mb-6">
          <h1 className="sr-only">Approvals</h1>
          <p className="text-muted-foreground">
            Review and manage approval requests from your team
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Ban Requests</p>
                  <p className="text-2xl font-bold text-destructive">{banCount}</p>
                </div>
                <Ban className="size-8 text-destructive" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Unsubscribe Requests</p>
                  <p className="text-2xl font-bold text-orange-500">{unsubscribeCount}</p>
                </div>
                <MailX className="size-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Delete Requests</p>
                  <p className="text-2xl font-bold">{deleteCount}</p>
                </div>
                <Trash2 className="size-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pending Requests */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Pending Requests</CardTitle>
              {requests.length > 0 && (
                <Badge variant="secondary">
                  {requests.length} request{requests.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {requests.length === 0 ? (
              <EmptyState
                icon={ShieldCheck}
                title="No pending requests"
                description="All approval requests have been handled. New requests from your team will appear here."
              />
            ) : (
              <div className="flex flex-col gap-3">
                {requests.map((item) => (
                  <div
                    key={item.request.id}
                    className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex flex-col flex-1 min-w-0 gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {getTypeBadge(item.request.type)}
                          <Link
                            href={`/clients/${item.request.clientId}`}
                            className="font-medium hover:underline"
                          >
                            {item.clientName}
                          </Link>
                        </div>

                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {item.request.reason}
                        </p>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <User className="size-3" />
                            Requested by {item.requestorName}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="size-3" />
                            {getRelativeTimeString(item.request.createdAt)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="default"
                          disabled={isPending}
                          onClick={() =>
                            setConfirmAction({
                              id: item.request.id,
                              action: "approve",
                              clientName: item.clientName,
                            })
                          }
                          className="gap-1"
                        >
                          <CheckCircle2 className="size-3.5" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() =>
                            setConfirmAction({
                              id: item.request.id,
                              action: "reject",
                              clientName: item.clientName,
                            })
                          }
                          className="gap-1 text-destructive hover:text-destructive"
                        >
                          <XCircle className="size-3.5" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={!!confirmAction}
        onOpenChangeAction={(open) => !open && setConfirmAction(null)}
        title={
          confirmAction?.action === "approve"
            ? "Approve Request"
            : "Reject Request"
        }
        description={
          <>
            Are you sure you want to{" "}
            {confirmAction?.action === "approve" ? "approve" : "reject"} the
            request for{" "}
            <strong>{confirmAction?.clientName}</strong>?
          </>
        }
        confirmLabel={confirmAction?.action === "approve" ? "Approve" : "Reject"}
        onConfirmAction={() =>
          confirmAction &&
          handleReview(confirmAction.id, confirmAction.action === "approve")
        }
        variant={confirmAction?.action === "reject" ? "destructive" : "default"}
        disabled={isPending}
      />
    </>
  );
}
