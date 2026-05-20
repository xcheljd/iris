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
import { correctCatalog, resolveFlag, confirmCatalogRow, deleteCatalogRow, clearCatalog } from "@/lib/actions";
import { brandLabel } from "@/lib/brand";
import { ImportCatalogDialog } from "@/components/catalog/import-catalog-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ColumnHeader } from "@/components/column-header";
import { ColumnFilterPopover } from "@/components/column-filter-popover";
import { TextFilterMenu, MultiSelectMenu, RangeFilterMenu } from "@/components/column-filters";
import { BRAND_VALUES } from "@/lib/db/schema";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";

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
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearTyped, setClearTyped] = useState("");

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

  const filterChips: { key: string; label: string; onRemove: () => void }[] = [];
  if (mod) {
    filterChips.push({ key: "mod", label: `Model: ${mod}`, onRemove: () => navigate({ mod: "", page: 1 }) });
  }
  if (col) {
    filterChips.push({ key: "col", label: `Collection: ${col}`, onRemove: () => navigate({ col: "", page: 1 }) });
  }
  if (brands.length > 0) {
    filterChips.push({
      key: "brands",
      label: `Brand: ${brands.map((b) => brandLabel(b)).join(", ")}`,
      onRemove: () => navigate({ brands: [], page: 1 }),
    });
  }
  if (msrpMin != null || msrpMax != null) {
    const lo = msrpMin != null ? `$${msrpMin.toLocaleString()}` : "$0";
    const hi = msrpMax != null ? `$${msrpMax.toLocaleString()}` : `$${msrpCeiling.toLocaleString()}+`;
    filterChips.push({
      key: "msrp",
      label: `MSRP: ${lo} – ${hi}`,
      onRemove: () => navigate({ msrpMin: undefined, msrpMax: undefined, page: 1 }),
    });
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
      <div className="flex-1 p-4 md:p-6 space-y-6">
        {needsReview.length > 0 && (
          <Card className="border-blue-500/40">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4" />
                Needs cataloging ({needsReview.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {needsReview.map((r) => (
                <div key={r.model} className="flex items-center justify-between gap-3 text-sm border rounded-md p-2">
                  <div>
                    <span className="font-mono">{r.model}</span> — entered as{" "}
                    <strong>{r.collection}</strong>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => handleConfirm(r.model)}>
                      <Check className="h-4 w-4 mr-1" />Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => { setEditing(r.model); setDraft(r.collection); }}
                    >
                      <Pencil className="h-4 w-4 mr-1" />Correct
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
            <CardContent className="space-y-2">
              {flagged.map((r) => (
                <div key={r.model} className="flex items-center justify-between gap-3 text-sm border rounded-md p-2">
                  <div>
                    <span className="font-mono">{r.model}</span> — current{" "}
                    <strong>{r.collection}</strong> ({r.source}); a promo import said{" "}
                    <strong>{r.flaggedCollection}</strong>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => handleFlag(r.model, true)}>
                      <Check className="h-4 w-4 mr-1" />Use promo
                    </Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => handleFlag(r.model, false)}>
                      <X className="h-4 w-4 mr-1" />Keep current
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
                <Library className="h-5 w-5" />
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
                  <Trash2 className="h-4 w-4 mr-1" />Clear Catalog
                </Button>
                <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                  <Upload className="h-4 w-4 mr-1" />Import Catalog
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filterChips.length > 0 && (
              <div
                className="flex flex-wrap items-center gap-1.5 rounded-md border bg-muted/30 px-3 py-2 text-xs mb-4"
                role="region"
                aria-label="Active filters"
              >
                <span className="text-muted-foreground font-medium mr-1">Filters:</span>
                {filterChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={chip.onRemove}
                    className="group inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 hover:bg-accent transition-colors"
                    aria-label={`Remove filter: ${chip.label}`}
                  >
                    <span>{chip.label}</span>
                    <X className="h-3 w-3 opacity-60 group-hover:opacity-100" />
                  </button>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs ml-auto"
                  onClick={clearAllFilters}
                >
                  Clear all
                </Button>
              </div>
            )}
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
                          onSort={handleSort}
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
                          onSort={handleSort}
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
                          onSort={handleSort}
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

                      <TableHead>
                        <ColumnHeader
                          label="MSRP"
                          sortKey="msrp"
                          currentSort={sort}
                          currentDir={dir}
                          onSort={handleSort}
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
                        <TableCell className="font-mono text-sm">{r.model}</TableCell>
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
                        <TableCell>{r.brand ? brandLabel(r.brand) : <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.msrp != null ? `$${r.msrp.toFixed(2)}` : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell><Badge variant={sourceBadge(r.source)}>{r.source}</Badge></TableCell>
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
                                <Pencil className="h-4 w-4 mr-1" />Correct
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                aria-label={`Delete ${r.model}`}
                                onClick={() => setDeleteTarget(r.model)}
                              >
                                <Trash2 className="h-4 w-4" />
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
          onPageChange={(p) => navigate({ page: p })}
          totalItems={total}
          pageSize={DEFAULT_PAGE_SIZE}
          itemLabel="models"
        />
      </div>
      <ImportCatalogDialog open={importOpen} onOpenChange={setImportOpen} />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
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
        onConfirm={handleDelete}
        disabled={pending}
      />

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={(open) => { if (!open) { setClearOpen(false); setClearTyped(""); } }}
        title="Clear the entire catalog?"
        description={
          <span className="block space-y-3">
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
        onConfirm={handleClear}
        disabled={pending || clearTyped !== CLEAR_PHRASE}
      />
    </>
  );
}
