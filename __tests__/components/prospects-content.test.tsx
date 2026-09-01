import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProspectsContent } from "@/app/(app)/prospects/prospects-content";
import type { ProspectListRow } from "@/lib/queries";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/components/topbar", () => ({
  Topbar: ({ children }: { children?: React.ReactNode }) => <div data-testid="topbar">{children}</div>,
}));

vi.mock("@/components/prospect-actions-menu", () => ({
  ProspectActionsMenu: ({ prospect }: { prospect: { id: string } }) => (
    <button type="button" aria-label={`Actions for ${prospect.id}`} />
  ),
}));

vi.mock("@/components/prospects-bulk-actions", () => ({
  ProspectsBulkToolbar: ({ selectedIds }: { selectedIds: string[] }) => (
    <div data-testid="bulk-toolbar">{selectedIds.join(",")}</div>
  ),
}));

type Props = Parameters<typeof ProspectsContent>[0];

function prospect(overrides: Partial<ProspectListRow> & { id: string }): ProspectListRow {
  return {
    rvxCustomerId: "RVX-1",
    rvxStoreId: "001",
    rvxSpend: 900,
    firstName: "Ada",
    lastName: "Byron",
    phone: "5550001111",
    email: "ada@example.com",
    status: "active",
    productsOfInterest: [],
    notes: null,
    birthday: null,
    anniversary: null,
    importBatchId: "batch-1",
    createdAt: new Date(Date.now() - 86_400_000),
    ...overrides,
  };
}

const ROWS: ProspectListRow[] = [
  prospect({ id: "p1", firstName: "Zoe", lastName: "Chan", phone: "5550001111", email: "zoe@example.com", rvxSpend: 1200 }),
  prospect({ id: "p2", firstName: "Ada", lastName: "Byron", phone: null, email: null, rvxSpend: null }),
];

const COUNTS: Props["counts"] = { active: 2, graduated: 4, unsubscribed: 0, rejected: 1 };

const FILTERS: Props["filters"] = { status: "active", q: "", dir: "asc", page: 1 };

function renderProspects(overrides: Partial<Props> = {}) {
  const props: Props = {
    rows: ROWS,
    total: ROWS.length,
    counts: COUNTS,
    filters: FILTERS,
    isManager: true,
    ...overrides,
  };
  return render(<ProspectsContent {...props} />);
}

/** Header row first, then one row per prospect on this server page. */
function tableRows() {
  return screen.getAllByRole("row");
}

describe("ProspectsContent on the DataTable engine", () => {
  beforeEach(() => replace.mockReset());

  it("renders the Active tab with selection and row actions", () => {
    renderProspects();
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Select all",
      "Name",
      "Phone",
      "Email",
      "RVX Spend",
      "Added",
      "Actions",
    ]);
    expect(within(tableRows()[1]).getByRole("button", { name: "Actions for p1" })).toBeInTheDocument();
  });

  it("drops selection and row actions on a terminal tab", () => {
    renderProspects({ filters: { ...FILTERS, status: "graduated" } });
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Name",
      "Phone",
      "Email",
      "RVX Spend",
      "Added",
    ]);
    expect(screen.getByText("Graduated Prospects")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("renders rows through the shared cell vocabulary", () => {
    renderProspects();
    const cells = within(tableRows()[1]).getAllByRole("cell");

    expect(cells).toHaveLength(7);
    expect(within(cells[1]).getByRole("link", { name: "Zoe Chan" })).toHaveAttribute("href", "/prospects/p1");
    expect(cells[2].textContent).toBe("5550001111");
    expect(cells[3].textContent).toBe("zoe@example.com");
    expect(cells[4]).toHaveClass("text-right", "tabular-nums");
    expect(cells[4].textContent).toBe("$1,200.00");
    expect(cells[5].textContent).toBe("1d ago");

    // Missing phone/email/spend all get the muted dash, never a blank.
    const sparse = within(tableRows()[2]).getAllByRole("cell");
    expect(sparse[2].textContent).toBe("—");
    expect(sparse[3].textContent).toBe("—");
    expect(sparse[4].textContent).toBe("—");
  });

  it("reflects the URL sort on the th and navigates on a header click", async () => {
    const user = userEvent.setup();
    const { unmount } = renderProspects();

    // No sort in the URL: the list is newest-first and no column claims it.
    expect(screen.getByRole("columnheader", { name: /Name/ })).toHaveAttribute("aria-sort", "none");

    // A first click sorts ascending — the default direction, so `dir` stays
    // out of the URL.
    await user.click(screen.getByRole("button", { name: /^Name/ }));
    expect(replace).toHaveBeenLastCalledWith("/prospects?sort=name", { scroll: false });
    unmount();

    renderProspects({ filters: { ...FILTERS, sort: "name", dir: "asc" } });
    expect(screen.getByRole("columnheader", { name: /Name/ })).toHaveAttribute("aria-sort", "ascending");

    // Same column flips…
    await user.click(screen.getByRole("button", { name: /^Name/ }));
    expect(replace).toHaveBeenLastCalledWith("/prospects?sort=name&dir=desc", { scroll: false });

    // …a different column starts ascending again.
    await user.click(screen.getByRole("button", { name: /^RVX Spend/ }));
    expect(replace).toHaveBeenLastCalledWith("/prospects?sort=spend", { scroll: false });
  });

  it("keeps the whole server page — the engine must not re-slice it", async () => {
    const user = userEvent.setup();
    const page = Array.from({ length: 20 }, (_, i) => prospect({ id: `m${i}` }));
    renderProspects({ rows: page, total: 44, counts: { ...COUNTS, active: 44 } });

    expect(tableRows()).toHaveLength(21);
    expect(screen.getByText("1–20 of 44 prospects")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Go to next page" }));
    expect(replace).toHaveBeenLastCalledWith("/prospects?page=2", { scroll: false });
  });

  it("renders the page the server served and pages on from there", async () => {
    const user = userEvent.setup();
    const page = Array.from({ length: 20 }, (_, i) => prospect({ id: `m${i}` }));
    renderProspects({ rows: page, total: 44, filters: { ...FILTERS, page: 2 } });

    expect(screen.getByText("21–40 of 44 prospects")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Go to previous page" }));
    expect(replace).toHaveBeenLastCalledWith("/prospects", { scroll: false });
  });

  it("debounces a search into one navigation that resets to page 1", async () => {
    const user = userEvent.setup();
    renderProspects({ filters: { ...FILTERS, page: 3 } });

    await user.type(screen.getByPlaceholderText("Search by name, phone, or email..."), "Zoe");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/prospects?q=Zoe", { scroll: false }));
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("navigates on a tab change, back to page 1", async () => {
    const user = userEvent.setup();
    renderProspects({ filters: { ...FILTERS, page: 4 } });

    await user.click(screen.getByRole("tab", { name: /Rejected/ }));
    expect(replace).toHaveBeenLastCalledWith("/prospects?status=rejected", { scroll: false });
  });

  it("badges every tab with its whole-table count", () => {
    renderProspects();
    expect(within(screen.getByRole("tab", { name: /Active/ })).getByText("2")).toBeInTheDocument();
    expect(within(screen.getByRole("tab", { name: /Graduated/ })).getByText("4")).toBeInTheDocument();
    expect(within(screen.getByRole("tab", { name: /Rejected/ })).getByText("1")).toBeInTheDocument();
    // Zero is no badge, not a "0".
    expect(within(screen.getByRole("tab", { name: /Unsubscribed/ })).queryByText("0")).toBeNull();
  });

  it("feeds the bulk toolbar the ids it selected", async () => {
    const user = userEvent.setup();
    renderProspects();

    expect(screen.queryByTestId("bulk-toolbar")).not.toBeInTheDocument();
    await user.click(within(tableRows()[1]).getByRole("checkbox"));
    expect(screen.getByTestId("bulk-toolbar").textContent).toBe("p1");

    await user.click(screen.getByRole("checkbox", { name: "Select all prospects" }));
    expect(screen.getByTestId("bulk-toolbar").textContent).toBe("p1,p2");
  });

  it("shows the searched-empty state, then the tab's own empty copy", () => {
    const { unmount } = renderProspects({ rows: [], total: 0, filters: { ...FILTERS, q: "zzz" } });
    expect(screen.getByText("No matching prospects")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    unmount();

    renderProspects({ rows: [], total: 0, filters: { ...FILTERS, status: "rejected" } });
    expect(screen.getByText("No rejected prospects")).toBeInTheDocument();
  });
});
