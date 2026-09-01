import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PromosContent } from "@/app/(app)/promos/promos-content";
import type { PromoWatch } from "@/lib/db/schema";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/actions", () => ({
  createPromo: vi.fn(),
  deletePromo: vi.fn(),
  clearAllPromos: vi.fn(),
}));

vi.mock("@/components/topbar", () => ({
  Topbar: ({ children }: { children?: React.ReactNode }) => <div data-testid="topbar">{children}</div>,
}));

vi.mock("@/components/matched-clients-tab", () => ({
  MatchedClientsTab: () => <div data-testid="matched-clients-tab" />,
}));

function promo(overrides: Partial<PromoWatch> & { id: string }): PromoWatch {
  return {
    modelNumber: "MR-1200",
    collection: "Solaris",
    brand: "Meridian",
    sizeOneQty: 2,
    sizeTwoQty: 0,
    msrp: 1200,
    discountPercent: 25,
    discountPrice: 900,
    promoStart: null,
    promoEnd: null,
    dateAdded: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  };
}

const PROMOS: PromoWatch[] = [
  promo({ id: "p1", modelNumber: "MR-1200", collection: "Solaris", msrp: 1200 }),
  promo({
    id: "p2",
    modelNumber: "AS-0450",
    collection: "Ashwood",
    brand: "Ashford",
    msrp: null,
    discountPercent: null,
    discountPrice: null,
    sizeOneQty: 0,
    sizeTwoQty: 1,
  }),
];

type Props = Parameters<typeof PromosContent>[0];

const SUMMARY: Props["summary"] = {
  count: 2,
  retailValue: 1200,
  savings: 300,
  promoStart: null,
  promoEnd: null,
};

const FILTERS: Props["filters"] = {
  q: "",
  brands: [],
  collections: [],
  size1Pos: false,
  size2Pos: false,
  dir: "asc",
  page: 1,
};

function renderPromos(overrides: Partial<Props> = {}) {
  const props: Props = {
    promos: PROMOS,
    total: PROMOS.length,
    summary: SUMMARY,
    collections: ["Ashwood", "Solaris"],
    filters: FILTERS,
    isManager: true,
    matchCounts: { p1: 3 },
    ...overrides,
  };
  return render(<PromosContent {...props} />);
}

/** Header row first, then one row per promo on this server page. */
function tableRows() {
  return screen.getAllByRole("row");
}

describe("PromosContent on the DataTable engine", () => {
  beforeEach(() => replace.mockReset());

  it("renders every column in order, with Actions only for managers", () => {
    const { unmount } = renderPromos();
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Model Number",
      "Collection",
      "Brand",
      "MSRP",
      "Disc.",
      "Sale Price",
      "Size 1",
      "Size 2",
      "Clients",
      "Actions",
    ]);
    unmount();

    renderPromos({ isManager: false });
    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers).toHaveLength(9);
    expect(headers).not.toContain("Actions");
  });

  it("renders rows through the shared cell vocabulary", () => {
    renderPromos();
    const cells = within(tableRows()[1]).getAllByRole("cell");

    expect(cells).toHaveLength(10);
    expect(cells[0]).toHaveClass("font-mono", "font-medium");
    expect(cells[0].textContent).toBe("MR-1200");
    expect(within(cells[1]).getByText("Solaris")).toBeInTheDocument();
    expect(cells[2].textContent).toBe("Meridian");
    expect(cells[3]).toHaveClass("text-right", "tabular-nums");
    expect(cells[3].textContent).toBe("$1,200.00");
    expect(cells[4].textContent).toBe("25%");
    expect(cells[5]).toHaveClass("text-green-500");
    expect(cells[5].textContent).toBe("$900.00");
    expect(cells[6].textContent).toBe("2");
    expect(cells[7].textContent).toBe("0");

    // Null money/percent still get the muted dash, not a blank.
    const sparse = within(tableRows()[2]).getAllByRole("cell");
    expect(sparse[3].textContent).toBe("—");
    expect(sparse[4].textContent).toBe("—");
    expect(sparse[5].textContent).toBe("—");
  });

  it("badges a client count and leaves the cell blank at zero", () => {
    renderPromos();
    expect(within(tableRows()[1]).getAllByRole("cell")[8].textContent).toBe("3 clients");
    expect(within(tableRows()[2]).getAllByRole("cell")[8].textContent).toBe("");
  });

  it("reads its stats off the unfiltered summary, not the page", () => {
    renderPromos({
      promos: [PROMOS[0]],
      total: 1,
      summary: { count: 40, retailValue: 48_000, savings: 12_000, promoStart: null, promoEnd: null },
      filters: { ...FILTERS, q: "MR" },
    });
    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.getByText("$48,000")).toBeInTheDocument();
    expect(screen.getByText("$12,000")).toBeInTheDocument();
  });

  it("shows the promo period from the summary's date bounds", () => {
    renderPromos({
      summary: { ...SUMMARY, promoStart: "2026-09-01", promoEnd: "2026-09-14" },
    });
    expect(screen.getByText("Current Promo Period")).toBeInTheDocument();
    expect(screen.getByText("Sep 1 — Sep 14, 2026")).toBeInTheDocument();
  });

  it("reflects the URL sort on the th and navigates on a header click", async () => {
    const user = userEvent.setup();
    const { unmount } = renderPromos();

    // No sort in the URL: the list is in import order and no column claims it.
    expect(screen.getByRole("columnheader", { name: /Model Number/ })).toHaveAttribute("aria-sort", "none");

    // A first click sorts ascending — which is the default direction, so `dir`
    // stays out of the URL.
    await user.click(screen.getByRole("button", { name: /^Model Number/ }));
    expect(replace).toHaveBeenLastCalledWith("/promos?sort=modelNumber", { scroll: false });
    unmount();

    renderPromos({ filters: { ...FILTERS, sort: "modelNumber", dir: "asc" } });
    expect(screen.getByRole("columnheader", { name: /Model Number/ })).toHaveAttribute("aria-sort", "ascending");

    // Same column flips…
    await user.click(screen.getByRole("button", { name: /^Model Number/ }));
    expect(replace).toHaveBeenLastCalledWith("/promos?sort=modelNumber&dir=desc", { scroll: false });

    // …a different column starts ascending again.
    await user.click(screen.getByRole("button", { name: /^MSRP/ }));
    expect(replace).toHaveBeenLastCalledWith("/promos?sort=msrp", { scroll: false });
  });

  it("keeps the whole server page — the engine must not re-slice it", async () => {
    const user = userEvent.setup();
    const page = Array.from({ length: 15 }, (_, i) =>
      promo({ id: `m${i}`, modelNumber: `MR-${String(i).padStart(2, "0")}` }),
    );
    renderPromos({ promos: page, total: 40, matchCounts: {}, summary: { ...SUMMARY, count: 40 } });

    expect(tableRows()).toHaveLength(16);
    expect(screen.getByText("1–15 of 40")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Go to next page" }));
    expect(replace).toHaveBeenLastCalledWith("/promos?page=2", { scroll: false });
  });

  it("renders the page the server served and pages on from there", async () => {
    const user = userEvent.setup();
    const page = Array.from({ length: 15 }, (_, i) => promo({ id: `m${i}` }));
    renderPromos({
      promos: page,
      total: 40,
      matchCounts: {},
      summary: { ...SUMMARY, count: 40 },
      filters: { ...FILTERS, page: 2 },
    });

    expect(screen.getByText("16–30 of 40")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Go to previous page" }));
    expect(replace).toHaveBeenLastCalledWith("/promos", { scroll: false });
  });

  it("debounces a search into one navigation that resets to page 1", async () => {
    const user = userEvent.setup();
    renderPromos({ filters: { ...FILTERS, page: 3 } });

    await user.type(screen.getByPlaceholderText("Search model, collection or brand..."), "MR-1");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/promos?q=MR-1", { scroll: false }));
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("navigates on a filter toggle and clears every filter at once", async () => {
    const user = userEvent.setup();
    renderPromos({ filters: { ...FILTERS, q: "MR", brands: ["Meridian"], size1Pos: true, page: 2 } });

    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.click(await screen.findByRole("checkbox", { name: "Ashford" }));
    expect(replace).toHaveBeenLastCalledWith("/promos?q=MR&brands=Meridian%2CAshford&s1=1", { scroll: false });

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(replace).toHaveBeenLastCalledWith("/promos", { scroll: false });
  });

  it("shows the filtered-empty state instead of the table", () => {
    renderPromos({ promos: [], total: 0, filters: { ...FILTERS, q: "zzz" } });
    expect(screen.getByText("No promos match your search")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows the no-promos-at-all state when the whole list is empty", () => {
    renderPromos({ promos: [], total: 0, summary: { ...SUMMARY, count: 0 } });
    expect(screen.getByText("No active promos")).toBeInTheDocument();
    expect(screen.queryByText("No promos match your search")).not.toBeInTheDocument();
  });

  it("opens the delete confirmation from the manager actions menu", async () => {
    const user = userEvent.setup();
    renderPromos();

    await user.click(within(tableRows()[1]).getByRole("button", { name: "Actions" }));
    await user.click(await screen.findByRole("menuitem", { name: /Delete/ }));
    expect(await screen.findByText("Delete Promo Watch")).toBeInTheDocument();
  });
});
