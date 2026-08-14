import { vi, describe, it, expect, afterEach } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { revalidatePath } from "next/cache";
import { logOutreach, markFollowUpComplete, rescheduleFollowUp } from "@/lib/actions";
import { db } from "@/lib/db";
import { outreachLogs, activityEvents, clients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206"; // Marcus (manager)
const ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23"; // Test associate
const FIRST_CLIENT_ID = "e18e3ba8-b3b1-4bc1-b0f2-f13a219dd30b"; // Michael White (owned by associate)

const managerSession: Session = {
  user: { id: MANAGER_ID, name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};

const associateSession: Session = {
  user: { id: ASSOCIATE_ID, name: "Test Associate", role: "associate", firstName: "Test", lastName: "Associate" },
  expires: "2099-12-31T23:59:59.000Z",
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
      vi.mocked(getServerSession).mockResolvedValue(managerSession);

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
      vi.mocked(getServerSession).mockResolvedValue(managerSession);

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
      vi.mocked(getServerSession).mockResolvedValue(managerSession);

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

    it("should reject outreach log without authentication", async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);

      await expect(logOutreach({
        clientId: FIRST_CLIENT_ID,
        method: "email",
        outcome: "voicemail",
      })).rejects.toThrow("Not authenticated");
    });

    it("should set follow-up date when provided", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);

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
      vi.mocked(getServerSession).mockResolvedValue(managerSession);

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

    it("should reject when associate tries to log outreach on another employee's client", async () => {
      // Dedicated fixture: the shared Test Client's owner is not guaranteed in a
      // cleanly seeded DB (setup.ts inserts it owned by the associate), so this
      // test creates its own manager-owned client to prove the ownership guard.
      const otherClientId = randomUUID();
      db.insert(clients).values({
        id: otherClientId,
        firstName: "Outreach",
        lastName: "Fixture",
        employeeId: MANAGER_ID,
        source: "Walk-in",
        productsOfInterest: [],
        tags: [],
        onEmailList: true,
        status: "active",
      }).run();

      vi.mocked(getServerSession).mockResolvedValue(associateSession);

      const result = await logOutreach({
        clientId: otherClientId,
        method: "call",
        outcome: "no_answer",
        notes: "Ownership check test",
      });

      expect(result).toEqual({ error: "You can only log outreach for your own clients" });

      db.delete(clients).where(eq(clients.id, otherClientId)).run();
    });

    it("should allow manager to log outreach on any client", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);

      const result = await logOutreach({
        clientId: FIRST_CLIENT_ID,
        method: "call",
        outcome: "no_answer",
        notes: "Manager override test",
      });

      expect(result).toBeUndefined();

      // Verify the log was created
      const logs = db.select().from(outreachLogs)
        .where(eq(outreachLogs.clientId, FIRST_CLIENT_ID))
        .all();
      const newLog = logs.find((l) => l.notes === "Manager override test");
      expect(newLog).toBeDefined();
      if (newLog) createdLogIds.push(newLog!.id);
    });
  });

  describe("markFollowUpComplete", () => {
    it("should mark an outreach log as completed", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);

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

  // Regression tests for plan 010 — follow-up actions previously accepted any
  // logId without checking who owned the log. FIRST_CLIENT_ID is manager-owned,
  // so a log created by the manager must be untouchable by the associate.
  describe("follow-up ownership", () => {
    async function createManagerLog(marker: string) {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);
      await logOutreach({
        clientId: FIRST_CLIENT_ID,
        method: "call",
        outcome: "wants_to_come_in",
        followUpDate: "2026-12-01",
        notes: marker,
      });
      const log = db.select().from(outreachLogs)
        .where(eq(outreachLogs.clientId, FIRST_CLIENT_ID))
        .all()
        .find((l) => l.notes === marker);
      expect(log).toBeDefined();
      createdLogIds.push(log!.id);
      return log!;
    }

    it("should reject an associate completing another employee's follow-up", async () => {
      const log = await createManagerLog("ownership-test-010a");

      vi.mocked(getServerSession).mockResolvedValue(associateSession);
      const result = await markFollowUpComplete(log.id);

      expect(result).toEqual({ error: "Not authorized to complete this follow-up" });
      const after = db.select().from(outreachLogs).where(eq(outreachLogs.id, log.id)).get();
      expect(after!.completed).toBe(false);
    });

    it("should reject an associate rescheduling another employee's follow-up", async () => {
      const log = await createManagerLog("ownership-test-010b");
      const originalDate = log.followUpDate;

      vi.mocked(getServerSession).mockResolvedValue(associateSession);
      const result = await rescheduleFollowUp(log.id, "2027-01-01");

      expect(result).toEqual({ error: "Not authorized to reschedule this follow-up" });
      const after = db.select().from(outreachLogs).where(eq(outreachLogs.id, log.id)).get();
      expect(after!.followUpDate).toEqual(originalDate);
    });

    it("should return not-found for a logId that does not exist", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);
      const result = await markFollowUpComplete("00000000-0000-4000-8000-000000000000");
      expect(result).toEqual({ error: "Follow-up not found" });
    });
  });
});
