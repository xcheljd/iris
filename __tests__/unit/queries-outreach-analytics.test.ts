/**
 * The analytics Outreach tab's reads: method/outcome breakdowns counted in SQL
 * over every log in the selected range.
 *
 * Regression (audit B5): the tab built its distributions client-side from
 * `getRecentOutreach(50)`, so any range older than the latest 50 logs showed
 * "No outreach data" and the "(all time)" count topped out at 50.
 *
 * Fixtures sit in early 2001, far from the seeded logs (which are dated
 * relative to now), so every ranged assertion sees only rows inserted here.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { clients, outreachLogs } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { outreachMethodBreakdown, outreachOutcomeBreakdown } from "@/lib/queries";

// From __tests__/setup.ts — never invented (outreach_logs.employee_id is a FK).
const TEST_MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const TEST_ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23";

const HOUR = 3600;
const DAY = 86_400;
/** 2001-01-01T00:00:00Z, unix seconds. */
const BASE = Date.UTC(2001, 0, 1) / 1000;
/** Last second of January 2001. */
const JAN_END = BASE + 31 * DAY - 1;

const clientId = randomUUID();
const logIds: string[] = [];

function insertLog(method: "call" | "text" | "email" | "in-person", outcome: "no_answer" | "responded" | "purchased" | "voicemail", employeeId: string, at: number) {
  const id = randomUUID();
  db.insert(outreachLogs).values({ id, clientId, method, outcome, employeeId, date: new Date(at * 1000) }).run();
  logIds.push(id);
}

beforeAll(() => {
  db.insert(clients).values({ id: clientId, firstName: "ZZOutreach", employeeId: TEST_MANAGER_ID }).run();
  // 65 logs inside January — more than the old 50-row ceiling.
  for (let i = 0; i < 40; i++) insertLog("call", "no_answer", TEST_MANAGER_ID, BASE + i * HOUR);
  for (let i = 0; i < 25; i++) insertLog("email", "responded", TEST_ASSOCIATE_ID, BASE + 10 * DAY + i * HOUR);
  // Outside January on both sides.
  insertLog("text", "purchased", TEST_MANAGER_ID, BASE - DAY);
  insertLog("in-person", "voicemail", TEST_MANAGER_ID, BASE + 60 * DAY);
});

afterAll(() => {
  db.delete(outreachLogs).where(inArray(outreachLogs.id, logIds)).run();
  db.delete(clients).where(eq(clients.id, clientId)).run();
});

const counts = (rows: { method: string; count: number }[]) =>
  Object.fromEntries(rows.map((r) => [r.method, r.count]));

describe("outreachMethodBreakdown / outreachOutcomeBreakdown", () => {
  it("counts every matching log in SQL, not the latest 50", async () => {
    const range = { from: BASE, to: JAN_END };
    expect(await outreachMethodBreakdown(range)).toEqual([
      { method: "call", label: "Call", count: 40 },
      { method: "text", label: "Text", count: 0 },
      { method: "email", label: "Email", count: 25 },
      { method: "in-person", label: "In-Person", count: 0 },
    ]);
    expect(await outreachOutcomeBreakdown(range)).toEqual([
      { outcome: "no_answer", count: 40 },
      { outcome: "responded", count: 25 },
    ]);
  });

  it("includes both boundary seconds and excludes logs outside the range", async () => {
    // `from` is the first call's exact second; `to` the first email's.
    expect(counts(await outreachMethodBreakdown({ from: BASE, to: BASE + 10 * DAY }))).toEqual({
      call: 40, text: 0, email: 1, "in-person": 0,
    });
    // End of Jan 10 (the convention the pickers send) stops just short of it.
    expect(counts(await outreachMethodBreakdown({ from: BASE, to: BASE + 10 * DAY - 1 }))).toEqual({
      call: 40, text: 0, email: 0, "in-person": 0,
    });
    // Open-ended ranges reach the logs either side of January.
    expect(counts(await outreachMethodBreakdown({ to: BASE - DAY, employeeId: TEST_MANAGER_ID })).text).toBeGreaterThanOrEqual(1);
    expect(counts(await outreachMethodBreakdown({ from: BASE + 60 * DAY, to: BASE + 61 * DAY }))["in-person"]).toBe(1);
  });

  it("scopes an associate to their own logged outreach", async () => {
    const range = { from: BASE - DAY, to: BASE + 61 * DAY };
    expect(counts(await outreachMethodBreakdown({ ...range, employeeId: TEST_ASSOCIATE_ID }))).toEqual({
      call: 0, text: 0, email: 25, "in-person": 0,
    });
    expect(await outreachOutcomeBreakdown({ ...range, employeeId: TEST_ASSOCIATE_ID })).toEqual([
      { outcome: "responded", count: 25 },
    ]);
    expect(counts(await outreachMethodBreakdown({ ...range, employeeId: TEST_MANAGER_ID }))).toEqual({
      call: 40, text: 1, email: 0, "in-person": 1,
    });
  });

  it("returns zeroes and no outcomes for an empty or inverted range", async () => {
    const empty = { from: BASE + 100 * DAY, to: BASE + 101 * DAY };
    expect(counts(await outreachMethodBreakdown(empty))).toEqual({ call: 0, text: 0, email: 0, "in-person": 0 });
    expect(await outreachOutcomeBreakdown(empty)).toEqual([]);
    // from > to matches nothing, as on the clients list — no swap.
    expect(await outreachOutcomeBreakdown({ from: JAN_END, to: BASE })).toEqual([]);
  });
});
