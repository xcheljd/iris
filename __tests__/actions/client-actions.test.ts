import { vi, describe, it, expect, afterEach } from "vitest";

// Mock next-auth before importing actions
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import {
  banClient,
  banWalkIn,
  unsubscribeClient,
  resubscribeClient,
  toggleEmailList,
} from "@/lib/actions";
import { db } from "@/lib/db";
import { clients, activityEvents, bannedCustomers, unsubscribeList } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

// Real IDs from seed data
const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206"; // Marcus (manager)
const ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23"; // Jordan (associate)
const FIRST_CLIENT_ID = "e18e3ba8-b3b1-4bc1-b0f2-f13a219dd30b"; // Michael White

const managerSession: Session = {
  user: { id: MANAGER_ID, name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};

const associateSession: Session = {
  user: { id: ASSOCIATE_ID, name: "Jordan", role: "associate", firstName: "Jordan", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};

describe("Client Actions", () => {
  // Track IDs created during tests for cleanup
  const createdClientIds: string[] = [];

  afterEach(() => {
    // Clean up created clients
    for (const id of createdClientIds) {
      try {
        db.delete(activityEvents).where(eq(activityEvents.clientId, id)).run();
        db.delete(clients).where(eq(clients.id, id)).run();
      } catch {
        // ignore cleanup errors
      }
    }
    createdClientIds.length = 0;
  });

  describe("banClient", () => {
    it("should ban a client with reason", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);

      await banClient(FIRST_CLIENT_ID, "Reselling", "Caught reselling online");

      const client = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
      expect(client!.status).toBe("banned");

      // Verify banned record was created
      const banned = db.select().from(bannedCustomers)
        .where(eq(bannedCustomers.customerId, FIRST_CLIENT_ID))
        .get();
      expect(banned).toBeDefined();
      expect(banned!.banReasonCategory).toBe("Reselling");
      expect(banned!.specificBanReason).toBe("Caught reselling online");

      // Clean up: restore client status
      db.delete(bannedCustomers).where(eq(bannedCustomers.customerId, FIRST_CLIENT_ID)).run();
      // Restore client to active
      db.update(clients).set({ status: "active", updatedAt: new Date() }).where(eq(clients.id, FIRST_CLIENT_ID)).run();
    });

    it("should do nothing if client does not exist", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);

      // Should not throw
      await banClient("nonexistent-id", "Other", "No reason");
    });
  });

  // F-2: the /banned "Ban Customer" dialog collects a walk-in's name and
  // contact details and has no client picker. It used to call
  // banClient("") — "Client not found" — and toast success anyway.
  describe("banWalkIn", () => {
    const walkInIds: string[] = [];
    afterEach(() => {
      for (const id of walkInIds) db.delete(bannedCustomers).where(eq(bannedCustomers.id, id)).run();
      walkInIds.length = 0;
    });

    it("inserts a banned_customers row with a null customer_id and no client", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);

      const email = `walkin-${randomUUID().slice(0, 8)}@example.com`;
      const res = await banWalkIn({
        firstName: "Casey",
        lastName: "Rivera",
        email,
        phone: "(702) 555-0100",
        category: "Reselling",
        reason: "Flipping allocations",
      });
      expect(res).toBeUndefined();

      const row = db.select().from(bannedCustomers).where(eq(bannedCustomers.email, email)).get();
      expect(row).toBeDefined();
      walkInIds.push(row!.id);
      expect(row!.customerId).toBeNull();
      expect(row!.firstName).toBe("Casey");
      expect(row!.lastName).toBe("Rivera");
      expect(row!.phone).toBe("(702) 555-0100");
      expect(row!.banReasonCategory).toBe("Reselling");
      expect(row!.specificBanReason).toBe("Flipping allocations");
    });

    it("stores blank optional fields as null rather than empty strings", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);

      const before = db.select().from(bannedCustomers).all().length;
      const res = await banWalkIn({
        firstName: "Solo",
        lastName: "",
        email: "",
        phone: "",
        category: "Other",
        reason: "",
      });
      expect(res).toBeUndefined();

      const rows = db.select().from(bannedCustomers).all();
      expect(rows.length).toBe(before + 1);
      const row = rows.find((r) => r.firstName === "Solo")!;
      walkInIds.push(row.id);
      expect(row.lastName).toBeNull();
      expect(row.email).toBeNull();
      expect(row.phone).toBeNull();
      expect(row.specificBanReason).toBeNull();
    });

    it("returns { error } and writes nothing for a blank first name", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);

      const before = db.select().from(bannedCustomers).all().length;
      const res = await banWalkIn({ firstName: "   ", category: "Other", reason: "" });

      expect(res).toEqual({ error: "First name is required" });
      expect(db.select().from(bannedCustomers).all().length).toBe(before);
    });

    it("returns { error } for a malformed email", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);

      const res = await banWalkIn({
        firstName: "Casey",
        email: "not-an-email",
        category: "Other",
        reason: "",
      });
      expect(res).toEqual({ error: "Invalid email" });
    });

    it("requires a manager", async () => {
      vi.mocked(getServerSession).mockResolvedValue(associateSession);
      await expect(
        banWalkIn({ firstName: "Casey", category: "Other", reason: "" }),
      ).rejects.toThrow("Manager access required");
    });
  });

  describe("unsubscribeClient", () => {
    it("should unsubscribe a client and add to unsubscribe list", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);

      // Ensure client has an email
      const clientBefore = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
      const testEmail = clientBefore!.email || "test-unsub@example.com";
      if (!clientBefore!.email) {
        db.update(clients).set({ email: testEmail }).where(eq(clients.id, FIRST_CLIENT_ID)).run();
      }

      await unsubscribeClient(FIRST_CLIENT_ID);

      const client = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
      expect(client!.status).toBe("unsubscribed");
      expect(client!.onEmailList).toBe(false);

      // Verify unsubscribe list entry
      const unsubEntry = db.select().from(unsubscribeList)
        .where(eq(unsubscribeList.email, testEmail))
        .get();
      expect(unsubEntry).toBeDefined();

      // Clean up
      if (unsubEntry) {
        db.delete(unsubscribeList).where(eq(unsubscribeList.id, unsubEntry.id)).run();
      }
      db.update(clients)
        .set({ status: "active", onEmailList: true, updatedAt: new Date() })
        .where(eq(clients.id, FIRST_CLIENT_ID))
        .run();
    });

    it("should do nothing if client does not exist", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);
      await unsubscribeClient("nonexistent-id");
      // Should not throw
    });
  });

  describe("resubscribeClient", () => {
    it("should resubscribe an unsubscribed client", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);

      // First unsubscribe
      const clientBefore = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
      const testEmail = clientBefore!.email || "resub-test@example.com";
      if (!clientBefore!.email) {
        db.update(clients).set({ email: testEmail }).where(eq(clients.id, FIRST_CLIENT_ID)).run();
      }

      await unsubscribeClient(FIRST_CLIENT_ID);

      // Now resubscribe
      await resubscribeClient(FIRST_CLIENT_ID);

      const client = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
      expect(client!.status).toBe("active");
      // resubscribeClient should NOT force onEmailList: true — it removes
      // the client from the suppression list but doesn't auto-opt them
      // back into emails. (Previous behavior was a bug — see H-18.)
      expect(client!.onEmailList).toBe(false);

      // Verify unsubscribe list entry was removed
      const unsubEntry = db.select().from(unsubscribeList)
        .where(eq(unsubscribeList.email, testEmail))
        .get();
      expect(unsubEntry).toBeUndefined();
    });

    it("should do nothing if client does not exist", async () => {
      await resubscribeClient("nonexistent-id");
      // Should not throw
    });
  });

  // Regression tests — toggleEmailList is intentionally requireAuth (associates
  // manage their own clients' email opt-in), but it previously guarded only on
  // not-found and unsubscribed-status, so any associate could flip the flag on
  // another employee's client. Ownership guard added per the logOutreach exemplar.
  describe("toggleEmailList ownership", () => {
    // Creates its own client rather than reusing FIRST_CLIENT_ID: that shared
    // fixture is inserted by __tests__/setup.ts owned by ASSOCIATE_ID, so it
    // cannot express "a client this associate does not own".
    function createClient(ownerId: string): string {
      const id = randomUUID();
      db.insert(clients).values({
        id,
        firstName: "Ownership",
        lastName: "Fixture",
        employeeId: ownerId,
        status: "active",
        onEmailList: false,
      }).run();
      createdClientIds.push(id);
      return id;
    }

    it("should reject an associate toggling another employee's client", async () => {
      const clientId = createClient(MANAGER_ID);
      vi.mocked(getServerSession).mockResolvedValue(associateSession);

      const result = await toggleEmailList(clientId);

      expect(result).toEqual({ error: "Not authorized to change this client's email list" });
      const after = db.select().from(clients).where(eq(clients.id, clientId)).get();
      expect(after!.onEmailList).toBe(false);
      // The rejected call must not leave an audit trail either.
      const events = db.select().from(activityEvents).where(eq(activityEvents.clientId, clientId)).all();
      expect(events).toHaveLength(0);
    });

    it("should allow an associate toggling their own client", async () => {
      const clientId = createClient(ASSOCIATE_ID);
      vi.mocked(getServerSession).mockResolvedValue(associateSession);

      const result = await toggleEmailList(clientId);

      expect(result).toBeUndefined();
      const after = db.select().from(clients).where(eq(clients.id, clientId)).get();
      expect(after!.onEmailList).toBe(true);
    });

    it("should allow a manager toggling a client they do not own", async () => {
      const clientId = createClient(ASSOCIATE_ID);
      vi.mocked(getServerSession).mockResolvedValue(managerSession);

      const result = await toggleEmailList(clientId);

      expect(result).toBeUndefined();
      const after = db.select().from(clients).where(eq(clients.id, clientId)).get();
      expect(after!.onEmailList).toBe(true);
    });
  });
});
