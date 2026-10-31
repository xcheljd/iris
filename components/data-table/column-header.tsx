"use client";

import type { ReactNode } from "react";
import type { HeaderContext, RowData } from "@tanstack/react-table";
import { ColumnHeader } from "@/components/column-header";
import type { DataTableFeatures } from "./data-table";

/**
 * Adapter, not a replacement: it reads sort state off the TanStack column and
 * hands it to the existing `components/column-header.tsx`, which still owns the
 * chevrons, the filter slot and the `aria-sort` effect. Every non-engine
 * `<Table>` surface keeps using `ColumnHeader` directly.
 *
 * `onSortAction` ignores the key it is handed and calls `toggleSorting()`, so
 * the cycle comes from the table options (`sortDescFirst: false`,
 * `enableSortingRemoval: false` — asc, then flip forever) rather than from
 * per-surface `handleSort` logic.
 */
export function DataTableColumnHeader<TData extends RowData>({
  ctx,
  label,
  filter,
  align,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: HeaderContext<DataTableFeatures, TData, any>;
  label: string;
  /** The column's filter trigger, if it has one. */
  filter?: ReactNode;
  /** Numeric columns pass "right" so the header sits over right-aligned cells. */
  align?: "left" | "right";
}) {
  const { column } = ctx;
  const sorted = column.getIsSorted();

  return (
    <ColumnHeader
      label={label}
      sortKey={column.getCanSort() ? column.id : undefined}
      currentSort={sorted ? column.id : undefined}
      currentDir={sorted || undefined}
      onSortAction={() => column.toggleSorting()}
      filter={filter}
      align={align}
    />
  );
}
