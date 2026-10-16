import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The real calendar is a day grid; stand in buttons that pick / clear a day,
// and record the props the picker passes down.
const calendarProps: Array<Record<string, unknown>> = [];
vi.mock("@/components/ui/calendar", () => ({
  Calendar: (props: { onSelect(d?: Date): void }) => {
    calendarProps.push(props);
    return (
      <>
        <button type="button" onClick={() => props.onSelect(new Date(2026, 8, 15))}>pick day</button>
        <button type="button" onClick={() => props.onSelect(undefined)}>clear day</button>
      </>
    );
  },
}));

import { DatePicker } from "@/components/date-picker";
import { startOfDay, startOfMonth } from "date-fns";

beforeEach(() => {
  calendarProps.length = 0;
});

async function openPicker(onSelectAction = vi.fn(), disabledDays?: { before: Date }) {
  const user = userEvent.setup();
  render(<DatePicker onSelectAction={onSelectAction} disabledDays={disabledDays} />);
  const trigger = screen.getByRole("button", { name: "Pick a date" });
  await user.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  return { user, trigger };
}

describe("DatePicker", () => {
  it("closes after a day is picked and reports the day", async () => {
    const onSelectAction = vi.fn();
    const { user, trigger } = await openPicker(onSelectAction);

    await user.click(screen.getByRole("button", { name: "pick day" }));

    expect(onSelectAction).toHaveBeenCalledWith(new Date(2026, 8, 15));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("closes when the picked day is cleared", async () => {
    const onSelectAction = vi.fn();
    const { user, trigger } = await openPicker(onSelectAction);

    await user.click(screen.getByRole("button", { name: "clear day" }));

    expect(onSelectAction).toHaveBeenCalledWith(undefined);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("passes disabledDays through to the calendar", async () => {
    const start = new Date(2026, 8, 1);
    await openPicker(vi.fn(), { before: start });

    expect(calendarProps.at(-1)?.disabled).toEqual({ before: start });
  });

  describe("noPastDays (follow-up dates)", () => {
    async function openFollowUpPicker(date?: Date) {
      const user = userEvent.setup();
      render(<DatePicker date={date} onSelectAction={vi.fn()} noPastDays />);
      await user.click(screen.getByRole("button"));
      return calendarProps.at(-1)!;
    }

    it("blocks days before today, starts the year list this month, and leaves today pickable", async () => {
      const today = startOfDay(new Date());
      const props = await openFollowUpPicker();

      expect(props.disabled).toEqual({ before: today });
      expect(props.startMonth).toEqual(startOfMonth(today));
      expect(props.defaultMonth).toEqual(today);
    });

    it("opens an overdue follow-up on today, not its old month", async () => {
      const today = startOfDay(new Date());
      const props = await openFollowUpPicker(new Date(2020, 0, 15));

      expect(props.defaultMonth).toEqual(today);
    });

    it("keeps a future date's month", async () => {
      const future = new Date(2099, 4, 10);
      const props = await openFollowUpPicker(future);

      expect(props.defaultMonth).toEqual(future);
    });

    it("combines with disabledDays", async () => {
      const user = userEvent.setup();
      const end = new Date(2099, 0, 1);
      render(<DatePicker onSelectAction={vi.fn()} noPastDays disabledDays={{ after: end }} />);
      await user.click(screen.getByRole("button"));

      expect(calendarProps.at(-1)!.disabled).toEqual([{ after: end }, { before: startOfDay(new Date()) }]);
    });
  });

  it("without noPastDays keeps the 100-year range and no past-day block", async () => {
    await openPicker();
    expect(calendarProps.at(-1)?.disabled).toBeUndefined();
    expect((calendarProps.at(-1)?.startMonth as Date).getFullYear()).toBe(new Date().getFullYear() - 100);
  });
});
