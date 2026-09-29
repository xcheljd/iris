/**
 * The analytics Outreach tab's reads: method/outcome breakdowns counted in SQL
 * over every log in the selected range, and the log list paged in SQL.
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
import { listOutreachLogs, outreachMethodBreakdown, outreachOutcomeBreakdown, OUTREACH_LOG_SORT_KEYS } from "@/lib/queries";

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

describe("listOutreachLogs", () => {
  const jan = { from: BASE, to: JAN_END };

  it("pages the whole range in SQL, newest first, with a correct total", async () => {
    const p1 = await listOutreachLogs({ ...jan, pageSize: 20 });
    const p4 = await listOutreachLogs({ ...jan, pageSize: 20, page: 4 });
    expect(p1.total).toBe(65);
    expect(p1.page).toBe(1);
    expect(p1.rows).toHaveLength(20);
    expect(p4.rows).toHaveLength(5);

    const ids = new Set<string>();
    for (let page = 1; page <= 4; page++) {
      for (const r of (await listOutreachLogs({ ...jan, pageSize: 20, page })).rows) ids.add(r.log.id);
    }
    // Every row exactly once across the pages — no 50-row ceiling, no repeats.
    expect(ids.size).toBe(65);

    const p2 = await listOutreachLogs({ ...jan, pageSize: 20, page: 2 });
    expect(p2.rows.map((r) => r.log.id)).not.toEqual(p1.rows.map((r) => r.log.id));
    const dates = p1.rows.map((r) => r.log.date.getTime());
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
    expect(p1.rows[0].log.method).toBe("email");
    expect(p1.rows[0].client?.firstName).toBe("ZZOutreach");
  });

  it("clamps a page past the end to the last real page", async () => {
    const res = await listOutreachLogs({ ...jan, pageSize: 20, page: 99 });
    expect(res.page).toBe(4);
    expect(res.rows).toHaveLength(5);
  });

  it("applies the same scope and range as the breakdowns", async () => {
    const mine = await listOutreachLogs({ ...jan, employeeId: TEST_ASSOCIATE_ID, pageSize: 100 });
    expect(mine.total).toBe(25);
    expect(mine.rows.every((r) => r.log.method === "email")).toBe(true);
    const empty = await listOutreachLogs({ from: JAN_END, to: BASE });
    expect(empty).toEqual({ rows: [], total: 0, page: 1 });
  });

  it("sorts on every whitelisted key", async () => {
    expect(OUTREACH_LOG_SORT_KEYS).toEqual(["date", "method", "outcome"]);
    const byMethod = await listOutreachLogs({ ...jan, sort: "method", sortDir: "asc", pageSize: 100 });
    expect(byMethod.rows[0].log.method).toBe("call");
    expect(byMethod.rows.at(-1)?.log.method).toBe("email");
    const byOutcome = await listOutreachLogs({ ...jan, sort: "outcome", sortDir: "desc", pageSize: 100 });
    expect(byOutcome.rows[0].log.outcome).toBe("responded");
    const oldest = await listOutreachLogs({ ...jan, sort: "date", sortDir: "asc", pageSize: 1 });
    expect(oldest.rows[0].log.date.getTime()).toBe(BASE * 1000);
  });
});
