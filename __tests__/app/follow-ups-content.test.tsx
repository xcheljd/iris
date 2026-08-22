import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FollowUpsContent } from "@/app/(app)/follow-ups/follow-ups-content";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/actions", () => ({
  markFollowUpComplete: vi.fn(),
  rescheduleFollowUp: vi.fn(),
}));

vi.mock("@/components/topbar", () => ({
  Topbar: () => <div data-testid="topbar" />,
}));

import { toast } from "sonner";
import { markFollowUpComplete } from "@/lib/actions";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeRow(id: string, followUpDate: Date) {
  return {
    log: {
      id,
      method: "call",
      date: new Date("2026-01-01"),
      outcome: "responded",
      notes: "Left a voicemail",
      followUpDate,
      completed: false,
    },
    client: {
      id: `client-${id}`,
      firstName: "Jane",
      lastName: "Doe",
      phone: "(555) 010-0001",
      email: "jane@example.test",
      heatScore: 80,
      heatLevel: "hot",
    },
    employee: { firstName: "Marcus", lastName: null },
  };
}

const overdueRow = makeRow("log-1", new Date("2026-01-05"));

async function clickConfirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Done" }));
  await user.click(screen.getByRole("button", { name: "Confirm" }));
}

describe("FollowUpsContent optimistic complete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("vanishes the card instantly on Confirm, before the action settles, and still calls the action", async () => {
    const user = userEvent.setup();
    const d = deferred<{ error: string } | undefined>();
    vi.mocked(markFollowUpComplete).mockReturnValue(d.promise);

    render(<FollowUpsContent overdue={[overdueRow]} upcoming={[]} />);

    // Card visible before acting.
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();

    await clickConfirm(user);

    // Pre-await assertion: card already gone from the DOM.
    expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument();
    expect(markFollowUpComplete).toHaveBeenCalledWith("log-1");

    d.resolve(undefined);
    await d.promise.catch(() => {});
    expect(toast.success).toHaveBeenCalledWith("Follow-up marked complete");
    // Still gone after settle (override held until revalidated props land).
    expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument();
  });

  it("rolls back — the card returns when the action rejects", async () => {
    const user = userEvent.setup();
    const d = deferred<{ error: string } | undefined>();
    vi.mocked(markFollowUpComplete).mockReturnValue(d.promise);

    render(<FollowUpsContent overdue={[overdueRow]} upcoming={[]} />);

    await clickConfirm(user);
    expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument();

    await act(async () => {
      d.reject(new Error("Failed to complete follow-up"));
      await d.promise.catch(() => {});
    });

    // Rolled back: card visible again.
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalled();
  });
});
