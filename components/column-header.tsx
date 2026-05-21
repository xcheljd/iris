"use client";

import type { ReactNode } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

/**
 * Header cell: label + optional sort affordance + optional filter trigger.
 * Sort is opt-in (pass sortKey/onSortAction); filter is opt-in (pass `filter` slot).
 * The chevron shows sort direction: up = asc, down = desc, faded = inactive.
 */
export function ColumnHeader<K extends string>({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSortAction,
  filter,
}: {
  label: string;
  sortKey?: K;
  currentSort?: K;
  currentDir?: "asc" | "desc";
  onSortAction?: (key: K) => void;
  filter?: ReactNode;
}) {
  const isActive = sortKey != null && currentSort === sortKey;
  return (
    <div className="flex items-center gap-1">
      {sortKey != null ? (
        <button
          onClick={() => onSortAction?.(sortKey)}
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          {label}
          {isActive ? (
            currentDir === "asc" ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
          )}
        </button>
      ) : (
        <span>{label}</span>
      )}
      {filter}
    </div>
  );
}
