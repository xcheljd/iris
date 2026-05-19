"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/search-input";
import { EmptyState } from "@/components/empty-state";
import { Topbar } from "@/components/topbar";
import { Library, Check, X, Pencil, Upload, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { correctCatalog, resolveFlag, confirmCatalogRow } from "@/lib/actions";
import { brandLabel } from "@/lib/brand";
import { ImportCatalogDialog } from "@/components/catalog/import-catalog-dialog";

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

export function CatalogContent({ rows }: { rows: CatalogRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const flagged = rows.filter((r) => r.flaggedCollection);
  const needsReview = rows.filter((r) => r.needsReview);
  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.model.includes(q) ||
        r.collection.toUpperCase().includes(q) ||
        (r.brand ?? "").toUpperCase().includes(q),
    );
  }, [rows, query]);

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
            <div className="mt-3">
              <SearchInput placeholder="Search model, collection, or brand…" value={query} onChange={setQuery} className="max-w-sm" />
            </div>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <EmptyState
                icon={Library}
                title={rows.length === 0 ? "No catalog entries" : `No matches for “${query.trim()}”`}
                compact
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model</TableHead>
                      <TableHead>Collection</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead className="text-right">MSRP</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
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
      </div>
      <ImportCatalogDialog open={importOpen} onOpenChange={setImportOpen} />
    </>
  );
}
