"use client";

import { Fragment, useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsCard } from "@/components/stats-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SearchInput } from "@/components/search-input";
import { EmptyState } from "@/components/empty-state";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PaginationFooter } from "@/components/pagination-footer";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Tag, Plus, Trash2, Watch, Users,
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
import { ArrowUpDown, Filter } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { ImportPromoDialog } from "@/components/promo/import-promo-dialog";

const PAGE_SIZE = 15;

interface PromoClientMatch {
  match: { id: string; matchType: string };
  client?: { id: string; firstName: string; lastName: string | null; phone: string | null; employeeId: string | null };
}

interface PromosContentProps {
  promos: PromoWatch[];
  isManager: boolean;
  matchCounts?: Record<string, number>;
  currentUserId?: string;
}


export function PromosContent({ promos: initialPromos, isManager, matchCounts = {}, currentUserId = "" }: PromosContentProps) {
  const router = useRouter();
  const [promos, setPromos] = useState(initialPromos);
  // router.refresh() (after import/create) re-renders the server component with
  // fresh data, but useState keeps its initial value — sync when the prop changes.
  useEffect(() => {
    setPromos(initialPromos);
  }, [initialPromos]);
  const [isCreating, setIsCreating] = useState(false);
  const [showMatches, setShowMatches] = useState<string | null>(null);
  const [matches, setMatches] = useState<PromoClientMatch[]>([]);
  const [newPromo, setNewPromo] = useState({ modelNumber: "", collection: "", brand: "", msrp: "", discountPercent: "", discountPrice: "", sizeOneQty: "", sizeTwoQty: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<PromoWatch | null>(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  type SortKey = "modelNumber" | "collection" | "brand" | "msrp" | "discountPercent" | "discountPrice" | "sizeOneQty" | "sizeTwoQty";
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [brandFilter, setBrandFilter] = useState<Set<string>>(new Set());
  const [collectionFilter, setCollectionFilter] = useState<Set<string>>(new Set());
  const [priceMax, setPriceMax] = useState("");
  const [discMin, setDiscMin] = useState("");
  const [size1Pos, setSize1Pos] = useState(false);
  const [size2Pos, setSize2Pos] = useState(false);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setSortDir(1); }
  };

  const distinctCollections = useMemo(
    () => Array.from(new Set(promos.map((p) => p.collection))).sort(),
    [promos],
  );

  const SortHead = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => (
    <TableHead className={className}>
      <button className="inline-flex items-center gap-1 font-medium" onClick={() => toggleSort(k)}>
        {label}
        <ArrowUpDown className={`h-3 w-3 ${sortKey === k ? "text-foreground" : "text-muted-foreground/50"}`} />
      </button>
    </TableHead>
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
    if (sortKey) {
      const val = (p: PromoWatch) => {
        const v = p[sortKey];
        return v == null ? (typeof v === "string" ? "" : -Infinity) : v;
      };
      r = [...r].sort((a, b) => {
        const av = val(a), bv = val(b);
        if (typeof av === "string" || typeof bv === "string") return String(av).localeCompare(String(bv)) * sortDir;
        return ((av as number) - (bv as number)) * sortDir;
      });
    }
    return r;
  }, [promos, searchQuery, brandFilter, collectionFilter, priceMax, discMin, size1Pos, size2Pos, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

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

  const handleViewMatches = async (promoId: string) => {
    if (showMatches === promoId) { setShowMatches(null); return; }
    try {
      const response = await fetch(`/api/promos/matches?promoId=${promoId}`);
      if (response.ok) { const data = await response.json(); setMatches(data); setShowMatches(promoId); }
    } catch { toast.error("Failed to load matches"); }
  };

  return (
    <>
      <Topbar title="Promo Manager" />
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
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <ClipboardPaste className="h-4 w-4 mr-2" />
            Import
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Add Single
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Promo Watch</DialogTitle>
                <DialogDescription>Add a single model to the current promo list.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="modelNumber">Model Number</Label>
                    <Input id="modelNumber" placeholder="e.g., HX1009-01X" value={newPromo.modelNumber} onChange={(e) => setNewPromo({ ...newPromo, modelNumber: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="collection">Collection</Label>
                    <Input id="collection" placeholder="e.g., Solaris" value={newPromo.collection} onChange={(e) => setNewPromo({ ...newPromo, collection: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Brand *</Label>
                    <Select value={newPromo.brand || undefined} onValueChange={(v) => setNewPromo({ ...newPromo, brand: v })}>
                      <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                      <SelectContent>
                        {BRAND_VALUES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="size1">Size 1 qty</Label>
                    <Input id="size1" type="number" min="0" placeholder="0" value={newPromo.sizeOneQty} onChange={(e) => setNewPromo({ ...newPromo, sizeOneQty: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="size2">Size 2 qty</Label>
                    <Input id="size2" type="number" min="0" placeholder="0" value={newPromo.sizeTwoQty} onChange={(e) => setNewPromo({ ...newPromo, sizeTwoQty: e.target.value })} />
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="msrp">MSRP ($)</Label>
                    <Input id="msrp" type="number" step="0.01" placeholder="395.00" value={newPromo.msrp} onChange={(e) => setNewPromo({ ...newPromo, msrp: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="discountPct">Discount (%)</Label>
                    <Input id="discountPct" type="number" step="0.1" placeholder="25" value={newPromo.discountPercent} onChange={(e) => setNewPromo({ ...newPromo, discountPercent: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="discountPrice">Sale Price ($)</Label>
                    <Input id="discountPrice" type="number" step="0.01" placeholder="296.25" value={newPromo.discountPrice} onChange={(e) => setNewPromo({ ...newPromo, discountPrice: e.target.value })} />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCreatePromo} disabled={isCreating} className="w-full">
                    {isCreating ? "Adding..." : "Add Promo Watch"}
                  </Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        )}
      </div>

      {/* Promo Period Banner */}
      {promos.length > 0 && (promoStart || promoEnd) && (
        <Card className="mb-6 border-blue-800/50 bg-blue-950/20">
          <CardContent className="py-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-blue-400" />
                <span className="text-sm font-medium">Current Promo Period</span>
                <span className="text-sm text-muted-foreground">
                  {promoStart ? format(parseISO(promoStart), "MMM d") : "?"} — {promoEnd ? format(parseISO(promoEnd), "MMM d, yyyy") : "?"}
                </span>
              </div>
              {isManager && (
              <Button variant="outline" size="sm" className="text-destructive h-7" onClick={() => setClearAllOpen(true)}>
                <Trash className="h-3 w-3 mr-1" />
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
                <Trash className="h-4 w-4 mr-2" />
                Clear All
              </Button>
            )}
          </div>
          {/* Search + filters */}
          <div className="mt-3 flex items-center gap-2">
            <SearchInput
              placeholder="Search model or collection..."
              value={searchQuery}
              onChange={(v) => { setSearchQuery(v); setPage(1); }}
              className="max-w-sm"
            />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className={`h-4 w-4 mr-1.5 ${(brandFilter.size || collectionFilter.size || priceMax || discMin || size1Pos || size2Pos) ? "text-primary" : ""}`} />
                  Filters
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 space-y-3" align="end">
                <div>
                  <div className="text-xs font-medium mb-1">Brand</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {BRAND_VALUES.map((b) => (
                      <label key={b} className="flex items-center gap-1.5 text-sm">
                        <input type="checkbox" checked={brandFilter.has(b)} onChange={() => { toggleIn(brandFilter, b, setBrandFilter); setPage(1); }} />
                        {brandLabel(b)}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium mb-1">Collection</div>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {distinctCollections.map((c) => (
                      <label key={c} className="flex items-center gap-1.5 text-sm">
                        <input type="checkbox" checked={collectionFilter.has(c)} onChange={() => { toggleIn(collectionFilter, c, setCollectionFilter); setPage(1); }} />
                        {c}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-xs font-medium mb-1">Max MSRP</div>
                    <Input type="number" value={priceMax} onChange={(e) => { setPriceMax(e.target.value); setPage(1); }} placeholder="e.g. 500" className="h-8" />
                  </div>
                  <div>
                    <div className="text-xs font-medium mb-1">Min Disc. %</div>
                    <Input type="number" value={discMin} onChange={(e) => { setDiscMin(e.target.value); setPage(1); }} placeholder="e.g. 20" className="h-8" />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={size1Pos} onChange={(e) => { setSize1Pos(e.target.checked); setPage(1); }} /> Size 1 in stock (&gt;0)
                  </label>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={size2Pos} onChange={(e) => { setSize2Pos(e.target.checked); setPage(1); }} /> Size 2 in stock (&gt;0)
                  </label>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => { setBrandFilter(new Set()); setCollectionFilter(new Set()); setPriceMax(""); setDiscMin(""); setSize1Pos(false); setSize2Pos(false); setPage(1); }}
                >
                  Clear filters
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        </CardHeader>
        <CardContent>
          {promos.length === 0 ? (
            <EmptyState
              icon={Watch}
              title="No active promos"
              description="Import this week's promo list to get started"
              {...(isManager ? { action: { label: "Import from Excel", onClick: () => setImportOpen(true), icon: ClipboardPaste } } : {})}
            />
          ) : filtered.length === 0 ? (
            <EmptyState description="No promos match your search" compact />
          ) : (
            <>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHead k="modelNumber" label="Model Number" />
                    <SortHead k="collection" label="Collection" />
                    <SortHead k="brand" label="Brand" className="hidden sm:table-cell" />
                    <SortHead k="msrp" label="MSRP" className="text-right hidden sm:table-cell" />
                    <SortHead k="discountPercent" label="Disc." className="text-right hidden md:table-cell" />
                    <SortHead k="discountPrice" label="Sale Price" className="text-right hidden sm:table-cell" />
                    <SortHead k="sizeOneQty" label="Size 1" className="text-right hidden md:table-cell" />
                    <SortHead k="sizeTwoQty" label="Size 2" className="text-right hidden md:table-cell" />
                    <TableHead className="text-right">Clients</TableHead>
                    {isManager && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((promo) => (
                    <Fragment key={promo.id}>
                      <TableRow>
                        <TableCell className="font-medium font-mono text-sm">{promo.modelNumber}</TableCell>
                        <TableCell><Badge variant="outline">{promo.collection}</Badge></TableCell>
                        <TableCell className="hidden sm:table-cell">{brandLabel(promo.brand)}</TableCell>
                        <TableCell className="text-right hidden sm:table-cell">{promo.msrp != null ? `$${promo.msrp.toFixed(2)}` : "—"}</TableCell>
                        <TableCell className="text-right hidden md:table-cell">{promo.discountPercent != null ? `${promo.discountPercent}%` : "—"}</TableCell>
                        <TableCell className="text-right hidden sm:table-cell font-medium text-green-500">{promo.discountPrice != null ? `$${promo.discountPrice.toFixed(2)}` : "—"}</TableCell>
                        <TableCell className="text-right hidden md:table-cell">{promo.sizeOneQty}</TableCell>
                        <TableCell className="text-right hidden md:table-cell">{promo.sizeTwoQty}</TableCell>
                        <TableCell className="text-right">
                          {(matchCounts[promo.id] ?? 0) > 0 && (
                            <Badge variant="secondary">
                              {matchCounts[promo.id]} client{matchCounts[promo.id] !== 1 ? "s" : ""}
                            </Badge>
                          )}
                        </TableCell>
                        {isManager && (
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Actions">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleViewMatches(promo.id)}>
                                <Users className="h-4 w-4 mr-2" />
                                View Matches
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(promo)}>
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                        )}
                      </TableRow>
                      {showMatches === promo.id && (
                        <TableRow key={`${promo.id}-matches`}>
                          <TableCell colSpan={isManager ? 10 : 9} className="bg-muted/30 p-4">
                            <div className="space-y-2">
                              <h4 className="text-sm font-medium">Matched Clients</h4>
                              {matches.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No client matches yet</p>
                              ) : (
                                <div className="space-y-1">
                                  {matches.map((m) => (
                                    <div key={m.match.id} className="flex items-center gap-2 text-sm">
                                      <Badge variant="outline" className="text-xs">{m.match.matchType}</Badge>
                                      {m.client && (isManager || m.client.employeeId === currentUserId) ? (
                                        <Link
                                          href={`/clients/${m.client.id}`}
                                          className="font-medium hover:underline"
                                        >
                                          {m.client.firstName} {m.client.lastName || ""}
                                        </Link>
                                      ) : (
                                        <span>{m.client?.firstName} {m.client?.lastName || ""}</span>
                                      )}
                                      {m.client?.phone && <span className="text-muted-foreground">{m.client.phone}</span>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
              </div>

              <PaginationFooter
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setPage}
                totalItems={filtered.length}
                pageSize={PAGE_SIZE}
                variant="icons"
                showBorder
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Import Dialog */}
      {isManager && <ImportPromoDialog open={importOpen} onOpenChange={setImportOpen} />}

      {/* Delete Confirmation */}
      {isManager && (
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Promo Watch"
        description={<>Remove <strong>{deleteTarget?.modelNumber}</strong> from the current promo list?</>}
        confirmLabel="Delete"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
        variant="destructive"
      />
      )}

      {/* Clear All Confirmation */}
      {isManager && (
      <ConfirmDialog
        open={clearAllOpen}
        onOpenChange={setClearAllOpen}
        title="Clear All Promos"
        description={`This will permanently delete all ${promos.length} promo watches and their client matches. Use this to reset before importing next week's promo list.`}
        confirmLabel="Clear All"
        onConfirm={handleClearAll}
        variant="destructive"
      />
      )}
      </div>
    </>
  );
}
