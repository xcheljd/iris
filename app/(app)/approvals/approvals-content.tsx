"use client";

import { useState, useMemo, useTransition } from "react";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { BadgeProps } from "@/components/ui/badge";

import {
  ShieldCheck,
  Ban,
  MailX,
  Trash2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { EmptyState } from "@/components/empty-state";
import { SearchInput } from "@/components/search-input";
import { StatsCard } from "@/components/stats-card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { TableCell } from "@/components/ui/table";
import { RelativeDateCell, StatusBadgeCell, TextCell } from "@/components/data-table/cells";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { reviewApprovalRequest } from "@/lib/actions";
import { toast } from "sonner";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

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

type RequestType = ApprovalRequest["request"]["type"];

const TYPE_LABELS: Record<RequestType, string> = {
  ban: "Ban",
  unsubscribe: "Unsubscribe",
  delete: "Delete",
};

/**
 * Badge treatment per request type. Amber for unsubscribe is the tinted
 * counterpart of the solid orange the card rows used — the cell vocabulary
 * renders a `Badge` variant, and unsubscribe is the softer of the three asks.
 */
const TYPE_VARIANTS: Record<RequestType, BadgeProps["variant"]> = {
  ban: "destructive",
  unsubscribe: "amber",
  delete: "destructive",
};

export function ApprovalsContent({ requests: initialRequests }: ApprovalsContentProps) {
  const [requests, setRequests] = useState(initialRequests);
  const [search, setSearch] = useState("");
  const [confirmAction, setConfirmAction] = useState<{
    id: string;
    action: "approve" | "reject";
    clientName: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  // The whole pending queue is already in the browser, so the engine owns the
  // sorted and paginated row models; search still narrows `data` first.
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZE });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter(
      (r) =>
        r.clientName.toLowerCase().includes(q) ||
        r.requestorName.toLowerCase().includes(q) ||
        r.request.reason.toLowerCase().includes(q) ||
        TYPE_LABELS[r.request.type].toLowerCase().includes(q),
    );
  }, [requests, search]);

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

  // The stat cards describe the whole queue, not the page or the search.
  const banCount = requests.filter((r) => r.request.type === "ban").length;
  const unsubscribeCount = requests.filter(
    (r) => r.request.type === "unsubscribe"
  ).length;
  const deleteCount = requests.filter((r) => r.request.type === "delete").length;

  // Rebuilt every render — cheap, because the engine keys its row model on
  // `data` alone, and the Actions cell has to see the current pending flag.
  const columns: DataTableColumn<ApprovalRequest>[] = [
    {
      id: "type",
      accessorFn: (r) => TYPE_LABELS[r.request.type],
      meta: { headClassName: "w-28" },
      header: (ctx) => <DataTableColumnHeader ctx={ctx} label="Type" />,
      cell: ({ row: { original: r } }) => (
        <StatusBadgeCell label={TYPE_LABELS[r.request.type]} variant={TYPE_VARIANTS[r.request.type]} />
      ),
    },
    {
      id: "client",
      accessorFn: (r) => r.clientName,
      header: (ctx) => <DataTableColumnHeader ctx={ctx} label="Client" />,
      cell: ({ row: { original: r } }) => (
        <TableCell>
          <Link href={`/clients/${r.request.clientId}`} className="font-medium hover:underline">
            {r.clientName}
          </Link>
        </TableCell>
      ),
    },
    {
      id: "reason",
      accessorFn: (r) => r.request.reason,
      enableSorting: false,
      header: (ctx) => <DataTableColumnHeader ctx={ctx} label="Reason" />,
      cell: ({ row: { original: r } }) => (
        <TextCell value={r.request.reason} className="max-w-[360px] text-sm text-muted-foreground" />
      ),
    },
    {
      id: "requestor",
      accessorFn: (r) => r.requestorName,
      meta: { headClassName: "hidden md:table-cell" },
      header: (ctx) => <DataTableColumnHeader ctx={ctx} label="Requested by" />,
      cell: ({ row: { original: r } }) => (
        <TextCell value={r.requestorName} className="hidden md:table-cell text-sm" />
      ),
    },
    {
      id: "createdAt",
      // The timestamp, not the Date: the page JSON-round-trips these rows, so
      // the value arrives as a string at runtime and a string comparator would
      // order them alphabetically.
      accessorFn: (r) => (r.request.createdAt ? new Date(r.request.createdAt).getTime() : 0),
      meta: { headClassName: "hidden sm:table-cell" },
      header: (ctx) => <DataTableColumnHeader ctx={ctx} label="Requested" />,
      cell: ({ row: { original: r } }) => (
        <RelativeDateCell value={r.request.createdAt} className="hidden sm:table-cell" />
      ),
    },
    {
      id: "actions",
      enableSorting: false,
      meta: { headClassName: "text-right" },
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row: { original: r } }) => (
        <TableCell className="text-right">
          {/* Inline, not a menu: a review queue is decided per row, the way
              Settings → Deleted offers Restore/Purge on its rows. */}
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="default"
              disabled={isPending}
              onClick={() =>
                setConfirmAction({ id: r.request.id, action: "approve", clientName: r.clientName })
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
                setConfirmAction({ id: r.request.id, action: "reject", clientName: r.clientName })
              }
              className="gap-1 text-destructive hover:text-destructive"
            >
              <XCircle className="size-3.5" />
              Reject
            </Button>
          </div>
        </TableCell>
      ),
    },
  ];

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
          <StatsCard label="Ban Requests" value={banCount} icon={Ban} iconClassName="text-destructive" valueClassName="text-destructive" />
          <StatsCard label="Unsubscribe Requests" value={unsubscribeCount} icon={MailX} iconClassName="text-orange-500" valueClassName="text-orange-500" />
          <StatsCard label="Delete Requests" value={deleteCount} icon={Trash2} />
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
            {requests.length > 0 && (
              <SearchInput
                placeholder="Search by client, requester, type or reason..."
                value={search}
                onChangeAction={(v) => {
                  setSearch(v);
                  setPagination((p) => ({ ...p, pageIndex: 0 }));
                }}
                className="mt-3 max-w-sm"
              />
            )}
          </CardHeader>
          <CardContent>
            {requests.length === 0 ? (
              <EmptyState
                icon={ShieldCheck}
                title="No pending requests"
                description="All approval requests have been handled. New requests from your team will appear here."
              />
            ) : filtered.length === 0 ? (
              <EmptyState description="No requests match your search" compact />
            ) : (
              <DataTable
                chrome={false}
                columns={columns}
                data={filtered}
                getRowId={(r) => r.request.id}
                // Search already narrowed `data`, and a re-sort must not
                // bounce the reviewer off the page they were working.
                autoResetPageIndex={false}
                state={{ sorting, pagination }}
                onSortingChange={setSorting}
                onPaginationChange={setPagination}
                rowClassName={() => "hover:bg-muted/50"}
                pagination={{ itemLabel: "requests", showBorder: true }}
              />
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
