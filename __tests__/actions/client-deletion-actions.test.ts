import { vi, describe, it, expect, afterEach } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { deleteClient, restoreClient, purgeClient } from "@/lib/actions";
import { db } from "@/lib/db";
import { clients, activityEvents, outreachLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const MANAGER_ID = "e09564a0-2ef8-4470-a149-fc8fcf695636"; // Marcus (manager)
const ASSOCIATE_ID = "85d655c4-4196-43ed-82d5-34474d22c782"; // Jordan (associate)
const FIRST_CLIENT_ID = "5aff9797-ad89-4661-906c-cde72c306181"; // Michael White

const managerSession = {
  user: { id: MANAGER_ID, name: "Marcus", role: "manager" },
};

const associateSession = {
  user: { id: ASSOCIATE_ID, name: "Jordan", role: "associate" },
};

describe("Client Deletion Actions", () => {
  const cleanupIds: string[] = [];

  afterEach(() => {
    for (const id of cleanupIds) {
      try {
        db.delete(activityEvents).where(eq(activityEvents.clientId, id)).run();
        db.delete(outreachLogs).where(eq(outreachLogs.clientId, id)).run();
        db.delete(clients).where(eq(clients.id, id)).run();
      } catch {
        // ignore
      }
    }
    cleanupIds.length = 0;
    // Restore FIRST_CLIENT_ID to active if modified
    try {
      db.update(clients)
        .set({ status: "active", previousStatus: null, deletedAt: null, deletedBy: null, updatedAt: new Date() })
        .where(eq(clients.id, FIRST_CLIENT_ID))
        .run();
    } catch {
      // ignore
    }
  });

  describe("deleteClient", () => {
    it("should soft-delete a client with manager session", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      await deleteClient(FIRST_CLIENT_ID);

      const client = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
      expect(client!.status).toBe("deleted");
      expect(client!.deletedAt).toBeDefined();
      expect(client!.deletedBy).toBe(MANAGER_ID);
      expect(client!.previousStatus).toBe("active"); // was active before deletion
    });

    it("should create a status_changed activity event on delete", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      await deleteClient(FIRST_CLIENT_ID);

      const activities = db.select().from(activityEvents)
        .where(eq(activityEvents.clientId, FIRST_CLIENT_ID))
        .all();
      const deleteEvent = activities.find((a) => a.description.includes("deleted"));
      expect(deleteEvent).toBeDefined();
      expect(deleteEvent!.eventType).toBe("status_changed");
    });

    it("should throw for non-manager session", async () => {
      vi.mocked(getServerSession).mockResolvedValue(associateSession as any);

      await expect(deleteClient(FIRST_CLIENT_ID)).rejects.toThrow("Manager access required");
    });

    it("should throw for no session", async () => {
      vi.mocked(getServerSession).mockResolvedValue(null as any);

      await expect(deleteClient(FIRST_CLIENT_ID)).rejects.toThrow("Not authenticated");
    });

    it("should throw for already-deleted client", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      // First delete
      await deleteClient(FIRST_CLIENT_ID);

      // Second delete should throw
      await expect(deleteClient(FIRST_CLIENT_ID)).rejects.toThrow("Client already deleted");
    });

    it("should throw for nonexistent client", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      await expect(deleteClient("nonexistent-id-12345")).rejects.toThrow("Client not found");
    });
  });

  describe("restoreClient", () => {
    it("should restore a deleted client to previous status", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      // First delete
      await deleteClient(FIRST_CLIENT_ID);

      // Now restore
      await restoreClient(FIRST_CLIENT_ID);

      const client = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
      expect(client!.status).toBe("active"); // restored to previousStatus
      expect(client!.deletedAt).toBeNull();
      expect(client!.deletedBy).toBeNull();
      expect(client!.previousStatus).toBeNull();
    });

    it("should restore to previous status when it was banned", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      // Set client to banned first
      db.update(clients).set({ status: "banned", updatedAt: new Date() }).where(eq(clients.id, FIRST_CLIENT_ID)).run();

      // Delete (should save previousStatus = "banned")
      await deleteClient(FIRST_CLIENT_ID);

      const deletedClient = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
      expect(deletedClient!.previousStatus).toBe("banned");

      // Restore
      await restoreClient(FIRST_CLIENT_ID);

      const restored = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
      expect(restored!.status).toBe("banned"); // restored to banned, not active
    });

    it("should create a status_changed activity event on restore", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      await deleteClient(FIRST_CLIENT_ID);
      await restoreClient(FIRST_CLIENT_ID);

      const activities = db.select().from(activityEvents)
        .where(eq(activityEvents.clientId, FIRST_CLIENT_ID))
        .all();
      const restoreEvent = activities.find((a) => a.description.includes("restored"));
      expect(restoreEvent).toBeDefined();
      expect(restoreEvent!.eventType).toBe("status_changed");
    });

    it("should throw for non-deleted client", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      await expect(restoreClient(FIRST_CLIENT_ID)).rejects.toThrow("Client is not deleted");
    });

    it("should throw for non-manager session", async () => {
      vi.mocked(getServerSession).mockResolvedValue(associateSession as any);

      await expect(restoreClient(FIRST_CLIENT_ID)).rejects.toThrow("Manager access required");
    });
  });

  describe("purgeClient", () => {
    it("should permanently delete a client and all related records", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      // Create a temp client to purge (so we don't destroy seed data)
      const tempId = "purge-test-" + Date.now();
      db.insert(clients).values({
        id: tempId, firstName: "PurgeTest", lastName: "Client",
        employeeId: null, dateAdded: new Date(), productsOfInterest: [],
        notes: null, onEmailList: false, status: "active", source: "Walk-in",
        tags: [], heatScore: 0, heatLevel: "cold", createdAt: new Date(), updatedAt: new Date(),
      }).run();
      db.insert(activityEvents).values({
        id: "evt-" + tempId, clientId: tempId, eventType: "created",
        description: "Created", employeeId: null,
      }).run();

      await purgeClient(tempId);

      const client = db.select().from(clients).where(eq(clients.id, tempId)).get();
      expect(client).toBeUndefined();

      const events = db.select().from(activityEvents).where(eq(activityEvents.clientId, tempId)).all();
      expect(events).toHaveLength(0);
    });

    it("should throw for non-manager session", async () => {
      vi.mocked(getServerSession).mockResolvedValue(associateSession as any);

      await expect(purgeClient("some-id")).rejects.toThrow("Manager access required");
    });

    it("should throw for nonexistent client", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      await expect(purgeClient("nonexistent-id-99999")).rejects.toThrow("Client not found");
    });
  });
});
