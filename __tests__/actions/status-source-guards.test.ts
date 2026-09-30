import { vi, describe, it, expect, beforeEach, afterAll } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { activityEvents, approvalRequests, bannedCustomers, clients, prospects, rvxImportBatches } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { banClient, unsubscribeClient } from "@/lib/actions/clients";
import { bulkBanClients, bulkUnsubscribeClients } from "@/lib/actions/bulk-clients";
import { bulkRejectProspects, bulkUnsubscribeProspects } from "@/lib/actions/bulk-prospects";
import { createApprovalRequest } from "@/lib/actions/approvals";
import { graduateProspectIntoExistingClient } from "@/lib/actions/prospects";

// M3: ban/unsubscribe accepted any source status — re-banning wrote a second
// banned_customers row, and deleted clients or graduated prospects could be
// flipped back into a live-looking status.

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206"; // setup.ts
const mgr: Session = {
  user: { id: MANAGER_ID, name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};

type Status = "active" | "inactive" | "banned" | "unsubscribed" | "deleted";
const clientIds: string[] = [];
const prospectIds: string[] = [];
const batchIds: string[] = [];

function insertClient(status: Status) {
  const id = randomUUID();
  db.insert(clients).values({
    id, firstName: "Guard", lastName: status, status, employeeId: MANAGER_ID,
    deletedAt: status === "deleted" ? new Date() : null,
  }).run();
  clientIds.push(id);
  return id;
}

function insertProspect(status: "active" | "graduated" | "rejected" | "unsubscribed") {
  const batchId = randomUUID();
  db.insert(rvxImportBatches).values({
    id: batchId, reportStartDate: new Date("2025-01-01"), reportEndDate: new Date("2025-12-31"),
    totalRows: 1, importedCount: 1, importedBy: MANAGER_ID,
  }).run();
  batchIds.push(batchId);
  const id = randomUUID();
  db.insert(prospects).values({
    id, rvxCustomerId: `RVX-GUARD-${id.slice(0, 8)}`, rvxStoreId: "100", importBatchId: batchId,
    firstName: "Guard", lastName: status, productsOfInterest: [], status,
  }).run();
  prospectIds.push(id);
  return id;
}

const statusOf = (id: string) => db.select({ s: clients.status }).from(clients).where(eq(clients.id, id)).get()!.s;
const prospectStatusOf = (id: string) => db.select({ s: prospects.status }).from(prospects).where(eq(prospects.id, id)).get()!.s;
const banRows = (id: string) => db.select().from(bannedCustomers).where(eq(bannedCustomers.customerId, id)).all().length;

beforeEach(() => vi.mocked(getServerSession).mockResolvedValue(mgr));

afterAll(() => {
  db.delete(prospects).where(inArray(prospects.id, prospectIds)).run();
  db.delete(rvxImportBatches).where(inArray(rvxImportBatches.id, batchIds)).run();
  db.delete(approvalRequests).where(inArray(approvalRequests.clientId, clientIds)).run();
  db.delete(activityEvents).where(inArray(activityEvents.clientId, clientIds)).run();
  db.delete(bannedCustomers).where(inArray(bannedCustomers.customerId, clientIds)).run();
  db.delete(clients).where(inArray(clients.id, clientIds)).run();
});

describe("single-client status guards", () => {
  it("re-banning a banned client is a no-op, not a second ban row", async () => {
    const id = insertClient("active");
    expect(await banClient(id, "Other", "first")).toBeUndefined();
    expect(await banClient(id, "Other", "again")).toBeUndefined();
    expect(banRows(id)).toBe(1);
  });

  it("bans an unsubscribed client", async () => {
    const id = insertClient("unsubscribed");
    expect(await banClient(id, "Other", "r")).toBeUndefined();
    expect(statusOf(id)).toBe("banned");
  });

  it("refuses to ban a deleted client", async () => {
    const id = insertClient("deleted");
    expect(await banClient(id, "Other", "r")).toEqual({ error: expect.any(String) });
    expect(statusOf(id)).toBe("deleted");
    expect(banRows(id)).toBe(0);
  });

  it.each(["banned", "deleted", "unsubscribed"] as const)("refuses to unsubscribe a %s client", async (status) => {
    const id = insertClient(status);
    expect(await unsubscribeClient(id)).toEqual({ error: expect.any(String) });
    expect(statusOf(id)).toBe(status);
  });
});

describe("bulk client status guards", () => {
  it("bulk ban skips deleted and banned clients", async () => {
    const deleted = insertClient("deleted");
    const active = insertClient("active");
    expect(await bulkBanClients([deleted, active], "Other", "r")).toMatchObject({ ok: 1 });
    expect(statusOf(deleted)).toBe("deleted");
    expect(statusOf(active)).toBe("banned");
    expect(banRows(deleted)).toBe(0);
  });

  it("bulk unsubscribe only moves active and inactive clients", async () => {
    const unsub = insertClient("unsubscribed");
    const inactive = insertClient("inactive");
    expect(await bulkUnsubscribeClients([unsub, inactive])).toMatchObject({ ok: 1 });
    expect(statusOf(inactive)).toBe("unsubscribed");
  });
});

describe("bulk prospect status guards", () => {
  it("bulk reject leaves a graduated prospect graduated", async () => {
    const graduated = insertProspect("graduated");
    const active = insertProspect("active");
    expect(await bulkRejectProspects([graduated, active])).toMatchObject({ ok: 1 });
    expect(prospectStatusOf(graduated)).toBe("graduated");
    expect(prospectStatusOf(active)).toBe("rejected");
  });

  it("bulk unsubscribe leaves a rejected prospect rejected", async () => {
    const rejected = insertProspect("rejected");
    expect(await bulkUnsubscribeProspects([rejected])).toMatchObject({ ok: 0 });
    expect(prospectStatusOf(rejected)).toBe("rejected");
  });
});

describe("approval and graduation guards", () => {
  it.each(["banned", "deleted"] as const)("refuses an approval request for a %s client", async (status) => {
    const id = insertClient(status);
    expect(await createApprovalRequest("ban", id, "reason")).toEqual({ error: expect.any(String) });
  });

  it.each(["banned", "deleted"] as const)("refuses to graduate into a %s client", async (status) => {
    const id = insertClient(status);
    const prospectId = insertProspect("active");
    expect(await graduateProspectIntoExistingClient(prospectId, id, {})).toEqual({ error: expect.any(String) });
    expect(prospectStatusOf(prospectId)).toBe("active");
  });
});
