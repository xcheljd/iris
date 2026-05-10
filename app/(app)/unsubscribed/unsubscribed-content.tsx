"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { PaginationFooter } from "@/components/pagination-footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsCard } from "@/components/stats-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SearchInput } from "@/components/search-input";
import { EmptyState } from "@/components/empty-state";
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
import { addUnsubscribeEmail, resubscribeClient } from "@/lib/actions";
import { toast } from "sonner";
import { format, isAfter, isBefore, subDays, startOfMonth, endOfMonth } from "date-fns";
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [removeTarget, setRemoveTarget] = useState<UnsubscribedRow | null>(null);
  const [batchRemoveOpen, setBatchRemoveOpen] = useState(false);

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

  const totalPages = Math.ceil(filteredList.length / PAGE_SIZE);
  const paged = filteredList.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const allSelected =
    paged.length > 0 && paged.every((r) => selected.has(r.unsub.id));

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(paged.map((r) => r.unsub.id)));
    }
  };

  const handleRemove = async (row: UnsubscribedRow) => {
    if (!row.clientId) return;
    try {
      await resubscribeClient(row.clientId);
      setList(list.filter((l) => l.unsub.id !== row.unsub.id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(row.unsub.id);
        return next;
      });
      toast.success("Removed from unsubscribe list");
    } catch {
      toast.error("Failed to remove");
    } finally {
      setRemoveTarget(null);
    }
  };

  const handleBatchRemove = async () => {
    try {
      const rows = list.filter((l) => selected.has(l.unsub.id) && l.clientId);
      await Promise.all(rows.map((row) => resubscribeClient(row.clientId!)));
      setList(list.filter((l) => !selected.has(l.unsub.id)));
      toast.success(`Removed ${selected.size} record${selected.size !== 1 ? "s" : ""}`);
      setSelected(new Set());
    } catch {
      toast.error("Failed to remove some records");
    } finally {
      setBatchRemoveOpen(false);
    }
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
              <div className="space-y-2">
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
                        <AlertCircle className="h-3 w-3" />
                        {addEmailError}
                      </p>
                    )}
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" onClick={handleAddEmail}>
                        <Plus className="h-4 w-4" />
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
            <CardTitle>Unsubscribe List</CardTitle>
            <div className="flex items-center gap-2">
              {isManager && selected.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setBatchRemoveOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Remove ({selected.size})
                </Button>
              )}
              <Select value={dateRange} onValueChange={(v) => { setDateRange(v as DateRange); setPage(1); }}>
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
            onChange={(v) => { setSearchQuery(v); setPage(1); }}
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
            <>
              {isManager && (
              <div className="flex items-center gap-3 mb-3 px-1">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
                <span className="text-xs text-muted-foreground">
                  {allSelected ? "Deselect all" : "Select all"}
                </span>
                <Separator orientation="vertical" className="h-4" />
                <Badge variant="secondary">
                  {filteredList.length} record{filteredList.length !== 1 ? "s" : ""}
                </Badge>
              </div>
              )}
              <div className="space-y-1">
                {paged.map((record) => (
                  <div
                    key={record.unsub.id}
                    className={`flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors ${
                      selected.has(record.unsub.id) ? "bg-muted/30" : ""
                    }`}
                  >
                    {isManager && (
                    <Checkbox
                      checked={selected.has(record.unsub.id)}
                      onCheckedChange={() => toggleSelect(record.unsub.id)}
                      aria-label={`Select ${record.unsub.email}`}
                    />
                    )}
                    <div className="flex-1 min-w-0 flex items-center justify-between gap-4">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 min-w-0">
                        {/* Name / Client link */}
                        <div className="min-w-0 sm:w-[180px]">
                          {record.clientId ? (
                            <Link
                              href={`/clients/${record.clientId}`}
                              className="text-sm font-medium hover:underline truncate block"
                            >
                              {record.firstName} {record.lastName || ""}
                            </Link>
                          ) : (
                            <span className="text-sm text-muted-foreground">No client match</span>
                          )}
                        </div>
                        {/* Customer ID */}
                        <div className="hidden sm:block sm:w-[110px] sm:shrink-0">
                          {record.customerId ? (
                            <Badge variant="outline" className="font-mono text-xs">
                              #{record.customerId}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                        {/* Email */}
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-sm truncate">{record.unsub.email}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3 shrink-0 flex-wrap">
                        <span className="text-xs text-muted-foreground">
                          {record.unsub.unsubscribedAt
                            ? format(new Date(record.unsub.unsubscribedAt), "MMM d, yyyy")
                            : "—"}
                        </span>
                        {isManager ? (
                          record.clientId ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="Actions">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                  <Link href={`/clients/${record.clientId}`}>
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    View Client
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleResubscribe(record)}
                                >
                                  <Mail className="h-4 w-4 mr-2" />
                                  Resubscribe
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setRemoveTarget(record)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Remove
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="h-7"
                                  onClick={() => setRemoveTarget(record)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                                  Remove
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Remove from unsubscribe list</TooltipContent>
                            </Tooltip>
                          )
                        ) : record.clientId ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" asChild>
                                <Link href={`/clients/${record.clientId}`}>
                                  <ExternalLink className="h-4 w-4" />
                                </Link>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>View Client</TooltipContent>
                          </Tooltip>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <PaginationFooter
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
                totalItems={filteredList.length}
                pageSize={PAGE_SIZE}
                itemLabel="records"
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Single Remove Confirmation */}
      {isManager && (
      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title="Remove from Unsubscribe List"
        description={
          <>
            Are you sure you want to remove{" "}
            <strong>{removeTarget?.unsub.email}</strong> from the unsubscribe list?
            This means they may receive marketing emails again.
          </>
        }
        confirmLabel="Remove"
        onConfirm={() => removeTarget && handleRemove(removeTarget)}
        variant="destructive"
      />
      )}

      {/* Batch Remove Confirmation */}
      {isManager && (
      <ConfirmDialog
        open={batchRemoveOpen}
        onOpenChange={setBatchRemoveOpen}
        title={`Remove ${selected.size} Records`}
        description={`Are you sure you want to remove ${selected.size} email${selected.size !== 1 ? "s" : ""} from the unsubscribe list? They may receive marketing emails again.`}
        confirmLabel="Remove All"
        onConfirm={handleBatchRemove}
        variant="destructive"
      />
      )}
      </div>
    </>
  );
}
