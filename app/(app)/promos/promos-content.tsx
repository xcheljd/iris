"use client";

import { useState, useMemo, useEffect } from "react";
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
import type { MatchedClientRow } from "@/lib/queries";
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
import { DataTable, type DataTableColumn, type DataTableSortFn } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
// Promo Import disabled for demo — Coming Soon
// import { ImportPromoDialog } from "@/components/promo/import-promo-dialog";

const PAGE_SIZE = 15;

// The comparators this surface already sorted with: text columns compare with
// `localeCompare`, numeric columns subtract, and a null number reads as
// -Infinity so blanks lead ascending. Passing them is not optional — the engine
// registers no sorting-function registry, so a column that omits `sortFn`
// silently falls back to `basic` (and warns in development).
//
// One deliberate fix: the old code coerced *every* null to -Infinity, so a null
// brand sorted as the literal string "-Infinity" — i.e. somewhere around "I",
// mid-alphabet. Text nulls now read as "" and lead, like every other column.
const textSort: DataTableSortFn<PromoWatch> = (a, b, columnId) =>
  String(a.getValue(columnId) ?? "").localeCompare(String(b.getValue(columnId) ?? ""));

const numericSort: DataTableSortFn<PromoWatch> = (a, b, columnId) =>
  ((a.getValue(columnId) as number | null) ?? -Infinity) -
  ((b.getValue(columnId) as number | null) ?? -Infinity);

interface PromosContentProps {
  promos: PromoWatch[];
  isManager: boolean;
  matchCounts?: Record<string, number>;
  currentUserId?: string;
  matchedClients?: MatchedClientRow[];
}


export function PromosContent({ promos: initialPromos, isManager, matchCounts = {}, currentUserId = "", matchedClients = [] }: PromosContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "matched" ? "matched" : "promos";
  const onTabChange = (v: string) => {
    const p = new URLSearchParams(Array.from(searchParams.entries()));
    if (v === "matched") p.set("tab", "matched"); else p.delete("tab");
    const qs = p.toString();
    router.replace(`/promos${qs ? `?${qs}` : ""}`);
  };
  const [promos, setPromos] = useState(initialPromos);
  // router.refresh() (after import/create) re-renders the server component with
  // fresh data, but useState keeps its initial value — sync when the prop changes.
  useEffect(() => {
    setPromos(initialPromos);
  }, [initialPromos]);
  const [isCreating, setIsCreating] = useState(false);
  const [newPromo, setNewPromo] = useState({ modelNumber: "", collection: "", brand: "", msrp: "", discountPercent: "", discountPrice: "", sizeOneQty: "", sizeTwoQty: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<PromoWatch | null>(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  // Promo Import disabled for demo — Coming Soon
  // const [importOpen, setImportOpen] = useState(false);

  // Promos is the first client-side engine surface: nothing here is in the URL
  // but the tab, so sorting and pagination stay plain local state and TanStack's
  // sorted/paginated row models do the work (no `manual*` flags).
  const [sorting, setSorting] = useState<SortingState>([]);
  const [brandFilter, setBrandFilter] = useState<Set<string>>(new Set());
  const [collectionFilter, setCollectionFilter] = useState<Set<string>>(new Set());
  const [priceMax, setPriceMax] = useState("");
  const [discMin, setDiscMin] = useState("");
  const [size1Pos, setSize1Pos] = useState(false);
  const [size2Pos, setSize2Pos] = useState(false);

  const distinctCollections = useMemo(
    () => Array.from(new Set(promos.map((p) => p.collection))).sort(),
    [promos],
  );

  const toggleIn = (set: Set<string>, v: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v); else next.add(v);
    setter(next);
  };

  const filtered = useMemo(() => {
    let r = promos;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      r = r.filter((p) => p.modelNumber.toLowerCase().includes(q) || p.collection.toLowerCase().includes(q));
    }
    if (brandFilter.size) r = r.filter((p) => p.brand && brandFilter.has(p.brand));
    if (collectionFilter.size) r = r.filter((p) => collectionFilter.has(p.collection));
    if (priceMax.trim()) { const m = parseFloat(priceMax); if (!isNaN(m)) r = r.filter((p) => (p.msrp ?? Infinity) <= m); }
    if (discMin.trim()) { const m = parseFloat(discMin); if (!isNaN(m)) r = r.filter((p) => (p.discountPercent ?? 0) >= m); }
    if (size1Pos) r = r.filter((p) => p.sizeOneQty > 0);
    if (size2Pos) r = r.filter((p) => p.sizeTwoQty > 0);
    return r;
  }, [promos, searchQuery, brandFilter, collectionFilter, priceMax, discMin, size1Pos, size2Pos]);

  // The engine compares state slices shallowly, so this has to keep its
  // identity between renders that did not move the page. The clamp reproduces
  // the old `Math.min(page, totalPages)`: a delete that shrinks the list shows
  // the last real page without rewriting the stored index.
  const pagination = useMemo<PaginationState>(() => {
    const lastIndex = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1);
    return { pageIndex: Math.min(pageIndex, lastIndex), pageSize: PAGE_SIZE };
  }, [filtered.length, pageIndex]);

  const handlePaginationChange: OnChangeFn<PaginationState> = (updater) => {
    const next = typeof updater === "function" ? updater(pagination) : updater;
    setPageIndex(next.pageIndex);
  };

  const totalRetailValue = promos.reduce((sum, p) => sum + (p.msrp || 0), 0);
  const totalSavings = promos.reduce((sum, p) => sum + ((p.msrp || 0) - (p.discountPrice || 0)), 0);

  // Derive promo period from the data
  const promoStart = useMemo(() => {
    const starts = promos.map((p) => p.promoStart).filter(Boolean);
    if (starts.length === 0) return null;
    return starts.sort()[0];
  }, [promos]);

  const promoEnd = useMemo(() => {
    const ends = promos.map((p) => p.promoEnd).filter(Boolean);
    if (ends.length === 0) return null;
    return ends.sort().reverse()[0];
  }, [promos]);

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

  const handleDelete = async (id: string) => {
    try {
      await deletePromo(id);
      setPromos(promos.filter((p) => p.id !== id));
      toast.success("Promo deleted");
      setDeleteTarget(null);
    } catch { toast.error("Failed to delete promo"); }
  };

  const handleClearAll = async () => {
    try {
      await clearAllPromos();
      setPromos([]);
      toast.success("All promos cleared — ready for next week's list");
      setClearAllOpen(false);
    } catch { toast.error("Failed to clear promos"); }
  };

  // Rebuilt every render — cheap, because the engine keys its row model on
  // `data` alone, and the Clients and Actions cells have to see the current
  // match counts and delete target.
  const columns: DataTableColumn<PromoWatch>[] = [
    {
      id: "modelNumber",
      accessorFn: (p) => p.modelNumber,
      sortFn: textSort,
      header: (ctx) => <DataTableColumnHeader ctx={ctx} label="Model Number" />,
      cell: ({ row }) => <MonoCell value={row.original.modelNumber} className="font-medium" />,
    },
    {
      id: "collection",
      accessorFn: (p) => p.collection,
      sortFn: textSort,
      header: (ctx) => <DataTableColumnHeader ctx={ctx} label="Collection" />,
      cell: ({ row }) => <StatusBadgeCell label={row.original.collection} variant="outline" />,
    },
    {
      id: "brand",
      accessorFn: (p) => p.brand,
      sortFn: textSort,
      meta: { headClassName: "hidden sm:table-cell" },
      header: (ctx) => <DataTableColumnHeader ctx={ctx} label="Brand" />,
      cell: ({ row }) => <TableCell className="hidden sm:table-cell">{brandLabel(row.original.brand)}</TableCell>,
    },
    {
      id: "msrp",
      accessorFn: (p) => p.msrp,
      sortFn: numericSort,
      meta: { headClassName: "hidden sm:table-cell text-right" },
      header: (ctx) => <DataTableColumnHeader ctx={ctx} align="right" label="MSRP" />,
      cell: ({ row }) => <MoneyCell value={row.original.msrp} className="hidden sm:table-cell" />,
    },
    {
      id: "discountPercent",
      accessorFn: (p) => p.discountPercent,
      sortFn: numericSort,
      meta: { headClassName: "hidden md:table-cell text-right" },
      header: (ctx) => <DataTableColumnHeader ctx={ctx} align="right" label="Disc." />,
      cell: ({ row }) => <PercentCell value={row.original.discountPercent} className="hidden md:table-cell" />,
    },
    {
      id: "discountPrice",
      accessorFn: (p) => p.discountPrice,
      sortFn: numericSort,
      meta: { headClassName: "hidden sm:table-cell text-right" },
      header: (ctx) => <DataTableColumnHeader ctx={ctx} align="right" label="Sale Price" />,
      cell: ({ row }) => <MoneyCell value={row.original.discountPrice} emphasis="sale" className="hidden sm:table-cell" />,
    },
    {
      id: "sizeOneQty",
      accessorFn: (p) => p.sizeOneQty,
      sortFn: numericSort,
      meta: { headClassName: "hidden md:table-cell text-right" },
      header: (ctx) => <DataTableColumnHeader ctx={ctx} align="right" label="Size 1" />,
      cell: ({ row }) => <TableCell className="text-right hidden md:table-cell">{row.original.sizeOneQty}</TableCell>,
    },
    {
      id: "sizeTwoQty",
      accessorFn: (p) => p.sizeTwoQty,
      sortFn: numericSort,
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
      {promos.length > 0 && (promoStart || promoEnd) && (
        <Card className="mb-6 border-primary/40 bg-primary/5">
          <CardContent className="py-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CalendarDays className="size-5 text-primary" />
                <span className="text-sm font-medium">Current Promo Period</span>
                <span className="text-sm text-muted-foreground">
                  {promoStart ? format(parseISO(promoStart), "MMM d") : "?"} — {promoEnd ? format(parseISO(promoEnd), "MMM d, yyyy") : "?"}
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
        <StatsCard label="Total Promos" value={promos.length} icon={Tag} />
        <StatsCard label="Total Retail Value" value={`$${totalRetailValue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} icon={FileSpreadsheet} iconClassName="text-blue-500" />
        <StatsCard label="Total Client Savings" value={`$${totalSavings.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} icon={Calendar} iconClassName="text-green-500" valueClassName="text-green-500" />
      </div>

      {/* Promo Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Current Promo List</CardTitle>
            {isManager && promos.length > 0 && !(promoStart || promoEnd) && (
              <Button variant="outline" size="sm" className="text-destructive" onClick={() => setClearAllOpen(true)}>
                <Trash className="size-4 mr-2" />
                Clear All
              </Button>
            )}
          </div>
          {/* Search + filters */}
          <div className="mt-3 flex items-center gap-2">
            <SearchInput
              placeholder="Search model or collection..."
              value={searchQuery}
              onChangeAction={(v) => { setSearchQuery(v); setPageIndex(0); }}
              className="max-w-sm"
            />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className={`size-4 mr-1.5 ${(brandFilter.size || collectionFilter.size || priceMax || discMin || size1Pos || size2Pos) ? "text-primary" : ""}`} />
                  Filters
                </Button>
              </PopoverTrigger>
              <PopoverContent className="flex flex-col w-72 gap-3" align="end">
                <div>
                  <div className="text-xs font-medium mb-1">Brand</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {BRAND_VALUES.map((b) => (
                      <label key={b} className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <Checkbox checked={brandFilter.has(b)} onCheckedChange={() => { toggleIn(brandFilter, b, setBrandFilter); setPageIndex(0); }} />
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
                        <Checkbox checked={collectionFilter.has(c)} onCheckedChange={() => { toggleIn(collectionFilter, c, setCollectionFilter); setPageIndex(0); }} />
                        {c}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-xs font-medium mb-1">Max MSRP</div>
                    <Input type="number" value={priceMax} onChange={(e) => { setPriceMax(e.target.value); setPageIndex(0); }} placeholder="e.g. 500" className="h-8" />
                  </div>
                  <div>
                    <div className="text-xs font-medium mb-1">Min Disc. %</div>
                    <Input type="number" value={discMin} onChange={(e) => { setDiscMin(e.target.value); setPageIndex(0); }} placeholder="e.g. 20" className="h-8" />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <Checkbox checked={size1Pos} onCheckedChange={(c) => { setSize1Pos(c === true); setPageIndex(0); }} /> Size 1 in stock (&gt;0)
                  </label>
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <Checkbox checked={size2Pos} onCheckedChange={(c) => { setSize2Pos(c === true); setPageIndex(0); }} /> Size 2 in stock (&gt;0)
                  </label>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => { setBrandFilter(new Set()); setCollectionFilter(new Set()); setPriceMax(""); setDiscMin(""); setSize1Pos(false); setSize2Pos(false); setPageIndex(0); }}
                >
                  Clear filters
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        </CardHeader>
        <CardContent>
          {promos.length === 0 ? (
            /* Promo Import disabled for demo — Coming Soon. Restore the manager CTA with:
               {...(isManager ? { action: { label: "Import from Excel", onClick: () => setImportOpen(true), icon: ClipboardPaste } } : {})} */
            <EmptyState
              icon={Watch}
              title="No active promos"
              description="Import this week's promo list to get started"
            />
          ) : filtered.length === 0 ? (
            <EmptyState description="No promos match your search" compact />
          ) : (
            <DataTable
              chrome={false}
              columns={columns}
              data={filtered}
              getRowId={(p) => p.id}
              // The sorted row model resets the page on every re-sort, and the
              // core one on every data change; this surface never did either —
              // filters reset the page explicitly and a shrinking list clamps.
              autoResetPageIndex={false}
              state={{ sorting, pagination }}
              onSortingChange={setSorting}
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
        description={`This will permanently delete all ${promos.length} promo watches and their client matches. Use this to reset before importing next week's promo list.`}
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
