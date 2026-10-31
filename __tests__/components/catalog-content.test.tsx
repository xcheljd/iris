import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CatalogContent, LAST_SEARCH_KEY } from "@/app/(app)/catalog/catalog-content";

const replace = vi.fn();
// Stable across renders, like Next's router instance.
const router = { push: vi.fn(), replace, refresh: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const updateCatalogRows = vi.fn();
vi.mock("@/lib/actions", () => ({
  updateCatalogRows: (...a: unknown[]) => updateCatalogRows(...a),
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

// Radix Select needs pointer-capture and scrollIntoView, which jsdom lacks.
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};

type Props = Parameters<typeof CatalogContent>[0];
type Row = Props["rows"][number];

const ROWS: Row[] = [
  {
    model: "MV-1200",
    collection: "Sundrift",
    source: "curated",
    brand: "maravista",
    msrp: 1200,
    needsReview: false,
    flaggedCollection: null,
    flaggedSource: null,
  },
  {
    model: "AD-0450",
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
    // The first column is the row-select checkbox.
    expect(headers).toEqual(["", "Model", "Collection", "Brand", "MSRP", "Source", "Actions"]);
  });

  it("renders rows through the shared cell vocabulary", () => {
    renderCatalog();
    const cells = within(tableRows()[1]).getAllByRole("cell");

    expect(cells).toHaveLength(7);
    expect(within(cells[0]).getByRole("checkbox", { name: "Select MV-1200" })).toBeInTheDocument();
    expect(cells[1]).toHaveClass("font-mono");
    expect(cells[1].textContent).toBe("MV-1200");
    expect(cells[4]).toHaveClass("text-right", "tabular-nums");
    expect(cells[4].textContent).toBe("$1,200.00");
    // A row with no brand and no MSRP gets the muted dash, not a blank.
    const sparse = within(tableRows()[2]).getAllByRole("cell");
    expect(sparse[3].textContent).toBe("—");
    expect(sparse[4].textContent).toBe("—");
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

  it("swaps collection, brand and MSRP for inputs while editing a row", async () => {
    const user = userEvent.setup();
    renderCatalog();

    await user.click(within(tableRows()[1]).getByRole("button", { name: "Edit MV-1200" }));
    expect(screen.getByDisplayValue("Sundrift")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Brand for MV-1200" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "MSRP for MV-1200" })).toHaveValue("1200");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByDisplayValue("Sundrift")).not.toBeInTheDocument();
  });

  it("saves only the fields that changed in an inline edit", async () => {
    updateCatalogRows.mockResolvedValue({ updated: 1, affected: 0 });
    const user = userEvent.setup();
    renderCatalog();
    await user.click(within(tableRows()[1]).getByRole("button", { name: "Edit MV-1200" }));
    const msrp = screen.getByRole("textbox", { name: "MSRP for MV-1200" });
    await user.clear(msrp);
    await user.type(msrp, "$1,350");
    expect(msrp).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(updateCatalogRows).toHaveBeenCalledWith(["MV-1200"], { msrp: 1350 }));
  });

  it("sets a field for every selected row from the bulk bar", async () => {
    updateCatalogRows.mockResolvedValue({ updated: 2, affected: 0 });
    const user = userEvent.setup();
    renderCatalog();
    expect(screen.queryByTestId("catalog-bulk-bar")).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Select all models on this page" }));
    const bar = screen.getByTestId("catalog-bulk-bar");
    expect(bar).toHaveTextContent("2 selected");
    await user.click(within(bar).getByRole("combobox", { name: "Field to set" }));
    await user.click(screen.getByRole("option", { name: "Collection" }));
    await user.type(within(bar).getByRole("textbox", { name: "New collection" }), "DRIFTWOOD");
    await user.click(within(bar).getByRole("button", { name: "Apply to 2" }));
    await waitFor(() => expect(updateCatalogRows).toHaveBeenCalledWith(["MV-1200", "AD-0450"], { collection: "DRIFTWOOD" }));
  });

  it("shows the filtered-empty state instead of the table", () => {
    renderCatalog({ rows: [], total: 0, mod: "zzz" });
    expect(screen.getByText("No matches for current filters")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("CatalogContent remembered filters", () => {
  beforeEach(() => {
    replace.mockReset();
    sessionStorage.clear();
  });

  it("saves the query string whenever it navigates", async () => {
    const user = userEvent.setup();
    renderCatalog({ brands: ["vellamy"] });

    await user.click(screen.getByRole("button", { name: /^MSRP/ }));

    expect(sessionStorage.getItem(LAST_SEARCH_KEY)).toBe("brands=vellamy&sort=msrp");
  });

  it("adopts the saved query on a bare /catalog visit, leaving the review panel alone", () => {
    sessionStorage.setItem(LAST_SEARCH_KEY, "brands=vellamy&page=2");
    renderCatalog({ restoreLastSearch: true, needsReview: [{ ...ROWS[0], model: "VL-0001", needsReview: true }] });

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/catalog?brands=vellamy&page=2", { scroll: false });
    // The panel is its own query, fed straight from props.
    expect(screen.getByText(/Needs cataloging \(1\)/)).toBeInTheDocument();
  });

  it("lets explicit URL params win over the saved query", () => {
    sessionStorage.setItem(LAST_SEARCH_KEY, "brands=vellamy");
    renderCatalog({ col: "Sundrift", restoreLastSearch: false });

    expect(replace).not.toHaveBeenCalled();
  });

  it("forgets the saved query when every filter is cleared", async () => {
    sessionStorage.setItem(LAST_SEARCH_KEY, "brands=vellamy");
    const user = userEvent.setup();
    renderCatalog({ brands: ["vellamy"] });

    await user.click(screen.getByRole("button", { name: /Clear all/i }));

    expect(replace).toHaveBeenLastCalledWith("/catalog");
    expect(sessionStorage.getItem(LAST_SEARCH_KEY)).toBeNull();
  });
});
