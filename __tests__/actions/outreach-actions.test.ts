import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { logOutreach, markFollowUpComplete } from "@/lib/actions";
import { db } from "@/lib/db";
import { outreachLogs, activityEvents, clients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206"; // Marcus (manager)
const FIRST_CLIENT_ID = "e18e3ba8-b3b1-4bc1-b0f2-f13a219dd30b"; // Michael White

const managerSession = {
  user: { id: MANAGER_ID, name: "Marcus", role: "manager" },
};

describe("Outreach Actions", () => {
  const createdLogIds: string[] = [];

  afterEach(() => {
    // Clean up created outreach logs and their activity events
    for (const id of createdLogIds) {
      try {
        db.delete(outreachLogs).where(eq(outreachLogs.id, id)).run();
      } catch {
        // ignore
      }
    }
    createdLogIds.length = 0;
  });

  describe("logOutreach", () => {
    it("should create an outreach log entry", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      await logOutreach({
        clientId: FIRST_CLIENT_ID,
        method: "call",
        outcome: "no_answer",
        notes: "Left voicemail",
      });

      // Find the log we just created
      const logs = db.select().from(outreachLogs)
        .where(eq(outreachLogs.clientId, FIRST_CLIENT_ID))
        .all();
      const newLog = logs.find((l) => l.notes === "Left voicemail" && l.employeeId === MANAGER_ID);
      expect(newLog).toBeDefined();
      expect(newLog!.method).toBe("call");
      expect(newLog!.outcome).toBe("no_answer");
      expect(newLog!.completed).toBe(false);
      createdLogIds.push(newLog!.id);

      // Verify activity event
      const activities = db.select().from(activityEvents)
        .where(eq(activityEvents.clientId, FIRST_CLIENT_ID))
        .all();
      const outreachEvent = activities.find(
        (a) => a.eventType === "outreach_logged" && a.description?.includes("call")
      );
      expect(outreachEvent).toBeDefined();
    });

    it("should set lastOutreachAt on the client", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      await logOutreach({
        clientId: FIRST_CLIENT_ID,
        method: "text",
        outcome: "responded",
        notes: "Client responded",
      });

      const client = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
      expect(client!.lastOutreachAt).toBeDefined();
      expect(client!.lastOutreachAt).not.toBeNull();

      // Find and track for cleanup
      const logs = db.select().from(outreachLogs)
        .where(eq(outreachLogs.clientId, FIRST_CLIENT_ID))
        .all();
      const newLog = logs.find((l) => l.notes === "Client responded");
      if (newLog) createdLogIds.push(newLog!.id);
    });

    it("should set lastPurchaseAt when outcome is purchased", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      await logOutreach({
        clientId: FIRST_CLIENT_ID,
        method: "in-person",
        outcome: "purchased",
        purchasedModel: "KX1011-01X",
        notes: "Client purchased a watch",
      });

      const client = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
      expect(client!.lastPurchaseAt).toBeDefined();
      expect(client!.lastPurchaseAt).not.toBeNull();

      // Verify activity event is "purchase" type
      const activities = db.select().from(activityEvents)
        .where(eq(activityEvents.clientId, FIRST_CLIENT_ID))
        .all();
      const purchaseEvent = activities.find(
        (a) => a.eventType === "purchase" && a.description?.includes("purchased")
      );
      expect(purchaseEvent).toBeDefined();

      // Find and track for cleanup
      const logs = db.select().from(outreachLogs)
        .where(eq(outreachLogs.clientId, FIRST_CLIENT_ID))
        .all();
      const newLog = logs.find((l) => l.notes === "Client purchased a watch");
      if (newLog) createdLogIds.push(newLog!.id);
    });

    it("should create outreach log without session (system user)", async () => {
      vi.mocked(getServerSession).mockResolvedValue(null as any);

      await logOutreach({
        clientId: FIRST_CLIENT_ID,
        method: "email",
        outcome: "voicemail",
      });

      const logs = db.select().from(outreachLogs)
        .where(eq(outreachLogs.clientId, FIRST_CLIENT_ID))
        .all();
      const newLog = logs.find((l) => l.employeeId === null && l.method === "email");
      expect(newLog).toBeDefined();
      if (newLog) createdLogIds.push(newLog!.id);
    });

    it("should set follow-up date when provided", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      const followUp = "2026-06-01";
      await logOutreach({
        clientId: FIRST_CLIENT_ID,
        method: "call",
        outcome: "wants_to_come_in",
        followUpDate: followUp,
        notes: "Follow-up test",
      });

      const logs = db.select().from(outreachLogs)
        .where(eq(outreachLogs.clientId, FIRST_CLIENT_ID))
        .all();
      const newLog = logs.find((l) => l.notes === "Follow-up test");
      expect(newLog).toBeDefined();
      expect(newLog!.followUpDate).toBeDefined();
      if (newLog) createdLogIds.push(newLog!.id);
    });

    it("should revalidate relevant paths", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      await logOutreach({
        clientId: FIRST_CLIENT_ID,
        method: "text",
        outcome: "not_interested",
        notes: "Revalidation test",
      });

      expect(revalidatePath).toHaveBeenCalledWith(`/clients/${FIRST_CLIENT_ID}`);
      expect(revalidatePath).toHaveBeenCalledWith("/follow-ups");
      expect(revalidatePath).toHaveBeenCalledWith("/");

      // Cleanup
      const logs = db.select().from(outreachLogs)
        .where(eq(outreachLogs.clientId, FIRST_CLIENT_ID))
        .all();
      const newLog = logs.find((l) => l.notes === "Revalidation test");
      if (newLog) createdLogIds.push(newLog!.id);
    });
  });

  describe("markFollowUpComplete", () => {
    it("should mark an outreach log as completed", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      // First create an outreach log with a follow-up
      await logOutreach({
        clientId: FIRST_CLIENT_ID,
        method: "call",
        outcome: "wants_to_come_in",
        followUpDate: "2026-06-01",
        notes: "Mark complete test",
      });

      const logs = db.select().from(outreachLogs)
        .where(eq(outreachLogs.clientId, FIRST_CLIENT_ID))
        .all();
      const newLog = logs.find((l) => l.notes === "Mark complete test" && l.completed === false);
      expect(newLog).toBeDefined();
      createdLogIds.push(newLog!.id);

      // Mark it complete
      await markFollowUpComplete(newLog!.id);

      const updated = db.select().from(outreachLogs).where(eq(outreachLogs.id, newLog!.id)).get();
      expect(updated!.completed).toBe(true);

      expect(revalidatePath).toHaveBeenCalledWith("/follow-ups");
    });
  });
});
