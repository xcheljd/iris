"use client";

import { useState, useMemo, useEffect, useRef, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { OnChangeFn, PaginationState, SortingState } from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsCard } from "@/components/stats-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Tag, Plus, Trash2, Watch,
  MoreHorizontal, ClipboardPaste,
  FileSpreadsheet, Trash, CalendarDays, Calendar,
} from "lucide-react";
import { createPromo, deletePromo, clearAllPromos } from "@/lib/actions";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import type { PromoWatch } from "@/lib/db/schema";
import { BRAND_VALUES, type Brand } from "@/lib/db/schema";
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
// Promo Import disabled for demo — Coming Soon
// import { ImportPromoDialog } from "@/components/promo/import-promo-dialog";

/** Debounce before a typed filter becomes a navigation. Clients uses the same. */
const TYPING_DELAY_MS = 300;

/** The promo list's URL state — the server has already applied all of it. */
export interface PromoFilters {
  q: string;
  brands: string[];
  collections: string[];
  msrpMax?: number;
  discMin?: number;
  size1Pos: boolean;
  size2Pos: boolean;
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
}

interface PromosContentProps {
  /** One page of promos, already filtered, sorted and sliced by the server. */
  promos: PromoWatch[];
  total: number;
  summary: PromoSummary;
  /** Every distinct collection in the list, for the filter menu. */
  collections: string[];
  filters: PromoFilters;
  isManager: boolean;
  matchCounts?: Record<string, number>;
  currentUserId?: string;
  matchedClients?: MatchedClientRow[];
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

export function PromosContent({ promos, total, summary, collections: distinctCollections, filters, isManager, matchCounts = {}, currentUserId = "", matchedClients = [] }: PromosContentProps) {
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
  const [newPromo, setNewPromo] = useState({ modelNumber: "", collection: "", brand: "", msrp: "", discountPercent: "", discountPrice: "", sizeOneQty: "", sizeTwoQty: "" });
  const [deleteTarget, setDeleteTarget] = useState<PromoWatch | null>(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  // Promo Import disabled for demo — Coming Soon
  // const [importOpen, setImportOpen] = useState(false);

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
    if (next.size1Pos) sp.set("s1", "1");
    if (next.size2Pos) sp.set("s2", "1");
    if (next.sort) sp.set("sort", next.sort);
    if (next.sort && next.dir !== "asc") sp.set("dir", next.dir);
    if (next.page > 1) sp.set("page", String(next.page));
    const qs = sp.toString();
    // scroll: false keeps the pagination footer under the cursor; the
    // transition keeps the current rows interactive while the server renders.
    startTransition(() => {
      router.replace(`/promos${qs ? `?${qs}` : ""}`, { scroll: false });
    });
  }

  // Keep a ref current so the debounce never closes over a stale navigate.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  // Adopt values that arrived from outside — a back/forward navigation, or a
  // deep link — so the inputs and the URL stay in step.
  useEffect(() => {
    const fromUrl = draftOf(filters);
    committed.current = fromUrl;
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
    !!draft.msrpMax || !!draft.discMin || filters.size1Pos || filters.size2Pos;

  const handleCreatePromo = async () => {
    if (!newPromo.modelNumber.trim() || !newPromo.collection.trim()) {
      toast.error("Model number and collection are required");
      return;
    }
    if (!newPromo.brand) {
      toast.error("Brand is required");
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
        newPromo.sizeOneQty ? parseInt(newPromo.sizeOneQty, 10) : 0,
        newPromo.sizeTwoQty ? parseInt(newPromo.sizeTwoQty, 10) : 0,
      );
      if (res?.error) { toast.error(res.error); return; }
      toast.success("Promo watch created");
      setNewPromo({ modelNumber: "", collection: "", brand: "", msrp: "", discountPercent: "", discountPrice: "", sizeOneQty: "", sizeTwoQty: "" });
      router.refresh();
    } catch { toast.error("Failed to create promo watch"); }
    finally { setIsCreating(false); }
  };

  // The list is the server's now, so both mutations refetch instead of
  // splicing a local copy: the page they land on, its total and the summary
  // all have to move together.
  const handleDelete = async (id: string) => {
    try {
      await deletePromo(id);
      toast.success("Promo deleted");
      setDeleteTarget(null);
      router.refresh();
    } catch { toast.error("Failed to delete promo"); }
  };

  const handleClearAll = async () => {
    try {
      await clearAllPromos();
      toast.success("All promos cleared — ready for next week's list");
      setClearAllOpen(false);
      router.refresh();
    } catch { toast.error("Failed to clear promos"); }
  };

  // Rebuilt every render — cheap, because the engine keys its row model on
  // `data` alone, and the Clients and Actions cells have to see the current
  // match counts and delete target. No column carries a `sortFn`: with
  // `manualSorting` the engine never runs one — SQL already ordered the page.
  const columns: DataTableColumn<PromoWatch>[] = [
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
      id: "sizeOneQty",
      accessorFn: (p) => p.sizeOneQty,
      meta: { headClassName: "hidden md:table-cell text-right" },
      header: (ctx) => <DataTableColumnHeader ctx={ctx} align="right" label="Size 1" />,
      cell: ({ row }) => <TableCell className="text-right hidden md:table-cell">{row.original.sizeOneQty}</TableCell>,
    },
    {
      id: "sizeTwoQty",
      accessorFn: (p) => p.sizeTwoQty,
      meta: { headClassName: "hidden md:table-cell text-right" },
      header: (ctx) => <DataTableColumnHeader ctx={ctx} align="right" label="Size 2" />,
      cell: ({ row }) => <TableCell className="text-right hidden md:table-cell">{row.original.sizeTwoQty}</TableCell>,
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
              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(row.original)}>
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
            Weekly promo watches — match them to interested clients
          </p>
        </div>
        {isManager && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" disabled>
            <ClipboardPaste className="size-4 mr-2" />
            Import
            <Badge variant="secondary" className="ml-2 text-[10px]">Coming Soon</Badge>
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
                <DialogTitle>Add Promo Watch</DialogTitle>
                <DialogDescription>Add a single model to the current promo list.</DialogDescription>
              </DialogHeader>
              <FieldGroup className="gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor="modelNumber">Model Number</FieldLabel>
                    <Input id="modelNumber" placeholder="e.g., HX1009-01X" value={newPromo.modelNumber} onChange={(e) => setNewPromo({ ...newPromo, modelNumber: e.target.value })} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="collection">Collection</FieldLabel>
                    <Input id="collection" placeholder="e.g., Solaris" value={newPromo.collection} onChange={(e) => setNewPromo({ ...newPromo, collection: e.target.value })} />
                  </Field>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field>
                    <FieldLabel htmlFor="promo-brand">Brand *</FieldLabel>
                    <Select value={newPromo.brand || undefined} onValueChange={(v) => setNewPromo({ ...newPromo, brand: v })}>
                      <SelectTrigger id="promo-brand"><SelectValue placeholder="Select brand" /></SelectTrigger>
                      <SelectContent>
                        {BRAND_VALUES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="size1">Size 1 qty</FieldLabel>
                    <Input id="size1" type="number" min="0" placeholder="0" value={newPromo.sizeOneQty} onChange={(e) => setNewPromo({ ...newPromo, sizeOneQty: e.target.value })} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="size2">Size 2 qty</FieldLabel>
                    <Input id="size2" type="number" min="0" placeholder="0" value={newPromo.sizeTwoQty} onChange={(e) => setNewPromo({ ...newPromo, sizeTwoQty: e.target.value })} />
                  </Field>
                </div>
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
              </FieldGroup>
              <DialogFooter className="mt-4">
                <Button onClick={handleCreatePromo} disabled={isCreating} className="w-full">
                  {isCreating ? "Adding..." : "Add Promo Watch"}
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
        <StatsCard label="Total Retail Value" value={`$${summary.retailValue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} icon={FileSpreadsheet} iconClassName="text-blue-500" />
        <StatsCard label="Total Client Savings" value={`$${summary.savings.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} icon={Calendar} iconClassName="text-green-500" valueClassName="text-green-500" />
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
                    {BRAND_VALUES.map((b) => (
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
                <div className="flex flex-col gap-1">
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <Checkbox checked={filters.size1Pos} onCheckedChange={(c) => navigate({ size1Pos: c === true, page: 1 })} /> Size 1 in stock (&gt;0)
                  </label>
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <Checkbox checked={filters.size2Pos} onCheckedChange={(c) => navigate({ size2Pos: c === true, page: 1 })} /> Size 2 in stock (&gt;0)
                  </label>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    const cleared: DraftFilters = { q: "", msrpMax: "", discMin: "" };
                    setDraft(cleared);
                    navigate({ brands: [], collections: [], size1Pos: false, size2Pos: false, page: 1 }, cleared);
                  }}
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
            /* Promo Import disabled for demo — Coming Soon. Restore the manager CTA with:
               {...(isManager ? { action: { label: "Import from Excel", onClick: () => setImportOpen(true), icon: ClipboardPaste } } : {})} */
            <EmptyState
              icon={Watch}
              title="No active promos"
              description="Import this week's promo list to get started"
            />
          ) : total === 0 ? (
            <EmptyState description="No promos match your search" compact />
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
      {/* Import disabled for demo — Coming Soon */}
      {/* {isManager && <ImportPromoDialog open={importOpen} onOpenChangeAction={setImportOpen} />} */}

      {/* Delete Confirmation */}
      {isManager && (
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChangeAction={(open) => !open && setDeleteTarget(null)}
        title="Delete Promo Watch"
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
        description={`This will permanently delete all ${summary.count} promo watches and their client matches. Use this to reset before importing next week's promo list.`}
        confirmLabel="Clear All"
        onConfirmAction={handleClearAll}
        variant="destructive"
      />
      )}
      </div>
        </TabsContent>
        <TabsContent value="matched" className="flex-1">
          <div className="flex-1 p-4 md:p-6">
            <MatchedClientsTab clients={matchedClients} isManager={isManager} currentUserId={currentUserId} />
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
