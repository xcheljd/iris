"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";
import { normalizeModel } from "@/lib/normalize";
import { MERIDIAN_COLLECTIONS } from "@/lib/collections";
import type { ProductOfInterest } from "@/lib/db/schema";

interface Props {
  value: ProductOfInterest[];
  onChange: (next: ProductOfInterest[]) => void;
  collectionSuggestions?: string[];
}

function keyOf(p: ProductOfInterest) {
  return `${(p.model ?? "").toUpperCase()}|${(p.collection ?? "").toUpperCase()}`;
}

function describe(p: ProductOfInterest) {
  if (p.model && p.collection) return `${p.model} — ${p.collection}`;
  return p.model ?? p.collection ?? "";
}

/**
 * Structured products-of-interest editor. Each entry is a { model, collection }
 * pair; at least one field is required. Model is upper-cased on add (matching
 * the server-side normalizeModel). Fuzzy interests go in notes, not here.
 */
export function ProductsOfInterestInput({ value, onChange, collectionSuggestions }: Props) {
  const [model, setModel] = useState("");
  const [collection, setCollection] = useState("");
  const listId = useId();
  const suggestions = collectionSuggestions ?? MERIDIAN_COLLECTIONS;

  const add = () => {
    const m = normalizeModel(model);
    const c = collection.trim();
    if (!m && !c) return;
    const entry: ProductOfInterest = { model: m || null, collection: c || null };
    if (value.some((p) => keyOf(p) === keyOf(entry))) {
      setModel("");
      setCollection("");
      return;
    }
    onChange([...value, entry]);
    setModel("");
    setCollection("");
  };

  const remove = (entry: ProductOfInterest) =>
    onChange(value.filter((p) => keyOf(p) !== keyOf(entry)));

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Model number (optional)"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          onBlur={() => setModel((m) => normalizeModel(m))}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          className="font-mono"
          aria-label="Model number"
        />
        <Input
          placeholder="Collection (optional)"
          value={collection}
          list={listId}
          onChange={(e) => setCollection(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          aria-label="Collection"
        />
        <datalist id={listId}>
          {suggestions.map((s) => <option key={s} value={s} />)}
        </datalist>
        <Button type="button" onClick={add} variant="outline" className="shrink-0">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Enter a model, a collection, or both. Vague interests belong in notes.
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
