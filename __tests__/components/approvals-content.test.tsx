import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApprovalsContent } from "@/app/(app)/approvals/approvals-content";

const reviewApprovalRequest = vi.fn();

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/actions", () => ({
  reviewApprovalRequest: (...args: unknown[]) => reviewApprovalRequest(...args),
}));

vi.mock("@/components/topbar", () => ({
  Topbar: ({ children }: { children?: React.ReactNode }) => <div data-testid="topbar">{children}</div>,
}));

type Props = Parameters<typeof ApprovalsContent>[0];
type Request = Props["requests"][number];

function request(overrides: {
  id: string;
  type?: Request["request"]["type"];
  clientName?: string;
  requestorName?: string;
  reason?: string;
  daysOld?: number;
}): Request {
  const {
    id,
    type = "ban",
    clientName = "Ada Byron",
    requestorName = "Marcus Vane",
    reason = "Repeated chargebacks",
    daysOld = 0,
  } = overrides;
  return {
    request: {
      id,
      type,
      clientId: `client-${id}`,
      requestorId: `emp-${id}`,
      reason,
      status: "pending",
      reviewedById: null,
      reviewedAt: null,
      metadata: null,
      createdAt: new Date(Date.now() - daysOld * 86_400_000),
    },
    clientName,
    requestorName,
  };
}

const REQUESTS: Request[] = [
  request({ id: "r1", type: "ban", clientName: "Zoe Chan", reason: "Repeated chargebacks", daysOld: 0 }),
  request({ id: "r2", type: "unsubscribe", clientName: "Ada Byron", requestorName: "Nadia Roth", reason: "Asked to stop emails", daysOld: 3 }),
  request({ id: "r3", type: "delete", clientName: "Milo Frost", reason: "Duplicate record", daysOld: 1 }),
];

function renderApprovals(overrides: Partial<Props> = {}) {
  const props: Props = { requests: REQUESTS, ...overrides };
  return render(<ApprovalsContent {...props} />);
}

/** Header row first, then one row per request on the current page. */
function tableRows() {
  return screen.getAllByRole("row");
}

/** The client column's cell text, top to bottom. */
function clientColumn(): string[] {
  return tableRows()
    .slice(1)
    .map((r) => within(r).getAllByRole("cell")[1].textContent ?? "");
}

describe("ApprovalsContent on the DataTable engine", () => {
  beforeEach(() => reviewApprovalRequest.mockReset());

  it("renders the card rows as a real table with headers", () => {
    renderApprovals();
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Type",
      "Client",
      "Reason",
      "Requested by",
      "Requested",
      "Actions",
    ]);
    // The card rows are gone — no bordered div wrappers left behind.
    expect(document.querySelectorAll(".border.rounded-lg")).toHaveLength(0);
  });

  it("renders rows through the shared cell vocabulary", () => {
    renderApprovals();
    const cells = within(tableRows()[1]).getAllByRole("cell");

    expect(cells).toHaveLength(6);
    expect(within(cells[0]).getByText("Ban")).toBeInTheDocument();
    expect(within(cells[1]).getByRole("link", { name: "Zoe Chan" })).toHaveAttribute("href", "/clients/client-r1");
    expect(cells[2].textContent).toBe("Repeated chargebacks");
    expect(cells[3].textContent).toBe("Marcus Vane");
    expect(cells[4].textContent).toBe("Today");
    expect(cells[4]).toHaveClass("text-muted-foreground");

    // The unsubscribe row is badged differently from the two destructive asks.
    const unsub = within(tableRows()[2]).getAllByRole("cell");
    expect(within(unsub[0]).getByText("Unsubscribe")).toBeInTheDocument();
    expect(unsub[4].textContent).toBe("3d ago");
  });

  it("keeps the StatsCard counts on the whole queue, not the filtered page", async () => {
    const user = userEvent.setup();
    renderApprovals();

    await user.type(screen.getByPlaceholderText(/Search by client/), "Zoe");
    expect(tableRows()).toHaveLength(2);
    // One of each type, still, under an active search.
    expect(screen.getByText("Ban Requests")).toBeInTheDocument();
    expect(screen.getAllByText("1")).toHaveLength(3);
  });

  it("sorts client-side, ascending first and flipping on the second click", async () => {
    const user = userEvent.setup();
    renderApprovals();

    expect(clientColumn()).toEqual(["Zoe Chan", "Ada Byron", "Milo Frost"]);
    expect(screen.getByRole("columnheader", { name: /Client/ })).toHaveAttribute("aria-sort", "none");

    await user.click(screen.getByRole("button", { name: /^Client/ }));
    expect(clientColumn()).toEqual(["Ada Byron", "Milo Frost", "Zoe Chan"]);
    expect(screen.getByRole("columnheader", { name: /Client/ })).toHaveAttribute("aria-sort", "ascending");

    await user.click(screen.getByRole("button", { name: /^Client/ }));
    expect(clientColumn()).toEqual(["Zoe Chan", "Milo Frost", "Ada Byron"]);
    expect(screen.getByRole("columnheader", { name: /Client/ })).toHaveAttribute("aria-sort", "descending");
  });

  it("sorts by age on the timestamp behind the relative label", async () => {
    const user = userEvent.setup();
    renderApprovals();

    await user.click(screen.getByRole("button", { name: /^Requested$/ }));
    expect(
      tableRows().slice(1).map((r) => within(r).getAllByRole("cell")[4].textContent),
    ).toEqual(["3d ago", "1d ago", "Today"]);
  });

  it("searches across client, requester, type and reason", async () => {
    const user = userEvent.setup();
    renderApprovals();
    const box = screen.getByPlaceholderText(/Search by client/);

    await user.type(box, "Nadia");
    expect(clientColumn()).toEqual(["Ada Byron"]);

    await user.clear(box);
    await user.type(box, "duplicate");
    expect(clientColumn()).toEqual(["Milo Frost"]);

    await user.clear(box);
    await user.type(box, "delete");
    expect(clientColumn()).toEqual(["Milo Frost"]);
  });

  it("pages the queue at 20 rows and drops back to page 1 on a search", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 25 }, (_, i) =>
      request({ id: `q${i}`, clientName: `Client ${String(i).padStart(2, "0")}` }),
    );
    renderApprovals({ requests: many });

    expect(tableRows()).toHaveLength(21);
    expect(screen.getByText("1–20 of 25 requests")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Go to next page" }));
    expect(screen.getByText("21–25 of 25 requests")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/Search by client/), "Client 07");
    expect(screen.getByText("1–1 of 1 requests")).toBeInTheDocument();
    expect(clientColumn()).toEqual(["Client 07"]);
  });

  it("shows the filtered-empty state, then the nothing-pending state", () => {
    const { unmount } = renderApprovals({ requests: [REQUESTS[0]] });
    expect(screen.getByRole("table")).toBeInTheDocument();
    unmount();

    renderApprovals({ requests: [] });
    expect(screen.getByText("No pending requests")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    // No search box either: there is nothing to search.
    expect(screen.queryByPlaceholderText(/Search by client/)).not.toBeInTheDocument();
  });

  it("shows the no-match state when the search excludes every request", async () => {
    const user = userEvent.setup();
    renderApprovals();

    await user.type(screen.getByPlaceholderText(/Search by client/), "zzzz");
    expect(screen.getByText("No requests match your search")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("approves from the row action, through the same confirmation and action", async () => {
    const user = userEvent.setup();
    renderApprovals();

    await user.click(within(tableRows()[1]).getByRole("button", { name: /Approve/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Approve Request")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Approve" }));

    expect(reviewApprovalRequest).toHaveBeenCalledWith("r1", true);
  });

  it("rejects from the row action and drops the row from the queue", async () => {
    const user = userEvent.setup();
    reviewApprovalRequest.mockResolvedValue(undefined);
    renderApprovals();

    await user.click(within(tableRows()[2]).getByRole("button", { name: /Reject/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Reject Request")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));

    expect(reviewApprovalRequest).toHaveBeenCalledWith("r2", false);
    expect(clientColumn()).toEqual(["Zoe Chan", "Milo Frost"]);
  });
});
