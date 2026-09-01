import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PromosContent } from "@/app/(app)/promos/promos-content";
import type { PromoWatch } from "@/lib/db/schema";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
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

function renderPromos(overrides: Partial<Props> = {}) {
  return render(
    <PromosContent promos={PROMOS} isManager matchCounts={{ p1: 3 }} {...overrides} />,
  );
}

/** Header row first, then one row per visible promo. */
function tableRows() {
  return screen.getAllByRole("row");
}

describe("PromosContent on the DataTable engine", () => {
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

  it("sorts client-side on a header click and flips on the second", async () => {
    const user = userEvent.setup();
    renderPromos();

    const modelHeader = screen.getByRole("columnheader", { name: /Model Number/ });
    expect(modelHeader).toHaveAttribute("aria-sort", "none");
    expect(within(tableRows()[1]).getAllByRole("cell")[0].textContent).toBe("MR-1200");

    // Ascending first — no server round-trip, the engine reorders the rows.
    await user.click(screen.getByRole("button", { name: /^Model Number/ }));
    expect(modelHeader).toHaveAttribute("aria-sort", "ascending");
    expect(within(tableRows()[1]).getAllByRole("cell")[0].textContent).toBe("AS-0450");

    await user.click(screen.getByRole("button", { name: /^Model Number/ }));
    expect(modelHeader).toHaveAttribute("aria-sort", "descending");
    expect(within(tableRows()[1]).getAllByRole("cell")[0].textContent).toBe("MR-1200");
  });

  it("sorts nulls first on a numeric column", async () => {
    const user = userEvent.setup();
    renderPromos();

    await user.click(screen.getByRole("button", { name: /^MSRP/ }));
    expect(within(tableRows()[1]).getAllByRole("cell")[0].textContent).toBe("AS-0450");
    expect(within(tableRows()[1]).getAllByRole("cell")[3].textContent).toBe("—");
  });

  it("paginates client-side and keeps the page across a re-sort", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 20 }, (_, i) =>
      promo({ id: `m${i}`, modelNumber: `MR-${String(i).padStart(2, "0")}` }),
    );
    renderPromos({ promos: many, matchCounts: {} });

    // 20 rows, 15 to a page.
    expect(tableRows()).toHaveLength(16);
    expect(screen.getByText("1–15 of 20")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Go to next page" }));
    expect(tableRows()).toHaveLength(6);
    expect(screen.getByText("16–20 of 20")).toBeInTheDocument();

    // Re-sorting must not bounce the reader back to page 1.
    await user.click(screen.getByRole("button", { name: /^Model Number/ }));
    expect(screen.getByText("16–20 of 20")).toBeInTheDocument();
  });

  it("resets to page 1 when a search narrows the list", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 20 }, (_, i) =>
      promo({ id: `m${i}`, modelNumber: `MR-${String(i).padStart(2, "0")}` }),
    );
    renderPromos({ promos: many, matchCounts: {} });

    await user.click(screen.getByRole("button", { name: "Go to next page" }));
    expect(screen.getByText("16–20 of 20")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Search model or collection..."), "MR-1");
    expect(screen.getByText("1–10 of 10")).toBeInTheDocument();
  });

  it("shows the filtered-empty state instead of the table", async () => {
    const user = userEvent.setup();
    renderPromos();

    await user.type(screen.getByPlaceholderText("Search model or collection..."), "zzz");
    expect(screen.getByText("No promos match your search")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("opens the delete confirmation from the manager actions menu", async () => {
    const user = userEvent.setup();
    renderPromos();

    await user.click(within(tableRows()[1]).getByRole("button", { name: "Actions" }));
    await user.click(await screen.findByRole("menuitem", { name: /Delete/ }));
    expect(await screen.findByText("Delete Promo Watch")).toBeInTheDocument();
  });
});
