import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PaginationState, RowSelectionState, SortingState } from "@tanstack/react-table";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { MoneyCell, TextCell } from "@/components/data-table/cells";
import { EmptyState } from "@/components/empty-state";

/**
 * The engine's own contract, exercised without a page around it: cell renderers
 * own their `<TableCell>`, headers get the `<TableHead>`, and every state slice
 * is the caller's. Catalog and promos have no component tests of their own, so
 * this is the regression net under both migrations.
 */

interface Model {
  model: string;
  msrp: number | null;
}

const ROWS: Model[] = [
  { model: "VX-3", msrp: 900 },
  { model: "AB-1", msrp: 250 },
  { model: "MC-2", msrp: null },
];

const COLUMNS: DataTableColumn<Model>[] = [
  {
    id: "model",
    accessorFn: (r) => r.model,
    header: (ctx) => <DataTableColumnHeader ctx={ctx} label="Model" />,
    cell: ({ row }) => <TextCell value={row.original.model} />,
  },
  {
    id: "msrp",
    accessorFn: (r) => r.msrp,
    meta: { headClassName: "text-right hidden md:table-cell" },
    header: (ctx) => <DataTableColumnHeader ctx={ctx} align="right" label="MSRP" />,
    cell: ({ row }) => <MoneyCell value={row.original.msrp} />,
  },
];

/** The model column's cell text, top to bottom. */
function modelColumn(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent ?? "");
}

describe("DataTable rendering", () => {
  it("renders one cell per column, emitted by the cell renderer itself", () => {
    render(<DataTable columns={COLUMNS} data={ROWS} getRowId={(r) => r.model} />);

    const body = screen.getAllByRole("row").slice(1);
    expect(body).toHaveLength(3);
    expect(within(body[0]).getAllByRole("cell")).toHaveLength(2);
    // MoneyCell's own classes survive — the engine does not re-wrap it.
    expect(within(body[0]).getAllByRole("cell")[1]).toHaveClass("text-right", "tabular-nums");
    expect(within(body[2]).getAllByRole("cell")[1].textContent).toBe("—");
  });

  it("puts column meta classes on the th", () => {
    render(<DataTable columns={COLUMNS} data={ROWS} />);
    expect(screen.getByRole("columnheader", { name: /MSRP/ })).toHaveClass("hidden", "md:table-cell");
  });

  it("renders the empty slot in a full-width row", () => {
    render(<DataTable columns={COLUMNS} data={[]} empty={<EmptyState description="No models." compact />} />);

    expect(screen.getByText("No models.")).toBeInTheDocument();
    expect(screen.getAllByRole("cell")[0]).toHaveAttribute("colspan", "2");
  });

  it("drops the Card shell for chrome={false}", () => {
    const { container, rerender } = render(<DataTable columns={COLUMNS} data={ROWS} chrome={false} />);
    expect(container.querySelector(".rounded-xl")).toBeNull();

    rerender(<DataTable columns={COLUMNS} data={ROWS} />);
    expect(container.querySelector(".rounded-xl")).not.toBeNull();
  });
});

describe("DataTable sorting", () => {
  function ClientSorted() {
    const [sorting, setSorting] = useState<SortingState>([]);
    return <DataTable columns={COLUMNS} data={ROWS} state={{ sorting }} onSortingChange={setSorting} />;
  }

  it("sorts ascending on the first click and flips on the second", async () => {
    const user = userEvent.setup();
    render(<ClientSorted />);

    await user.click(screen.getByRole("button", { name: /Model/ }));
    expect(modelColumn()).toEqual(["AB-1", "MC-2", "VX-3"]);
    expect(screen.getByRole("columnheader", { name: /Model/ })).toHaveAttribute("aria-sort", "ascending");

    await user.click(screen.getByRole("button", { name: /Model/ }));
    expect(modelColumn()).toEqual(["VX-3", "MC-2", "AB-1"]);
    expect(screen.getByRole("columnheader", { name: /Model/ })).toHaveAttribute("aria-sort", "descending");
  });

  it("leaves the row order alone under manualSorting and still reports the sort", async () => {
    const onSortingChange = vi.fn();
    const user = userEvent.setup();
    render(
      <DataTable
        columns={COLUMNS}
        data={ROWS}
        manualSorting
        state={{ sorting: [{ id: "model", desc: false }] }}
        onSortingChange={onSortingChange}
      />,
    );

    expect(modelColumn()).toEqual(["VX-3", "AB-1", "MC-2"]);

    await user.click(screen.getByRole("button", { name: /Model/ }));
    expect(onSortingChange).toHaveBeenCalledTimes(1);
  });
});

describe("DataTable pagination", () => {
  it("slices client-side and reports the count", async () => {
    const user = userEvent.setup();
    function Paged() {
      const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 2 });
      return (
        <DataTable
          columns={COLUMNS}
          data={ROWS}
          state={{ pagination }}
          onPaginationChange={setPagination}
          pagination={{ itemLabel: "models" }}
        />
      );
    }
    render(<Paged />);

    expect(screen.getByText("1–2 of 3 models")).toBeInTheDocument();
    expect(modelColumn()).toEqual(["VX-3", "AB-1"]);

    await user.click(screen.getByRole("button", { name: "Go to next page" }));
    expect(modelColumn()).toEqual(["MC-2"]);
  });

  it("trusts the server page and rowCount under manualPagination", async () => {
    const onPaginationChange = vi.fn();
    const user = userEvent.setup();
    render(
      <DataTable
        columns={COLUMNS}
        data={ROWS}
        manualPagination
        rowCount={100}
        state={{ pagination: { pageIndex: 3, pageSize: 20 } }}
        onPaginationChange={onPaginationChange}
        pagination={{ itemLabel: "models" }}
      />,
    );

    expect(modelColumn()).toHaveLength(3);
    expect(screen.getByText("61–80 of 100 models")).toBeInTheDocument();
    expect(screen.getByText("Page 4 of 5")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Go to next page" }));
    expect(onPaginationChange).toHaveBeenCalledTimes(1);
  });
});

describe("DataTable selection", () => {
  function Selectable() {
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    return (
      <DataTable
        columns={COLUMNS}
        data={ROWS}
        getRowId={(r) => r.model}
        selection={{ label: "models" }}
        state={{ rowSelection }}
        onRowSelectionChange={setRowSelection}
        rowClassName={(row) => (row.getIsSelected() ? "bg-accent/5" : "hover:bg-muted/30")}
      />
    );
  }

  it("selects one row and marks it through rowClassName", async () => {
    const user = userEvent.setup();
    render(<Selectable />);

    const firstRow = screen.getAllByRole("row")[1];
    await user.click(within(firstRow).getByRole("checkbox"));

    expect(screen.getAllByRole("row")[1]).toHaveClass("bg-accent/5");
    expect(screen.getByRole("checkbox", { name: "Select all models" })).not.toBeChecked();
  });

  it("selects and clears every row from the header checkbox", async () => {
    const user = userEvent.setup();
    render(<Selectable />);
    const selectAll = screen.getByRole("checkbox", { name: "Select all models" });

    await user.click(selectAll);
    expect(screen.getAllByRole("checkbox").filter((c) => c.getAttribute("data-state") === "checked")).toHaveLength(4);

    await user.click(selectAll);
    expect(screen.getAllByRole("checkbox").filter((c) => c.getAttribute("data-state") === "checked")).toHaveLength(0);
  });

  it("leaves the header checkbox unchecked when there are no rows", () => {
    render(<DataTable columns={COLUMNS} data={[]} selection={{ label: "models" }} />);
    expect(screen.getByRole("checkbox", { name: "Select all models" })).not.toBeChecked();
  });
});
