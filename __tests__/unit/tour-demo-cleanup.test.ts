import { describe, it, expect, afterAll } from "vitest";
import { db, sqlite } from "@/lib/db";
import {
  clients, activityEvents, outreachLogs, promoWatches, promoMatches, approvalRequests,
  bannedCustomers, unsubscribeList, rvxImportBatches, prospects,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { purgeLegacyTourDemoClient } from "@/lib/db/tour-demo-cleanup";
import { TOUR_DEMO_CLIENT_ID } from "@/lib/tour-demo-client";

const ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23";
const DEMO_EMAIL = "alex.tourguide@example.com";

// Legacy DBs still hold the row ensureTourDemoClient (removed in f3388ae)
// persisted, plus whatever was done to it while it showed up in real lists.
const promoId = randomUUID();
const batchId = randomUUID();
const prospectId = randomUUID();

function seedLegacyDemoClient() {
  db.insert(clients).values({
    id: TOUR_DEMO_CLIENT_ID, firstName: "Alex", lastName: "Tourguide", email: DEMO_EMAIL,
    employeeId: ASSOCIATE_ID, onEmailList: true, status: "active",
  }).run();
  db.insert(activityEvents).values({
    id: randomUUID(), clientId: TOUR_DEMO_CLIENT_ID, eventType: "status_changed", description: "demo", employeeId: ASSOCIATE_ID,
  }).run();
  db.insert(outreachLogs).values({
    id: randomUUID(), clientId: TOUR_DEMO_CLIENT_ID, method: "email", outcome: "responded", employeeId: ASSOCIATE_ID,
  }).run();
  db.insert(promoWatches).values({ id: promoId, modelNumber: "TOURDEMO-01", collection: "TOURDEMO" }).run();
  db.insert(promoMatches).values({ id: randomUUID(), clientId: TOUR_DEMO_CLIENT_ID, promoId, matchType: "model" }).run();
  db.insert(approvalRequests).values({
    id: randomUUID(), type: "unsubscribe", clientId: TOUR_DEMO_CLIENT_ID, requestorId: ASSOCIATE_ID, reason: "demo",
  }).run();
  db.insert(bannedCustomers).values({ id: randomUUID(), customerId: TOUR_DEMO_CLIENT_ID, firstName: "Alex", email: DEMO_EMAIL }).run();
  db.insert(unsubscribeList).values({ id: randomUUID(), email: DEMO_EMAIL }).run();
  db.insert(rvxImportBatches).values({
    id: batchId, reportStartDate: new Date("2026-01-01"), reportEndDate: new Date("2026-01-31"),
    totalRows: 1, importedCount: 1, importedBy: ASSOCIATE_ID,
  }).run();
  db.insert(prospects).values({
    id: prospectId, rvxCustomerId: "RVX-TOURDEMO", rvxStoreId: "STORE-01", importBatchId: batchId,
    firstName: "Merged", status: "graduated", graduatedToClientId: TOUR_DEMO_CLIENT_ID,
  }).run();
}

function ftsRows(): number {
  return (sqlite.prepare("SELECT count(*) AS n FROM clients_fts WHERE client_id = ?").get(TOUR_DEMO_CLIENT_ID) as { n: number }).n;
}

afterAll(() => {
  try {
    db.delete(prospects).where(eq(prospects.id, prospectId)).run();
    db.delete(rvxImportBatches).where(eq(rvxImportBatches.id, batchId)).run();
    db.delete(promoWatches).where(eq(promoWatches.id, promoId)).run();
  } catch { /* best effort */ }
});

describe("purgeLegacyTourDemoClient", () => {
  it("deletes the demo client and every related row in one pass", () => {
    seedLegacyDemoClient();
    expect(ftsRows()).toBe(1);

    const result = purgeLegacyTourDemoClient(sqlite);

    expect(result).toEqual({
      clients: 1, activityEvents: 1, outreachLogs: 1, promoMatches: 1, approvalRequests: 1,
      bannedCustomers: 1, unsubscribeList: 1, prospectsUnlinked: 1,
    });
    expect(db.select().from(clients).where(eq(clients.id, TOUR_DEMO_CLIENT_ID)).all()).toHaveLength(0);
    expect(db.select().from(activityEvents).where(eq(activityEvents.clientId, TOUR_DEMO_CLIENT_ID)).all()).toHaveLength(0);
    expect(db.select().from(outreachLogs).where(eq(outreachLogs.clientId, TOUR_DEMO_CLIENT_ID)).all()).toHaveLength(0);
    expect(db.select().from(promoMatches).where(eq(promoMatches.clientId, TOUR_DEMO_CLIENT_ID)).all()).toHaveLength(0);
    expect(db.select().from(approvalRequests).where(eq(approvalRequests.clientId, TOUR_DEMO_CLIENT_ID)).all()).toHaveLength(0);
    expect(db.select().from(bannedCustomers).where(eq(bannedCustomers.customerId, TOUR_DEMO_CLIENT_ID)).all()).toHaveLength(0);
    expect(db.select().from(unsubscribeList).where(eq(unsubscribeList.email, DEMO_EMAIL)).all()).toHaveLength(0);
    expect(ftsRows()).toBe(0);
    // The prospect is real imported data: unlinked, not deleted.
    expect(db.select().from(prospects).where(eq(prospects.id, prospectId)).get()?.graduatedToClientId).toBeNull();
  });

  it("is a no-op on a DB without the demo client", () => {
    const before = db.select().from(clients).all().length;

    expect(purgeLegacyTourDemoClient(sqlite)).toEqual({
      clients: 0, activityEvents: 0, outreachLogs: 0, promoMatches: 0, approvalRequests: 0,
      bannedCustomers: 0, unsubscribeList: 0, prospectsUnlinked: 0,
    });
    expect(db.select().from(clients).all()).toHaveLength(before);
  });

  it("leaves the demo address's suppression row alone when the demo client is already gone", () => {
    const id = randomUUID();
    db.insert(unsubscribeList).values({ id, email: DEMO_EMAIL }).run();
    try {
      expect(purgeLegacyTourDemoClient(sqlite).unsubscribeList).toBe(0);
      expect(db.select().from(unsubscribeList).where(eq(unsubscribeList.id, id)).get()).toBeDefined();
    } finally {
      db.delete(unsubscribeList).where(eq(unsubscribeList.id, id)).run();
    }
  });
});
