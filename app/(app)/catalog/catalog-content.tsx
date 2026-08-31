"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PaginationFooter } from "@/components/pagination-footer";
import { EmptyState } from "@/components/empty-state";
import { Topbar } from "@/components/topbar";
import { Library, Check, X, Pencil, Upload, ClipboardCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { correctCatalog, resolveFlag, confirmCatalogRow, confirmCatalogRows, deleteCatalogRow, deleteCatalogRows, clearCatalog } from "@/lib/actions";
import { Checkbox } from "@/components/ui/checkbox";
import { brandLabel } from "@/lib/brand";
// Catalog Import disabled for demo — Coming Soon
// import { ImportCatalogDialog } from "@/components/catalog/import-catalog-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ColumnHeader } from "@/components/column-header";
import { ColumnFilterPopover } from "@/components/column-filter-popover";
import { TextFilterMenu, MultiSelectMenu, RangeFilterMenu } from "@/components/column-filters";
import { BRAND_VALUES } from "@/lib/db/schema";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { MoneyCell, MonoCell, StatusBadgeCell, TextCell } from "@/components/data-table/cells";
import { ActiveFilterChips, type ActiveFilterChip } from "@/components/active-filter-chips";

type CatalogFilterChipKey = "mod" | "col" | "brands" | "msrp";

interface CatalogRow {
  model: string;
  collection: string;
  source: "promo" | "manual" | "curated";
  brand: string | null;
  msrp: number | null;
  needsReview: boolean;
  flaggedCollection: string | null;
  flaggedSource: string | null;
}

interface CatalogContentProps {
  rows: CatalogRow[];
  total: number;
  needsReview: CatalogRow[];
  flagged: CatalogRow[];
  mod: string;
  col: string;
  brands: string[];
  msrpMin?: number;
  msrpMax?: number;
  msrpCeiling: number;
  sort: "model" | "collection" | "brand" | "msrp";
  dir: "asc" | "desc";
  page: number;
}

type SortKey = "model" | "collection" | "brand" | "msrp";

export function CatalogContent({ rows, total, needsReview, flagged, mod, col, brands, msrpMin, msrpMax, msrpCeiling, sort, dir, page }: CatalogContentProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  // Catalog Import disabled for demo — Coming Soon
  // const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearTyped, setClearTyped] = useState("");
  const [selectedReview, setSelectedReview] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const CLEAR_PHRASE = "CLEAR CATALOG";

  const totalPages = Math.ceil(total / DEFAULT_PAGE_SIZE);

  function navigate(
    overrides: Partial<{
      mod: string;
      col: string;
      brands: string[];
      msrpMin?: number;
      msrpMax?: number;
      sort: SortKey;
      dir: "asc" | "desc";
      page: number;
    }> = {},
  ) {
    const next = { mod, col, brands, msrpMin, msrpMax, sort, dir, page, ...overrides };
    const sp = new URLSearchParams();
    if (next.mod) sp.set("mod", next.mod);
    if (next.col) sp.set("col", next.col);
    if (next.brands.length) sp.set("brands", next.brands.join(","));
    if (next.msrpMin != null && next.msrpMin > 0) sp.set("msrpMin", String(next.msrpMin));
    if (next.msrpMax != null && next.msrpMax < msrpCeiling) sp.set("msrpMax", String(next.msrpMax));
    if (next.sort !== "model") sp.set("sort", next.sort);
    if (next.dir !== "asc") sp.set("dir", next.dir);
    if (next.page > 1) sp.set("page", String(next.page));
    router.replace(`/catalog${sp.toString() ? `?${sp.toString()}` : ""}`);
  }

  const handleSort = (k: SortKey) => {
    if (sort === k) {
      navigate({ dir: dir === "asc" ? "desc" : "asc", page: 1 });
    } else {
      navigate({ sort: k, dir: "asc", page: 1 });
    }
  };

  const sourceBadge = (s: CatalogRow["source"]) =>
    s === "curated" ? "default" : s === "promo" ? "secondary" : "outline";

  const filterChips: ActiveFilterChip<CatalogFilterChipKey>[] = [];
  if (mod) filterChips.push({ key: "mod", label: `Model: ${mod}` });
  if (col) filterChips.push({ key: "col", label: `Collection: ${col}` });
  if (brands.length > 0) {
    filterChips.push({ key: "brands", label: `Brand: ${brands.map((b) => brandLabel(b)).join(", ")}` });
  }
  if (msrpMin != null || msrpMax != null) {
    const lo = msrpMin != null ? `$${msrpMin.toLocaleString()}` : "$0";
    const hi = msrpMax != null ? `$${msrpMax.toLocaleString()}` : `$${msrpCeiling.toLocaleString()}+`;
    filterChips.push({ key: "msrp", label: `MSRP: ${lo} – ${hi}` });
  }

  function clearFilterChip(key: CatalogFilterChipKey) {
    switch (key) {
      case "mod": navigate({ mod: "", page: 1 }); break;
      case "col": navigate({ col: "", page: 1 }); break;
      case "brands": navigate({ brands: [], page: 1 }); break;
      case "msrp": navigate({ msrpMin: undefined, msrpMax: undefined, page: 1 }); break;
    }
  }

  const clearAllFilters = () =>
    navigate({ mod: "", col: "", brands: [], msrpMin: undefined, msrpMax: undefined, page: 1 });

  const saveCorrection = (model: string, collection: string) => {
    if (!collection.trim()) return;
    start(async () => {
      const res = await correctCatalog(model, collection.trim());
      if ("error" in res) { toast.error(res.error); return; }
      toast.success(`Catalog updated — ${res.affected} client${res.affected !== 1 ? "s" : ""} re-matched`);
      setEditing(null);
      router.refresh();
    });
  };

  const handleConfirm = (model: string) => {
    start(async () => {
      const res = await confirmCatalogRow(model);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success("Entry confirmed as curated");
      router.refresh();
    });
  };

  const handleFlag = (model: string, accept: boolean) => {
    start(async () => {
      const res = await resolveFlag(model, accept);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success(accept ? "Conflicting value applied" : "Kept current value");
      router.refresh();
    });
  };

  const handleDelete = () => {
    const model = deleteTarget;
    if (!model) return;
    start(async () => {
      const res = await deleteCatalogRow(model);
      if ("error" in res) { toast.error(res.error); return; }
      const suffix = res.affected > 0 ? ` — ${res.affected} client${res.affected !== 1 ? "s" : ""} re-matched` : "";
      toast.success(`Deleted ${model}${suffix}`);
      setDeleteTarget(null);
      router.refresh();
    });
  };

  const toggleReviewSelection = (model: string, checked: boolean) => {
    setSelectedReview((prev) => {
      const next = new Set(prev);
      if (checked) next.add(model); else next.delete(model);
      return next;
    });
  };

  const toggleAllReview = (checked: boolean) => {
    setSelectedReview(checked ? new Set(needsReview.map((r) => r.model)) : new Set());
  };

  const handleBulkConfirm = () => {
    const models = Array.from(selectedReview);
    if (models.length === 0) return;
    start(async () => {
      const res = await confirmCatalogRows(models);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success(`Confirmed ${res.confirmed} entr${res.confirmed === 1 ? "y" : "ies"} as curated`);
      setSelectedReview(new Set());
      router.refresh();
    });
  };

  const handleBulkDelete = () => {
    const models = Array.from(selectedReview);
    if (models.length === 0) return;
    start(async () => {
      const res = await deleteCatalogRows(models);
      if ("error" in res) { toast.error(res.error); return; }
      const suffix = res.affected > 0 ? ` — ${res.affected} client${res.affected !== 1 ? "s" : ""} re-matched` : "";
      toast.success(`Deleted ${res.deleted} entr${res.deleted === 1 ? "y" : "ies"}${suffix}`);
      setSelectedReview(new Set());
      setBulkDeleteOpen(false);
      router.refresh();
    });
  };

  const handleClear = () => {
    start(async () => {
      const res = await clearCatalog();
      if ("error" in res) { toast.error(res.error); return; }
      const provisioned = res.provisioned > 0
        ? ` — ${res.provisioned.toLocaleString()} provisional row${res.provisioned !== 1 ? "s" : ""} reseeded from client POIs`
        : "";
      toast.success(`Catalog cleared (${res.cleared.toLocaleString()} row${res.cleared !== 1 ? "s" : ""})${provisioned}`);
      setClearOpen(false);
      setClearTyped("");
      router.refresh();
    });
  };

  return (
    <>
      <Topbar title="Model Catalog" />
      <div className="flex flex-col flex-1 p-4 md:p-6 gap-6">
        {needsReview.length > 0 && (
          <Card className="border-primary/40">
            <CardHeader>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardCheck className="size-4" />
                  Needs cataloging ({needsReview.length})
                </CardTitle>
                {selectedReview.size > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">{selectedReview.size} selected</span>
                    <Button size="sm" variant="outline" disabled={pending} onClick={handleBulkConfirm}>
                      <Check className="size-4 mr-1" />Confirm {selectedReview.size}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      disabled={pending}
                      onClick={() => setBulkDeleteOpen(true)}
                    >
                      <Trash2 className="size-4 mr-1" />Delete {selectedReview.size}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedReview(new Set())}>
                      Clear
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <div className="flex items-center gap-2 px-2 pb-2 text-xs text-muted-foreground border-b">
                <Checkbox
                  checked={needsReview.length > 0 && selectedReview.size === needsReview.length}
                  onCheckedChange={(checked) => toggleAllReview(checked === true)}
                  aria-label="Select all needs-review rows"
                />
                <span>Select all</span>
              </div>
              {needsReview.map((r) => (
                <div key={r.model} className="flex items-center justify-between gap-3 text-sm border rounded-md p-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <Checkbox
                      checked={selectedReview.has(r.model)}
                      onCheckedChange={(checked) => toggleReviewSelection(r.model, checked === true)}
                      aria-label={`Select ${r.model}`}
                    />
                    <div className="truncate">
                      <span className="font-mono">{r.model}</span> — entered as{" "}
                      <strong>{r.collection}</strong>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => handleConfirm(r.model)}>
                      <Check className="size-4 mr-1" />Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => { setEditing(r.model); setDraft(r.collection); }}
                    >
                      <Pencil className="size-4 mr-1" />Correct
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {flagged.length > 0 && (
          <Card className="border-amber-500/40">
            <CardHeader>
              <CardTitle className="text-base">
                Pending catalog conflicts ({flagged.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {flagged.map((r) => (
                <div key={r.model} className="flex items-center justify-between gap-3 text-sm border rounded-md p-2">
                  <div>
                    <span className="font-mono">{r.model}</span> — current{" "}
                    <strong>{r.collection}</strong> ({r.source}); a promo import said{" "}
                    <strong>{r.flaggedCollection}</strong>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => handleFlag(r.model, true)}>
                      <Check className="size-4 mr-1" />Use promo
                    </Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => handleFlag(r.model, false)}>
                      <X className="size-4 mr-1" />Keep current
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <Library className="size-5" />
                Model Catalog
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => { setClearTyped(""); setClearOpen(true); }}
                  disabled={total === 0}
                >
                  <Trash2 className="size-4 mr-1" />Clear Catalog
                </Button>
                <Button variant="outline" size="sm" disabled>
                  <Upload className="size-4 mr-1" />Import Catalog
                  <Badge variant="secondary" className="ml-2 text-[10px]">Coming Soon</Badge>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ActiveFilterChips
              chips={filterChips}
              onRemove={clearFilterChip}
              onClearAll={clearAllFilters}
              className="mb-4"
            />
            {rows.length === 0 && total === 0 && !mod && !col && !brands.length && msrpMin == null && msrpMax == null ? (
              <EmptyState icon={Library} title="No catalog entries" compact />
            ) : rows.length === 0 ? (
              <EmptyState icon={Library} title="No matches for current filters" compact />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <ColumnHeader
                          label="Model"
                          sortKey="model"
                          currentSort={sort}
                          currentDir={dir}
                          onSortAction={handleSort}
                          filter={
                            <ColumnFilterPopover
                              label="Model"
                              active={!!mod}
                              onClear={() => navigate({ mod: "", page: 1 })}
                            >
                              <TextFilterMenu
                                value={mod}
                                onChange={(v) => navigate({ mod: v, page: 1 })}
                                placeholder="Filter model…"
                              />
                            </ColumnFilterPopover>
                          }
                        />
                      </TableHead>

                      <TableHead>
                        <ColumnHeader
                          label="Collection"
                          sortKey="collection"
                          currentSort={sort}
                          currentDir={dir}
                          onSortAction={handleSort}
                          filter={
                            <ColumnFilterPopover
                              label="Collection"
                              active={!!col}
                              onClear={() => navigate({ col: "", page: 1 })}
                            >
                              <TextFilterMenu
                                value={col}
                                onChange={(v) => navigate({ col: v, page: 1 })}
                                placeholder="Filter collection…"
                              />
                            </ColumnFilterPopover>
                          }
                        />
                      </TableHead>

                      <TableHead>
                        <ColumnHeader
                          label="Brand"
                          sortKey="brand"
                          currentSort={sort}
                          currentDir={dir}
                          onSortAction={handleSort}
                          filter={
                            <ColumnFilterPopover
                              label="Brand"
                              active={brands.length > 0}
                              onClear={() => navigate({ brands: [], page: 1 })}
                            >
                              <MultiSelectMenu
                                options={BRAND_VALUES.map((b) => ({ value: b, label: brandLabel(b) }))}
                                selected={brands}
                                onChange={(next) => navigate({ brands: next, page: 1 })}
                                placeholder="Search brands…"
                              />
                            </ColumnFilterPopover>
                          }
                        />
                      </TableHead>

                      <TableHead className="text-right">
                        <ColumnHeader
                          align="right"
                          label="MSRP"
                          sortKey="msrp"
                          currentSort={sort}
                          currentDir={dir}
                          onSortAction={handleSort}
                          filter={
                            <ColumnFilterPopover
                              label="MSRP"
                              active={msrpMin != null || msrpMax != null}
                              onClear={() => navigate({ msrpMin: undefined, msrpMax: undefined, page: 1 })}
                            >
                              <RangeFilterMenu
                                min={msrpMin ?? 0}
                                max={msrpMax ?? msrpCeiling}
                                ceiling={msrpCeiling}
                                onChange={({ min, max }) =>
                                  navigate({
                                    msrpMin: min > 0 ? min : undefined,
                                    msrpMax: max < msrpCeiling ? max : undefined,
                                    page: 1,
                                  })
                                }
                              />
                            </ColumnFilterPopover>
                          }
                        />
                      </TableHead>

                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.model}>
                        <MonoCell value={r.model} />
                        <TableCell>
                          {editing === r.model ? (
                            <Input
                              autoFocus
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") saveCorrection(r.model, draft); if (e.key === "Escape") setEditing(null); }}
                              className="h-8 max-w-[200px]"
                            />
                          ) : (
                            r.collection
                          )}
                        </TableCell>
                        <TextCell value={r.brand ? brandLabel(r.brand) : null} />
                        <MoneyCell value={r.msrp} />
                        <StatusBadgeCell label={r.source} variant={sourceBadge(r.source)} />
                        <TableCell className="text-right">
                          {editing === r.model ? (
                            <div className="flex justify-end gap-2">
                              <Button size="sm" disabled={pending} onClick={() => saveCorrection(r.model, draft)}>Save</Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => { setEditing(r.model); setDraft(r.collection); }}
                              >
                                <Pencil className="size-4 mr-1" />Correct
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                aria-label={`Delete ${r.model}`}
                                onClick={() => setDeleteTarget(r.model)}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <PaginationFooter
          currentPage={page}
          totalPages={totalPages}
          onPageChangeAction={(p) => navigate({ page: p })}
          totalItems={total}
          pageSize={DEFAULT_PAGE_SIZE}
          itemLabel="models"
        />
      </div>
      {/* Catalog Import disabled for demo — Coming Soon */}
      {/* <ImportCatalogDialog open={importOpen} onOpenChangeAction={setImportOpen} /> */}

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChangeAction={(open) => !open && setBulkDeleteOpen(false)}
        title={`Delete ${selectedReview.size} catalog entr${selectedReview.size === 1 ? "y" : "ies"}?`}
        description={
          <>
            Removing these from the catalog. Clients with these models in products
            of interest keep their entries, but collection and brand will no longer
            resolve from the catalog. Promo matches for affected clients will be
            rebuilt.
          </>
        }
        confirmLabel={`Delete ${selectedReview.size}`}
        variant="destructive"
        onConfirmAction={handleBulkDelete}
        disabled={pending || selectedReview.size === 0}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChangeAction={(open) => !open && setDeleteTarget(null)}
        title="Delete catalog entry"
        description={
          <>
            Remove <strong>{deleteTarget}</strong> from the catalog? Clients with this
            model in products of interest keep the entry, but its collection and brand
            will no longer resolve from the catalog. Promo matches for affected clients
            will be rebuilt.
          </>
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirmAction={handleDelete}
        disabled={pending}
      />

      <ConfirmDialog
        open={clearOpen}
        onOpenChangeAction={(open) => { if (!open) { setClearOpen(false); setClearTyped(""); } }}
        title="Clear the entire catalog?"
        description={
          <span className="flex flex-col gap-3">
            <span className="block">
              This deletes all <strong>{total.toLocaleString()}</strong> catalog
              {" "}entries, then re-seeds the catalog with provisional
              {" "}<em>needs-review</em> rows from every client&apos;s products of
              interest so no model the sales team has entered gets lost. The next
              RVX import overrides these; anything the import doesn&apos;t cover
              stays in the <strong>Needs cataloging</strong> queue. Promo matches
              are <strong>not</strong> recomputed — the next import repairs them.
            </span>
            <span className="block">
              Type <code className="rounded bg-muted px-1 py-0.5 text-xs">{CLEAR_PHRASE}</code> to confirm:
            </span>
            <Input
              autoFocus
              value={clearTyped}
              onChange={(e) => setClearTyped(e.target.value)}
              placeholder={CLEAR_PHRASE}
              className="h-9"
            />
          </span>
        }
        confirmLabel="Clear Catalog"
        variant="destructive"
        onConfirmAction={handleClear}
        disabled={pending || clearTyped !== CLEAR_PHRASE}
      />
    </>
  );
}
