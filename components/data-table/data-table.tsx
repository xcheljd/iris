"use client";

import { Fragment, useMemo, type ReactNode } from "react";
import {
  columnFilteringFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type ColumnFiltersState,
  type OnChangeFn,
  type PaginationState,
  type Row,
  type RowData,
  type RowSelectionState,
  type SortFn,
  type SortingState,
  type TableState,
} from "@tanstack/react-table";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { PaginationFooter } from "@/components/pagination-footer";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * The composition layer between TanStack Table v9 and Iris' `<Table>` shell.
 *
 * It owns exactly three things: the table instance, the markup, and the
 * optional Card/PaginationFooter chrome around it. It does **not** fetch, does
 * not touch the router and does not own state — every state slice is passed in
 * through `state` and written back through the matching `on…Change` callback,
 * so URL-backed surfaces keep their `navigate()` as the single writer.
 *
 * Cell renderers emit their own `<TableCell>` (that is the contract of the
 * shared vocabulary in `./cells`), so the engine renders a column's `cell`
 * output directly into the row instead of wrapping it. Headers are the other
 * way round: the engine owns the `<TableHead>` and the column supplies its
 * contents (usually via `<DataTableColumnHeader>`).
 */

/** Extra per-column presentation the engine reads off `columnDef.meta`. */
export interface DataTableColumnMeta {
  /** Classes for this column's `<TableHead>` — alignment, width, responsive hiding. */
  headClassName?: string;
}

/**
 * The one feature set every Iris table shares. Registering a feature is what
 * creates its state slice and APIs, and the row-model slots are what make the
 * client-side pathway work; the `manual*` options below bypass a slot when the
 * server has already done that step.
 */
export const dataTableFeatures = tableFeatures({
  columnFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  rowSelectionFeature,
  columnMeta: {} as DataTableColumnMeta,
});

export type DataTableFeatures = typeof dataTableFeatures;

/**
 * A column of an Iris table. `TValue` is `any` on purpose: one array mixes
 * accessors returning strings, numbers and nulls, and the `unknown` default
 * makes those definitions mutually unassignable.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DataTableColumn<TData extends RowData> = ColumnDef<DataTableFeatures, TData, any>;
export type DataTableRow<TData extends RowData> = Row<DataTableFeatures, TData>;
export type DataTableSortFn<TData extends RowData> = SortFn<DataTableFeatures, TData>;

export interface DataTableProps<TData extends RowData> {
  columns: DataTableColumn<TData>[];
  data: TData[];
  /** Stable row identity — required for row selection to survive re-sorts. */
  getRowId?: (row: TData, index: number) => string;

  /**
   * Caller-owned state slices, straight through to TanStack. Each slice is
   * compared *shallowly* against the table's own copy, so a slice holding
   * objects — `sorting` is `[{ id, desc }]` — has to keep its identity between
   * renders that did not change it. Derive those with `useMemo`; a fresh array
   * every render publishes on every commit and re-renders forever.
   */
  state?: Partial<TableState<DataTableFeatures>>;
  onSortingChange?: OnChangeFn<SortingState>;
  onColumnFiltersChange?: OnChangeFn<ColumnFiltersState>;
  onPaginationChange?: OnChangeFn<PaginationState>;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;

  /** "The server already did this step; trust the incoming rows." */
  manualSorting?: boolean;
  manualFiltering?: boolean;
  manualPagination?: boolean;
  /** Server-side row total. Required with `manualPagination` for the page maths. */
  rowCount?: number;
  /** Client-side surfaces that must keep their page across a re-sort pass `false`. */
  autoResetPageIndex?: boolean;

  /** Prepend a checkbox column. `label` names the rows ("clients"). */
  selection?: { label: string };
  /** Rendered in a full-width row when there are no rows. */
  empty?: ReactNode;
  /** Per-row classes — selected and hover treatments. */
  rowClassName?: (row: DataTableRow<TData>) => string;

  /** Card shell. `false` = bare table, for embeds and dialog previews. */
  chrome?: boolean;
  /** Dim the shell while a navigation is in flight. Only meaningful with `chrome`. */
  busy?: boolean;
  /**
   * Render a `PaginationFooter` after the table (outside the Card, as a
   * sibling — every Iris surface places it that way). Omit for no footer.
   */
  pagination?: { itemLabel?: string; variant?: "text" | "icons"; showBorder?: boolean };
}

/** The leading checkbox column, built only when `selection` is passed. */
function selectionColumn<TData extends RowData>(label: string): DataTableColumn<TData> {
  return {
    id: "select",
    meta: { headClassName: "w-10" },
    header: ({ table }) => (
      <>
        <span className="sr-only">Select all</span>
        <Checkbox
          checked={table.getRowModel().rows.length > 0 && table.getIsAllPageRowsSelected()}
          onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked === true)}
          aria-label={`Select all ${label}`}
        />
      </>
    ),
    cell: ({ row }) => (
      <TableCell>
        <Checkbox checked={row.getIsSelected()} onCheckedChange={(checked) => row.toggleSelected(checked === true)} />
      </TableCell>
    ),
  };
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  getRowId,
  state,
  onSortingChange,
  onColumnFiltersChange,
  onPaginationChange,
  onRowSelectionChange,
  manualSorting,
  manualFiltering,
  manualPagination,
  rowCount,
  autoResetPageIndex,
  selection,
  empty,
  rowClassName,
  chrome = true,
  busy,
  pagination,
}: DataTableProps<TData>) {
  const selectionLabel = selection?.label;
  const allColumns = useMemo(
    () => (selectionLabel == null ? columns : [selectionColumn<TData>(selectionLabel), ...columns]),
    [selectionLabel, columns],
  );

  const table = useTable({
    features: dataTableFeatures,
    columns: allColumns,
    data,
    getRowId,
    state,
    onSortingChange,
    onColumnFiltersChange,
    onPaginationChange,
    onRowSelectionChange,
    manualSorting,
    manualFiltering,
    manualPagination,
    rowCount,
    autoResetPageIndex,
    // Every Iris table sorts ascending on the first click and then flips
    // forever; TanStack would otherwise start numeric columns descending and
    // let a third click clear the sort.
    sortDescFirst: false,
    enableSortingRemoval: false,
  });

  const rows = table.getRowModel().rows;

  const body = (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead key={header.id} className={header.column.columnDef.meta?.headClassName}>
                  <table.FlexRender header={header} />
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length === 0 && empty ? (
            <TableRow>
              <TableCell colSpan={table.getAllLeafColumns().length} className="p-0">
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id} className={rowClassName?.(row)}>
                {row.getAllCells().map((cell) => (
                  // The cell renderer emits the <TableCell> itself; a Fragment
                  // carries the key without adding a DOM node between them.
                  <Fragment key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </Fragment>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <>
      {chrome ? (
        <Card aria-busy={busy} className={busy ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {body}
        </Card>
      ) : (
        body
      )}
      {pagination && (
        <PaginationFooter
          currentPage={table.state.pagination.pageIndex + 1}
          totalPages={table.getPageCount()}
          onPageChangeAction={(page) => table.setPageIndex(page - 1)}
          totalItems={table.getRowCount()}
          pageSize={table.state.pagination.pageSize}
          itemLabel={pagination.itemLabel}
          variant={pagination.variant}
          showBorder={pagination.showBorder}
        />
      )}
    </>
  );
}
