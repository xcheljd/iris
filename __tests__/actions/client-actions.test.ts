import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// Mock next-auth before importing actions
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import {
  createClient,
  updateClient,
  transferClient,
  banClient,
  unsubscribeClient,
  resubscribeClient,
} from "@/lib/actions";
import { db } from "@/lib/db";
import { clients, activityEvents, bannedCustomers, unsubscribeList } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Real IDs from seed data
const MANAGER_ID = "e09564a0-2ef8-4470-a149-fc8fcf695636"; // Marcus (manager)
const ASSOCIATE_ID = "85d655c4-4196-43ed-82d5-34474d22c782"; // Jordan (associate)
const FIRST_CLIENT_ID = "5aff9797-ad89-4661-906c-cde72c306181"; // Michael White

const managerSession = {
  user: { id: MANAGER_ID, name: "Marcus", role: "manager" },
};

const associateSession = {
  user: { id: ASSOCIATE_ID, name: "Jordan", role: "associate" },
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

  describe("createClient", () => {
    it("should create a client with authenticated user and redirect", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      const result = await createClient({
        firstName: "TestClient",
        lastName: "TestLast",
        phone: "(555) 123-4567",
        email: "test@example.com",
        productsOfInterest: ["KX1011-01X"],
        notes: "Test notes",
        onEmailList: true,
        source: "Walk-in",
        tags: ["VIP"],
      });

      // createClient calls redirect, so we check that redirect was called
      expect(redirect).toHaveBeenCalled();
      const redirectPath = vi.mocked(redirect).mock.calls[0][0];
      expect(redirectPath).toMatch(/^\/clients\/[0-9a-f-]+$/);

      // Extract client ID from redirect path and track for cleanup
      const clientId = redirectPath.replace("/clients/", "");
      createdClientIds.push(clientId);

      // Verify client was created in database
      const client = db.select().from(clients).where(eq(clients.id, clientId)).get();
      expect(client).toBeDefined();
      expect(client!.firstName).toBe("TestClient");
      expect(client!.lastName).toBe("TestLast");
      expect(client!.email).toBe("test@example.com");
      expect(client!.employeeId).toBe(MANAGER_ID);
      expect(client!.onEmailList).toBe(true);
      expect(client!.tags).toEqual(["VIP"]);

      // Verify activity event was created
      const activity = db.select().from(activityEvents).where(eq(activityEvents.clientId, clientId)).get();
      expect(activity).toBeDefined();
      expect(activity!.eventType).toBe("created");
      expect(activity!.description).toContain("Marcus");
    });

    it("should create a client without session (system user)", async () => {
      vi.mocked(getServerSession).mockResolvedValue(null as any);

      // Clear redirect mock
      vi.mocked(redirect).mockImplementation(() => {
        // redirect throws NEXT_REDIRECT, so we simulate that
        throw new Error("NEXT_REDIRECT");
      });

      try {
        await createClient({
          firstName: "NoSession",
          lastName: "Client",
        });
      } catch (e: any) {
        expect(e.message).toBe("NEXT_REDIRECT");
      }

      // Find the client we just created
      const client = db.select().from(clients).where(eq(clients.firstName, "NoSession")).get();
      expect(client).toBeDefined();
      expect(client!.employeeId).toBeNull();
      createdClientIds.push(client!.id);
    });
  });

  describe("updateClient", () => {
    it("should update a client's fields", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      await updateClient(FIRST_CLIENT_ID, {
        firstName: "UpdatedMichael",
        phone: "(999) 999-9999",
        notes: "Updated notes",
      });

      const client = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
      expect(client!.firstName).toBe("UpdatedMichael");
      expect(client!.phone).toBe("(999) 999-9999");
      expect(client!.notes).toBe("Updated notes");

      // Restore original data
      await updateClient(FIRST_CLIENT_ID, {
        firstName: "Michael",
        phone: undefined,
        notes: undefined,
      });
    });

    it("should create an activity event on update", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      await updateClient(FIRST_CLIENT_ID, { notes: "Activity test note" });

      const activities = db.select().from(activityEvents)
        .where(eq(activityEvents.clientId, FIRST_CLIENT_ID))
        .all();
      const editEvent = activities.find((a) => a.eventType === "edited");
      expect(editEvent).toBeDefined();
      expect(editEvent!.description).toContain("Marcus");

      // Restore
      await updateClient(FIRST_CLIENT_ID, { notes: null });
    });
  });

  describe("transferClient", () => {
    it("should transfer a client to another employee", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      await transferClient(FIRST_CLIENT_ID, ASSOCIATE_ID);

      const client = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
      expect(client!.employeeId).toBe(ASSOCIATE_ID);

      // Verify activity event
      const activities = db.select().from(activityEvents)
        .where(eq(activityEvents.clientId, FIRST_CLIENT_ID))
        .all();
      const transferEvent = activities.find((a) => a.eventType === "transferred");
      expect(transferEvent).toBeDefined();
      expect(transferEvent!.description).toContain("Transferred");

      // Restore
      await transferClient(FIRST_CLIENT_ID, MANAGER_ID);
    });
  });

  describe("banClient", () => {
    it("should ban a client with reason", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

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
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      // Should not throw
      await banClient("nonexistent-id", "Other", "No reason");
    });
  });

  describe("unsubscribeClient", () => {
    it("should unsubscribe a client and add to unsubscribe list", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

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
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
      await unsubscribeClient("nonexistent-id");
      // Should not throw
    });
  });

  describe("resubscribeClient", () => {
    it("should resubscribe an unsubscribed client", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

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
      expect(client!.onEmailList).toBe(true);

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
});
