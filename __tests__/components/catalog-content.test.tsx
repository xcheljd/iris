import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CatalogContent } from "@/app/(app)/catalog/catalog-content";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/actions", () => ({
  correctCatalog: vi.fn(),
  resolveFlag: vi.fn(),
  confirmCatalogRow: vi.fn(),
  confirmCatalogRows: vi.fn(),
  deleteCatalogRow: vi.fn(),
  deleteCatalogRows: vi.fn(),
  clearCatalog: vi.fn(),
}));

vi.mock("@/components/topbar", () => ({
  Topbar: ({ children }: { children?: React.ReactNode }) => <div data-testid="topbar">{children}</div>,
}));

type Props = Parameters<typeof CatalogContent>[0];
type Row = Props["rows"][number];

const ROWS: Row[] = [
  {
    model: "MR-1200",
    collection: "Solaris",
    source: "curated",
    brand: "meridian",
    msrp: 1200,
    needsReview: false,
    flaggedCollection: null,
    flaggedSource: null,
  },
  {
    model: "AS-0450",
    collection: "Ashwood",
    source: "promo",
    brand: null,
    msrp: null,
    needsReview: false,
    flaggedCollection: null,
    flaggedSource: null,
  },
];

function renderCatalog(overrides: Partial<Props> = {}) {
  const props: Props = {
    rows: ROWS,
    total: 40,
    needsReview: [],
    flagged: [],
    mod: "",
    col: "",
    brands: [],
    msrpCeiling: 10_000,
    sort: "model",
    dir: "asc",
    page: 1,
    ...overrides,
  };
  return render(<CatalogContent {...props} />);
}

/** The catalog table, ignoring the needs-review / conflict cards above it. */
function tableRows() {
  return screen.getAllByRole("row");
}

describe("CatalogContent on the DataTable engine", () => {
  beforeEach(() => replace.mockReset());

  it("renders every column in order", () => {
    renderCatalog();
    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers).toEqual(["Model", "Collection", "Brand", "MSRP", "Source", "Actions"]);
  });

  it("renders rows through the shared cell vocabulary", () => {
    renderCatalog();
    const cells = within(tableRows()[1]).getAllByRole("cell");

    expect(cells).toHaveLength(6);
    expect(cells[0]).toHaveClass("font-mono");
    expect(cells[0].textContent).toBe("MR-1200");
    expect(cells[3]).toHaveClass("text-right", "tabular-nums");
    expect(cells[3].textContent).toBe("$1,200.00");
    // A row with no brand and no MSRP gets the muted dash, not a blank.
    const sparse = within(tableRows()[2]).getAllByRole("cell");
    expect(sparse[2].textContent).toBe("—");
    expect(sparse[3].textContent).toBe("—");
  });

  it("reflects the URL sort on the th and navigates on a header click", async () => {
    const user = userEvent.setup();
    renderCatalog({ sort: "model", dir: "asc" });

    expect(screen.getByRole("columnheader", { name: /Model/ })).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByRole("columnheader", { name: /MSRP/ })).toHaveAttribute("aria-sort", "none");

    // Same column flips direction…
    await user.click(screen.getByRole("button", { name: /^Model/ }));
    expect(replace).toHaveBeenLastCalledWith("/catalog?dir=desc");

    // …a different column starts ascending, and both go back to page 1.
    await user.click(screen.getByRole("button", { name: /^MSRP/ }));
    expect(replace).toHaveBeenLastCalledWith("/catalog?sort=msrp");
  });

  it("keeps the whole server page — the engine must not re-slice it", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ ...ROWS[0], model: `MR-${i}` }));
    renderCatalog({ rows: many, total: 40 });
    expect(tableRows()).toHaveLength(21);
    expect(screen.getByText("1–20 of 40 models")).toBeInTheDocument();
  });

  it("swaps the collection cell for an input while correcting", async () => {
    const user = userEvent.setup();
    renderCatalog();

    await user.click(within(tableRows()[1]).getByRole("button", { name: "Correct" }));
    expect(screen.getByDisplayValue("Solaris")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByDisplayValue("Solaris")).not.toBeInTheDocument();
  });

  it("shows the filtered-empty state instead of the table", () => {
    renderCatalog({ rows: [], total: 0, mod: "zzz" });
    expect(screen.getByText("No matches for current filters")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
