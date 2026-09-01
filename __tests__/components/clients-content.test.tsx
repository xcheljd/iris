import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StrictMode } from "react";
import { render, screen, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClientListContent } from "@/app/(app)/clients/clients-content";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/actions", () => ({ deleteClient: vi.fn() }));

vi.mock("@/components/topbar", () => ({
  Topbar: ({ children }: { children?: React.ReactNode }) => <div data-testid="topbar">{children}</div>,
}));

type Props = Parameters<typeof ClientListContent>[0];
type Row = Props["rows"][number];

/** Synthetic Meridian-style rows. */
function makeRows(count: number): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    client: {
      id: `client-${i}`,
      firstName: "Ashford",
      lastName: `Client ${i}`,
      email: null,
      phone: null,
      heatLevel: "warm" as const,
      heatScore: 50,
      status: "active",
      lastOutreachAt: null,
      tags: [],
    },
    employeeName: null,
  }));
}

const BASE_FILTERS: Props["currentFilters"] = {
  q: "",
  nameQ: "",
  contactQ: "",
  heat: "any",
  owner: "any",
  tags: [],
  tagMode: "any",
  sort: "heat",
  sortDir: "desc",
  page: 1,
};

function renderList(overrides: Partial<Props> = {}, strict = false) {
  const props: Props = {
    rows: makeRows(20),
    total: 100,
    ownerNames: [],
    allTags: [],
    employeeOptions: [],
    currentFilters: BASE_FILTERS,
    currentUserRole: "associate",
    ...overrides,
  };
  return render(<ClientListContent {...props} />, strict ? { wrapper: StrictMode } : undefined);
}

/** The last URL the component navigated to, whichever method it used. */
function lastNavigationUrl(): string | undefined {
  const calls = [...push.mock.calls, ...replace.mock.calls];
  return calls.at(-1)?.[0] as string | undefined;
}

describe("ClientListContent pagination", () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("goes from page 1 to page 2 with the filters preserved", async () => {
    const user = userEvent.setup();
    renderList({
      currentFilters: { ...BASE_FILTERS, q: "ashford", heat: "hot", tags: ["VIP"], page: 1 },
    });

    await user.click(screen.getByRole("button", { name: "Go to next page" }));

    const url = lastNavigationUrl()!;
    const sp = new URLSearchParams(url.split("?")[1]);
    expect(sp.get("page")).toBe("2");
    expect(sp.get("q")).toBe("ashford");
    expect(sp.get("heat")).toBe("hot");
    expect(sp.get("tags")).toBe("VIP");
  });

  it("goes from page 3 back to page 2", async () => {
    const user = userEvent.setup();
    renderList({ currentFilters: { ...BASE_FILTERS, page: 3 } });

    await user.click(screen.getByRole("button", { name: "Go to previous page" }));

    expect(new URLSearchParams(lastNavigationUrl()!.split("?")[1]).get("page")).toBe("2");
  });

  it("pushes page changes so browser back returns to the previous page", async () => {
    const user = userEvent.setup();
    renderList({ currentFilters: { ...BASE_FILTERS, page: 1 } });

    await user.click(screen.getByRole("button", { name: "Go to next page" }));

    expect(push).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });

  it("respects the page param it was given on load", () => {
    renderList({ currentFilters: { ...BASE_FILTERS, page: 4 }, total: 100 });
    expect(screen.getByText("Page 4 of 5")).toBeInTheDocument();
    expect(screen.getByText("61–80 of 100 clients")).toBeInTheDocument();
  });

  // Regression: the search debounce used a "first render" ref to stay quiet on
  // mount. React re-runs effects on every mount in StrictMode (and the page
  // remounts behind the Suspense boundary on each navigation), so the second
  // run sailed past the ref and fired navigate({ page: 1 }) 300ms after the
  // user landed on page 2 — silently bouncing them back to page 1.
  it("does not navigate on mount when the query has not changed", () => {
    vi.useFakeTimers();
    renderList({ currentFilters: { ...BASE_FILTERS, q: "ashford", page: 2 } }, true);

    act(() => { vi.advanceTimersByTime(1000); });

    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  // Regression: a search debounce still in flight when Next was clicked used to
  // fire afterwards with page: 1, undoing the page change.
  it("does not let an in-flight search debounce undo a page change", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderList({ currentFilters: { ...BASE_FILTERS, page: 1 } });

    await user.type(screen.getByPlaceholderText("Search name, email, phone…"), "voss");
    await user.click(screen.getByRole("button", { name: "Go to next page" }));
    act(() => { vi.advanceTimersByTime(1000); });

    const sp = new URLSearchParams(lastNavigationUrl()!.split("?")[1]);
    expect(sp.get("page")).toBe("2");
    expect(sp.get("q")).toBe("voss");
  });
});

// The list renders through the shared DataTable engine; page-scoped selection
// moved from a local Set to the engine's rowSelection map, keyed by client id.
describe("ClientListContent selection", () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    localStorage.clear();
  });

  it("feeds the checked ids to the bulk actions toolbar", async () => {
    const user = userEvent.setup();
    renderList({ rows: makeRows(3) });

    await user.click(within(screen.getAllByRole("row")[1]).getAllByRole("checkbox")[0]);
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Select all clients" }));
    expect(screen.getByText("3 selected")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Select all clients" }));
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
  });

  it("marks the selected row", async () => {
    const user = userEvent.setup();
    renderList({ rows: makeRows(2) });

    await user.click(within(screen.getAllByRole("row")[1]).getAllByRole("checkbox")[0]);
    expect(screen.getAllByRole("row")[1]).toHaveClass("bg-accent/5");
    expect(screen.getAllByRole("row")[2]).toHaveClass("hover:bg-muted/30");
  });
});

describe("ClientListContent table", () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    localStorage.clear();
  });

  it("renders the empty state across the full row", () => {
    renderList({ rows: [], total: 0 });
    expect(screen.getByText("No clients match.")).toBeInTheDocument();
    expect(screen.getAllByRole("cell")[0]).toHaveAttribute("colspan", "8");
  });

  it("reflects the URL sort on the th", () => {
    renderList({ currentFilters: { ...BASE_FILTERS, sort: "heat", sortDir: "desc" } });
    expect(screen.getByRole("columnheader", { name: /Heat/ })).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByRole("columnheader", { name: /Name/ })).toHaveAttribute("aria-sort", "none");
  });

  it("sorts a new column ascending and flips the active one", async () => {
    const user = userEvent.setup();
    renderList({ currentFilters: { ...BASE_FILTERS, sort: "heat", sortDir: "desc" } });

    await user.click(screen.getByRole("button", { name: /^Name/ }));
    let sp = new URLSearchParams(lastNavigationUrl()!.split("?")[1]);
    expect(sp.get("sort")).toBe("name");
    expect(sp.get("sortDir")).toBe("asc");

    await user.click(screen.getByRole("button", { name: /^Heat/ }));
    sp = new URLSearchParams(lastNavigationUrl()!.split("?")[1]);
    expect(sp.get("sort")).toBeNull(); // "heat" is the default, so it is omitted
    expect(sp.get("sortDir")).toBe("asc");
  });
});
