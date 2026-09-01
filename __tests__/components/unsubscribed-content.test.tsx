import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnsubscribedContent } from "@/app/(app)/unsubscribed/unsubscribed-content";
import { TooltipProvider } from "@/components/ui/tooltip";

const resubscribeClient = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/actions", () => ({
  addUnsubscribeEmail: vi.fn(),
  resubscribeClient: (...args: unknown[]) => resubscribeClient(...args),
}));

vi.mock("@/components/topbar", () => ({
  Topbar: ({ children }: { children?: React.ReactNode }) => <div data-testid="topbar">{children}</div>,
}));

type Props = Parameters<typeof UnsubscribedContent>[0];
type Row = Props["list"][number];

/** Noon UTC so the rendered calendar day is the same in every test TZ. */
function at(iso: string) {
  return new Date(`${iso}T12:00:00Z`);
}

function row(overrides: Partial<Row> & { id: string }): Row {
  const { id, ...rest } = overrides;
  return {
    unsub: { id, email: `${id}@example.com`, unsubscribedAt: at("2026-08-20") },
    clientId: `client-${id}`,
    firstName: "Ada",
    lastName: "Byron",
    customerId: "1001",
    ...rest,
  };
}

const LIST: Row[] = [
  row({ id: "u1", unsub: { id: "u1", email: "zoe@example.com", unsubscribedAt: at("2026-08-20") }, firstName: "Zoe", lastName: "Chan", customerId: "1003" }),
  row({ id: "u2", unsub: { id: "u2", email: "ada@example.com", unsubscribedAt: at("2026-01-05") }, firstName: "Ada", lastName: "Byron", customerId: "1001" }),
  // No client match: no name, no customer id, and only a Remove action.
  row({ id: "u3", unsub: { id: "u3", email: "orphan@example.com", unsubscribedAt: at("2026-06-10") }, clientId: null, firstName: null, lastName: null, customerId: null }),
];

/** The app supplies the tooltip provider from `components/providers.tsx`. */
function renderUnsubscribed(overrides: Partial<Props> = {}) {
  const props: Props = { list: LIST, isManager: true, ...overrides };
  return render(
    <TooltipProvider>
      <UnsubscribedContent {...props} />
    </TooltipProvider>,
  );
}

/** Header row first, then one row per record on the current page. */
function tableRows() {
  return screen.getAllByRole("row");
}

/** The name column's cell text, top to bottom. */
function nameColumn(): string[] {
  return tableRows()
    .slice(1)
    .map((r) => within(r).getAllByRole("cell")[1].textContent ?? "");
}

describe("UnsubscribedContent on the DataTable engine", () => {
  beforeEach(() => resubscribeClient.mockReset());

  it("renders a real header row, with the checkbox column only for managers", () => {
    const { unmount } = renderUnsubscribed();
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Select all",
      "Name",
      "Customer ID",
      "Email",
      "Unsubscribed",
      "Actions",
    ]);
    unmount();

    renderUnsubscribed({ isManager: false });
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Name",
      "Customer ID",
      "Email",
      "Unsubscribed",
      "Actions",
    ]);
  });

  it("renders rows through the shared cell vocabulary", () => {
    renderUnsubscribed();
    const cells = within(tableRows()[1]).getAllByRole("cell");

    expect(cells).toHaveLength(6);
    expect(within(cells[1]).getByRole("link", { name: "Zoe Chan" })).toHaveAttribute("href", "/clients/client-u1");
    expect(cells[2]).toHaveClass("font-mono");
    expect(cells[2].textContent).toBe("#1003");
    expect(cells[3].textContent).toBe("zoe@example.com");
    expect(cells[4]).toHaveClass("text-right");
    expect(cells[4].textContent).toBe("Aug 20, 2026");

    // The unmatched record: muted placeholder name, dashed customer id.
    const orphan = within(tableRows()[3]).getAllByRole("cell");
    expect(orphan[1].textContent).toBe("No client match");
    expect(orphan[2].textContent).toBe("—");
  });

  it("keeps the server's order until a header is clicked, then sorts client-side", async () => {
    const user = userEvent.setup();
    renderUnsubscribed();

    expect(nameColumn()).toEqual(["Zoe Chan", "Ada Byron", "No client match"]);
    expect(screen.getByRole("columnheader", { name: /Name/ })).toHaveAttribute("aria-sort", "none");

    // Ascending first — the unmatched row has no name, so it sorts to the top.
    await user.click(screen.getByRole("button", { name: /^Name/ }));
    expect(nameColumn()).toEqual(["No client match", "Ada Byron", "Zoe Chan"]);
    expect(screen.getByRole("columnheader", { name: /Name/ })).toHaveAttribute("aria-sort", "ascending");

    await user.click(screen.getByRole("button", { name: /^Name/ }));
    expect(nameColumn()).toEqual(["Zoe Chan", "Ada Byron", "No client match"]);
    expect(screen.getByRole("columnheader", { name: /Name/ })).toHaveAttribute("aria-sort", "descending");
  });

  it("sorts the date column on the timestamp, not its rendered string", async () => {
    const user = userEvent.setup();
    renderUnsubscribed();

    await user.click(screen.getByRole("button", { name: /^Unsubscribed/ }));
    expect(
      tableRows().slice(1).map((r) => within(r).getAllByRole("cell")[4].textContent),
    ).toEqual(["Jan 5, 2026", "Jun 10, 2026", "Aug 20, 2026"]);
  });

  it("pages the list client-side at 20 rows", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 25 }, (_, i) =>
      row({ id: `p${i}`, unsub: { id: `p${i}`, email: `p${i}@example.com`, unsubscribedAt: at("2026-08-20") } }),
    );
    renderUnsubscribed({ list: many });

    expect(tableRows()).toHaveLength(21);
    expect(screen.getByText("1–20 of 25 records")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Go to next page" }));
    expect(tableRows()).toHaveLength(6);
    expect(screen.getByText("21–25 of 25 records")).toBeInTheDocument();
  });

  it("filters by search and drops back to the first page", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 25 }, (_, i) =>
      row({ id: `p${i}`, unsub: { id: `p${i}`, email: `p${i}@example.com`, unsubscribedAt: at("2026-08-20") } }),
    );
    renderUnsubscribed({ list: many });

    await user.click(screen.getByRole("button", { name: "Go to next page" }));
    expect(screen.getByText("21–25 of 25 records")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Search by email, name, or customer ID..."), "p21@");
    expect(screen.getByText("1–1 of 1 records")).toBeInTheDocument();
    expect(tableRows()).toHaveLength(2);
  });

  it("filters by the date range and shows the filtered-empty state", async () => {
    const user = userEvent.setup();
    renderUnsubscribed({
      list: [row({ id: "old", unsub: { id: "old", email: "old@example.com", unsubscribedAt: at("2020-01-01") } })],
    });

    // Keyboard, not a click: jsdom has no pointer-capture API for Radix's
    // pointer-down path, and the listbox opens on ArrowDown all the same.
    screen.getByRole("combobox").focus();
    await user.keyboard("{ArrowDown}");
    await screen.findByRole("option", { name: "Last 7 Days" });
    await user.keyboard("{ArrowDown}{Enter}");

    expect(screen.getByText("No matching records")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows the nothing-at-all empty state for an empty list", () => {
    renderUnsubscribed({ list: [] });
    expect(screen.getByText("No unsubscribed emails")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("resubscribes a client from the row actions menu", async () => {
    const user = userEvent.setup();
    renderUnsubscribed();

    await user.click(within(tableRows()[1]).getByRole("button", { name: "Actions" }));
    await user.click(await screen.findByRole("menuitem", { name: /Resubscribe/ }));
    expect(resubscribeClient).toHaveBeenCalledWith("client-u1");
  });

  it("opens the remove confirmation from the row actions menu", async () => {
    const user = userEvent.setup();
    renderUnsubscribed();

    await user.click(within(tableRows()[1]).getByRole("button", { name: "Actions" }));
    await user.click(await screen.findByRole("menuitem", { name: /Remove/ }));
    expect(await screen.findByText("Remove from Unsubscribe List")).toBeInTheDocument();
  });

  it("bulk-removes every selected record from the header checkbox", async () => {
    const user = userEvent.setup();
    renderUnsubscribed();

    await user.click(screen.getByRole("checkbox", { name: "Select all records" }));
    await user.click(screen.getByRole("button", { name: "Remove (3)" }));
    await user.click(await screen.findByRole("button", { name: "Remove All" }));

    // The unmatched record has no client to resubscribe; the other two do.
    expect(resubscribeClient).toHaveBeenCalledTimes(2);
    expect(resubscribeClient.mock.calls.map(([id]) => id).sort()).toEqual(["client-u1", "client-u2"]);
  });
});
