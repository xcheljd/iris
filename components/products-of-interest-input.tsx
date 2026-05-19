"use client";

import { useEffect, useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Plus, X } from "lucide-react";
import { normalizeModel } from "@/lib/normalize";
import { MERIDIAN_COLLECTIONS } from "@/lib/collections";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INTEREST_INTENT_VALUES, BRAND_VALUES, type ProductOfInterest, type InterestIntent, type Brand } from "@/lib/db/schema";
import type { CatalogEntry } from "@/lib/actions/model-catalog";

interface Props {
  value: ProductOfInterest[];
  onChange: (next: ProductOfInterest[]) => void;
  catalogIndex?: Record<string, CatalogEntry> | null;
  isManager?: boolean;
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
 * is already in the catalog, the collection autofills and brand autofills
 * if the catalog has one; associates are locked to both. For unknown models
 * (not yet in catalog) brand is required before the entry can be added.
 */
export function ProductsOfInterestInput({
  value,
  onChange,
  catalogIndex = null,
  isManager = false,
  collectionSuggestions,
}: Props) {
  const [model, setModel] = useState("");
  const [collection, setCollection] = useState("");
  const [brand, setBrand] = useState<Brand | "">("");
  const [intent, setIntent] = useState<InterestIntent | "">("");
  const listId = useId();
  const suggestions = collectionSuggestions ?? MERIDIAN_COLLECTIONS;

  const m = normalizeModel(model);
  const catalogEntry = m && catalogIndex != null ? catalogIndex[m] : undefined;
  const catalogedCollection = catalogEntry?.collection;
  const catalogedBrand = catalogEntry?.brand ?? null;

  const collectionLocked = !!catalogedCollection && !isManager;
  // Lock brand when catalog says there's a brand and user is an associate
  const brandLocked = catalogedBrand !== null && !isManager;
  // Brand is required when a model is entered and it's not in the (loaded) catalog
  const brandRequired = !!m && catalogIndex !== null && !catalogEntry;

  // Autofill brand from catalog when model changes or catalog updates
  useEffect(() => {
    if (!m || catalogIndex === null) return;
    const entry = catalogIndex[m];
    if (entry !== undefined) {
      setBrand((entry.brand ?? "") as Brand | "");
    }
  }, [m, catalogIndex]);

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
    if (brandRequired && !brand) return;

    if (catalogedCollection) {
      const sameCollection = c === "" || c.toUpperCase() === catalogedCollection.toUpperCase();
      // Associates are always coerced; managers can store a divergent value
      // (the catalog is authoritative at read time anyway).
      if (sameCollection || !isManager) {
        commit(m, catalogedCollection, intent);
        return;
      }
    }
    commit(m || null, c || null, intent);
  };

  const addDisabled = !intent || (!m && !collection.trim() && !brand) || (brandRequired && !brand);

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
          placeholder={collectionLocked ? catalogedCollection : "Collection"}
          value={collectionLocked ? catalogedCollection : collection}
          list={listId}
          readOnly={collectionLocked}
          onChange={(e) => setCollection(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          aria-label="Collection"
        />
        <datalist id={listId}>
          {suggestions.map((s) => <option key={s} value={s} />)}
        </datalist>
        <Select
          value={brand || undefined}
          onValueChange={(v) => setBrand(v as Brand)}
          disabled={brandLocked}
        >
          <SelectTrigger className="sm:w-44" aria-label={brandRequired ? "Brand (required)" : "Brand (optional)"}>
            <SelectValue placeholder={brandRequired ? "Brand (required)" : "Brand (optional)"} />
          </SelectTrigger>
          <SelectContent>
            {BRAND_VALUES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button type="button" onClick={add} variant="outline" className="shrink-0" disabled={addDisabled}>
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
        {catalogedCollection && ` ${m} is cataloged as ${catalogedCollection}.`}
        {brandRequired && " Brand required for new models."}
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

    </div>
  );
}
