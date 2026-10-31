"use client";

import { PlusCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { NewBrand } from "@/lib/new-brands";

/**
 * "This file names brands that aren't in your list" — shared by the promo and
 * catalog imports. Ticked brands are added to the brand list when the import
 * runs (and are treated as listed in the preview); likely typos start unticked.
 */
export function NewBrandsPanel({ brands, ticked, onToggle, disabled, listEmpty }: {
  brands: readonly NewBrand[];
  ticked: readonly string[];
  onToggle: (name: string, on: boolean) => void;
  disabled?: boolean;
  /** The store has no brands yet (first import). */
  listEmpty: boolean;
}) {
  if (brands.length === 0) return null;
  const on = new Set(ticked);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-primary/40 bg-primary/5 p-3" data-testid="new-brands-panel">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <PlusCircle className="size-4" />
        {listEmpty ? "Start your brand list" : "New brands in this file"}
      </div>
      <p className="text-xs text-muted-foreground">
        {listEmpty
          ? "Your store has no brands yet. Ticked brands are added to your brand list (Settings → Brands) when you import."
          : `${brands.length} ${brands.length === 1 ? "brand isn't" : "brands aren't"} in your brand list. Ticked brands are added when you import.`}
        {" "}Spellings that look like a typo start unticked.
      </p>
      <ul className="flex flex-col gap-1">
        {brands.map((b) => (
          <li key={b.name} className="flex flex-wrap items-center gap-2 text-sm">
            <Checkbox
              checked={on.has(b.name)}
              disabled={disabled}
              onCheckedChange={(v) => onToggle(b.name, v === true)}
              aria-label={`Add brand ${b.name}`}
            />
            <span className="font-medium">{b.name}</span>
            <span className="text-xs text-muted-foreground">{b.rows} {b.rows === 1 ? "row" : "rows"}</span>
            {b.closeTo && <span className="text-xs text-warning">looks like a typo — did you mean {b.closeTo}?</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
