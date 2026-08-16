"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ClientFilterChip, ClientFilterChipKey } from "@/lib/smart-list-filters";

interface ClientsActiveFiltersProps {
  chips: ClientFilterChip[];
  /** Called when an individual chip's X is clicked. */
  onRemove(key: ClientFilterChipKey): void;
  /** Called when the "Clear all" button is clicked. */
  onClearAll(): void;
  className?: string;
}

/**
 * One-line strip of removable chips that surfaces the currently-active
 * Clients-page filters. Renders nothing when no filters are active.
 *
 * The chip set is computed once by the caller via getActiveFilterChips()
 * and the parent owns the filter state — this component only emits
 * remove-this-key / clear-all signals.
 */
export function ClientsActiveFilters({
  chips,
  onRemove,
  onClearAll,
  className,
}: ClientsActiveFiltersProps) {
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
