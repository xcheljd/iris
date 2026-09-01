"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

/**
 * Header cell: label + optional sort affordance + optional filter trigger.
 * Sort is opt-in (pass sortKey/onSortAction); filter is opt-in (pass `filter` slot).
 * The chevron shows sort direction: up = asc, down = desc, faded = inactive.
 *
 * aria-sort belongs on the `<th>`, which the caller owns (every call site wraps
 * this in shadcn's TableHead). Rather than thread the attribute through ~35 call
 * sites, a sortable header writes it onto its enclosing th from an effect.
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
  const sortable = sortKey != null;
  const ariaSort = !isActive ? "none" : currentDir === "asc" ? "ascending" : "descending";
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sortable) return;
    const th = ref.current?.closest("th");
    if (!th) return;
    th.setAttribute("aria-sort", ariaSort);
    return () => th.removeAttribute("aria-sort");
  }, [sortable, ariaSort]);

  return (
    <div ref={ref} className={`flex items-center gap-1${align === "right" ? " justify-end" : ""}`}>
      {sortKey != null ? (
        <button
          onClick={() => onSortAction?.(sortKey)}
          className="flex items-center gap-1 rounded-sm hover:text-foreground transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
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
