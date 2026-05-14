"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { HeatBadge } from "@/components/heat-badge";
import { SearchInputWithHistory, pushSearchHistory } from "@/components/search-input-with-history";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PaginationFooter } from "@/components/pagination-footer";
import { Topbar } from "@/components/topbar";
import { formatPhone, daysAgo } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ChevronUp, ChevronDown, ChevronsUpDown, MoreHorizontal, Eye, Edit, Ban, MailX, Trash2, Mail, BookmarkPlus } from "lucide-react";
import type { ReactNode } from "react";
import { BanCustomerDialog, UnsubscribeCustomerDialog } from "@/components/client-status-actions";
import { EmailRecipientsDialog } from "@/components/email-recipients-dialog";
import { ColumnFilterPopover } from "@/components/column-filter-popover";
import {
  TextFilterMenu,
  SingleSelectMenu,
  TagsFilterMenu,
  DatesFilterButton,
} from "@/components/clients-column-filters";
import { SaveCurrentFilterDialog } from "@/components/smart-lists/save-current-filter-dialog";
import { describeClientFilters, hasActiveClientFilters } from "@/lib/smart-list-filters";
import { BulkActionsToolbar } from "@/components/clients-bulk-actions";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { deleteClient } from "@/lib/actions";
import { toast } from "sonner";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

type SortKey = "name" | "heat" | "lastContact" | "owner";
type SortDir = "asc" | "desc";

interface ClientFilters {
  q: string;
  nameQ: string;
  contactQ: string;
  heat: string;
  owner: string;
  tags: string[];
  tagMode: "any" | "all";
  /** Unix seconds. */
  lastContactFrom?: number;
  lastContactTo?: number;
  createdFrom?: number;
  createdTo?: number;
  sort: SortKey;
  sortDir: SortDir;
  page: number;
}

interface ClientRow {
  client: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    heatLevel: "hot" | "warm" | "cold";
    heatScore: number;
    status: string;
    lastOutreachAt: string | null;
    tags: string[];
  };
  employeeName: string | null;
}

/**
 * Header cell: label + optional sort affordance + optional filter trigger.
 * Sort is opt-in (pass sortKey/onSort); filter is opt-in (pass `filter` slot).
 */
function ColumnHeader({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
  filter,
}: {
  label: string;
  sortKey?: SortKey;
  currentSort?: SortKey;
  currentDir?: SortDir;
  onSort?: (key: SortKey) => void;
  filter?: ReactNode;
}) {
  const isActive = sortKey && currentSort === sortKey;
  return (
    <div className="flex items-center gap-1">
      {sortKey ? (
        <button
          onClick={() => onSort?.(sortKey)}
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          {label}
          {isActive ? (
            currentDir === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
          )}
        </button>
      ) : (
        <span>{label}</span>
      )}
      {filter}
    </div>
  );
}

export function ClientListContent({
  rows,
  total,
  ownerNames,
  allTags,
  employeeOptions,
  currentFilters,
  currentUserRole,
}: {
  rows: ClientRow[];
  total: number;
  ownerNames: string[];
  allTags: { name: string; usageCount: number }[];
  employeeOptions: { id: string; name: string }[];
  currentFilters: ClientFilters;
  currentUserRole?: string;
}) {
  const router = useRouter();
  const [qLocal, setQLocal] = useState(currentFilters.q);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<ClientRow | null>(null);
  const [emailRecipientsOpen, setEmailRecipientsOpen] = useState(false);
  const [saveFilterOpen, setSaveFilterOpen] = useState(false);
  const isFirstRender = useRef(true);

  // Stable filter object for the EmailRecipientsDialog — prevents refetch
  // on every parent re-render. Joining tags keeps the dep primitive.
  const tagsKey = currentFilters.tags.join(",");
  const emailRecipientFilters = useMemo(
    () => ({
      q: currentFilters.q,
      nameQ: currentFilters.nameQ,
      contactQ: currentFilters.contactQ,
      heat: currentFilters.heat,
      owner: currentFilters.owner,
      tags: currentFilters.tags,
      tagMode: currentFilters.tagMode,
      lastContactFrom: currentFilters.lastContactFrom,
      lastContactTo: currentFilters.lastContactTo,
      createdFrom: currentFilters.createdFrom,
      createdTo: currentFilters.createdTo,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      currentFilters.q, currentFilters.nameQ, currentFilters.contactQ,
      currentFilters.heat, currentFilters.owner, tagsKey, currentFilters.tagMode,
      currentFilters.lastContactFrom, currentFilters.lastContactTo,
      currentFilters.createdFrom, currentFilters.createdTo,
    ],
  );

  function navigate(overrides: Partial<ClientFilters>) {
    const next = { ...currentFilters, ...overrides };
    const sp = new URLSearchParams();
    if (next.q) sp.set("q", next.q);
    if (next.nameQ) sp.set("nameQ", next.nameQ);
    if (next.contactQ) sp.set("contactQ", next.contactQ);
    if (next.heat !== "any") sp.set("heat", next.heat);
    if (next.owner !== "any") sp.set("owner", next.owner);
    if (next.tags.length > 0) sp.set("tags", next.tags.join(","));
    if (next.tagMode !== "any") sp.set("tagMode", next.tagMode);
    if (next.lastContactFrom) sp.set("lastContactFrom", String(next.lastContactFrom));
    if (next.lastContactTo) sp.set("lastContactTo", String(next.lastContactTo));
    if (next.createdFrom) sp.set("createdFrom", String(next.createdFrom));
    if (next.createdTo) sp.set("createdTo", String(next.createdTo));
    if (next.sort !== "heat") sp.set("sort", next.sort);
    if (next.sortDir !== "desc") sp.set("sortDir", next.sortDir);
    if (next.page > 1) sp.set("page", String(next.page));
    const qs = sp.toString();
    router.replace(`/clients${qs ? `?${qs}` : ""}`);
  }

  // Keep ref current so the debounce effect never closes over a stale navigate.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  // Debounce the search query so every keystroke doesn't fire a navigation.
  // After the debounce fires, push the committed (non-empty) query into
  // localStorage so the SearchInputWithHistory dropdown can surface it later.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const id = setTimeout(() => {
      navigateRef.current({ q: qLocal, page: 1 });
      if (qLocal.trim()) pushSearchHistory("iris:recent-searches:clients", qLocal);
    }, 300);
    return () => clearTimeout(id);
  }, [qLocal]);

  const handleSort = (key: SortKey) => {
    if (currentFilters.sort === key) {
      navigate({ sortDir: currentFilters.sortDir === "asc" ? "desc" : "asc", page: 1 });
    } else {
      navigate({ sort: key, sortDir: "asc", page: 1 });
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const toggleAll = () => {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((r) => r.client.id)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteClient(deleteTarget.client.id);
    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success("Client deleted");
      setDeleteTarget(null);
      router.refresh();
    }
  };

  return (
    <>
      <Topbar title="Clients">
        <Button
          onClick={() => setSaveFilterOpen(true)}
          variant="outline"
          size="sm"
          disabled={!hasActiveClientFilters(emailRecipientFilters)}
          title={hasActiveClientFilters(emailRecipientFilters) ? "Save current filter as Smart List" : "Apply a filter first"}
        >
          <BookmarkPlus className="h-4 w-4 mr-2" />
          Save Filter
        </Button>
        <Button onClick={() => setEmailRecipientsOpen(true)} variant="outline" size="sm">
          <Mail className="h-4 w-4 mr-2" />
          Email Recipients
        </Button>
        <Button asChild variant="gold" size="sm" data-hint="add-client">
          <Link href="/clients/new"><Plus className="h-4 w-4 mr-1" /> Add Client</Link>
        </Button>
      </Topbar>
      <div className="flex-1 p-4 md:p-6 space-y-4 max-w-full overflow-hidden" data-tour="client-list">
        {/* Search + Dates filter row */}
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
          <SearchInputWithHistory
            value={qLocal}
            onChange={(v) => setQLocal(v)}
            placeholder="Search name, email, phone…"
            className="flex-1 max-w-md"
            historyKey="iris:recent-searches:clients"
          />
          <DatesFilterButton
            lastContactFrom={currentFilters.lastContactFrom}
            lastContactTo={currentFilters.lastContactTo}
            createdFrom={currentFilters.createdFrom}
            createdTo={currentFilters.createdTo}
            onChange={(next) => navigate({ ...next, page: 1 })}
          />
        </div>

        {/* Bulk actions */}
        <BulkActionsToolbar
          selectedIds={Array.from(selected)}
          onClear={() => setSelected(new Set())}
          allTags={allTags}
          owners={employeeOptions}
          isManager={currentUserRole === "manager"}
        />

        {/* Table */}
        <Card>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <span className="sr-only">Select all</span>
                  <Checkbox
                    checked={rows.length > 0 && selected.size === rows.length}
                    onCheckedChange={toggleAll}
                    aria-label="Select all clients"
                  />
                </TableHead>
                <TableHead>
                  <ColumnHeader
                    label="Name"
                    sortKey="name"
                    currentSort={currentFilters.sort}
                    currentDir={currentFilters.sortDir}
                    onSort={handleSort}
                    filter={
                      <ColumnFilterPopover
                        label="Name"
                        active={!!currentFilters.nameQ}
                        onClear={() => navigate({ nameQ: "", page: 1 })}
                      >
                        <TextFilterMenu
                          value={currentFilters.nameQ}
                          onChange={(v) => navigate({ nameQ: v, page: 1 })}
                          placeholder="Filter name…"
                        />
                      </ColumnFilterPopover>
                    }
                  />
                </TableHead>
                <TableHead>
                  <ColumnHeader
                    label="Contact"
                    filter={
                      <ColumnFilterPopover
                        label="Contact"
                        active={!!currentFilters.contactQ}
                        onClear={() => navigate({ contactQ: "", page: 1 })}
                      >
                        <TextFilterMenu
                          value={currentFilters.contactQ}
                          onChange={(v) => navigate({ contactQ: v, page: 1 })}
                          placeholder="Filter email or phone…"
                        />
                      </ColumnFilterPopover>
                    }
                  />
                </TableHead>
                <TableHead>
                  <ColumnHeader
                    label="Heat"
                    sortKey="heat"
                    currentSort={currentFilters.sort}
                    currentDir={currentFilters.sortDir}
                    onSort={handleSort}
                    filter={
                      <ColumnFilterPopover
                        label="Heat"
                        active={currentFilters.heat !== "any"}
                        onClear={() => navigate({ heat: "any", page: 1 })}
                      >
                        <SingleSelectMenu
                          value={currentFilters.heat}
                          onChange={(v) => navigate({ heat: v, page: 1 })}
                          options={[
                            { value: "any", label: "Any heat" },
                            { value: "hot", label: "Hot" },
                            { value: "warm", label: "Warm" },
                            { value: "cold", label: "Cold" },
                          ]}
                        />
                      </ColumnFilterPopover>
                    }
                  />
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  <ColumnHeader
                    label="Tags"
                    filter={
                      <ColumnFilterPopover
                        label="Tags"
                        active={currentFilters.tags.length > 0}
                        onClear={() => navigate({ tags: [], tagMode: "any", page: 1 })}
                      >
                        <TagsFilterMenu
                          allTags={allTags}
                          selected={currentFilters.tags}
                          mode={currentFilters.tagMode}
                          onChange={({ selected, mode }) => navigate({ tags: selected, tagMode: mode, page: 1 })}
                        />
                      </ColumnFilterPopover>
                    }
                  />
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  <ColumnHeader
                    label="Owner"
                    sortKey="owner"
                    currentSort={currentFilters.sort}
                    currentDir={currentFilters.sortDir}
                    onSort={handleSort}
                    filter={
                      <ColumnFilterPopover
                        label="Owner"
                        active={currentFilters.owner !== "any"}
                        onClear={() => navigate({ owner: "any", page: 1 })}
                      >
                        <SingleSelectMenu
                          searchable
                          value={currentFilters.owner}
                          onChange={(v) => navigate({ owner: v, page: 1 })}
                          options={[
                            { value: "any", label: "Any owner" },
                            { value: "__none__", label: "Unassigned" },
                            ...ownerNames.map((name) => ({ value: name, label: name })),
                          ]}
                        />
                      </ColumnFilterPopover>
                    }
                  />
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  <ColumnHeader
                    label="Last contact"
                    sortKey="lastContact"
                    currentSort={currentFilters.sort}
                    currentDir={currentFilters.sortDir}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">No clients match.</TableCell>
                </TableRow>
              ) : rows.map((r) => {
                const d = daysAgo(r.client.lastOutreachAt);
                const isSelected = selected.has(r.client.id);
                return (
                  <TableRow key={r.client.id} className={isSelected ? "bg-accent/5" : "hover:bg-muted/30"}>
                    <TableCell>
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(r.client.id)} />
                    </TableCell>
                    <TableCell>
                      <Link href={`/clients/${r.client.id}`} className="font-medium hover:underline">
                        {r.client.firstName} {r.client.lastName ?? ""}
                      </Link>
                      {r.client.status !== "active" && <Badge variant="outline" className="ml-2 text-[10px] capitalize">{r.client.status}</Badge>}
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      {r.client.phone && <div className="text-xs">{formatPhone(r.client.phone)}</div>}
                      {r.client.email && <div className="text-xs text-muted-foreground truncate">{r.client.email}</div>}
                    </TableCell>
                    <TableCell><HeatBadge level={r.client.heatLevel} score={r.client.heatScore} showScore /></TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex gap-1 flex-wrap max-w-[180px]">
                        {(r.client.tags || []).slice(0, 3).map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{r.employeeName ?? "—"}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{d === null ? "Never" : d === 0 ? "Today" : `${d}d ago`}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/clients/${r.client.id}`}><Eye className="h-4 w-4 mr-2" /> View</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/clients/${r.client.id}/edit`}><Edit className="h-4 w-4 mr-2" /> Edit</Link>
                          </DropdownMenuItem>
                          {r.client.status === "active" && (
                            <>
                              <DropdownMenuSeparator />
                              <BanCustomerDialog clientId={r.client.id} clientName={`${r.client.firstName} ${r.client.lastName ?? ""}`}>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onSelect={(e) => e.preventDefault()}
                                >
                                  <Ban className="h-4 w-4 mr-2" /> Ban Customer
                                </DropdownMenuItem>
                              </BanCustomerDialog>
                              <UnsubscribeCustomerDialog clientId={r.client.id} clientName={`${r.client.firstName} ${r.client.lastName ?? ""}`}>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onSelect={(e) => e.preventDefault()}
                                >
                                  <MailX className="h-4 w-4 mr-2" /> Unsubscribe
                                </DropdownMenuItem>
                              </UnsubscribeCustomerDialog>
                            </>
                          )}
                          {currentUserRole === "manager" && r.client.status !== "deleted" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(r)}>
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Client
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        </Card>

        <PaginationFooter
          currentPage={currentFilters.page}
          totalPages={totalPages}
          onPageChange={(p) => navigate({ page: p })}
          totalItems={total}
          pageSize={PAGE_SIZE}
          itemLabel="clients"
        />
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Client"
        description={<>Are you sure you want to delete <strong>{deleteTarget?.client.firstName} {deleteTarget?.client.lastName}</strong>? This hides the client from all views. It can be restored by a manager from Settings.</>}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />

      <EmailRecipientsDialog
        open={emailRecipientsOpen}
        onOpenChange={setEmailRecipientsOpen}
        filters={emailRecipientFilters}
      />

      <SaveCurrentFilterDialog
        open={saveFilterOpen}
        onOpenChange={setSaveFilterOpen}
        filters={emailRecipientFilters}
        activeFilterChips={describeClientFilters(emailRecipientFilters)}
      />
    </>
  );
}
