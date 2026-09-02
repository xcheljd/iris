/**
 * F-5: the follow-up date was serialised with
 * `followUp.toISOString().split("T")[0]` — the *UTC* calendar day — while the
 * value it serialises is a local Date (the picker's local midnight, or
 * `new Date()` plus N days from the quick presets). East of Greenwich that
 * writes the day before. `toDateOnly` in lib/utils exists for exactly this and
 * documents the hazard; every client-form path already uses it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OutreachLogger } from "@/components/outreach-logger";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/actions", () => ({
  logOutreach: vi.fn(),
}));

vi.mock("@/components/date-picker", () => ({
  DatePicker: () => <div data-testid="date-picker" />,
}));

import { logOutreach } from "@/lib/actions";

describe("OutreachLogger follow-up day boundary", () => {
  // 2026-08-30 05:00 in Tokyo — the morning window where the UTC day is still
  // the 29th, so a UTC-serialised "tomorrow" lands a day early.
  const MORNING = new Date("2026-08-29T20:00:00.000Z");
  let savedTz: string | undefined;

  beforeEach(() => {
    savedTz = process.env.TZ;
    process.env.TZ = "Asia/Tokyo";
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(MORNING);
    vi.mocked(logOutreach).mockReset();
    vi.mocked(logOutreach).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = savedTz;
  });

  it("sends the local calendar day for a quick follow-up preset", async () => {
    // Guard the fixture: without the frozen clock and TZ this would pass for
    // the wrong reason.
    expect(new Date().getHours()).toBe(5);
    expect(new Date().toISOString().slice(0, 10)).toBe("2026-08-29");

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<OutreachLogger clientId="client-1" clientName="Ashford Client" />);

    await user.click(screen.getByRole("button", { name: /Log Outreach/ }));
    await user.click(await screen.findByRole("button", { name: "Tomorrow" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    // Local tomorrow is the 31st. The old toISOString() path gave "2026-08-30".
    expect(logOutreach).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "client-1", followUpDate: "2026-08-31" }),
    );
  });

  it("still sends null when no follow-up was picked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<OutreachLogger clientId="client-1" clientName="Ashford Client" />);

    await user.click(screen.getByRole("button", { name: /Log Outreach/ }));
    await user.click(await screen.findByRole("button", { name: "Save" }));

    expect(logOutreach).toHaveBeenCalledWith(expect.objectContaining({ followUpDate: null }));
  });
});
