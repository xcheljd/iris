import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ColumnHeader } from "@/components/column-header";
import { ColumnFilterPopover } from "@/components/column-filter-popover";
import { Table, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type SortKey = "msrp" | "model";

function renderHeader(props: Partial<Parameters<typeof ColumnHeader<SortKey>>[0]> = {}) {
  return render(
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            <ColumnHeader<SortKey> label="MSRP" sortKey="msrp" {...props} />
          </TableHead>
        </TableRow>
      </TableHeader>
    </Table>,
  );
}

// Regression (audit B9): sortable headers exposed no sort state to assistive
// tech, and the sort control had hover-only affordance.
describe("ColumnHeader a11y", () => {
  it("marks an unsorted sortable column aria-sort=none", () => {
    renderHeader();
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "none");
  });

  it("reflects the active sort direction on the th", () => {
    const { rerender } = renderHeader({ currentSort: "msrp", currentDir: "asc" });
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "ascending");

    rerender(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <ColumnHeader<SortKey> label="MSRP" sortKey="msrp" currentSort="msrp" currentDir="desc" />
            </TableHead>
          </TableRow>
        </TableHeader>
      </Table>,
    );
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "descending");
  });

  it("leaves aria-sort off a non-sortable column", () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <ColumnHeader label="Source" />
            </TableHead>
          </TableRow>
        </TableHeader>
      </Table>,
    );
    expect(screen.getByRole("columnheader")).not.toHaveAttribute("aria-sort");
  });

  it("gives the sort button a focus-visible ring, not hover only", () => {
    renderHeader();
    expect(screen.getByRole("button", { name: /MSRP/ }).className).toContain("focus-visible:ring-1");
  });

  it("still calls onSortAction with the column key", async () => {
    const onSortAction = vi.fn();
    const user = userEvent.setup();
    renderHeader({ onSortAction });
    await user.click(screen.getByRole("button", { name: /MSRP/ }));
    expect(onSortAction).toHaveBeenCalledWith("msrp");
  });
});

describe("ColumnFilterPopover a11y", () => {
  // Radix Popover already supplies aria-expanded on the trigger; aria-pressed
  // made it read as a toggle button as well.
  it("does not set aria-pressed on the trigger", () => {
    render(
      <ColumnFilterPopover label="MSRP" active>
        <div>filter body</div>
      </ColumnFilterPopover>,
    );
    const trigger = screen.getByRole("button", { name: "Filter MSRP" });
    expect(trigger).not.toHaveAttribute("aria-pressed");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
