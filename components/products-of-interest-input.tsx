"use client";

import { useEffect, useId, useRef, useState } from "react";
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
  /**
   * Receives the next list. Return `false` to reject the change — the draft
   * fields are then left intact so the user can correct them. Returning
   * nothing (the common case) counts as accepted and clears the draft.
   */
  onChangeAction: (next: ProductOfInterest[]) => void | boolean;
  catalogIndex?: Record<string, CatalogEntry> | null;
  isManager?: boolean;
  collectionSuggestions?: string[];
  /**
   * Pre-seed the model field (e.g. from a quick-add search bar), normalized at
   * mount. Read **once**: later changes to this prop are ignored, so a caller
   * that needs to re-seed must unmount the input first. `interests-tab` relies
   * on Radix unmounting `DialogContent` when the dialog closes — do not add
   * `forceMount` there without also adding an explicit re-seed effect.
   */
  initialModel?: string;
  /**
   * Render the existing entries as read-only badges. Add-only surfaces (the
   * interests tab's "Add interest" dialog) pass `false` so a stray click can't
   * bulk-delete tracked interests. Defaults to `true` for the edit forms.
   */
  allowRemove?: boolean;
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
 * { model, collection, brand, intent }; intent must be picked explicitly
 * (no default, unless `initialModel` seeds one) and ≥1 of
 * model/collection/brand is required — the server schema refines on
 * `model || collection || brand`, so a brand-only interest is legal. When the
 * entered model is already in the catalog, the collection autofills and brand
 * autofills if the catalog has one; associates are locked to both. For unknown
 * models (not yet in catalog) brand is required before the entry can be added.
 */
export function ProductsOfInterestInput({
  value,
  onChangeAction,
  catalogIndex = null,
  isManager = false,
  collectionSuggestions,
  initialModel = "",
  allowRemove = true,
}: Props) {
  const [model, setModel] = useState(() => normalizeModel(initialModel));
  const [collection, setCollection] = useState("");
  const [brand, setBrand] = useState<Brand | "">("");
  // A seeded model means the user already committed to adding something, so
  // default the intent rather than leaving Enter a dead key.
  const [intent, setIntent] = useState<InterestIntent | "">(() =>
    normalizeModel(initialModel) ? "interested" : "",
  );
  // Select the seeded text on first focus so it can be typed over; later
  // focuses (after the user has edited or added) must not hijack the caret.
  const selectOnFocus = useRef(normalizeModel(initialModel) !== "");
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
    if (value.some((p) => keyOf(p) === keyOf(entry))) {
      reset();
      return;
    }
    // A parent may reject the add (duplicate, save in flight). Keep the draft
    // fields intact in that case so the user can correct and retry.
    const accepted = onChangeAction([...value, entry]);
    if (accepted !== false) reset();
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
    onChangeAction(value.filter((p) => keyOf(p) !== keyOf(entry)));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Model number"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          onFocus={(e) => {
            if (!selectOnFocus.current) return;
            selectOnFocus.current = false;
            e.currentTarget.select();
          }}
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
        <Button type="button" onClick={add} variant="outline" className="shrink-0" disabled={addDisabled} aria-label="Add interest">
          <Plus className="size-4" />
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
            {allowRemove && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="size-5 ml-1"
                onClick={() => remove(p)}
                aria-label={`Remove ${describe(p)}`}
              >
                <X className="size-3" />
              </Button>
            )}
          </Badge>
        ))}
      </div>

    </div>
  );
}
