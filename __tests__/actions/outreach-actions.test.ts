import { vi, describe, it, expect, afterEach, beforeEach } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { revalidatePath } from "next/cache";
import { logOutreach, markFollowUpComplete, reopenFollowUp, rescheduleFollowUp } from "@/lib/actions";
import { getOverdueFollowUps, getUpcomingFollowUps } from "@/lib/queries";
import { formatDate } from "@/lib/utils";
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
  const createdClientIds: string[] = [];

  // Ownership-sensitive tests insert their own client (AGENTS.md): the shared
  // fixture client is associate-owned.
  function createClient(employeeId: string) {
    const id = randomUUID();
    db.insert(clients).values({
      id, firstName: "FollowUp", lastName: "Owner", employeeId, source: "Walk-in",
      productsOfInterest: [], tags: [], onEmailList: false, status: "active",
    }).run();
    createdClientIds.push(id);
    return id;
  }

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
    for (const id of createdClientIds) {
      try {
        db.delete(outreachLogs).where(eq(outreachLogs.clientId, id)).run();
        db.delete(activityEvents).where(eq(activityEvents.clientId, id)).run();
        db.delete(clients).where(eq(clients.id, id)).run();
      } catch {
        // ignore
      }
    }
    createdClientIds.length = 0;
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

  // Backs the Undo action on the "Follow-up marked complete" toast.
  describe("reopenFollowUp", () => {
    it("flips a completed follow-up back to open", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);
      await logOutreach({
        clientId: FIRST_CLIENT_ID,
        method: "call",
        outcome: "wants_to_come_in",
        followUpDate: "2026-06-01",
        notes: "Reopen test",
      });
      const log = db.select().from(outreachLogs)
        .where(eq(outreachLogs.clientId, FIRST_CLIENT_ID))
        .all()
        .find((l) => l.notes === "Reopen test");
      createdLogIds.push(log!.id);

      await markFollowUpComplete(log!.id);
      expect(await reopenFollowUp(log!.id)).toBeUndefined();
      expect(db.select().from(outreachLogs).where(eq(outreachLogs.id, log!.id)).get()!.completed).toBe(false);
    });

    it("refuses an associate reopening a follow-up on a client they do not own", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);
      const clientId = createClient(MANAGER_ID);
      await logOutreach({
        clientId,
        method: "call",
        outcome: "wants_to_come_in",
        followUpDate: "2026-06-01",
        notes: "Reopen ownership test",
      });
      const log = db.select().from(outreachLogs)
        .where(eq(outreachLogs.clientId, clientId))
        .all()
        .find((l) => l.notes === "Reopen ownership test");
      createdLogIds.push(log!.id);
      await markFollowUpComplete(log!.id);

      vi.mocked(getServerSession).mockResolvedValue(associateSession);
      expect(await reopenFollowUp(log!.id)).toEqual({ error: "Not authorized to reopen this follow-up" });
      expect(db.select().from(outreachLogs).where(eq(outreachLogs.id, log!.id)).get()!.completed).toBe(true);
    });
  });

  // Regression tests for plan 010 — follow-up actions previously accepted any
  // logId without checking ownership. A follow-up on a manager-owned client
  // must be untouchable by the associate.
  describe("follow-up ownership", () => {
    async function createManagerLog(marker: string, clientId = createClient(MANAGER_ID)) {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);
      await logOutreach({
        clientId,
        method: "call",
        outcome: "wants_to_come_in",
        followUpDate: "2026-12-01",
        notes: marker,
      });
      const log = db.select().from(outreachLogs)
        .where(eq(outreachLogs.clientId, clientId))
        .all()
        .find((l) => l.notes === marker);
      expect(log).toBeDefined();
      createdLogIds.push(log!.id);
      return log!;
    }

    // B19: the Follow-ups list shows an associate the follow-ups on the clients
    // they own, whoever logged them, so the actions must let them act on those.
    it("lets the client's owner complete a follow-up someone else logged", async () => {
      const log = await createManagerLog("ownership-owner-completes", createClient(ASSOCIATE_ID));

      vi.mocked(getServerSession).mockResolvedValue(associateSession);
      expect(await markFollowUpComplete(log.id)).toBeUndefined();
      expect(db.select().from(outreachLogs).where(eq(outreachLogs.id, log.id)).get()!.completed).toBe(true);
    });

    it("refuses the logger once the client has been transferred away", async () => {
      const clientId = createClient(ASSOCIATE_ID);
      vi.mocked(getServerSession).mockResolvedValue(associateSession);
      await logOutreach({ clientId, method: "call", outcome: "wants_to_come_in", followUpDate: "2026-12-01", notes: "ownership-after-transfer" });
      const log = db.select().from(outreachLogs).where(eq(outreachLogs.clientId, clientId)).get()!;
      db.update(clients).set({ employeeId: MANAGER_ID }).where(eq(clients.id, clientId)).run();

      expect(await rescheduleFollowUp(log.id, "2027-01-01")).toEqual({ error: "Not authorized to reschedule this follow-up" });
    });

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

  // Regression (B19): queryFollowUps listed follow-ups on deleted and banned
  // clients, and scoped by who logged the follow-up rather than who owns the
  // client, so after a transfer the new owner never saw them.
  describe("follow-up lists", () => {
    const overdueDate = "2026-01-15";

    async function logFollowUp(clientId: string, session: Session) {
      vi.mocked(getServerSession).mockResolvedValue(session);
      expect(await logOutreach({ clientId, method: "call", outcome: "wants_to_come_in", followUpDate: overdueDate })).toBeUndefined();
      return db.select().from(outreachLogs).where(eq(outreachLogs.clientId, clientId)).get()!.id;
    }
    const overdueIds = async (scope?: string) => (await getOverdueFollowUps(scope)).map((r) => r.log.id);

    it("hides follow-ups on deleted and banned clients", async () => {
      const liveId = await logFollowUp(createClient(ASSOCIATE_ID), associateSession);
      const bannedClient = createClient(ASSOCIATE_ID);
      const deletedClient = createClient(ASSOCIATE_ID);
      const bannedLog = await logFollowUp(bannedClient, associateSession);
      const deletedLog = await logFollowUp(deletedClient, associateSession);
      db.update(clients).set({ status: "banned" }).where(eq(clients.id, bannedClient)).run();
      db.update(clients).set({ status: "deleted" }).where(eq(clients.id, deletedClient)).run();

      for (const scope of [ASSOCIATE_ID, undefined]) {
        const ids = await overdueIds(scope);
        expect(ids).toContain(liveId);
        expect(ids).not.toContain(bannedLog);
        expect(ids).not.toContain(deletedLog);
      }
    });

    it("follows the client to its new owner after a transfer", async () => {
      const clientId = createClient(ASSOCIATE_ID);
      const logId = await logFollowUp(clientId, associateSession);
      expect(await overdueIds(ASSOCIATE_ID)).toContain(logId);

      db.update(clients).set({ employeeId: MANAGER_ID }).where(eq(clients.id, clientId)).run();

      expect(await overdueIds(MANAGER_ID)).toContain(logId);
      expect(await overdueIds(ASSOCIATE_ID)).not.toContain(logId);
    });

    it("shows the owner a follow-up someone else logged on their client", async () => {
      const clientId = createClient(ASSOCIATE_ID);
      const logId = await logFollowUp(clientId, managerSession);
      expect(await overdueIds(ASSOCIATE_ID)).toContain(logId);
      expect(await overdueIds(MANAGER_ID)).not.toContain(logId);
    });
  });

  // Regression: rescheduleFollowUp fed `newDate` straight into `new Date(...)`,
  // so an unparseable string wrote an Invalid Date to the row.
  describe("rescheduleFollowUp date validation", () => {
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

    it("rejects an unparseable date without touching the row", async () => {
      const log = await createManagerLog("reschedule-invalid-date");
      const originalDate = log.followUpDate;

      const result = await rescheduleFollowUp(log.id, "not-a-date");

      expect(result).toEqual({ error: "Invalid date" });
      const after = db.select().from(outreachLogs).where(eq(outreachLogs.id, log.id)).get();
      expect(after!.followUpDate).toEqual(originalDate);
    });

    it("rejects a well-formed but impossible date", async () => {
      const log = await createManagerLog("reschedule-impossible-date");
      const originalDate = log.followUpDate;

      expect(await rescheduleFollowUp(log.id, "2026-02-31")).toEqual({ error: "Invalid date" });

      const after = db.select().from(outreachLogs).where(eq(outreachLogs.id, log.id)).get();
      expect(after!.followUpDate).toEqual(originalDate);
    });

    it("still reschedules on a valid YYYY-MM-DD date", async () => {
      const log = await createManagerLog("reschedule-valid-date");

      const result = await rescheduleFollowUp(log.id, "2027-01-05");

      expect(result).toBeUndefined();
      const after = db.select().from(outreachLogs).where(eq(outreachLogs.id, log.id)).get();
      expect(after!.followUpDate).toEqual(new Date(2027, 0, 5));
    });
  });

  // Regression: follow-up dates were parsed with `new Date("YYYY-MM-DD")`, i.e. UTC
  // midnight. West of Greenwich that is the previous evening, so a follow-up for
  // Sep 25 rendered as "Sep 24" and turned overdue at 5pm on the 24th.
  describe("follow-up dates in a negative-offset timezone", () => {
    // 2026-09-24 20:00 PDT — the UTC day has already rolled over to the 25th.
    const EVENING_BEFORE = new Date("2026-09-25T03:00:00.000Z");
    let savedTz: string | undefined;

    beforeEach(() => {
      savedTz = process.env.TZ;
      process.env.TZ = "America/Los_Angeles";
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(EVENING_BEFORE);
      vi.mocked(getServerSession).mockResolvedValue(managerSession);
    });

    afterEach(() => {
      vi.useRealTimers();
      process.env.TZ = savedTz;
    });

    function findLog(marker: string) {
      const log = db.select().from(outreachLogs)
        .where(eq(outreachLogs.clientId, FIRST_CLIENT_ID))
        .all()
        .find((l) => l.notes === marker);
      expect(log).toBeDefined();
      createdLogIds.push(log!.id);
      return log!;
    }

    it("is not overdue the evening before and displays as the picked day", async () => {
      // Guard the fixture: without TZ and the frozen clock this passes for the wrong reason.
      expect(new Date().getHours()).toBe(20);
      expect(new Date().getDate()).toBe(24);

      await logOutreach({
        clientId: FIRST_CLIENT_ID,
        method: "call",
        outcome: "wants_to_come_in",
        followUpDate: "2026-09-25",
        notes: "tz-follow-up-log",
      });
      const log = findLog("tz-follow-up-log");

      expect(log.followUpDate).toEqual(new Date(2026, 8, 25));
      expect(formatDate(log.followUpDate)).toBe("Sep 25, 2026");
      const overdue = await getOverdueFollowUps();
      expect(overdue.map((r) => r.log.id)).not.toContain(log.id);
      const upcoming = await getUpcomingFollowUps();
      expect(upcoming.map((r) => r.log.id)).toContain(log.id);
    });

    it("reschedules to local midnight and logs the picked day", async () => {
      await logOutreach({
        clientId: FIRST_CLIENT_ID,
        method: "call",
        outcome: "wants_to_come_in",
        followUpDate: "2026-09-24",
        notes: "tz-follow-up-reschedule",
      });
      const log = findLog("tz-follow-up-reschedule");

      expect(await rescheduleFollowUp(log.id, "2026-09-25")).toBeUndefined();

      const after = db.select().from(outreachLogs).where(eq(outreachLogs.id, log.id)).get();
      expect(after!.followUpDate).toEqual(new Date(2026, 8, 25));
      const overdue = await getOverdueFollowUps();
      expect(overdue.map((r) => r.log.id)).not.toContain(log.id);
      const event = db.select().from(activityEvents)
        .where(eq(activityEvents.clientId, FIRST_CLIENT_ID))
        .all()
        .find((e) => e.description === "Follow-up rescheduled to Sep 25, 2026 by Marcus");
      expect(event).toBeDefined();
    });
  });
});
