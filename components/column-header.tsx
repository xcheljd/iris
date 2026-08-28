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
  align = "left",
}: {
  label: string;
  sortKey?: K;
  currentSort?: K;
  currentDir?: "asc" | "desc";
  onSortAction?: (key: K) => void;
  filter?: ReactNode;
  /** Numeric columns pass "right" so the header sits over right-aligned cells. */
  align?: "left" | "right";
}) {
  const isActive = sortKey != null && currentSort === sortKey;
  return (
    <div className={`flex items-center gap-1${align === "right" ? " justify-end" : ""}`}>
      {sortKey != null ? (
        <button
          onClick={() => onSortAction?.(sortKey)}
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          {label}
          {isActive ? (
            currentDir === "asc" ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )
          ) : (
            <ChevronsUpDown className="size-3.5 opacity-40" />
          )}
        </button>
      ) : (
        <span>{label}</span>
      )}
      {filter}
    </div>
  );
}
