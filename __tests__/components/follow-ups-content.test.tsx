import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

vi.mock("@/components/date-picker", () => ({
  DatePicker: () => <div data-testid="date-picker" />,
}));

import { markFollowUpComplete } from "@/lib/actions";

type Row = Parameters<typeof FollowUpsContent>[0]["overdue"][number];

/** Synthetic overdue follow-up rows — Meridian-style demo data only. */
function makeRows(count: number): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    log: {
      id: `log-${i}`,
      method: "call",
      date: new Date("2026-01-05T12:00:00.000Z"),
      outcome: "no_answer",
      notes: null,
      followUpDate: new Date("2026-01-10T12:00:00.000Z"),
      completed: false,
    },
    client: {
      id: `client-${i}`,
      firstName: "Ashford",
      lastName: `Client ${i}`,
      phone: null,
      email: null,
      heatScore: 50,
      heatLevel: "warm",
    },
    employee: null,
  }));
}

describe("FollowUpsContent pagination footer", () => {
  beforeEach(() => {
    vi.mocked(markFollowUpComplete).mockReset();
    vi.mocked(markFollowUpComplete).mockResolvedValue(undefined as never);
  });

  it("counts the rows actually shown, not the pre-optimistic-removal props", async () => {
    const user = userEvent.setup();
    // 22 rows over a page size of 20 → two pages, so the footer renders both
    // before and after a completion.
    render(<FollowUpsContent overdue={makeRows(22)} upcoming={[]} />);

    expect(screen.getByText(/1–20 of 22 follow-ups/)).toBeInTheDocument();

    // Complete the first card: optimistic removal drops it from the list.
    await user.click(screen.getAllByRole("button", { name: /Done/ })[0]);
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(markFollowUpComplete).toHaveBeenCalledWith("log-0");
    // Regression (audit B1): footer used `overdue.length` (22) while the rows
    // and totalPages came from the post-removal list.
    expect(await screen.findByText(/1–20 of 21 follow-ups/)).toBeInTheDocument();
  });
});
