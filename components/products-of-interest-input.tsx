"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Plus, X } from "lucide-react";
import { normalizeModel } from "@/lib/normalize";
import { MERIDIAN_COLLECTIONS } from "@/lib/collections";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INTEREST_INTENT_VALUES, BRAND_VALUES, type ProductOfInterest, type InterestIntent, type Brand } from "@/lib/db/schema";

interface Props {
  value: ProductOfInterest[];
  onChange: (next: ProductOfInterest[]) => void;
  catalogMap?: Record<string, string>;
  isManager?: boolean;
  /** Manager "fix catalog" — wire to correctCatalog + refetch in parent. */
  onCorrectCatalog?: (model: string, collection: string) => Promise<void> | void;
  collectionSuggestions?: string[];
}

const INTENT_LABELS: Record<InterestIntent, string> = {
  interested: "Interested",
  promo: "Promo",
  arrival: "Arrival",
};

function keyOf(p: ProductOfInterest) {
  return `${(p.model ?? "").toUpperCase()}|${(p.collection ?? "").toUpperCase()}|${p.brand ?? ""}|${p.intent}`;
}

function describe(p: ProductOfInterest) {
  const parts = [p.model, p.collection, p.brand].filter(Boolean);
  const base = parts.length ? parts.join(" — ") : "";
  return `${base} · ${INTENT_LABELS[p.intent] ?? p.intent}`;
}

/**
 * Structured products-of-interest editor. Each entry is
 * { model, collection, intent }; intent must be picked explicitly (no
 * default) and ≥1 of model/collection is required. When the entered model
 * is already in the catalog, the collection autofills; associates are
 * locked to it, managers may diverge which fixes the catalog (cascades).
 */
export function ProductsOfInterestInput({
  value,
  onChange,
  catalogMap = {},
  isManager = false,
  onCorrectCatalog,
  collectionSuggestions,
}: Props) {
  const [model, setModel] = useState("");
  const [collection, setCollection] = useState("");
  const [brand, setBrand] = useState<Brand | "">("");
  const [intent, setIntent] = useState<InterestIntent | "">("");
  const [conflict, setConflict] = useState<{ m: string; typed: string; cataloged: string; intent: InterestIntent } | null>(null);
  const listId = useId();
  const suggestions = collectionSuggestions ?? MERIDIAN_COLLECTIONS;

  const m = normalizeModel(model);
  const cataloged = m ? catalogMap[m] : undefined;
  const collectionLocked = !!cataloged && !isManager;

  function reset() {
    setModel("");
    setCollection("");
    setBrand("");
    setIntent("");
  }

  function commit(finalModel: string | null, finalCollection: string | null, it: InterestIntent) {
    const entry: ProductOfInterest = {
      model: finalModel,
      collection: finalCollection,
      brand: brand || null,
      intent: it,
    };
    if (!value.some((p) => keyOf(p) === keyOf(entry))) onChange([...value, entry]);
    reset();
  }

  const add = () => {
    if (!intent) return;
    const c = collection.trim();
    if (!m && !c && !brand) return;

    if (cataloged) {
      const sameCollection = c === "" || c.toUpperCase() === cataloged.toUpperCase();
      if (sameCollection) {
        commit(m, cataloged, intent);
        return;
      }
      if (!isManager) {
        // Associates cannot diverge — coerce to the cataloged value.
        commit(m, cataloged, intent);
        return;
      }
      // Manager diverging from the catalog → resolve the conflict.
      setConflict({ m, typed: c, cataloged, intent });
      return;
    }
    commit(m || null, c || null, intent);
  };

  const remove = (entry: ProductOfInterest) =>
    onChange(value.filter((p) => keyOf(p) !== keyOf(entry)));

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Model number"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          onBlur={() => setModel((v) => normalizeModel(v))}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          className="font-mono"
          aria-label="Model number"
        />
        <Input
          placeholder={collectionLocked ? cataloged : "Collection"}
          value={collectionLocked ? cataloged : collection}
          list={listId}
          readOnly={collectionLocked}
          onChange={(e) => setCollection(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          aria-label="Collection"
        />
        <datalist id={listId}>
          {suggestions.map((s) => <option key={s} value={s} />)}
        </datalist>
        <Select value={brand || undefined} onValueChange={(v) => setBrand(v as Brand)}>
          <SelectTrigger className="sm:w-44" aria-label="Brand (optional)">
            <SelectValue placeholder="Brand (optional)" />
          </SelectTrigger>
          <SelectContent>
            {BRAND_VALUES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button type="button" onClick={add} variant="outline" className="shrink-0" disabled={!intent || (!m && !collection.trim() && !brand)}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <ToggleGroup
        type="single"
        value={intent}
        onValueChange={(v) => setIntent((v as InterestIntent) || "")}
        variant="outline"
        className="justify-start"
        aria-label="Interest intent (required)"
      >
        {INTEREST_INTENT_VALUES.map((it) => (
          <ToggleGroupItem key={it} value={it} className="text-xs px-3">
            {INTENT_LABELS[it]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <p className="text-xs text-muted-foreground">
        Pick an intent and enter a model and/or collection.
        {cataloged && ` ${m} is cataloged as ${cataloged}.`}
        {" "}Vague interests belong in notes.
      </p>

      <div className="flex flex-wrap gap-2">
        {value.map((p) => (
          <Badge key={keyOf(p)} variant="secondary" className="cursor-default">
            {describe(p)}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-5 w-5 ml-1"
              onClick={() => remove(p)}
              aria-label={`Remove ${describe(p)}`}
            >
              <X className="h-3 w-3" />
            </Button>
          </Badge>
        ))}
      </div>

      <Dialog open={!!conflict} onOpenChange={(o) => !o && setConflict(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Catalog conflict</DialogTitle>
            <DialogDescription>
              {conflict && (
                <>
                  <strong>{conflict.m}</strong> is cataloged as{" "}
                  <strong>{conflict.cataloged}</strong>, but you entered{" "}
                  <strong>{conflict.typed}</strong>. Fixing the catalog updates
                  this model for all clients and re-runs promo matching.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (conflict) commit(conflict.m, conflict.cataloged, conflict.intent);
                setConflict(null);
              }}
            >
              Use cataloged
            </Button>
            <Button
              variant="gold"
              onClick={async () => {
                if (conflict) {
                  await onCorrectCatalog?.(conflict.m, conflict.typed);
                  commit(conflict.m, conflict.typed, conflict.intent);
                }
                setConflict(null);
              }}
            >
              Fix catalog
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
