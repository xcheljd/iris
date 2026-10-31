"use client";

import { useState, useMemo, useEffect, useRef, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { OnChangeFn, PaginationState, SortingState } from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsCard } from "@/components/stats-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SearchInput } from "@/components/search-input";
import { EmptyState } from "@/components/empty-state";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MatchedClientsTab } from "@/components/matched-clients-tab";
import type { MatchedClientRow, PromoSortKey } from "@/lib/queries";
import { TableCell } from "@/components/ui/table";
import {
  Tag, Plus, Trash2,
  MoreHorizontal, ClipboardPaste,
  FileSpreadsheet, Trash, CalendarDays, Calendar,
} from "lucide-react";
import { createPromo, deletePromo, clearAllPromos } from "@/lib/actions";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import type { PromoItem } from "@/lib/db/schema";
import { type Brand } from "@/lib/db/schema";
import { useBrands } from "@/components/brands-provider";
import { brandLabel } from "@/lib/brand";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Filter } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { MoneyCell, MonoCell, PercentCell, StatusBadgeCell } from "@/components/data-table/cells";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { PROMO_PAGE_SIZE } from "@/lib/constants";
import { ImportPromoDialog } from "@/components/promo/import-promo-dialog";

/** Debounce before a typed filter becomes a navigation. Clients uses the same. */
const TYPING_DELAY_MS = 300;

/** sessionStorage key for the last query string navigate() wrote. */
export const LAST_SEARCH_KEY = "promos:last-search";

/** The promo list's URL state — the server has already applied all of it. */
export interface PromoFilters {
  q: string;
  brands: string[];
  collections: string[];
  msrpMax?: number;
  discMin?: number;
  /** Absent = the list's native import order. */
  sort?: PromoSortKey;
  dir: "asc" | "desc";
  page: number;
}

/** Unfiltered aggregates: they describe the whole list, not the current page. */
export interface PromoSummary {
  count: number;
  retailValue: number;
  savings: number;
  promoStart: string | null;
  promoEnd: string | null;
  current: { promoStart: string | null; promoEnd: string | null } | null;
}

interface PromosContentProps {
  /** One page of promos, already filtered, sorted and sliced by the server. */
  promos: PromoItem[];
  total: number;
  summary: PromoSummary;
  /** Every distinct collection in the list, for the filter menu. */
  collections: string[];
  filters: PromoFilters;
  isManager: boolean;
  matchCounts?: Record<string, number>;
  currentUserId?: string;
  matchedClients?: MatchedClientRow[];
  /** True when matchedClients was cut at the page-read cap. */
  matchedClientsTruncated?: boolean;
  /** True when the page was requested with no search params at all. */
  restoreLastSearch?: boolean;
}

/** The three text filters, kept as strings while the user is still typing. */
interface DraftFilters {
  q: string;
  msrpMax: string;
  discMin: string;
}

const draftOf = (f: PromoFilters): DraftFilters => ({
  q: f.q,
  msrpMax: f.msrpMax != null ? String(f.msrpMax) : "",
  discMin: f.discMin != null ? String(f.discMin) : "",
});

const sameDraft = (a: DraftFilters, b: DraftFilters) =>
  a.q === b.q && a.msrpMax === b.msrpMax && a.discMin === b.discMin;

const parseBound = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** "Oct 26 – Nov 1, 2026"; an open side reads "?", no dates at all "no dates set". */
function periodLabel(p: { promoStart: string | null; promoEnd: string | null }): string {
  if (!p.promoStart && !p.promoEnd) return "no dates set";
  const start = p.promoStart ? format(parseISO(p.promoStart), "MMM d") : "?";
  const end = p.promoEnd ? format(parseISO(p.promoEnd), "MMM d, yyyy") : "?";
  return `${start} – ${end}`;
}

export function PromosContent({ promos, total, summary, collections: distinctCollections, filters, isManager, matchCounts = {}, currentUserId = "", matchedClients = [], matchedClientsTruncated = false, restoreLastSearch = false }: PromosContentProps) {
  const brandList = useBrands();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const tab = searchParams.get("tab") === "matched" ? "matched" : "promos";
  const onTabChange = (v: string) => {
    const p = new URLSearchParams(Array.from(searchParams.entries()));
    if (v === "matched") p.set("tab", "matched"); else p.delete("tab");
    const qs = p.toString();
    router.replace(`/promos${qs ? `?${qs}` : ""}`);
  };
  const [isCreating, setIsCreating] = useState(false);
  const [newPromo, setNewPromo] = useState({ modelNumber: "", collection: "", brand: "", msrp: "", discountPercent: "", discountPrice: "", promoStart: "", promoEnd: "" });
  const [deleteTarget, setDeleteTarget] = useState<PromoItem | null>(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Search and the two numeric bounds are typed, so they live locally until a
  // debounce commits them; every other control navigates on the click.
  const [draft, setDraft] = useState<DraftFilters>(() => draftOf(filters));
  const committed = useRef<DraftFilters>(draftOf(filters));
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const brandFilter = filters.brands;
  const collectionFilter = filters.collections;

  const toggleIn = (values: string[], v: string) =>
    values.includes(v) ? values.filter((x) => x !== v) : [...values, v];

  function navigate(overrides: Partial<PromoFilters> = {}, typed: DraftFilters = draft) {
    // A pending debounce would fire later with `page: 1` and clobber this
    // navigation, so fold the typed values in here and cancel it.
    if (typingTimer.current !== null) {
      clearTimeout(typingTimer.current);
      typingTimer.current = null;
    }
    committed.current = typed;
    const next: PromoFilters = {
      ...filters,
      q: typed.q,
      msrpMax: parseBound(typed.msrpMax),
      discMin: parseBound(typed.discMin),
      ...overrides,
    };
    const sp = new URLSearchParams();
    if (tab === "matched") sp.set("tab", "matched");
    if (next.q) sp.set("q", next.q);
    if (next.brands.length) sp.set("brands", next.brands.join(","));
    if (next.collections.length) sp.set("cols", next.collections.join(","));
    if (next.msrpMax != null) sp.set("msrpMax", String(next.msrpMax));
    if (next.discMin != null) sp.set("discMin", String(next.discMin));
    if (next.sort) sp.set("sort", next.sort);
    if (next.sort && next.dir !== "asc") sp.set("dir", next.dir);
    if (next.page > 1) sp.set("page", String(next.page));
    const qs = sp.toString();
    // Remembered for a bare /promos visit later in the session; an empty
    // query (every filter cleared) forgets it.
    if (qs) sessionStorage.setItem(LAST_SEARCH_KEY, qs);
    else sessionStorage.removeItem(LAST_SEARCH_KEY);
    // scroll: false keeps the pagination footer under the cursor; the
    // transition keeps the current rows interactive while the server renders.
    startTransition(() => {
      router.replace(`/promos${qs ? `?${qs}` : ""}`, { scroll: false });
    });
  }

  // Keep a ref current so the debounce never closes over a stale navigate.
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  });

  // A bare /promos visit adopts the filters the user last had this session.
  // It only moves the URL: the adoption effect below pulls the restored
  // values into the draft, so draft keeps a single writer.
  useEffect(() => {
    if (!restoreLastSearch) return;
    const saved = sessionStorage.getItem(LAST_SEARCH_KEY);
    if (saved) router.replace(`/promos?${saved}`, { scroll: false });
  }, [restoreLastSearch, router]);

  // Adopt values that arrived from outside — a back/forward navigation, or a
  // deep link — so the inputs and the URL stay in step.
  useEffect(() => {
    const fromUrl = draftOf(filters);
    committed.current = fromUrl;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- adopts a URL q from back/forward or a deep link; the render-phase version must write committedQ.current during render (react-hooks/refs), and ref-based guards caused the pagination bounce documented below
    setDraft(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q, filters.msrpMax, filters.discMin]);

  // Debounce typing into one navigation. Guarding on "has this actually
  // diverged from the URL" rather than on a first-render ref is what makes it
  // mount-safe: the effect re-runs whenever the Suspense boundary remounts
  // this tree, and a navigation with `page: 1` there would bounce the reader
  // off the page they picked.
  useEffect(() => {
    if (sameDraft(draft, committed.current)) return;
    typingTimer.current = setTimeout(() => {
      typingTimer.current = null;
      navigateRef.current({ page: 1 });
    }, TYPING_DELAY_MS);
    return () => {
      if (typingTimer.current !== null) clearTimeout(typingTimer.current);
      typingTimer.current = null;
    };
  }, [draft]);

  // Both slices are compared shallowly by the engine, so they have to keep
  // their identity between renders that did not change them.
  const sorting = useMemo<SortingState>(
    () => (filters.sort ? [{ id: filters.sort, desc: filters.dir === "desc" }] : []),
    [filters.sort, filters.dir],
  );
  const pagination = useMemo<PaginationState>(
    () => ({ pageIndex: filters.page - 1, pageSize: PROMO_PAGE_SIZE }),
    [filters.page],
  );

  // Sort removal and descending-first are off in the engine, so the updater
  // always resolves to one column: same column flips, a new one starts asc.
  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    const [next] = typeof updater === "function" ? updater(sorting) : updater;
    if (!next) return;
    navigate({ sort: next.id as PromoSortKey, dir: next.desc ? "desc" : "asc", page: 1 });
  };

  const handlePaginationChange: OnChangeFn<PaginationState> = (updater) => {
    const next = typeof updater === "function" ? updater(pagination) : updater;
    navigate({ page: next.pageIndex + 1 });
  };

  const hasActiveFilters =
    !!draft.q || brandFilter.length > 0 || collectionFilter.length > 0 ||
    !!draft.msrpMax || !!draft.discMin;

  function clearFilters() {
    const cleared: DraftFilters = { q: "", msrpMax: "", discMin: "" };
    setDraft(cleared);
    navigate({ brands: [], collections: [], page: 1 }, cleared);
  }

  const handleCreatePromo = async () => {
    if (!newPromo.modelNumber.trim() || !newPromo.collection.trim()) {
      toast.error("Model number and collection are required");
      return;
    }
    if (!newPromo.brand) {
      toast.error("Brand is required");
      return;
    }
    // A hand-added item joins the current promo; with none running, it needs its own dates.
    if (!summary.current && (!newPromo.promoStart || !newPromo.promoEnd)) {
      toast.error("No promo is running — pick the promo dates");
      return;
    }
    setIsCreating(true);
    try {
      const res = await createPromo(
        newPromo.modelNumber,
        newPromo.collection,
        newPromo.brand as Brand,
        newPromo.msrp ? parseFloat(newPromo.msrp) : null,
        newPromo.discountPercent ? parseFloat(newPromo.discountPercent) : null,
        newPromo.discountPrice ? parseFloat(newPromo.discountPrice) : null,
        summary.current ? undefined : { promoStart: newPromo.promoStart, promoEnd: newPromo.promoEnd },
      );
      if (res?.error) { toast.error(res.error); return; }
      toast.success("Promo item added");
      setNewPromo({ modelNumber: "", collection: "", brand: "", msrp: "", discountPercent: "", discountPrice: "", promoStart: "", promoEnd: "" });
      router.refresh();
    } catch { toast.error("Failed to add promo item"); }
    finally { setIsCreating(false); }
  };

  // The list is the server's now, so both mutations refetch instead of
  // splicing a local copy: the page they land on, its total and the summary
  // all have to move together.
  const handleDelete = async (id: string) => {
    try {
      const res = await deletePromo(id);
      if (res?.error) { toast.error(res.error); return; }
      toast.success("Promo deleted");
      setDeleteTarget(null);
      router.refresh();
    } catch { toast.error("Failed to delete promo"); }
  };

  const handleClearAll = async () => {
    try {
      const result = await clearAllPromos();
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("All promos cleared — ready for the next promo list");
      setClearAllOpen(false);
      router.refresh();
    } catch { toast.error("Failed to clear promos"); }
  };

  // Rebuilt every render — cheap, because the engine keys its row model on
  // `data` alone, and the Clients and Actions cells have to see the current
  // match counts and delete target. No column carries a `sortFn`: with
  // `manualSorting` the engine never runs one — SQL already ordered the page.
  const columns: DataTableColumn<PromoItem>[] = [
    {
      id: "modelNumber",
      accessorFn: (p) => p.modelNumber,
      header: (ctx) => <DataTableColumnHeader ctx={ctx} label="Model Number" />,
      cell: ({ row }) => <MonoCell value={row.original.modelNumber} className="font-medium" />,
    },
    {
      id: "collection",
      accessorFn: (p) => p.collection,
      header: (ctx) => <DataTableColumnHeader ctx={ctx} label="Collection" />,
      cell: ({ row }) => <StatusBadgeCell label={row.original.collection} variant="outline" />,
    },
    {
      id: "brand",
      accessorFn: (p) => p.brand,
      meta: { headClassName: "hidden sm:table-cell" },
      header: (ctx) => <DataTableColumnHeader ctx={ctx} label="Brand" />,
      cell: ({ row }) => <TableCell className="hidden sm:table-cell">{brandLabel(row.original.brand)}</TableCell>,
    },
    {
      id: "msrp",
      accessorFn: (p) => p.msrp,
      meta: { headClassName: "hidden sm:table-cell text-right" },
      header: (ctx) => <DataTableColumnHeader ctx={ctx} align="right" label="MSRP" />,
      cell: ({ row }) => <MoneyCell value={row.original.msrp} className="hidden sm:table-cell" />,
    },
    {
      id: "discountPercent",
      accessorFn: (p) => p.discountPercent,
      meta: { headClassName: "hidden md:table-cell text-right" },
      header: (ctx) => <DataTableColumnHeader ctx={ctx} align="right" label="Disc." />,
      cell: ({ row }) => <PercentCell value={row.original.discountPercent} className="hidden md:table-cell" />,
    },
    {
      id: "discountPrice",
      accessorFn: (p) => p.discountPrice,
      meta: { headClassName: "hidden sm:table-cell text-right" },
      header: (ctx) => <DataTableColumnHeader ctx={ctx} align="right" label="Sale Price" />,
      cell: ({ row }) => <MoneyCell value={row.original.discountPrice} emphasis="sale" className="hidden sm:table-cell" />,
    },
    {
      id: "clients",
      header: "Clients",
      enableSorting: false,
      meta: { headClassName: "text-right" },
      cell: ({ row }) => {
        const count = matchCounts[row.original.id] ?? 0;
        return (
          <StatusBadgeCell
            className="text-right"
            label={count > 0 ? `${count} client${count !== 1 ? "s" : ""}` : null}
          />
        );
      },
    },
  ];

  if (isManager) {
    columns.push({
      id: "actions",
      header: "Actions",
      enableSorting: false,
      meta: { headClassName: "text-right" },
      cell: ({ row }) => (
        <TableCell className="text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="size-8 p-0" aria-label="Actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(row.original)}>
                <Trash2 className="size-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      ),
    });
  }

  return (
    <>
      <Topbar title="Promo Manager" />
      <Tabs value={tab} onValueChange={onTabChange} className="flex-1 flex flex-col">
        <div className="px-4 md:px-6 pt-4">
          <TabsList>
            <TabsTrigger value="promos">Promos</TabsTrigger>
            <TabsTrigger value="matched">Matched Clients</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="promos" className="flex-1">
      <div className="flex-1 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="sr-only">Promo Manager</h1>
          <p className="text-muted-foreground mt-1">
            Promo items — match them to interested clients
          </p>
        </div>
        {isManager && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <ClipboardPaste className="size-4 mr-2" />
            Import
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="size-4 mr-2" />
                Add Single
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Promo Item</DialogTitle>
                <DialogDescription>
                  {summary.current
                    ? `Joins the current promo (${periodLabel(summary.current)}).`
                    : "No promo is running, so pick this item's promo dates."}
                </DialogDescription>
              </DialogHeader>
              <FieldGroup className="gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor="modelNumber">Model Number</FieldLabel>
                    <Input id="modelNumber" placeholder="e.g., MV-1109-BLK" value={newPromo.modelNumber} onChange={(e) => setNewPromo({ ...newPromo, modelNumber: e.target.value })} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="collection">Collection</FieldLabel>
                    <Input id="collection" placeholder="e.g., Sundrift" value={newPromo.collection} onChange={(e) => setNewPromo({ ...newPromo, collection: e.target.value })} />
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="promo-brand">Brand *</FieldLabel>
                  <Select value={newPromo.brand || undefined} onValueChange={(v) => setNewPromo({ ...newPromo, brand: v })}>
                    <SelectTrigger id="promo-brand"><SelectValue placeholder="Select brand" /></SelectTrigger>
                    <SelectContent>
                      {brandList.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Separator />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field>
                    <FieldLabel htmlFor="msrp">MSRP ($)</FieldLabel>
                    <Input id="msrp" type="number" step="0.01" placeholder="395.00" value={newPromo.msrp} onChange={(e) => setNewPromo({ ...newPromo, msrp: e.target.value })} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="discountPct">Discount (%)</FieldLabel>
                    <Input id="discountPct" type="number" step="0.1" placeholder="25" value={newPromo.discountPercent} onChange={(e) => setNewPromo({ ...newPromo, discountPercent: e.target.value })} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="discountPrice">Sale Price ($)</FieldLabel>
                    <Input id="discountPrice" type="number" step="0.01" placeholder="296.25" value={newPromo.discountPrice} onChange={(e) => setNewPromo({ ...newPromo, discountPrice: e.target.value })} />
                  </Field>
                </div>
                {!summary.current && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field>
                      <FieldLabel htmlFor="promoStart">Promo start *</FieldLabel>
                      <Input id="promoStart" type="date" value={newPromo.promoStart} onChange={(e) => setNewPromo({ ...newPromo, promoStart: e.target.value })} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="promoEnd">Promo end *</FieldLabel>
                      <Input id="promoEnd" type="date" value={newPromo.promoEnd} onChange={(e) => setNewPromo({ ...newPromo, promoEnd: e.target.value })} />
                    </Field>
                  </div>
                )}
              </FieldGroup>
              <DialogFooter className="mt-4">
                <Button onClick={handleCreatePromo} disabled={isCreating} className="w-full">
                  {isCreating ? "Adding..." : "Add Promo Item"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        )}
      </div>

      {/* Promo Period Banner */}
      {summary.count > 0 && (summary.promoStart || summary.promoEnd) && (
        <Card className="mb-6 border-primary/40 bg-primary/5">
          <CardContent className="py-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CalendarDays className="size-5 text-primary" />
                <span className="text-sm font-medium">Current Promo Period</span>
                <span className="text-sm text-muted-foreground">
                  {summary.promoStart ? format(parseISO(summary.promoStart), "MMM d") : "?"} — {summary.promoEnd ? format(parseISO(summary.promoEnd), "MMM d, yyyy") : "?"}
                </span>
              </div>
              {isManager && (
              <Button variant="outline" size="sm" className="text-destructive h-7" onClick={() => setClearAllOpen(true)}>
                <Trash className="size-3 mr-1" />
                Clear All &amp; Reset
              </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatsCard label="Total Promos" value={summary.count} icon={Tag} />
        <StatsCard label="Total Retail Value" value={`$${summary.retailValue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} icon={FileSpreadsheet} iconClassName="text-info" />
        <StatsCard label="Total Client Savings" value={`$${summary.savings.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} icon={Calendar} iconClassName="text-success" valueClassName="text-success" />
      </div>

      {/* Promo Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Current Promo List</CardTitle>
            {isManager && summary.count > 0 && !(summary.promoStart || summary.promoEnd) && (
              <Button variant="outline" size="sm" className="text-destructive" onClick={() => setClearAllOpen(true)}>
                <Trash className="size-4 mr-2" />
                Clear All
              </Button>
            )}
          </div>
          {/* Search + filters */}
          <div className="mt-3 flex items-center gap-2">
            <SearchInput
              placeholder="Search model, collection or brand..."
              value={draft.q}
              onChangeAction={(v) => setDraft({ ...draft, q: v })}
              className="max-w-sm"
            />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className={`size-4 mr-1.5 ${hasActiveFilters ? "text-primary" : ""}`} />
                  Filters
                </Button>
              </PopoverTrigger>
              <PopoverContent className="flex flex-col w-72 gap-3" align="end">
                <div>
                  <div className="text-xs font-medium mb-1">Brand</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {brandList.map((b) => (
                      <label key={b} className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <Checkbox checked={brandFilter.includes(b)} onCheckedChange={() => navigate({ brands: toggleIn(brandFilter, b), page: 1 })} />
                        {brandLabel(b)}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium mb-1">Collection</div>
                  <div className="flex flex-col max-h-32 overflow-y-auto gap-1">
                    {distinctCollections.map((c) => (
                      <label key={c} className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <Checkbox checked={collectionFilter.includes(c)} onCheckedChange={() => navigate({ collections: toggleIn(collectionFilter, c), page: 1 })} />
                        {c}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-xs font-medium mb-1">Max MSRP</div>
                    <Input type="number" value={draft.msrpMax} onChange={(e) => setDraft({ ...draft, msrpMax: e.target.value })} placeholder="e.g. 500" className="h-8" />
                  </div>
                  <div>
                    <div className="text-xs font-medium mb-1">Min Disc. %</div>
                    <Input type="number" value={draft.discMin} onChange={(e) => setDraft({ ...draft, discMin: e.target.value })} placeholder="e.g. 20" className="h-8" />
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={clearFilters}
                >
                  Clear filters
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        </CardHeader>
        <CardContent>
          {/* `summary.count` is the whole list, `total` what the filters left. */}
          {summary.count === 0 ? (
            <EmptyState
              icon={Tag}
              title="No active promos"
              description="Import a promo list to get started"
              {...(isManager ? { action: { label: "Import from Excel", onClick: () => setImportOpen(true), icon: ClipboardPaste } } : {})}
            />
          ) : total === 0 ? (
            <EmptyState
              description="No promos match your search"
              compact
              {...(hasActiveFilters ? { action: { label: "Clear filters", onClick: clearFilters } } : {})}
            />
          ) : (
            <DataTable
              chrome={false}
              columns={columns}
              data={promos}
              getRowId={(p) => p.id}
              manualSorting
              manualFiltering
              manualPagination
              rowCount={total}
              state={{ sorting, pagination }}
              onSortingChange={handleSortingChange}
              onPaginationChange={handlePaginationChange}
              pagination={{ variant: "icons", showBorder: true }}
            />
          )}
        </CardContent>
      </Card>

      {/* Import Dialog */}
      {isManager && <ImportPromoDialog open={importOpen} onOpenChangeAction={setImportOpen} />}

      {/* Delete Confirmation */}
      {isManager && (
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChangeAction={(open) => !open && setDeleteTarget(null)}
        title="Delete Promo Item"
        description={<>Remove <strong>{deleteTarget?.modelNumber}</strong> from the current promo list?</>}
        confirmLabel="Delete"
        onConfirmAction={() => deleteTarget && handleDelete(deleteTarget.id)}
        variant="destructive"
      />
      )}

      {/* Clear All Confirmation */}
      {isManager && (
      <ConfirmDialog
        open={clearAllOpen}
        onOpenChangeAction={setClearAllOpen}
        title="Clear All Promos"
        description={`This will permanently delete all ${summary.count} promo items and their client matches. Use this to reset before importing the next promo list.`}
        confirmLabel="Clear All"
        onConfirmAction={handleClearAll}
        variant="destructive"
      />
      )}
      </div>
        </TabsContent>
        <TabsContent value="matched" className="flex-1">
          <div className="flex-1 p-4 md:p-6">
            <MatchedClientsTab clients={matchedClients} truncated={matchedClientsTruncated} isManager={isManager} currentUserId={currentUserId} />
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
