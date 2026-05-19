"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PaginationFooter } from "@/components/pagination-footer";
import { EmptyState } from "@/components/empty-state";
import { Topbar } from "@/components/topbar";
import { Library, Check, X, Pencil, Upload, ClipboardCheck, ArrowUpDown, Filter } from "lucide-react";
import { toast } from "sonner";
import { correctCatalog, resolveFlag, confirmCatalogRow } from "@/lib/actions";
import { brandLabel } from "@/lib/brand";
import { ImportCatalogDialog } from "@/components/catalog/import-catalog-dialog";
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
  sort: "model" | "collection" | "brand";
  dir: "asc" | "desc";
  page: number;
}

type SortKey = "model" | "collection" | "brand";

export function CatalogContent({ rows, total, needsReview, flagged, mod, col, brands, msrpMin, msrpMax, sort, dir, page }: CatalogContentProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [modLocal, setModLocal] = useState(mod);
  const [colLocal, setColLocal] = useState(col);
  const [msrpMinLocal, setMsrpMinLocal] = useState(msrpMin != null ? String(msrpMin) : "");
  const [msrpMaxLocal, setMsrpMaxLocal] = useState(msrpMax != null ? String(msrpMax) : "");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const isFirstRender = useRef(true);

  const totalPages = Math.ceil(total / DEFAULT_PAGE_SIZE);

  function navigate(overrides: {
    mod?: string; col?: string; brands?: string[];
    msrpMin?: string; msrpMax?: string;
    sort?: SortKey; dir?: "asc" | "desc"; page?: number;
  } = {}) {
    const nextMod = overrides.mod ?? modLocal;
    const nextCol = overrides.col ?? colLocal;
    const nextBrands = overrides.brands ?? brands;
    const nextMsrpMin = overrides.msrpMin ?? msrpMinLocal;
    const nextMsrpMax = overrides.msrpMax ?? msrpMaxLocal;
    const nextSort = overrides.sort ?? sort;
    const nextDir = overrides.dir ?? dir;
    const nextPage = overrides.page ?? page;
    const sp = new URLSearchParams();
    if (nextMod) sp.set("mod", nextMod);
    if (nextCol) sp.set("col", nextCol);
    if (nextBrands.length) sp.set("brands", nextBrands.join(","));
    if (nextMsrpMin) sp.set("msrpMin", nextMsrpMin);
    if (nextMsrpMax) sp.set("msrpMax", nextMsrpMax);
    if (nextSort !== "model") sp.set("sort", nextSort);
    if (nextDir !== "asc") sp.set("dir", nextDir);
    if (nextPage > 1) sp.set("page", String(nextPage));
    router.replace(`/catalog${sp.toString() ? `?${sp.toString()}` : ""}`);
  }

  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const id = setTimeout(() => navigateRef.current({ page: 1 }), 300);
    return () => clearTimeout(id);
  }, [modLocal, colLocal, msrpMinLocal, msrpMaxLocal]);

  const toggleBrand = (b: string) => {
    const next = brands.includes(b) ? brands.filter((x) => x !== b) : [...brands, b];
    navigate({ brands: next, page: 1 });
  };

  const toggleSort = (k: SortKey) => {
    if (sort === k) {
      navigate({ dir: dir === "asc" ? "desc" : "asc", page: 1 });
    } else {
      navigate({ sort: k, dir: "asc", page: 1 });
    }
  };

  const SortHead = ({ k, label }: { k: SortKey; label: string }) => (
    <button className="flex items-center gap-1 font-medium" onClick={() => toggleSort(k)}>
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sort === k ? "text-foreground" : "text-muted-foreground/50"}`} />
    </button>
  );

  const sourceBadge = (s: CatalogRow["source"]) =>
    s === "curated" ? "default" : s === "promo" ? "secondary" : "outline";

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
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4 mr-1" />Import Catalog
              </Button>
            </div>
          </CardHeader>
          <CardContent>
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
                        <div className="flex items-center gap-1">
                          <SortHead k="model" label="Model" />
                          <Popover>
                            <PopoverTrigger asChild>
                              <button aria-label="Filter model">
                                <Filter className={`h-3 w-3 ${modLocal ? "text-primary" : "text-muted-foreground/50"}`} />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-56">
                              <Input
                                placeholder="Model contains…"
                                value={modLocal}
                                onChange={(e) => setModLocal(e.target.value.toUpperCase())}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </TableHead>

                      <TableHead>
                        <div className="flex items-center gap-1">
                          <SortHead k="collection" label="Collection" />
                          <Popover>
                            <PopoverTrigger asChild>
                              <button aria-label="Filter collection">
                                <Filter className={`h-3 w-3 ${colLocal ? "text-primary" : "text-muted-foreground/50"}`} />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-56">
                              <Input
                                placeholder="Collection contains…"
                                value={colLocal}
                                onChange={(e) => setColLocal(e.target.value)}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </TableHead>

                      <TableHead>
                        <div className="flex items-center gap-1">
                          <SortHead k="brand" label="Brand" />
                          <Popover>
                            <PopoverTrigger asChild>
                              <button aria-label="Filter brand">
                                <Filter className={`h-3 w-3 ${brands.length ? "text-primary" : "text-muted-foreground/50"}`} />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-48 space-y-1">
                              {BRAND_VALUES.map((b) => (
                                <label key={b} className="flex items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={brands.includes(b)}
                                    onChange={() => toggleBrand(b)}
                                  />
                                  {brandLabel(b)}
                                </label>
                              ))}
                            </PopoverContent>
                          </Popover>
                        </div>
                      </TableHead>

                      <TableHead className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          MSRP
                          <Popover>
                            <PopoverTrigger asChild>
                              <button aria-label="Filter MSRP">
                                <Filter className={`h-3 w-3 ${msrpMinLocal || msrpMaxLocal ? "text-primary" : "text-muted-foreground/50"}`} />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-44 space-y-3">
                              <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">Min $</p>
                                <Input
                                  type="number"
                                  min="0"
                                  placeholder="0"
                                  value={msrpMinLocal}
                                  onChange={(e) => setMsrpMinLocal(e.target.value)}
                                  className="h-8"
                                />
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">Max $</p>
                                <Input
                                  type="number"
                                  min="0"
                                  placeholder="∞"
                                  value={msrpMaxLocal}
                                  onChange={(e) => setMsrpMaxLocal(e.target.value)}
                                  className="h-8"
                                />
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
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
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { setEditing(r.model); setDraft(r.collection); }}
                            >
                              <Pencil className="h-4 w-4 mr-1" />Correct
                            </Button>
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
    </>
  );
}
