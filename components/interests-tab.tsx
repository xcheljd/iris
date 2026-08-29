"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { MoreHorizontal, Tag } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ColumnHeader } from "@/components/column-header";
import { ColumnFilterPopover } from "@/components/column-filter-popover";
import { toast } from "sonner";
import { OutreachLogger } from "@/components/outreach-logger";
import { EmptyState } from "@/components/empty-state";
import { normalizeModel } from "@/lib/normalize";
import { useCatalog } from "@/components/use-catalog";
import { INTEREST_INTENT_VALUES, BRAND_VALUES, type InterestIntent, type ProductOfInterest } from "@/lib/db/schema";
import type { FullClient, PromoMatchWithPromo } from "@/components/client-provider";
import { formatMoney } from "@/lib/utils";
import { ProductsOfInterestInput } from "@/components/products-of-interest-input";
import { saveClientEdits } from "@/lib/actions";

interface InterestsTabProps {
  client: FullClient;
}

const INTENT_LABEL: Record<InterestIntent, string> = {
  interested: "Interested",
  promo: "Promo",
  arrival: "Arrival",
};

type SortKey = "intent" | "model" | "collection" | "brand" | "promo";

interface Row {
  intent: InterestIntent;
  model: string | null;
  collection: string | null;
  brand: string | null;
  /** Promo cell: model/collection match with price, or collection-only "select models". */
  promoLabel: string;
  promoModels: string[]; // for collection-only "select models"
  promoModelNumber: string | null; // matched promo's model (for copy/template)
  promoCollection: string | null;
}

/** Same identity rule the server uses when de-duping products of interest. */
function interestKey(p: Pick<ProductOfInterest, "model" | "collection">) {
  return `${(p.model ?? "").toUpperCase()}|${(p.collection ?? "").toUpperCase()}`;
}

export function InterestsTab({ client }: InterestsTabProps) {
  const router = useRouter();
  // Inline message shown when an add is rejected client-side (duplicate).
  const [addError, setAddError] = useState<string | null>(null);
  // Rows added/removed this session, shown before the server round-trip resolves.
  const [optimistic, setOptimistic] = useState<ProductOfInterest[]>([]);
  const [, startSaving] = useTransition();

  const saved = useMemo(() => client.productsOfInterest ?? [], [client.productsOfInterest]);
  // Drop optimistic rows once the refreshed client carries them.
  const products = useMemo(() => {
    const have = new Set(saved.map(interestKey));
    return [...saved, ...optimistic.filter((p) => !have.has(interestKey(p)))];
  }, [saved, optimistic]);

  const handleProductsChange = (next: ProductOfInterest[]) => {
    const removed = products.filter((p) => !next.some((q) => interestKey(q) === interestKey(p)));
    const added = next.filter((p) => !products.some((q) => interestKey(q) === interestKey(p)));
    if (added.length === 0 && removed.length === 0) return;

    // Client-side dedupe. The shared input only compares model|collection|
    // brand|intent as one tuple, which misses a model overlapping an existing
    // model+collection row, so mirror the old quick-add's rule here: an entry
    // is a duplicate when its model (or, on a model-less add, collection)
    // already appears on a tracked row. A duplicate never reaches the server.
    const duplicate = added.find((p) => {
      const token = normalizeModel(p.model ?? "") || (p.collection ?? "").trim().toUpperCase();
      return (
        !!token &&
        products.some(
          (q) =>
            (q.model ?? "").toUpperCase() === token ||
            (q.collection ?? "").trim().toUpperCase() === token,
        )
      );
    });
    if (duplicate) {
      setAddError("This client already has that interest");
      return;
    }
    setAddError(null);

    const removedKeys = new Set(removed.map(interestKey));
    setOptimistic((cur) => {
      const kept = cur
        .filter((p) => !removedKeys.has(interestKey(p)))
        .filter((p) => !saved.some((s) => interestKey(s) === interestKey(p)));
      return [...kept, ...added];
    });

    startSaving(async () => {
      const result = await saveClientEdits(client.id, { productsOfInterest: next });
      if (result?.error) {
        const addedKeys = new Set(added.map(interestKey));
        setOptimistic((cur) => cur.filter((p) => !addedKeys.has(interestKey(p))));
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  };

  const matched = client.matches.filter(
    (m: PromoMatchWithPromo) => m.promo?.modelNumber || m.promo?.collection,
  );

  const promoBrandLabel = (b: string | null | undefined) =>
    !b ? "" : b === "Chamberlain" ? "FC" : b;

  const { catalogIndex, isManager, resolve } = useCatalog();

  const rows: Row[] = useMemo(() => {
    return products.map((p) => {
      const intent: InterestIntent = p.intent ?? "interested";
      // Derive-at-read: a cataloged model's collection/brand are
      // authoritative; stored values feed only collection/brand-only
      // or not-yet-cataloged interests.
      const resolved = resolve(p);
      const m = normalizeModel(p.model);
      const coll = (resolved.collection ?? "").trim();
      const br = (resolved.brand ?? "").trim();

      // Model match: a matched promo with the same model number.
      const modelHit = m
        ? matched.find((x) => normalizeModel(x.promo?.modelNumber) === m)
        : undefined;
      // Collection match: a matched promo with the same collection.
      const collHits = coll
        ? matched.filter(
            (x) => (x.promo?.collection ?? "").trim().toUpperCase() === coll.toUpperCase(),
          )
        : [];
      // Brand match: a matched promo with the same brand.
      const brandHit = br
        ? matched.find((x) => (x.promo?.brand ?? "").trim().toUpperCase() === br.toUpperCase())
        : undefined;

      let promoLabel = "—";
      let promoModels: string[] = [];
      let promoModelNumber: string | null = null;
      let promoCollection: string | null = null;

      if (modelHit?.promo) {
        promoModelNumber = modelHit.promo.modelNumber;
        promoCollection = modelHit.promo.collection;
        promoLabel = modelHit.promo.discountPrice != null
          ? `${formatMoney(modelHit.promo.discountPrice)} · model`
          : "On promo · model";
      } else if (collHits.length > 0) {
        if (!p.model) {
          // Collection-only interest: surface the specific promo models.
          promoModels = Array.from(new Set(collHits.map((x) => x.promo!.modelNumber)));
          promoCollection = collHits[0].promo!.collection;
          promoLabel = "Select models";
        } else {
          promoModelNumber = collHits[0].promo!.modelNumber;
          promoCollection = collHits[0].promo!.collection;
          promoLabel = "On promo · collection";
        }
      } else if (brandHit?.promo) {
        promoModelNumber = brandHit.promo.modelNumber;
        promoCollection = brandHit.promo.collection;
        promoLabel = "On promo · brand";
      }

      return { intent, model: p.model, collection: resolved.collection, brand: resolved.brand, promoLabel, promoModels, promoModelNumber, promoCollection };
    });
  }, [products, matched, resolve]);

  // --- sort + filter state ---
  const [sortKey, setSortKey] = useState<SortKey>("intent");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [intentFilter, setIntentFilter] = useState<Set<InterestIntent>>(new Set());
  const [modelFilter, setModelFilter] = useState("");
  const [collectionFilter, setCollectionFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState<Set<string>>(new Set());
  const [promoOnly, setPromoOnly] = useState<"" | "has" | "none">("");

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  const visible = useMemo(() => {
    let r = rows;
    if (intentFilter.size > 0) r = r.filter((x) => intentFilter.has(x.intent));
    if (modelFilter.trim()) r = r.filter((x) => (x.model ?? "").toUpperCase().includes(modelFilter.trim().toUpperCase()));
    if (collectionFilter.trim()) r = r.filter((x) => (x.collection ?? "").toUpperCase().includes(collectionFilter.trim().toUpperCase()));
    if (brandFilter.size > 0) r = r.filter((x) => x.brand != null && brandFilter.has(x.brand));
    if (promoOnly === "has") r = r.filter((x) => x.promoLabel !== "—");
    if (promoOnly === "none") r = r.filter((x) => x.promoLabel === "—");
    const val = (x: Row) =>
      sortKey === "intent" ? x.intent
        : sortKey === "model" ? (x.model ?? "")
        : sortKey === "collection" ? (x.collection ?? "")
        : sortKey === "brand" ? (x.brand ?? "")
        : x.promoLabel;
    return [...r].sort((a, b) => val(a).localeCompare(val(b)) * (sortDir === "asc" ? 1 : -1));
  }, [rows, intentFilter, modelFilter, collectionFilter, brandFilter, promoOnly, sortKey, sortDir]);

  const copyTemplate = (model: string, collection: string) => {
    navigator.clipboard.writeText(
      `Hi ${client.firstName}, we have a great promo on the ${model} from the ${collection} collection. Would you like to come in and take a look?`,
    );
    toast.success("Outreach template copied");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tag className="size-5" />
          Products of Interest
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-col gap-1.5">
          <ProductsOfInterestInput
            value={products}
            onChangeAction={handleProductsChange}
            catalogIndex={catalogIndex}
            isManager={isManager}
          />
          {addError && (
            <p role="alert" className="text-xs text-destructive">
              {addError}
            </p>
          )}
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={Tag} title="No products of interest recorded" compact />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <ColumnHeader label="Intent" sortKey="intent" currentSort={sortKey} currentDir={sortDir} onSortAction={toggleSort} filter={
                      <ColumnFilterPopover label="Intent" active={intentFilter.size > 0} onClear={() => setIntentFilter(new Set())} contentWidth="w-44">
                        <div className="flex flex-col p-3 gap-1">
                          {INTEREST_INTENT_VALUES.map((it) => (
                            <label key={it} className="flex items-center gap-2 text-sm cursor-pointer">
                              <Checkbox checked={intentFilter.has(it)} onCheckedChange={(checked) => {
                                const next = new Set(intentFilter);
                                if (checked === true) next.add(it); else next.delete(it);
                                setIntentFilter(next);
                              }} />
                              {INTENT_LABEL[it]}
                            </label>
                          ))}
                        </div>
                      </ColumnFilterPopover>
                    } />
                  </TableHead>
                  <TableHead>
                    <ColumnHeader label="Model" sortKey="model" currentSort={sortKey} currentDir={sortDir} onSortAction={toggleSort} filter={
                      <ColumnFilterPopover label="Model" active={!!modelFilter} onClear={() => setModelFilter("")} contentWidth="w-56">
                        <div className="p-2">
                          <Input placeholder="Model contains…" value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} />
                        </div>
                      </ColumnFilterPopover>
                    } />
                  </TableHead>
                  <TableHead>
                    <ColumnHeader label="Collection" sortKey="collection" currentSort={sortKey} currentDir={sortDir} onSortAction={toggleSort} filter={
                      <ColumnFilterPopover label="Collection" active={!!collectionFilter} onClear={() => setCollectionFilter("")} contentWidth="w-56">
                        <div className="p-2">
                          <Input placeholder="Collection contains…" value={collectionFilter} onChange={(e) => setCollectionFilter(e.target.value)} />
                        </div>
                      </ColumnFilterPopover>
                    } />
                  </TableHead>
                  <TableHead>
                    <ColumnHeader label="Brand" sortKey="brand" currentSort={sortKey} currentDir={sortDir} onSortAction={toggleSort} filter={
                      <ColumnFilterPopover label="Brand" active={brandFilter.size > 0} onClear={() => setBrandFilter(new Set())} contentWidth="w-44">
                        <div className="flex flex-col p-3 gap-1">
                          {BRAND_VALUES.map((b) => (
                            <label key={b} className="flex items-center gap-2 text-sm cursor-pointer">
                              <Checkbox checked={brandFilter.has(b)} onCheckedChange={(checked) => {
                                const next = new Set(brandFilter);
                                if (checked === true) next.add(b); else next.delete(b);
                                setBrandFilter(next);
                              }} />
                              {promoBrandLabel(b)}
                            </label>
                          ))}
                        </div>
                      </ColumnFilterPopover>
                    } />
                  </TableHead>
                  <TableHead>
                    <ColumnHeader label="Promo" sortKey="promo" currentSort={sortKey} currentDir={sortDir} onSortAction={toggleSort} filter={
                      <ColumnFilterPopover label="Promo" active={promoOnly !== ""} onClear={() => setPromoOnly("")} contentWidth="w-44">
                        <RadioGroup value={promoOnly} onValueChange={(v) => setPromoOnly(v as "" | "has" | "none")} className="p-3 gap-3">
                          {([["", "All"], ["has", "On promo"], ["none", "Not on promo"]] as const).map(([v, l]) => (
                            <div key={v} className="flex items-center gap-2">
                              <RadioGroupItem value={v} id={`promo-filter-${v}`} />
                              <label htmlFor={`promo-filter-${v}`} className="text-sm cursor-pointer">{l}</label>
                            </div>
                          ))}
                        </RadioGroup>
                      </ColumnFilterPopover>
                    } />
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r, i) => (
                  <TableRow key={`${r.model ?? ""}|${r.collection ?? ""}|${r.intent}|${i}`}>
                    <TableCell>
                      <Badge variant={r.intent === "promo" ? "default" : r.intent === "arrival" ? "secondary" : "outline"}>
                        {INTENT_LABEL[r.intent]}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{r.model ?? "—"}</TableCell>
                    <TableCell>{r.collection ?? "—"}</TableCell>
                    <TableCell>{r.brand ? promoBrandLabel(r.brand) : "—"}</TableCell>
                    <TableCell>
                      {r.promoLabel === "Select models" ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7">Select models</Button>
                          </PopoverTrigger>
                          <PopoverContent className="flex flex-col w-56 gap-1">
                            <p className="text-xs text-muted-foreground mb-1">
                              Promo models in {r.promoCollection}. Copy one and add it via Edit Client.
                            </p>
                            {r.promoModels.map((pm) => (
                              <button
                                key={pm}
                                className="block w-full text-left font-mono text-sm rounded px-2 py-1 hover:bg-muted"
                                onClick={() => { navigator.clipboard.writeText(pm); toast.success(`Copied ${pm}`); }}
                              >
                                {pm}
                              </button>
                            ))}
                          </PopoverContent>
                        </Popover>
                      ) : r.promoLabel === "—" ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Badge variant="default">{r.promoLabel}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.promoLabel !== "—" && r.promoLabel !== "Select models" && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="size-8 p-0" aria-label="Promo actions">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <OutreachLogger
                              clientId={client.id}
                              clientName={`${client.firstName} ${client.lastName || ""}`}
                              trigger={
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                  Log Outreach
                                </DropdownMenuItem>
                              }
                            />
                            <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(r.promoModelNumber || r.model || ""); toast.success("Model copied"); }}>
                              Copy Model
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => copyTemplate(r.promoModelNumber || r.model || "", r.promoCollection || r.collection || "")}>
                              Copy Template
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground text-center mt-3">
              {visible.length} of {rows.length} {rows.length === 1 ? "interest" : "interests"}
              {" · "}
              {matched.length} active promo match{matched.length !== 1 ? "es" : ""}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
