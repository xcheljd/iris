import { vi, describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The real picker is shortcuts + a calendar grid; stand in two buttons per
// section: picked days (both ends local midnight, as react-day-picker reports
// them) and the "Last 30 days" shortcut.
vi.mock("@/components/date-range-picker", () => ({
  DateRangePresets: ({ label, onChange }: { label: string; onChange(r: { preset?: string; from?: Date; to?: Date }): void }) => (
    <>
      <button type="button" onClick={() => onChange({ from: new Date(2026, 8, 1), to: new Date(2026, 8, 22) })}>
        pick {label}
      </button>
      <button type="button" onClick={() => onChange({ preset: "30d" })}>
        last 30 {label}
      </button>
    </>
  ),
}));

import { DatesFilterButton } from "@/components/column-filters";
import { getClientsWithEmployeePaginated } from "@/lib/queries";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

// Regression: the "to" day went out as local midnight and the query bound is
// `lte`, so "Sep 1 → Sep 22" dropped everything that happened on Sep 22.

const createdIds: string[] = [];

afterEach(() => {
  for (const id of createdIds) db.delete(clients).where(eq(clients.id, id)).run();
  createdIds.length = 0;
});

async function pickRange(label: "Last Contact" | "Created", which: "pick" | "last 30" = "pick") {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<DatesFilterButton onChange={onChange} />);
  await user.click(screen.getByRole("button", { name: /Dates/ }));
  await user.click(screen.getByRole("button", { name: `${which} ${label}` }));
  expect(onChange).toHaveBeenCalledTimes(1);
  return onChange.mock.calls[0][0] as {
    lastContactFrom?: number; lastContactTo?: number; createdFrom?: number; createdTo?: number;
    lastContactRange?: string; createdRange?: string;
  };
}

function insertClient(at: Date) {
  const id = randomUUID();
  db.insert(clients).values({
    id,
    firstName: "Range",
    lastName: "Edge",
    source: "Walk-in",
    status: "active",
    onEmailList: false,
    productsOfInterest: [],
    tags: [],
    lastOutreachAt: at,
    createdAt: at,
  }).run();
  createdIds.push(id);
  return id;
}

describe("DatesFilterButton date ranges", () => {
  it("sends the end of the picked 'to' day for last contact", async () => {
    const next = await pickRange("Last Contact");
    expect(next.lastContactFrom).toBe(new Date(2026, 8, 1).getTime() / 1000);
    expect(next.lastContactTo).toBe(new Date(2026, 8, 22, 23, 59, 59).getTime() / 1000);
  });

  it("sends the end of the picked 'to' day for created", async () => {
    const next = await pickRange("Created");
    expect(next.createdTo).toBe(new Date(2026, 8, 22, 23, 59, 59).getTime() / 1000);
  });

  it("includes a client last contacted on the 'to' date", async () => {
    const next = await pickRange("Last Contact");
    const onLastDay = insertClient(new Date(2026, 8, 22, 15, 30));
    const dayAfter = insertClient(new Date(2026, 8, 23, 0, 0, 1));

    const { rows } = await getClientsWithEmployeePaginated(undefined, {
      lastContactFrom: next.lastContactFrom,
      lastContactTo: next.lastContactTo,
      pageSize: 1000,
    });
    const ids = rows.map((r) => r.client.id);
    expect(ids).toContain(onLastDay);
    expect(ids).not.toContain(dayAfter);
  });

  it("includes a client created on the 'to' date", async () => {
    const next = await pickRange("Created");
    const onLastDay = insertClient(new Date(2026, 8, 22, 18, 0));

    const { rows } = await getClientsWithEmployeePaginated(undefined, {
      createdFrom: next.createdFrom,
      createdTo: next.createdTo,
      pageSize: 1000,
    });
    expect(rows.map((r) => r.client.id)).toContain(onLastDay);
  });
});

// Rolling shortcuts: a picked shortcut is stored by id, not by its dates, so a
// saved filter keeps meaning "the last 30 days" whenever it is opened.
describe("DatesFilterButton shortcuts", () => {
  it("stores the shortcut id and clears explicit bounds", async () => {
    const next = await pickRange("Last Contact", "last 30");
    expect(next.lastContactRange).toBe("30d");
    expect(next.lastContactFrom).toBeUndefined();
    expect(next.lastContactTo).toBeUndefined();
  });

  it("resolves the shortcut against today at query time", async () => {
    const today = insertClient(new Date());
    const fortyDaysAgo = insertClient(new Date(Date.now() - 40 * 86_400_000));
    const { rows } = await getClientsWithEmployeePaginated(undefined, { lastContactRange: "30d", pageSize: 1000 });
    const ids = rows.map((r) => r.client.id);
    expect(ids).toContain(today);
    expect(ids).not.toContain(fortyDaysAgo);
  });
});
