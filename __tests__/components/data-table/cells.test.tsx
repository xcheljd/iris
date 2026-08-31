import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  BooleanCell,
  DateTimeCell,
  HeatBadgeCell,
  MoneyCell,
  MonoCell,
  PercentCell,
  RelativeDateCell,
  StatusBadgeCell,
  TextCell,
} from "@/components/data-table/cells";

/** Cells are `<td>`s — nest them properly or React logs a DOM-nesting error. */
function renderCell(cell: ReactNode) {
  const result = render(
    <table>
      <tbody>
        <tr>{cell}</tr>
      </tbody>
    </table>,
  );
  return { ...result, cell: result.container.querySelector("td")! };
}

const DASH = "—";

describe("TextCell", () => {
  it("renders the value", () => {
    renderCell(<TextCell value="Marcus" />);
    expect(screen.getByText("Marcus")).toBeInTheDocument();
  });

  it("renders a muted dash for null", () => {
    const { cell } = renderCell(<TextCell value={null} />);
    expect(cell.textContent).toBe(DASH);
    expect(cell.querySelector("span")).toHaveClass("text-muted-foreground");
  });

  it("renders a muted dash for an empty string", () => {
    const { cell } = renderCell(<TextCell value="" />);
    expect(cell.textContent).toBe(DASH);
  });

  it("renders 0 rather than treating it as missing", () => {
    const { cell } = renderCell(<TextCell value={0} />);
    expect(cell.textContent).toBe("0");
  });

  it("merges the caller's className onto the cell", () => {
    const { cell } = renderCell(<TextCell value="x" className="hidden md:table-cell" />);
    expect(cell).toHaveClass("hidden", "md:table-cell");
  });
});

describe("MonoCell", () => {
  it("renders the value in the monospace face", () => {
    const { cell } = renderCell(<MonoCell value="M-116610" />);
    expect(cell).toHaveClass("font-mono");
    expect(screen.getByText("M-116610")).toBeInTheDocument();
  });

  it("falls back to a dash like TextCell", () => {
    const { cell } = renderCell(<MonoCell value={null} />);
    expect(cell.textContent).toBe(DASH);
  });
});

describe("MoneyCell", () => {
  it("formats USD with a thousands separator and cents", () => {
    const { cell } = renderCell(<MoneyCell value={12500} />);
    expect(cell.textContent).toBe("$12,500.00");
  });

  it("right-aligns with tabular numerals", () => {
    const { cell } = renderCell(<MoneyCell value={1} />);
    expect(cell).toHaveClass("text-right", "tabular-nums");
  });

  it("renders a muted dash for null — a missing price is not a free watch", () => {
    const { cell } = renderCell(<MoneyCell value={null} />);
    expect(cell.textContent).toBe(DASH);
    expect(cell.querySelector("span")).toHaveClass("text-muted-foreground");
  });

  it("renders $0.00 for a real zero", () => {
    const { cell } = renderCell(<MoneyCell value={0} />);
    expect(cell.textContent).toBe("$0.00");
  });

  it("applies the sale treatment on emphasis=sale", () => {
    const { cell } = renderCell(<MoneyCell value={999} emphasis="sale" />);
    expect(cell).toHaveClass("text-green-500", "font-medium");
  });

  it("renders a note under the amount", () => {
    const { cell } = renderCell(<MoneyCell value={999} note={<div>below catalog</div>} />);
    expect(cell.textContent).toContain("$999.00");
    expect(screen.getByText("below catalog")).toBeInTheDocument();
  });
});

describe("PercentCell", () => {
  it("suffixes the value with a percent sign", () => {
    const { cell } = renderCell(<PercentCell value={15} />);
    expect(cell.textContent).toBe("15%");
  });

  it("renders 0%, not a dash", () => {
    const { cell } = renderCell(<PercentCell value={0} />);
    expect(cell.textContent).toBe("0%");
  });

  it("renders a dash for null", () => {
    const { cell } = renderCell(<PercentCell value={null} />);
    expect(cell.textContent).toBe(DASH);
  });

  it("right-aligns with tabular numerals", () => {
    const { cell } = renderCell(<PercentCell value={5} />);
    expect(cell).toHaveClass("text-right", "tabular-nums");
  });
});

describe("RelativeDateCell", () => {
  it('renders "Today" for now', () => {
    const { cell } = renderCell(<RelativeDateCell value={new Date()} />);
    expect(cell.textContent).toBe("Today");
  });

  it("renders the age as text, never a bare number", () => {
    const twelveDaysAgo = new Date(Date.now() - 12 * 24 * 60 * 60 * 1000);
    const { cell } = renderCell(<RelativeDateCell value={twelveDaysAgo} />);
    expect(cell.textContent).toBe("12d ago");
  });

  it('renders "Never" for null', () => {
    const { cell } = renderCell(<RelativeDateCell value={null} />);
    expect(cell.textContent).toBe("Never");
  });
});

describe("DateTimeCell", () => {
  it("renders the absolute date", () => {
    const { cell } = renderCell(<DateTimeCell value={new Date(2026, 7, 31)} />);
    expect(cell.textContent).toBe("Aug 31, 2026");
  });

  it("stacks the relative age under the date when asked", () => {
    const { cell } = renderCell(<DateTimeCell value={new Date()} showRelative />);
    const lines = Array.from(cell.querySelectorAll("div")).map((d) => d.textContent);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe("Today");
  });

  it("omits the relative line by default", () => {
    const { cell } = renderCell(<DateTimeCell value={new Date()} />);
    expect(cell.querySelectorAll("div")).toHaveLength(1);
  });

  it("renders a dash for null rather than an invalid date", () => {
    const { cell } = renderCell(<DateTimeCell value={null} />);
    expect(cell.textContent).toBe(DASH);
  });
});

describe("StatusBadgeCell", () => {
  it("renders the label in a badge", () => {
    renderCell(<StatusBadgeCell label="manager" />);
    expect(screen.getByText("manager")).toBeInTheDocument();
  });

  it("defaults to the secondary variant", () => {
    renderCell(<StatusBadgeCell label="manager" />);
    expect(screen.getByText("manager")).toHaveClass("bg-secondary");
  });

  it("honours an explicit variant", () => {
    renderCell(<StatusBadgeCell label="rvx" variant="outline" />);
    expect(screen.getByText("rvx")).toHaveClass("text-foreground");
  });

  it("capitalizes only when asked", () => {
    renderCell(<StatusBadgeCell label="banned" capitalize />);
    expect(screen.getByText("banned")).toHaveClass("capitalize");
  });

  it("renders a numeric 0 label rather than swallowing it", () => {
    const { cell } = renderCell(<StatusBadgeCell label={0} />);
    expect(cell.textContent).toBe("0");
  });

  it("renders an empty cell — not a dash — when there is nothing to flag", () => {
    const { cell } = renderCell(<StatusBadgeCell label={null} />);
    expect(cell.textContent).toBe("");
    expect(cell.children).toHaveLength(0);
  });
});

describe("HeatBadgeCell", () => {
  it("renders the heat level", () => {
    renderCell(<HeatBadgeCell level="hot" />);
    expect(screen.getByText("hot")).toBeInTheDocument();
  });

  it("hides the score by default", () => {
    renderCell(<HeatBadgeCell level="warm" score={62} />);
    expect(screen.queryByText("62")).not.toBeInTheDocument();
  });

  it("shows the score when asked", () => {
    renderCell(<HeatBadgeCell level="warm" score={62} showScore />);
    expect(screen.getByText("62")).toBeInTheDocument();
  });
});

describe("BooleanCell", () => {
  it("renders a check icon for true", () => {
    const { cell } = renderCell(<BooleanCell value />);
    expect(cell.querySelector("svg")).toBeTruthy();
  });

  it("renders a dash for false", () => {
    const { cell } = renderCell(<BooleanCell value={false} />);
    expect(cell.querySelector("svg")).toBeNull();
    expect(cell.textContent).toContain(DASH);
  });

  it("gives both states a screen-reader word", () => {
    renderCell(<BooleanCell value />);
    expect(screen.getByText("Yes")).toHaveClass("sr-only");
  });

  it('reads "No" when false', () => {
    renderCell(<BooleanCell value={false} />);
    expect(screen.getByText("No")).toHaveClass("sr-only");
  });
});
