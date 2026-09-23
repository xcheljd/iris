import { vi, describe, it, expect, afterEach } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { mergeClients, purgeClient } from "@/lib/actions";
import { db } from "@/lib/db";
import { clients, activityEvents, prospects, rvxImportBatches } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

// Regression: prospects.graduated_to_client_id references clients(id) with no
// ON DELETE action and foreign_keys = ON, so deleting a client a prospect had
// graduated into — the merge loser, or a purged client — failed with
// "FOREIGN KEY constraint failed". Seeded graduated clients could be neither
// merged nor purged.

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";

const managerSession: Session = {
  user: { id: MANAGER_ID, name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};

const createdClientIds: string[] = [];
const createdBatchIds: string[] = [];

function createClient(firstName: string, dateAdded: Date) {
  const id = randomUUID();
  db.insert(clients).values({
    id,
    firstName,
    lastName: "Graduate",
    source: "Walk-in",
    status: "active",
    onEmailList: false,
    dateAdded,
    productsOfInterest: [],
    tags: [],
  }).run();
  createdClientIds.push(id);
  return id;
}

/** A prospect that graduated into `clientId`, the way graduateProspect leaves it. */
function createGraduatedProspect(clientId: string) {
  const batchId = randomUUID();
  db.insert(rvxImportBatches).values({
    id: batchId,
    reportStartDate: new Date("2025-01-01"),
    reportEndDate: new Date("2025-12-31"),
    totalRows: 1,
    importedCount: 1,
    importedBy: MANAGER_ID,
  }).run();
  createdBatchIds.push(batchId);

  const prospectId = randomUUID();
  db.insert(prospects).values({
    id: prospectId,
    rvxCustomerId: `RVX-LINK-${prospectId.slice(0, 8)}`,
    rvxStoreId: "100",
    importBatchId: batchId,
    firstName: "Linked",
    lastName: "Prospect",
    productsOfInterest: [],
    status: "graduated",
    graduatedToClientId: clientId,
  }).run();
  return prospectId;
}

afterEach(() => {
  for (const batchId of createdBatchIds) {
    db.delete(prospects).where(eq(prospects.importBatchId, batchId)).run();
    db.delete(rvxImportBatches).where(eq(rvxImportBatches.id, batchId)).run();
  }
  createdBatchIds.length = 0;
  for (const id of createdClientIds) {
    db.delete(activityEvents).where(eq(activityEvents.clientId, id)).run();
    db.delete(clients).where(eq(clients.id, id)).run();
  }
  createdClientIds.length = 0;
});

describe("graduated-prospect links on client removal", () => {
  it("merging away a graduated client re-points the prospect to the winner", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    const winnerId = createClient("Older", new Date("2019-01-01"));
    const loserId = createClient("Newer", new Date("2023-01-01"));
    const prospectId = createGraduatedProspect(loserId);

    const result = await mergeClients(winnerId, loserId, {}, null);

    expect(result).toEqual({ winnerId });
    expect(db.select().from(clients).where(eq(clients.id, loserId)).get()).toBeUndefined();
    const prospect = db.select().from(prospects).where(eq(prospects.id, prospectId)).get();
    expect(prospect!.graduatedToClientId).toBe(winnerId);
  });

  it("purging a graduated client succeeds and clears the prospect's link", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    const clientId = createClient("Purged", new Date("2020-01-01"));
    const prospectId = createGraduatedProspect(clientId);

    expect(await purgeClient(clientId)).toBeUndefined();

    expect(db.select().from(clients).where(eq(clients.id, clientId)).get()).toBeUndefined();
    const prospect = db.select().from(prospects).where(eq(prospects.id, prospectId)).get();
    expect(prospect).toBeDefined();
    expect(prospect!.graduatedToClientId).toBeNull();
  });
});
