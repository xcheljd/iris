import { vi, describe, it, expect, afterEach } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import {
  rescheduleFollowUp,
  unbanClient,
  addUnsubscribeEmail,
  resubscribeClient,
  banClient,
} from "@/lib/actions";
import { db } from "@/lib/db";
import { outreachLogs, bannedCustomers, unsubscribeList, clients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const FIRST_CLIENT_ID = "e18e3ba8-b3b1-4bc1-b0f2-f13a219dd30b";

const managerSession: Session = {
  user: { id: MANAGER_ID, name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};

describe("Misc Actions", () => {
  const cleanupUnsubIds: string[] = [];
  const cleanupBannedIds: string[] = [];

  afterEach(() => {
    for (const id of cleanupUnsubIds) {
      try {
        db.delete(unsubscribeList).where(eq(unsubscribeList.id, id)).run();
      } catch {
        // ignore
      }
    }
    cleanupUnsubIds.length = 0;

    for (const id of cleanupBannedIds) {
      try {
        db.delete(bannedCustomers).where(eq(bannedCustomers.id, id)).run();
      } catch {
        // ignore
      }
    }
    cleanupBannedIds.length = 0;

    // Restore client to active
    try {
      db.update(clients)
        .set({ status: "active", onEmailList: true, updatedAt: new Date() })
        .where(eq(clients.id, FIRST_CLIENT_ID))
        .run();
    } catch {
      // ignore
    }
  });

  describe("rescheduleFollowUp", () => {
    it("should update followUpDate on an outreach log", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);
      const { revalidatePath } = await import("next/cache");

      // Find an existing outreach log
      const logs = db.select().from(outreachLogs).all();
      if (logs.length === 0) return; // Skip if no logs

      const log = logs[0];
      const newDate = "2026-12-31";

      await rescheduleFollowUp(log.id, newDate);

      const updated = db.select().from(outreachLogs).where(eq(outreachLogs.id, log.id)).get();
      expect(updated!.followUpDate).toBeDefined();
      expect(new Date(updated!.followUpDate!).getFullYear()).toBe(2026);

      // Restore original date
      db.update(outreachLogs).set({ followUpDate: log.followUpDate }).where(eq(outreachLogs.id, log.id)).run();

      expect(revalidatePath).toHaveBeenCalledWith("/follow-ups");
    });
  });

  describe("unbanClient", () => {
    it("should restore a banned client to active and delete banned record", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);

      // First ban the client
      await banClient(FIRST_CLIENT_ID, "Other", "Test ban for unban test");

      const banned = db.select().from(bannedCustomers)
        .where(eq(bannedCustomers.customerId, FIRST_CLIENT_ID))
        .get();
      expect(banned).toBeDefined();

      // Now unban by client ID
      await expect(unbanClient(FIRST_CLIENT_ID)).resolves.toBeUndefined();

      // Client should be active again
      const client = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
      expect(client!.status).toBe("active");

      // Banned record should be deleted
      const deleted = db.select().from(bannedCustomers)
        .where(eq(bannedCustomers.id, banned!.id))
        .get();
      expect(deleted).toBeUndefined();
    });

    // F-3: unbanClient returned a bare `undefined` when there was nothing to
    // unban — indistinguishable from success. `useRemovedKeys.remove` treats a
    // non-{ error } result as success and *holds* the optimistic removal until
    // revalidated props drop the key; the untouched ban row never does, so the
    // row vanished from /banned and stayed vanished until a full reload while
    // the ban was still in the DB.
    it("reports { error } for a client that is not banned", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);
      db.update(clients).set({ status: "active" }).where(eq(clients.id, FIRST_CLIENT_ID)).run();

      await expect(unbanClient(FIRST_CLIENT_ID)).resolves.toEqual({ error: "Client is not banned" });
    });

    it("reports { error } for a nonexistent client instead of a silent success", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);

      await expect(unbanClient("nonexistent-client-id")).resolves.toEqual({ error: "Client not found" });
    });
  });

  describe("addUnsubscribeEmail", () => {
    it("should add email to unsubscribe list and update matching client", async () => {
      // Ensure client has a known email
      const testEmail = `unsub-test-${Date.now()}@example.com`;
      db.update(clients).set({ email: testEmail, status: "active", onEmailList: true }).where(eq(clients.id, FIRST_CLIENT_ID)).run();

      await addUnsubscribeEmail(testEmail);

      // Check unsubscribe list
      const entry = db.select().from(unsubscribeList).where(eq(unsubscribeList.email, testEmail)).get();
      expect(entry).toBeDefined();
      if (entry) cleanupUnsubIds.push(entry.id);

      // Check client status
      const client = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
      expect(client!.status).toBe("unsubscribed");
      expect(client!.onEmailList).toBe(false);
    });

    it("should throw error for duplicate email", async () => {
      const testEmail = `dup-unsub-${Date.now()}@example.com`;
      db.update(clients).set({ email: testEmail }).where(eq(clients.id, FIRST_CLIENT_ID)).run();

      await addUnsubscribeEmail(testEmail);

      const entry = db.select().from(unsubscribeList).where(eq(unsubscribeList.email, testEmail)).get();
      if (entry) cleanupUnsubIds.push(entry.id);

      const result = await addUnsubscribeEmail(testEmail);
      expect(result?.error).toBe("Email already exists");
    });

    // F-8: the UI deduped case-insensitively, the UNIQUE TEXT column collates
    // BINARY, and the action matched clients with a plain eq(). Quick-Adding
    // "Alex@Example.com" for a client stored as "alex@example.com" passed the
    // UI check, passed the constraint, marked nobody unsubscribed, and left a
    // row reading "No client match" forever — straight into the orphan bucket.
    it("matches a differently-cased client email and marks them unsubscribed", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);
      const stored = `case-client-${Date.now()}@example.com`;
      db.update(clients)
        .set({ email: stored, status: "active", onEmailList: true })
        .where(eq(clients.id, FIRST_CLIENT_ID))
        .run();

      const res = await addUnsubscribeEmail(stored.toUpperCase());
      expect(res).toBeUndefined();

      const entry = db.select().from(unsubscribeList).where(eq(unsubscribeList.email, stored)).get();
      expect(entry).toBeDefined();
      if (entry) cleanupUnsubIds.push(entry.id);
      // Stored lowercased, not as typed.
      expect(entry!.email).toBe(stored);

      const client = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
      expect(client!.status).toBe("unsubscribed");
    });

    it("rejects a differently-cased address already on the list", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);
      const email = `case-dup-${Date.now()}@example.com`;

      await addUnsubscribeEmail(email);
      const entry = db.select().from(unsubscribeList).where(eq(unsubscribeList.email, email)).get();
      if (entry) cleanupUnsubIds.push(entry.id);

      await expect(addUnsubscribeEmail(email.toUpperCase())).resolves.toEqual({
        error: "Email already exists",
      });
    });

    // The only write path in the app with no zod schema at all: its sole gate
    // was a hand-rolled regex in the UI that accepts "a@b.c." and "a@b..c".
    it.each(["a@b.c.", "a@b..c", "not-an-email", "", "   "])(
      "rejects the malformed address %j before it reaches the suppression list",
      async (bad) => {
        vi.mocked(getServerSession).mockResolvedValue(managerSession);
        const before = db.select().from(unsubscribeList).all().length;

        await expect(addUnsubscribeEmail(bad)).resolves.toEqual({
          error: "Enter a valid email address",
        });
        expect(db.select().from(unsubscribeList).all().length).toBe(before);
      },
    );
  });

  describe("resubscribeClient", () => {
    it("should remove from unsubscribe list and restore client to active", async () => {
      const testEmail = `resub-test-${Date.now()}@example.com`;
      db.update(clients).set({ email: testEmail, status: "unsubscribed", onEmailList: false }).where(eq(clients.id, FIRST_CLIENT_ID)).run();

      // Add to unsubscribe list first
      await addUnsubscribeEmail(testEmail);

      const entry = db.select().from(unsubscribeList).where(eq(unsubscribeList.email, testEmail)).get();
      expect(entry).toBeDefined();

      // Now resubscribe by client ID
      await resubscribeClient(FIRST_CLIENT_ID);

      // Check unsubscribe list is empty
      const removed = db.select().from(unsubscribeList).where(eq(unsubscribeList.id, entry!.id)).get();
      expect(removed).toBeUndefined();

      // Check client is active again
      const client = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
      expect(client!.status).toBe("active");
    });

    it("should do nothing for nonexistent client", async () => {
      await resubscribeClient("nonexistent-client-id");
      // Should not throw
    });
  });
});
