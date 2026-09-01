"use client";

import { useState, useEffect, useMemo, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OnChangeFn, PaginationState, RowSelectionState, SortingState } from "@tanstack/react-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { SearchInput } from "@/components/search-input";
import { Topbar } from "@/components/topbar";
import { TableCell } from "@/components/ui/table";
import { MoneyCell, RelativeDateCell, TextCell } from "@/components/data-table/cells";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { ProspectActionsMenu } from "@/components/prospect-actions-menu";
import { ProspectsBulkToolbar } from "@/components/prospects-bulk-actions";
// RVX Import disabled for demo — Coming Soon
// import { RvxImportDialog } from "@/components/rvx-import-dialog";
import { Upload, UserSearch } from "lucide-react";
import Link from "next/link";
import type { ProspectListRow, ProspectSortKey, ProspectStatus } from "@/lib/queries";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";

/** Debounce before a typed search becomes a navigation. Promos uses the same. */
const TYPING_DELAY_MS = 300;
const PAGE_SIZE = DEFAULT_PAGE_SIZE;

const TAB_LABELS: Record<ProspectStatus, string> = {
  active: "Active Prospects",
  graduated: "Graduated Prospects",
  unsubscribed: "Unsubscribed Prospects",
  rejected: "Rejected Prospects",
};

const EMPTY_COPY: Record<ProspectStatus, { title: string; description: string }> = {
  active: {
    title: "No active prospects",
    description: "Import prospects from RVX or wait for new ones to come in.",
  },
  graduated: {
    title: "No graduated prospects",
    description: "Prospects move here once they're converted to clients.",
  },
  unsubscribed: {
    title: "No unsubscribed prospects",
    description: "Prospects who opt out of outreach will appear here.",
  },
  rejected: {
    title: "No rejected prospects",
    description: "Prospects marked as not-a-fit will appear here.",
  },
};

/** The prospect list's URL state — the server has already applied all of it. */
export interface ProspectFilters {
  status: ProspectStatus;
  q: string;
  /** Absent = the list's native order, newest first. */
  sort?: ProspectSortKey;
  dir: "asc" | "desc";
  page: number;
}

interface ProspectsContentProps {
  /** One page of one status, already filtered, sorted and sliced by the server. */
  rows: ProspectListRow[];
  total: number;
  /** Whole-table counts per status, for the tab badges. */
  counts: Record<ProspectStatus, number>;
  filters: ProspectFilters;
  isManager: boolean;
}

export function ProspectsContent({ rows, total, counts, filters, isManager }: ProspectsContentProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // RVX Import disabled for demo — Coming Soon
  // const [importOpen, setImportOpen] = useState(false);
  const [qLocal, setQLocal] = useState(filters.q);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  // The query the URL currently reflects, and the id of the debounce waiting
  // to commit a newer one — see navigate() and the debounce effect below.
  const committedQ = useRef(filters.q);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActiveTab = filters.status === "active";

  function navigate(overrides: Partial<ProspectFilters> = {}) {
    // A pending debounce would fire later with `page: 1` and clobber this
    // navigation, so fold the typed query in here and cancel it.
    if (searchTimer.current !== null) {
      clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
    const next: ProspectFilters = { ...filters, q: qLocal, ...overrides };
    committedQ.current = next.q;
    const sp = new URLSearchParams();
    if (next.status !== "active") sp.set("status", next.status);
    if (next.q) sp.set("q", next.q);
    if (next.sort) sp.set("sort", next.sort);
    if (next.sort && next.dir !== "asc") sp.set("dir", next.dir);
    if (next.page > 1) sp.set("page", String(next.page));
    const qs = sp.toString();
    // scroll: false keeps the pagination footer under the cursor; the
    // transition keeps the current rows interactive while the server renders.
    startTransition(() => {
      router.replace(`/prospects${qs ? `?${qs}` : ""}`, { scroll: false });
    });
  }

  // Keep a ref current so the debounce never closes over a stale navigate.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  // Adopt a query that arrived from outside — a back/forward navigation, or a
  // deep link — so the input and the URL stay in step.
  useEffect(() => {
    committedQ.current = filters.q;
    setQLocal(filters.q);
  }, [filters.q]);

  // Debounce typing into one navigation. Guarding on "has this diverged from
  // the URL" rather than on a first-render ref is what makes it mount-safe:
  // the effect re-runs whenever the Suspense boundary remounts this tree, and
  // a navigation with `page: 1` there would bounce the reader off their page.
  useEffect(() => {
    if (qLocal === committedQ.current) return;
    searchTimer.current = setTimeout(() => {
      searchTimer.current = null;
      navigateRef.current({ page: 1 });
    }, TYPING_DELAY_MS);
    return () => {
      if (searchTimer.current !== null) clearTimeout(searchTimer.current);
      searchTimer.current = null;
    };
  }, [qLocal]);

  // Both slices are compared shallowly by the engine, so they have to keep
  // their identity between renders that did not change them.
  const sorting = useMemo<SortingState>(
    () => (filters.sort ? [{ id: filters.sort, desc: filters.dir === "desc" }] : []),
    [filters.sort, filters.dir],
  );
  const pagination = useMemo<PaginationState>(
    () => ({ pageIndex: filters.page - 1, pageSize: PAGE_SIZE }),
    [filters.page],
  );

  // Sort removal and descending-first are off in the engine, so the updater
  // always resolves to one column: same column flips, a new one starts asc.
  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    const [next] = typeof updater === "function" ? updater(sorting) : updater;
    if (!next) return;
    navigate({ sort: next.id as ProspectSortKey, dir: next.desc ? "desc" : "asc", page: 1 });
  };

  const handlePaginationChange: OnChangeFn<PaginationState> = (updater) => {
    const next = typeof updater === "function" ? updater(pagination) : updater;
    navigate({ page: next.pageIndex + 1 });
  };

  // Selection is keyed by prospect id (`getRowId` below), so the map keys are
  // the ids the bulk actions need — minus any toggled back off.
  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection],
  );

  // One column set for every tab — the terminal tabs are the same list without
  // the row actions, which is what made the second copy of this markup
  // (`ProspectListCard`) redundant.
  const columns: DataTableColumn<ProspectListRow>[] = [
    {
      id: "name",
      accessorFn: (p) => `${p.firstName} ${p.lastName ?? ""}`,
      header: (ctx) => <DataTableColumnHeader ctx={ctx} label="Name" />,
      cell: ({ row: { original: p } }) => (
        <TableCell>
          <Link href={`/prospects/${p.id}`} className="font-medium hover:underline">
            {p.firstName} {p.lastName ?? ""}
          </Link>
        </TableCell>
      ),
    },
    {
      id: "phone",
      accessorFn: (p) => p.phone,
      header: (ctx) => <DataTableColumnHeader ctx={ctx} label="Phone" />,
      cell: ({ row: { original: p } }) => <TextCell value={p.phone} className="text-xs" />,
    },
    {
      id: "email",
      accessorFn: (p) => p.email,
      meta: { headClassName: "hidden sm:table-cell" },
      header: (ctx) => <DataTableColumnHeader ctx={ctx} label="Email" />,
      cell: ({ row: { original: p } }) => (
        <TextCell value={p.email} className="hidden sm:table-cell text-xs max-w-[220px] truncate" />
      ),
    },
    {
      id: "spend",
      accessorFn: (p) => p.rvxSpend,
      meta: { headClassName: "text-right" },
      header: (ctx) => <DataTableColumnHeader ctx={ctx} align="right" label="RVX Spend" />,
      cell: ({ row: { original: p } }) => <MoneyCell value={p.rvxSpend} />,
    },
    {
      id: "added",
      accessorFn: (p) => p.createdAt,
      meta: { headClassName: "hidden md:table-cell" },
      header: (ctx) => <DataTableColumnHeader ctx={ctx} label="Added" />,
      cell: ({ row: { original: p } }) => (
        <RelativeDateCell value={p.createdAt} className="hidden md:table-cell" />
      ),
    },
  ];

  if (isActiveTab) {
    columns.push({
      id: "actions",
      enableSorting: false,
      meta: { headClassName: "w-10" },
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row: { original: p } }) => (
        <TableCell className="text-right">
          <ProspectActionsMenu prospect={p} />
        </TableCell>
      ),
    });
  }

  const copy = EMPTY_COPY[filters.status];
  const searching = filters.q.trim().length > 0;

  return (
    <>
      <Topbar title="Prospects">
        {isManager && (
          <Button size="sm" disabled>
            <Upload className="size-4 mr-2" />
            Import RVX
            <Badge variant="secondary" className="ml-2 text-[10px]">Coming Soon</Badge>
          </Button>
        )}
      </Topbar>

      <div className="flex flex-col flex-1 p-4 md:p-6 gap-4" data-tour="prospects">
        <SearchInput
          value={qLocal}
          onChangeAction={setQLocal}
          placeholder="Search by name, phone, or email..."
          className="max-w-sm"
        />

        <Tabs
          value={filters.status}
          onValueChange={(v) => {
            setRowSelection({});
            navigate({ status: v as ProspectStatus, page: 1 });
          }}
        >
          <TabsList>
            <TabsTrigger value="active">
              Active
              {counts.active > 0 && (
                <Badge variant="secondary" className="ml-2 text-[10px]">{counts.active}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="graduated">
              Graduated
              {counts.graduated > 0 && (
                <Badge variant="secondary" className="ml-2 text-[10px]">{counts.graduated}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="unsubscribed">
              Unsubscribed
              {counts.unsubscribed > 0 && (
                <Badge variant="secondary" className="ml-2 text-[10px]">{counts.unsubscribed}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="rejected">
              Rejected
              {counts.rejected > 0 && (
                <Badge variant="secondary" className="ml-2 text-[10px]">{counts.rejected}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* One panel: the server serves the tab in the URL, so the other
              three have no rows to render. */}
          <TabsContent value={filters.status} className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{TAB_LABELS[filters.status]}</CardTitle>
                  {total > 0 && (
                    <Badge variant="secondary">
                      {total} prospect{total !== 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>
                {isActiveTab && selectedIds.length > 0 && (
                  <ProspectsBulkToolbar
                    selectedIds={selectedIds}
                    onClearAction={() => setRowSelection({})}
                  />
                )}
              </CardHeader>
              <CardContent>
                {total === 0 ? (
                  <EmptyState
                    icon={UserSearch}
                    title={searching ? "No matching prospects" : copy.title}
                    description={searching ? "Try a different search term" : copy.description}
                  />
                ) : (
                  <DataTable
                    chrome={false}
                    busy={isPending}
                    columns={columns}
                    data={rows}
                    getRowId={(p) => p.id}
                    manualSorting
                    manualFiltering
                    manualPagination
                    rowCount={total}
                    state={{ sorting, pagination, rowSelection }}
                    onSortingChange={handleSortingChange}
                    onPaginationChange={handlePaginationChange}
                    onRowSelectionChange={setRowSelection}
                    {...(isActiveTab ? { selection: { label: "prospects" } } : {})}
                    rowClassName={(row) => (row.getIsSelected() ? "bg-accent/5" : "hover:bg-muted/30")}
                    pagination={{ itemLabel: "prospects", showBorder: true }}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* RVX Import disabled for demo — Coming Soon */}
        {/* <RvxImportDialog open={importOpen} onOpenChangeAction={setImportOpen} /> */}
      </div>
    </>
  );
}
