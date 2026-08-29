/**
 * Month-occasion query + the "Anniversaries This Month" built-in list.
 *
 * Fixtures are inserted here (never the shared setup.ts client) and owned by
 * the associate from setup.ts, so the employeeId scoping assertions hold
 * regardless of file ordering.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getClientOccasionsCurrentMonth, getAllSmartListCounts } from "@/lib/queries";
import { formatOccasionDate } from "@/lib/utils";

const ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23";
const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";

const thisMonth = String(new Date().getMonth() + 1).padStart(2, "0");
const otherMonth = String(((new Date().getMonth() + 6) % 12) + 1).padStart(2, "0");
const inMonth = (day: string) => `1985-${thisMonth}-${day}`;

// Older form submits JSON-serialised a Date, so some rows store a full ISO
// timestamp instead of the canonical YYYY-MM-DD.
const inMonthIso = (day: string) => `${inMonth(day)}T07:00:00.000Z`;

const BIRTHDAY_ID = randomUUID();
const ANNIVERSARY_ID = randomUUID();
const BOTH_ID = randomUUID();
const NEITHER_ID = randomUUID();
const OTHER_OWNER_ID = randomUUID();
const INACTIVE_ID = randomUUID();
const ISO_ID = randomUUID();
const createdIds: string[] = [BIRTHDAY_ID, ANNIVERSARY_ID, BOTH_ID, NEITHER_ID, OTHER_OWNER_ID, INACTIVE_ID, ISO_ID];

beforeAll(() => {
  const base = { employeeId: ASSOCIATE_ID, status: "active" as const, dateAdded: new Date(), createdAt: new Date() };
  db.insert(clients).values([
    { ...base, id: BIRTHDAY_ID, firstName: "Bea", lastName: "Voss", birthday: inMonth("22") },
    { ...base, id: ANNIVERSARY_ID, firstName: "Ansel", lastName: "Ashford", anniversary: inMonth("09") },
    { ...base, id: BOTH_ID, firstName: "Bo", lastName: "Kinetic", birthday: inMonth("15"), anniversary: inMonth("02") },
    { ...base, id: NEITHER_ID, firstName: "Nell", lastName: "Chamberlain", birthday: `1985-${otherMonth}-11` },
    { ...base, id: OTHER_OWNER_ID, firstName: "Otto", lastName: "Meridian", employeeId: MANAGER_ID, anniversary: inMonth("28") },
    // Inactive ≠ banned/deleted: occasion radar deliberately includes lapsed clients.
    { ...base, id: INACTIVE_ID, firstName: "Ivan", lastName: "Lapsed", status: "inactive" as const, birthday: inMonth("04") },
    { ...base, id: ISO_ID, firstName: "Iso", lastName: "Chamberlain", anniversary: inMonthIso("18") },
  ]).run();
});

afterAll(() => {
  db.delete(clients).where(inArray(clients.id, createdIds)).run();
});

describe("getClientOccasionsCurrentMonth", () => {
  it("returns birthdays and anniversaries in the current month, tagged and dated", async () => {
    const rows = await getClientOccasionsCurrentMonth(ASSOCIATE_ID);
    const mine = rows.filter((r) => createdIds.includes(r.id));

    expect(mine.map((r) => [r.id, r.occasion, r.occasionDate])).toEqual([
      [BOTH_ID, "anniversary", inMonth("02")],
      [INACTIVE_ID, "birthday", inMonth("04")],
      [ANNIVERSARY_ID, "anniversary", inMonth("09")],
      [BOTH_ID, "birthday", inMonth("15")],
      [ISO_ID, "anniversary", inMonthIso("18")],
      [BIRTHDAY_ID, "birthday", inMonth("22")],
    ]);
  });

  // Regression: a row stored as a full ISO timestamp still buckets by month
  // and sorts by day, and the dashboard renders it as a plain calendar day
  // instead of leaking "…T07:00:00.000Z".
  it("handles a row stored as a full ISO timestamp", async () => {
    const rows = await getClientOccasionsCurrentMonth(ASSOCIATE_ID);
    const iso = rows.find((r) => r.id === ISO_ID);

    expect(iso).toBeDefined();
    expect(formatOccasionDate(iso!.occasionDate)).toBe(formatOccasionDate(inMonth("18")));
    expect(formatOccasionDate(iso!.occasionDate)).not.toContain("T07:00");
  });

  it("includes inactive clients but never banned/deleted (matches the smart-list base filter)", async () => {
    const rows = await getClientOccasionsCurrentMonth(ASSOCIATE_ID);

    // Inactive lapsed client with a birthday this month IS on the radar.
    expect(rows.some((r) => r.id === INACTIVE_ID)).toBe(true);
    // No banned/deleted client can ever appear — the same exclusion the
    // smart-list builtins apply as their base filter.
    expect(rows.every((r) => !["banned", "deleted"].includes(r.status ?? ""))).toBe(true);
  });

  it("excludes a client whose only date falls in another month", async () => {
    const rows = await getClientOccasionsCurrentMonth(ASSOCIATE_ID);
    expect(rows.some((r) => r.id === NEITHER_ID)).toBe(false);
  });

  it("scopes to the associate, and drops the filter for a manager", async () => {
    const scoped = await getClientOccasionsCurrentMonth(ASSOCIATE_ID);
    expect(scoped.some((r) => r.id === OTHER_OWNER_ID)).toBe(false);

    const unscoped = await getClientOccasionsCurrentMonth();
    expect(unscoped.some((r) => r.id === OTHER_OWNER_ID)).toBe(true);
  });
});

describe("anniversaries_month built-in smart list", () => {
  it("counts exactly the clients with an anniversary in the current month", async () => {
    const { builtIn } = await getAllSmartListCounts([], ASSOCIATE_ID);

    // Hand-computed from the same rows the count query sees.
    const expected = db
      .select({ anniversary: clients.anniversary, status: clients.status })
      .from(clients)
      .where(eq(clients.employeeId, ASSOCIATE_ID))
      .all()
      .filter(
        (c) =>
          !["banned", "deleted"].includes(c.status) &&
          (c.anniversary ?? "").slice(5, 7) === thisMonth,
      ).length;

    expect(builtIn.anniversaries_month).toBe(expected);
    // The two fixtures above are in it.
    expect(builtIn.anniversaries_month).toBeGreaterThanOrEqual(2);
  });
});
