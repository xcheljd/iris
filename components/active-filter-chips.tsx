"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ActiveFilterChip<K extends string = string> {
  /** Unique key (one per filter family). The caller knows how to clear it in their own filter shape. */
  key: K;
  /** Human-readable label, e.g. `"Heat: hot"`. */
  label: string;
}

interface ActiveFilterChipsProps<K extends string> {
  chips: ReadonlyArray<ActiveFilterChip<K>>;
  /** Called when an individual chip's X is clicked. */
  onRemove(key: K): void;
  /** Called when the "Clear all" button is clicked. */
  onClearAll(): void;
  className?: string;
}

/**
 * One-line strip of removable chips that surfaces the currently-active filters
 * on a list page. Renders nothing when no filters are active.
 *
 * The chip set is computed by the caller and the parent owns the filter state —
 * this component only emits remove-this-key / clear-all signals. `K` is the
 * caller's own chip-key union, so handlers stay exhaustively typed.
 */
export function ActiveFilterChips<K extends string>({
  chips,
  onRemove,
  onClearAll,
  className,
}: ActiveFilterChipsProps<K>) {
  if (chips.length === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 rounded-md border bg-muted/30 px-3 py-2 text-xs",
        className,
      )}
      role="region"
      aria-label="Active filters"
    >
      <span className="text-muted-foreground font-medium mr-1">Filters:</span>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onRemove(chip.key)}
          className="group inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 hover:bg-accent transition-colors"
          aria-label={`Remove filter: ${chip.label}`}
        >
          <span>{chip.label}</span>
          <X className="size-3 opacity-60 group-hover:opacity-100" />
        </button>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 text-xs ml-auto"
        onClick={onClearAll}
      >
        Clear all
      </Button>
    </div>
  );
}
