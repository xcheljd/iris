"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { PaginationState, RowSelectionState, SortingState } from "@tanstack/react-table";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsCard } from "@/components/stats-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SearchInput } from "@/components/search-input";
import { EmptyState } from "@/components/empty-state";
import { TableCell } from "@/components/ui/table";
import { DateTimeCell, MonoCell, TextCell } from "@/components/data-table/cells";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MailX,
  Mail,
  Trash2,
  Plus,
  AlertCircle,
  ExternalLink,
  MoreHorizontal,
  UserX,
} from "lucide-react";
import { addUnsubscribeEmail, removeUnsubscribeEntry, resubscribeClient } from "@/lib/actions";
import { toast } from "sonner";
import { isAfter, isBefore, subDays, startOfMonth, endOfMonth } from "date-fns";
import Link from "next/link";
import { Topbar } from "@/components/topbar";

interface UnsubscribedRow {
  unsub: {
    id: string;
    email: string;
    unsubscribedAt: Date;
  };
  clientId: string | null;
  firstName: string | null;
  lastName: string | null;
  customerId: string | null;
}

type DateRange = "all" | "7d" | "30d" | "90d" | "this_month";

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

function filterByDate(records: UnsubscribedRow[], range: DateRange): UnsubscribedRow[] {
  const now = new Date();
  switch (range) {
    case "7d":
      return records.filter((r) => isAfter(r.unsub.unsubscribedAt, subDays(now, 7)));
    case "30d":
      return records.filter((r) => isAfter(r.unsub.unsubscribedAt, subDays(now, 30)));
    case "90d":
      return records.filter((r) => isAfter(r.unsub.unsubscribedAt, subDays(now, 90)));
    case "this_month":
      return records.filter(
        (r) => isAfter(r.unsub.unsubscribedAt, startOfMonth(now)) && isBefore(r.unsub.unsubscribedAt, endOfMonth(now))
      );
    default:
      return records;
  }
}

export function UnsubscribedContent({ list: initialList, isManager }: { list: UnsubscribedRow[]; isManager: boolean }) {
  const router = useRouter();
  const [list, setList] = useState(initialList);
  const [searchQuery, setSearchQuery] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addEmailError, setAddEmailError] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  // The whole list is already in the browser, so the engine owns the row
  // models and this component only holds the state slices it feeds them —
  // search and the date range still filter `data` before it goes in.
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZE });
  const [removeTarget, setRemoveTarget] = useState<UnsubscribedRow | null>(null);
  const [batchRemoveOpen, setBatchRemoveOpen] = useState(false);

  const toFirstPage = () => setPagination((p) => ({ ...p, pageIndex: 0 }));

  const filteredBySearch = useMemo(
    () =>
      searchQuery
        ? list.filter((l) => {
            const q = searchQuery.toLowerCase();
            return (
              l.unsub.email.toLowerCase().includes(q) ||
              (l.firstName || "").toLowerCase().includes(q) ||
              (l.lastName || "").toLowerCase().includes(q) ||
              (l.customerId || "").toLowerCase().includes(q)
            );
          })
        : list,
    [list, searchQuery]
  );

  const filteredList = useMemo(
    () => filterByDate(filteredBySearch, dateRange),
    [filteredBySearch, dateRange]
  );

  // Selection is keyed by unsubscribe-record id (`getRowId` below), so the map
  // keys are the ids the bulk remove needs — minus any toggled back off.
  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection],
  );

  // A row with no `clientId` is an orphan suppression-list entry — a seeded
  // opt-out or a Quick Add for a non-client. It still renders a destructive
  // "Remove" button, so it needs a removal path that isn't keyed on a client:
  // `removeUnsubscribeEntry` deletes the row by its own id.
  const handleRemove = async (row: UnsubscribedRow) => {
    try {
      if (row.clientId) {
        await resubscribeClient(row.clientId);
      } else {
        const res = await removeUnsubscribeEntry(row.unsub.id);
        if (res?.error) {
          toast.error(res.error);
          return;
        }
      }
      setList(list.filter((l) => l.unsub.id !== row.unsub.id));
      setRowSelection((prev) => {
        const next = { ...prev };
        delete next[row.unsub.id];
        return next;
      });
      toast.success("Removed from unsubscribe list");
    } catch {
      toast.error("Failed to remove");
    } finally {
      setRemoveTarget(null);
    }
  };

  // The local diff and the toast are both driven by what actually came back
  // removed. Before, this awaited only the rows *with* a clientId, then
  // spliced every selected id out of local state and toasted
  // `Removed ${selected.size}`: select three rows where one is unmatched and
  // you got two server calls, three rows gone from the list, "Removed 3
  // records", and the third back on the next refresh.
  const handleBatchRemove = async () => {
    const selected = new Set(selectedIds);
    const rows = list.filter((l) => selected.has(l.unsub.id));

    // allSettled, not all: one failure must not discard the outcome of the
    // rows that did succeed.
    const results = await Promise.allSettled(
      rows.map(async (row) => {
        if (row.clientId) {
          await resubscribeClient(row.clientId);
        } else {
          const res = await removeUnsubscribeEntry(row.unsub.id);
          if (res?.error) throw new Error(res.error);
        }
        return row.unsub.id;
      }),
    );

    const removed = new Set(
      results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
    );
    // Functional updater: N actions resolve against one render's `list`, so a
    // captured array would let the last one to settle resurrect the rest.
    setList((prev) => prev.filter((l) => !removed.has(l.unsub.id)));
    // Keep failed rows selected so they can be retried.
    setRowSelection((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([id]) => !removed.has(id))),
    );

    if (removed.size > 0) {
      toast.success(`Removed ${removed.size} record${removed.size !== 1 ? "s" : ""}`);
    }
    const failed = results.length - removed.size;
    if (failed > 0) {
      toast.error(`Failed to remove ${failed} record${failed !== 1 ? "s" : ""}`);
    }
    setBatchRemoveOpen(false);
  };

  const handleResubscribe = async (record: UnsubscribedRow) => {
    if (!record.clientId) return;
    try {
      await resubscribeClient(record.clientId);
      setList(list.filter((l) => l.unsub.id !== record.unsub.id));
      toast.success(`${record.firstName || ""} ${record.lastName || ""} resubscribed successfully`);
    } catch {
      toast.error("Failed to resubscribe client");
    }
  };

  const handleAddEmail = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!addEmail.trim()) {
      setAddEmailError("Email is required");
      return;
    }
    if (!emailRegex.test(addEmail.trim())) {
      setAddEmailError("Please enter a valid email address");
      return;
    }
    if (list.some((l) => l.unsub.email.toLowerCase() === addEmail.trim().toLowerCase())) {
      setAddEmailError("This email is already on the list");
      return;
    }
    setAddEmailError("");
    const result = await addUnsubscribeEmail(addEmail.trim());
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Email added to unsubscribe list");
    router.refresh();
  };

  const matchCount = list.filter((l) => l.clientId).length;

  // Rebuilt every render — cheap, because the engine keys its row model on
  // `data` alone, and the Actions cell has to see the current handlers. The
  // date column sorts on the timestamp rather than the Date object so the
  // comparator never falls back to string ordering.
  const columns: DataTableColumn<UnsubscribedRow>[] = [
    {
      id: "name",
      accessorFn: (r) => `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim(),
      header: (ctx) => <DataTableColumnHeader ctx={ctx} label="Name" />,
      cell: ({ row: { original: r } }) =>
        r.clientId ? (
          <TableCell>
            <Link href={`/clients/${r.clientId}`} className="text-sm font-medium hover:underline">
              {r.firstName} {r.lastName || ""}
            </Link>
          </TableCell>
        ) : (
          <TableCell className="text-sm text-muted-foreground">No client match</TableCell>
        ),
    },
    {
      id: "customerId",
      accessorFn: (r) => r.customerId,
      meta: { headClassName: "hidden sm:table-cell" },
      header: (ctx) => <DataTableColumnHeader ctx={ctx} label="Customer ID" />,
      cell: ({ row: { original: r } }) => (
        <MonoCell value={r.customerId ? `#${r.customerId}` : null} className="hidden sm:table-cell text-xs" />
      ),
    },
    {
      id: "email",
      accessorFn: (r) => r.unsub.email,
      header: (ctx) => <DataTableColumnHeader ctx={ctx} label="Email" />,
      cell: ({ row: { original: r } }) => <TextCell value={r.unsub.email} className="text-sm" />,
    },
    {
      id: "unsubscribedAt",
      accessorFn: (r) => (r.unsub.unsubscribedAt ? new Date(r.unsub.unsubscribedAt).getTime() : 0),
      meta: { headClassName: "text-right" },
      header: (ctx) => <DataTableColumnHeader ctx={ctx} align="right" label="Unsubscribed" />,
      cell: ({ row: { original: r } }) => <DateTimeCell value={r.unsub.unsubscribedAt} className="text-right" />,
    },
    {
      id: "actions",
      enableSorting: false,
      meta: { headClassName: "w-10" },
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row: { original: r } }) => (
        <TableCell className="text-right">
          {isManager ? (
            r.clientId ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="size-7 p-0" aria-label="Actions">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/clients/${r.clientId}`}>
                      <ExternalLink className="size-4 mr-2" />
                      View Client
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleResubscribe(r)}>
                    <Mail className="size-4 mr-2" />
                    Resubscribe
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setRemoveTarget(r)}
                  >
                    <Trash2 className="size-4 mr-2" />
                    Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="destructive" size="sm" className="h-7" onClick={() => setRemoveTarget(r)}>
                    <Trash2 className="size-3.5 mr-1" />
                    Remove
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Remove from unsubscribe list</TooltipContent>
              </Tooltip>
            )
          ) : r.clientId ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="size-7 p-0" asChild>
                  <Link href={`/clients/${r.clientId}`}>
                    <ExternalLink className="size-4" />
                    <span className="sr-only">View Client</span>
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>View Client</TooltipContent>
            </Tooltip>
          ) : null}
        </TableCell>
      ),
    },
  ];

  return (
    <>
      <Topbar title="Unsubscribed" />
      <div className="flex-1 p-4 md:p-6">
      <div className="mb-6">
        <h1 className="sr-only">Unsubscribed</h1>
        <p className="text-muted-foreground mt-1">
          Manage email unsubscribe list for compliance
        </p>
      </div>

      {/* Stats + Quick Add */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatsCard label="Total Unsubscribed" value={list.length} icon={MailX} />
        <StatsCard label="Matched Clients" value={matchCount} icon={UserX} iconClassName="text-orange-500" />
        <Card>
          <CardContent className="pt-6">
            {isManager ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">Quick Add Email</p>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      placeholder="email@example.com"
                      value={addEmail}
                      onChange={(e) => {
                        setAddEmail(e.target.value);
                        setAddEmailError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddEmail();
                      }}
                      className={addEmailError ? "border-destructive" : ""}
                    />
                    {addEmailError && (
                      <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                        <AlertCircle className="size-3" />
                        {addEmailError}
                      </p>
                    )}
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" onClick={handleAddEmail}>
                        <Plus className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Add to unsubscribe list (detects existing clients)</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm text-muted-foreground">Quick Add Email</p>
                <p className="text-sm text-muted-foreground mt-2">Manager access required to add emails</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Unsubscribe List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <CardTitle>Unsubscribe List</CardTitle>
              {filteredList.length > 0 && (
                <Badge variant="secondary">
                  {filteredList.length} record{filteredList.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isManager && selectedIds.length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setBatchRemoveOpen(true)}
                >
                  <Trash2 className="size-4 mr-1" />
                  Remove ({selectedIds.length})
                </Button>
              )}
              <Select value={dateRange} onValueChange={(v) => { setDateRange(v as DateRange); toFirstPage(); }}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="7d">Last 7 Days</SelectItem>
                  <SelectItem value="30d">Last 30 Days</SelectItem>
                  <SelectItem value="90d">Last 90 Days</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <SearchInput
            placeholder="Search by email, name, or customer ID..."
            value={searchQuery}
            onChangeAction={(v) => { setSearchQuery(v); toFirstPage(); }}
          />
        </CardHeader>
        <CardContent>
          {filteredList.length === 0 ? (
            <EmptyState
              icon={Mail}
              title={searchQuery || dateRange !== "all" ? "No matching records" : "No unsubscribed emails"}
              description={searchQuery || dateRange !== "all" ? "Try adjusting your search or date filter" : "Unsubscribed email addresses will appear here"}
            />
          ) : (
            <DataTable
              chrome={false}
              columns={columns}
              data={filteredList}
              getRowId={(r) => r.unsub.id}
              // Search and the date range already narrowed `data`, and a
              // re-sort must not bounce the reader off the page they picked.
              autoResetPageIndex={false}
              state={{ sorting, pagination, rowSelection }}
              onSortingChange={setSorting}
              onPaginationChange={setPagination}
              onRowSelectionChange={setRowSelection}
              {...(isManager ? { selection: { label: "records" } } : {})}
              rowClassName={(row) => (row.getIsSelected() ? "bg-muted/30" : "hover:bg-muted/50")}
              pagination={{ itemLabel: "records", showBorder: true }}
            />
          )}
        </CardContent>
      </Card>

      {/* Single Remove Confirmation */}
      {isManager && (
      <ConfirmDialog
        open={!!removeTarget}
        onOpenChangeAction={(open) => !open && setRemoveTarget(null)}
        title="Remove from Unsubscribe List"
        description={
          <>
            Are you sure you want to remove{" "}
            <strong>{removeTarget?.unsub.email}</strong> from the unsubscribe list?
            This means they may receive marketing emails again.
          </>
        }
        confirmLabel="Remove"
        onConfirmAction={() => removeTarget && handleRemove(removeTarget)}
        variant="destructive"
      />
      )}

      {/* Batch Remove Confirmation */}
      {isManager && (
      <ConfirmDialog
        open={batchRemoveOpen}
        onOpenChangeAction={setBatchRemoveOpen}
        title={`Remove ${selectedIds.length} Records`}
        description={`Are you sure you want to remove ${selectedIds.length} email${selectedIds.length !== 1 ? "s" : ""} from the unsubscribe list? They may receive marketing emails again.`}
        confirmLabel="Remove All"
        onConfirmAction={handleBatchRemove}
        variant="destructive"
      />
      )}
      </div>
    </>
  );
}
