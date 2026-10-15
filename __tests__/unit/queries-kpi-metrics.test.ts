/**
 * getKpiMetrics: client-based conversion, follow-up completion, and the
 * previous-period comparison behind the Analytics trend badges.
 *
 * Fixtures sit in 2001 (far from seeded logs dated relative to now) and on
 * clients owned by a throwaway employee, scoped by employeeId, so every
 * assertion sees only rows inserted here.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { clients, employees, outreachLogs } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getKpiMetrics } from "@/lib/queries";

const OWNER = randomUUID();
const TEST_MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const DAY = 86_400;
/** 2001-02-01T00:00:00Z: the window is February, January is the previous period. */
const FEB = Date.UTC(2001, 1, 1) / 1000;
const FEB_END = FEB + 28 * DAY - 1;

const clientIds: string[] = [];
const logIds: string[] = [];

function client(status: "active" | "banned" = "active") {
  const id = randomUUID();
  db.insert(clients).values({ id, firstName: "ZZKpi", employeeId: OWNER, status }).run();
  clientIds.push(id);
  return id;
}
function log(clientId: string, at: number, outcome: "no_answer" | "purchased" = "no_answer", followUpAt?: number, completed = false) {
  const id = randomUUID();
  db.insert(outreachLogs).values({
    id, clientId, method: "call", outcome, employeeId: TEST_MANAGER_ID, date: new Date(at * 1000),
    followUpDate: followUpAt ? new Date(followUpAt * 1000) : null, completed,
  }).run();
  logIds.push(id);
}

beforeAll(() => {
  // A throwaway owner, so no seeded client is in scope.
  db.insert(employees).values({
    id: OWNER, name: "ZZ Kpi", firstName: "ZZ", lastName: "Kpi", username: `zz-kpi-${OWNER.slice(0, 8)}`,
    passwordHash: "test-hash", role: "associate", active: true, createdAt: new Date(),
  }).run();
  const a = client(), b = client(), c = client(), banned = client("banned");
  // February: a contacted 3 times and bought once; b contacted once; c bought.
  log(a, FEB + 1 * DAY);
  log(a, FEB + 2 * DAY);
  log(a, FEB + 3 * DAY, "purchased");
  log(b, FEB + 4 * DAY);
  log(c, FEB + 5 * DAY, "purchased");
  // Follow-ups due in February: 2 done, 1 open (overdue now); banned excluded.
  log(a, FEB - 90 * DAY, "no_answer", FEB + 6 * DAY, true);
  log(b, FEB - 90 * DAY, "no_answer", FEB + 7 * DAY, true);
  log(c, FEB - 90 * DAY, "no_answer", FEB + 8 * DAY, false);
  log(banned, FEB - 90 * DAY, "no_answer", FEB + 9 * DAY, false);
  // January (previous period, same length): 2 clients contacted, none bought.
  log(a, FEB - 10 * DAY);
  log(b, FEB - 9 * DAY);
});

afterAll(() => {
  db.delete(outreachLogs).where(inArray(outreachLogs.id, logIds)).run();
  db.delete(clients).where(inArray(clients.id, clientIds)).run();
  db.delete(employees).where(eq(employees.id, OWNER)).run();
});

describe("getKpiMetrics", () => {
  it("counts conversion by clients, not attempts", async () => {
    const k = await getKpiMetrics(OWNER, { from: FEB, to: FEB_END });
    expect(k.outreach).toBe(5);
    expect(k.contacted).toBe(3);
    expect(k.bought).toBe(2); // purchases / attempts would say 2 of 5
  });

  it("counts follow-ups due in the window, skipping banned clients", async () => {
    const k = await getKpiMetrics(OWNER, { from: FEB, to: FEB_END });
    expect(k.followUpsDue).toBe(3);
    expect(k.followUpsDone).toBe(2);
  });

  it("counts overdue right now regardless of the window", async () => {
    const k = await getKpiMetrics(OWNER, { from: FEB + 20 * DAY, to: FEB_END });
    expect(k.overdueNow).toBe(1);
  });

  it("returns the same-length previous window for trends", async () => {
    const k = await getKpiMetrics(OWNER, { from: FEB, to: FEB_END });
    expect(k.prev).not.toBeNull();
    expect(k.prev!.contacted).toBe(2);
    expect(k.prev!.bought).toBe(0);
  });

  it("has no previous period without both bounds", async () => {
    expect((await getKpiMetrics(OWNER, {})).prev).toBeNull();
    expect((await getKpiMetrics(OWNER, { from: FEB })).prev).toBeNull();
  });
});
