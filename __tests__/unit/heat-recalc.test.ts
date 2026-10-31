import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/db";
import { clients, meta } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { recalcHeat, recalcAllHeat, recalcAllHeatDaily, LAST_HEAT_RECALC_KEY } from "@/lib/heat-recalc";
import * as actions from "@/lib/actions";
import * as outreachActions from "@/lib/actions/outreach";
import { getMeta } from "@/lib/db/meta";
import { MS_PER_DAY } from "@/lib/constants";

const TEST_ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23";

let clientId: string;

function stored() {
  return db.select({ heatScore: clients.heatScore, heatLevel: clients.heatLevel }).from(clients).where(eq(clients.id, clientId)).get();
}

// Bought 80 days before "day 1": purchase (30) + recent purchase (25) +
// birthday (10) = 65. Eleven days later the purchase is past the 90-day
// window and the stored score must drop to 40 without any write to the client.
const DAY1 = new Date("2026-03-01T12:00:00");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(DAY1);
  clientId = randomUUID();
  db.insert(clients).values({
    id: clientId,
    firstName: "Decay",
    lastName: "Check",
    employeeId: TEST_ASSOCIATE_ID,
    birthday: "1980-01-01",
    lastPurchaseAt: new Date(DAY1.getTime() - 80 * MS_PER_DAY),
    heatScore: 0,
    heatLevel: "cold",
  }).run();
  db.delete(meta).where(eq(meta.key, LAST_HEAT_RECALC_KEY)).run();
});

afterEach(() => {
  vi.useRealTimers();
  db.delete(clients).where(eq(clients.id, clientId)).run();
  db.delete(meta).where(eq(meta.key, LAST_HEAT_RECALC_KEY)).run();
});

describe("recalcHeat", () => {
  it("rescores one client", async () => {
    await recalcHeat(clientId);
    expect(stored()).toEqual({ heatScore: 65, heatLevel: "warm" });
  });

  // Regression: it was exported from the "use server" lib/actions/outreach.ts
  // (and so the lib/actions barrel), making it a server action any caller could
  // invoke with any client id and no auth check.
  it("is not exposed as a server action", () => {
    expect("recalcHeat" in actions).toBe(false);
    expect("recalcHeat" in outreachActions).toBe(false);
  });
});

describe("recalcAllHeat", () => {
  it("rescores every non-deleted client", () => {
    recalcAllHeat();
    expect(stored()).toEqual({ heatScore: 65, heatLevel: "warm" });
  });

  it("leaves soft-deleted clients alone", () => {
    db.update(clients).set({ status: "deleted" }).where(eq(clients.id, clientId)).run();
    recalcAllHeat();
    expect(stored()).toEqual({ heatScore: 0, heatLevel: "cold" });
  });
});

describe("recalcAllHeatDaily", () => {
  it("recomputes at most once per calendar day", () => {
    expect(recalcAllHeatDaily()).toBe(true);
    expect(stored()?.heatScore).toBe(65);
    expect(getMeta(LAST_HEAT_RECALC_KEY)).toBe("2026-03-01");

    // Same day, later: the gate holds, so a manual reset is not overwritten.
    db.update(clients).set({ heatScore: 0 }).where(eq(clients.id, clientId)).run();
    vi.setSystemTime(new Date("2026-03-01T23:00:00"));
    expect(recalcAllHeatDaily()).toBe(false);
    expect(stored()?.heatScore).toBe(0);

    // Next run on a later day decays the recent-purchase bonus.
    vi.setSystemTime(new Date("2026-03-12T09:00:00"));
    expect(recalcAllHeatDaily()).toBe(true);
    expect(stored()).toEqual({ heatScore: 40, heatLevel: "warm" });
    expect(getMeta(LAST_HEAT_RECALC_KEY)).toBe("2026-03-12");
  });
});
