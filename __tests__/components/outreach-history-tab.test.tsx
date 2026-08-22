import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OutreachHistoryTab } from "@/components/outreach-history-tab";
import type { FullClient } from "@/components/client-provider";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/actions", () => ({
  markFollowUpComplete: vi.fn(),
  rescheduleFollowUp: vi.fn(),
}));

vi.mock("@/components/outreach-logger", () => ({
  OutreachLogger: () => <div data-testid="outreach-logger" />,
}));

vi.mock("@/components/date-picker", () => ({
  DatePicker: () => <div data-testid="date-picker" />,
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

function makeClient(overrides: Partial<FullClient> = {}): FullClient {
  return {
    id: "client-1",
    firstName: "Jane",
    lastName: "Doe",
    dateAdded: new Date("2026-01-01").toISOString(),
    productsOfInterest: [],
    onEmailList: false,
    status: "active",
    source: "Walk-in",
    tags: [],
    heatScore: 80,
    heatLevel: "hot",
    createdAt: new Date("2026-01-01").toISOString(),
    updatedAt: new Date("2026-01-01").toISOString(),
    outreach: [],
    timeline: [],
    matches: [],
    allTags: [],
    followUps: [],
    ...overrides,
  };
}

const openFollowUp = {
  id: "log-1",
  clientId: "client-1",
  method: "call" as const,
  date: new Date("2026-01-01"),
  outcome: "responded" as const,
  purchasedModel: null,
  notes: "Left a voicemail",
  employeeId: null,
  followUpDate: new Date("2020-01-05"), // far past → Overdue
  templateId: null,
  completed: false,
};

describe("OutreachHistoryTab optimistic follow-up completion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("flips the badge to Completed instantly on click, before the action settles", async () => {
    const user = userEvent.setup();
    const d = deferred<{ error: string } | undefined>();
    vi.mocked(markFollowUpComplete).mockReturnValue(d.promise);

    render(<OutreachHistoryTab client={makeClient({ outreach: [openFollowUp] })} />);

    // Incomplete state visible before acting.
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.queryByText("Completed")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /complete/i }));

    // Pre-await assertion: badge already flipped.
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.queryByText("Overdue")).not.toBeInTheDocument();
    expect(markFollowUpComplete).toHaveBeenCalledWith("log-1");

    d.resolve(undefined);
    await d.promise.catch(() => {});
    expect(toast.success).toHaveBeenCalledWith("Follow-up marked complete");
    // Still completed after settle (override held until revalidated props land).
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("reverts the badge when the action rejects", async () => {
    const user = userEvent.setup();
    const d = deferred<{ error: string } | undefined>();
    vi.mocked(markFollowUpComplete).mockReturnValue(d.promise);

    render(<OutreachHistoryTab client={makeClient({ outreach: [openFollowUp] })} />);

    await user.click(screen.getByRole("button", { name: /complete/i }));
    expect(screen.getByText("Completed")).toBeInTheDocument();

    await act(async () => {
      d.reject(new Error("Failed to mark complete"));
      await d.promise.catch(() => {});
    });

    // Rolled back to the server state.
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.queryByText("Completed")).not.toBeInTheDocument();
    expect(toast.error).toHaveBeenCalled();
  });
});
