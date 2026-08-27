import { vi, describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({}));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import {
  bulkAddTags,
  bulkRemoveTags,
  bulkReassignOwner,
  bulkSetEmailList,
  bulkDeleteClients,
  bulkBanClients,
  bulkUnsubscribeClients,
} from "@/lib/actions/bulk-clients";
import { db } from "@/lib/db";
import { clients, activityEvents, bannedCustomers, unsubscribeList, clientTags, employees } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23";
const JORDAN_ID = "db8f1f0b-3e96-4b04-a3d6-24d6a3b5e6de";

const managerSession: Session = {
  user: { id: MANAGER_ID, name: "Test Manager", role: "manager" as const, firstName: "Test", lastName: "Manager" },
  expires: "2099-12-31T23:59:59.000Z",
};
const associateSession: Session = {
  user: { id: ASSOCIATE_ID, name: "Test Associate", role: "associate" as const, firstName: "Test", lastName: "Associate" },
  expires: "2099-12-31T23:59:59.000Z",
};

// Helper: create temporary clients for testing, returns IDs for cleanup
function createTestClients(count: number): string[] {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = randomUUID();
    ids.push(id);
    db.insert(clients).values({
      id,
      firstName: "BulkTest",
      lastName: `Client${i}`,
      phone: `555-010${i}`,
      email: `bulktest${i}@test.com`,
      employeeId: ASSOCIATE_ID,
      source: "Walk-in",
      productsOfInterest: [],
      tags: [],
      onEmailList: true,
      status: "active",
    }).run();
  }
  return ids;
}

function cleanupClients(ids: string[]) {
  for (const id of ids) {
    try {
      db.delete(activityEvents).where(eq(activityEvents.clientId, id)).run();
      db.delete(bannedCustomers).where(eq(bannedCustomers.customerId, id)).run();
      db.delete(clients).where(eq(clients.id, id)).run();
    } catch { /* best effort */ }
  }
}

function cleanupUnsubscribe(emails: string[]) {
  for (const email of emails) {
    try {
      db.delete(unsubscribeList).where(eq(unsubscribeList.email, email)).run();
    } catch { /* best effort */ }
  }
}

function cleanupTags(tagNames: string[]) {
  for (const name of tagNames) {
    try {
      db.delete(clientTags).where(eq(clientTags.name, name)).run();
    } catch { /* best effort */ }
  }
}

describe("Bulk Client Operations", () => {
  let testClientIds: string[] = [];

  beforeAll(() => {
    // JORDAN_ID is a hardcoded fixture employee the reassign tests target.
    // The seed generates random employee UUIDs, so this row must be created
    // here or clients.employee_id fails the FK on bulkReassignOwner.
    db.insert(employees).values({
      id: JORDAN_ID,
      name: "Test Jordan",
      firstName: "Test",
      lastName: "Jordan",
      username: "test-jordan",
      passwordHash: "test-hash",
      role: "associate",
      active: true,
      createdAt: new Date(),
    }).run();
  });

  beforeEach(() => {
    vi.mocked(getServerSession).mockClear();
    testClientIds = createTestClients(3);
  });

  afterEach(() => {
    cleanupClients(testClientIds);
    testClientIds = [];
  });

  // ---------------------------------------------------------------
  // bulkAddTags / bulkRemoveTags
  // ---------------------------------------------------------------
  describe("bulkAddTags", () => {
    it("adds tags to multiple clients and creates activity events", async () => {
      vi.mocked(getServerSession).mockResolvedValue(associateSession);
      const tag = "bulk-test-add";
      const result = await bulkAddTags(testClientIds, [tag]);
      expect(result.ok).toBe(3);

      for (const id of testClientIds) {
        const client = db.select().from(clients).where(eq(clients.id, id)).get();
        expect(client?.tags).toContain(tag);
      }

      const events = db.select().from(activityEvents)
        .where(inArray(activityEvents.clientId, testClientIds)).all()
        .filter((e) => e.eventType === "tag_added");
      expect(events.length).toBe(3);

      cleanupTags([tag]);
    });

    it("skips clients that already have the tag", async () => {
      vi.mocked(getServerSession).mockResolvedValue(associateSession);
      const tag = "bulk-test-skip";

      // Add to first client manually first
      const first = db.select().from(clients).where(eq(clients.id, testClientIds[0])).get();
      db.update(clients).set({ tags: [...(first?.tags || []), tag] }).where(eq(clients.id, testClientIds[0])).run();

      const result = await bulkAddTags(testClientIds, [tag]);
      expect(result.ok).toBe(2); // only 2 didn't have it

      cleanupTags([tag]);
    });

    it("returns ok:0 for empty tags array", async () => {
      vi.mocked(getServerSession).mockResolvedValue(associateSession);
      const result = await bulkAddTags(testClientIds, []);
      expect(result.ok).toBe(0);
    });

    it("returns ok:0 for empty clientIds array", async () => {
      vi.mocked(getServerSession).mockResolvedValue(associateSession);
      const result = await bulkAddTags([], ["some-tag"]);
      expect(result.ok).toBe(0);
    });
  });

  describe("bulkRemoveTags", () => {
    it("removes tags from multiple clients", async () => {
      vi.mocked(getServerSession).mockResolvedValue(associateSession);
      const tag = "bulk-test-remove";

      // Add first, then remove
      await bulkAddTags(testClientIds, [tag]);
      const result = await bulkRemoveTags(testClientIds, [tag]);
      expect(result.ok).toBe(3);

      for (const id of testClientIds) {
        const client = db.select().from(clients).where(eq(clients.id, id)).get();
        expect(client?.tags).not.toContain(tag);
      }

      cleanupTags([tag]);
    });
  });

  // ---------------------------------------------------------------
  // bulkReassignOwner
  // ---------------------------------------------------------------
  describe("bulkReassignOwner", () => {
    it("reassigns clients to a new employee (manager)", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);
      const result = await bulkReassignOwner(testClientIds, JORDAN_ID);
      expect(result.ok).toBe(3);

      for (const id of testClientIds) {
        const client = db.select().from(clients).where(eq(clients.id, id)).get();
        expect(client?.employeeId).toBe(JORDAN_ID);
      }

      const events = db.select().from(activityEvents)
        .where(inArray(activityEvents.clientId, testClientIds)).all()
        .filter((e) => e.eventType === "transferred");
      expect(events.length).toBe(3);
    });

    it("throws when associate calls it", async () => {
      vi.mocked(getServerSession).mockResolvedValue(associateSession);
      await expect(bulkReassignOwner(testClientIds, JORDAN_ID)).rejects.toThrow("Manager access required");
    });

    it("returns ok:0 for empty array", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);
      const result = await bulkReassignOwner([], JORDAN_ID);
      expect(result.ok).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  // bulkSetEmailList
  // ---------------------------------------------------------------
  describe("bulkSetEmailList", () => {
    it("removes clients from email list (any auth)", async () => {
      vi.mocked(getServerSession).mockResolvedValue(associateSession);
      const result = await bulkSetEmailList(testClientIds, false);
      expect(result.ok).toBe(3);

      for (const id of testClientIds) {
        const client = db.select().from(clients).where(eq(clients.id, id)).get();
        expect(client?.onEmailList).toBeFalsy();
      }

      const events = db.select().from(activityEvents)
        .where(inArray(activityEvents.clientId, testClientIds)).all()
        .filter((e) => e.eventType === "edited");
      expect(events.length).toBe(3);
    });
  });

  // ---------------------------------------------------------------
  // bulkDeleteClients
  // ---------------------------------------------------------------
  describe("bulkDeleteClients", () => {
    it("soft-deletes multiple clients (manager)", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);
      const result = await bulkDeleteClients(testClientIds);
      expect(result.ok).toBe(3);

      for (const id of testClientIds) {
        const client = db.select().from(clients).where(eq(clients.id, id)).get();
        expect(client?.status).toBe("deleted");
        expect(client?.deletedBy).toBe(MANAGER_ID);
      }

      const events = db.select().from(activityEvents)
        .where(inArray(activityEvents.clientId, testClientIds)).all()
        .filter((e) => e.eventType === "status_changed");
      expect(events.length).toBe(3);
    });

    it("skips already-deleted clients", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);

      // Delete first client manually
      db.update(clients).set({ status: "deleted", deletedAt: new Date(), deletedBy: MANAGER_ID })
        .where(eq(clients.id, testClientIds[0])).run();

      const result = await bulkDeleteClients(testClientIds);
      expect(result.ok).toBe(2); // one was already deleted
    });

    it("throws when associate calls it", async () => {
      vi.mocked(getServerSession).mockResolvedValue(associateSession);
      await expect(bulkDeleteClients(testClientIds)).rejects.toThrow("Manager access required");
    });
  });

  // ---------------------------------------------------------------
  // bulkBanClients
  // ---------------------------------------------------------------
  describe("bulkBanClients", () => {
    it("bans multiple clients and creates banned_customers rows (manager)", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);
      const result = await bulkBanClients(testClientIds, "Reselling", "Test ban");
      expect(result.ok).toBe(3);

      for (const id of testClientIds) {
        const client = db.select().from(clients).where(eq(clients.id, id)).get();
        expect(client?.status).toBe("banned");

        const banned = db.select().from(bannedCustomers).where(eq(bannedCustomers.customerId, id)).get();
        expect(banned).toBeTruthy();
        expect(banned?.banReasonCategory).toBe("Reselling");
      }

      const events = db.select().from(activityEvents)
        .where(inArray(activityEvents.clientId, testClientIds)).all()
        .filter((e) => e.eventType === "status_changed");
      expect(events.length).toBe(3);
    });

    it("throws when associate calls it", async () => {
      vi.mocked(getServerSession).mockResolvedValue(associateSession);
      await expect(bulkBanClients(testClientIds, "Other", "test")).rejects.toThrow("Manager access required");
    });

    it("skips already-banned clients instead of duplicating banned_customers rows", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);
      const [activeId, alreadyBannedId] = testClientIds;

      const first = await bulkBanClients([alreadyBannedId], "Reselling", "First ban");
      expect(first.ok).toBe(1);

      const second = await bulkBanClients([activeId, alreadyBannedId], "Other", "Second ban");
      expect(second.ok).toBe(1);

      expect(
        db.select().from(bannedCustomers).where(eq(bannedCustomers.customerId, alreadyBannedId)).all(),
      ).toHaveLength(1);
      expect(
        db.select().from(bannedCustomers).where(eq(bannedCustomers.customerId, activeId)).all(),
      ).toHaveLength(1);

      const reBanEvents = db.select().from(activityEvents)
        .where(eq(activityEvents.clientId, alreadyBannedId)).all()
        .filter((e) => e.eventType === "status_changed");
      expect(reBanEvents).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------
  // bulkUnsubscribeClients
  // ---------------------------------------------------------------
  describe("bulkUnsubscribeClients", () => {
    it("unsubscribes multiple clients and adds to unsubscribe_list (manager)", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);
      const result = await bulkUnsubscribeClients(testClientIds);
      expect(result.ok).toBe(3);

      for (const id of testClientIds) {
        const client = db.select().from(clients).where(eq(clients.id, id)).get();
        expect(client?.status).toBe("unsubscribed");
        expect(client?.onEmailList).toBeFalsy();
      }

      // Check unsubscribe_list entries
      for (const id of testClientIds) {
        const client = db.select().from(clients).where(eq(clients.id, id)).get();
        if (client?.email) {
          const unsub = db.select().from(unsubscribeList).where(eq(unsubscribeList.email, client.email)).get();
          expect(unsub).toBeTruthy();
        }
      }

      const events = db.select().from(activityEvents)
        .where(inArray(activityEvents.clientId, testClientIds)).all()
        .filter((e) => e.eventType === "status_changed");
      expect(events.length).toBe(3);
    });

    it("throws when associate calls it", async () => {
      vi.mocked(getServerSession).mockResolvedValue(associateSession);
      await expect(bulkUnsubscribeClients(testClientIds)).rejects.toThrow("Manager access required");
    });

    // Regression test for plan 012 — clients.email has no UNIQUE constraint but
    // unsubscribe_list.email does, so two clients sharing an address must
    // produce exactly one unsubscribe row, not a constraint violation that
    // rolls back the whole batch.
    it("handles two clients sharing one email address", async () => {
      const sharedEmail = "shared-couple-012@test.com";
      const sharedIds = [randomUUID(), randomUUID()];
      for (const [i, id] of sharedIds.entries()) {
        db.insert(clients).values({
          id,
          firstName: "SharedEmail",
          lastName: `Partner${i}`,
          email: sharedEmail,
          employeeId: ASSOCIATE_ID,
          source: "Walk-in",
          productsOfInterest: [],
          tags: [],
          onEmailList: true,
          status: "active",
        }).run();
      }

      try {
        vi.mocked(getServerSession).mockResolvedValue(managerSession);
        const result = await bulkUnsubscribeClients(sharedIds);

        expect(result.error).toBeUndefined();
        expect(result.ok).toBe(2);

        for (const id of sharedIds) {
          const client = db.select().from(clients).where(eq(clients.id, id)).get();
          expect(client?.status).toBe("unsubscribed");
        }

        const unsubRows = db.select().from(unsubscribeList)
          .where(eq(unsubscribeList.email, sharedEmail)).all();
        expect(unsubRows.length).toBe(1);
      } finally {
        cleanupClients(sharedIds);
        cleanupUnsubscribe([sharedEmail]);
      }
    });
  });
  // ---------------------------------------------------------------
  // PERF-03: activity events are emitted as ONE multi-row insert
  //
  // Two things are asserted, deliberately: that every client got a correct
  // persisted event (behaviour), and that they were written by a single
  // INSERT statement (the actual perf contract — this fails if anyone
  // reintroduces a per-client `tx.insert(activityEvents)` loop). The old
  // version also counted `(?` parameter groups inside the SQL text, which
  // pinned Drizzle's binding format without checking any written value.
  // ---------------------------------------------------------------
  describe("activity-event batching", () => {
    it("writes one activity_events INSERT for N clients", async () => {
      const { sqlite } = await import("@/lib/db");
      const ids = createTestClients(5);
      const original = sqlite.prepare.bind(sqlite);
      const seen: string[] = [];
      const spy = vi.spyOn(sqlite, "prepare").mockImplementation(((source: string) => {
        seen.push(source);
        return original(source);
      }) as typeof sqlite.prepare);

      try {
        vi.mocked(getServerSession).mockResolvedValue(managerSession);
        const result = await bulkReassignOwner(ids, JORDAN_ID);
        expect(result.ok).toBe(5);

        const inserts = seen.filter((s) => /insert\s+into\s+"activity_events"/i.test(s));
        expect(inserts).toHaveLength(1);

        // One event per client, with the right type and actor.
        const events = db.select().from(activityEvents).where(inArray(activityEvents.clientId, ids)).all();
        expect(events).toHaveLength(ids.length);
        expect([...new Set(events.map((e) => e.clientId))].sort()).toEqual([...ids].sort());
        for (const e of events) {
          expect(e.eventType).toBe("transferred");
          expect(e.employeeId).toBe(MANAGER_ID);
        }
      } finally {
        spy.mockRestore();
        cleanupClients(ids);
      }

      const events = db.select().from(activityEvents).where(inArray(activityEvents.clientId, ids)).all();
      expect(events).toHaveLength(0); // cleaned up
    });
  });
});
