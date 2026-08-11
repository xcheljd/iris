import { vi, describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({}));

import { getServerSession } from "next-auth";
import { bulkRejectProspects, bulkUnsubscribeProspects } from "@/lib/actions/bulk-prospects";
import { db } from "@/lib/db";
import { prospects, unsubscribeList, rvxImportBatches } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23";

const managerSession = { user: { id: MANAGER_ID, name: "Test Manager", role: "manager" as const } };
const associateSession = { user: { id: ASSOCIATE_ID, name: "Test Associate", role: "associate" as const } };

// prospects.importBatchId is NOT NULL and references rvx_import_batches, and the
// connection runs with `foreign_keys = ON` — so every test prospect needs a real
// batch row to hang off.
let batchId: string;

beforeAll(() => {
  batchId = randomUUID();
  db.insert(rvxImportBatches).values({
    id: batchId,
    reportStartDate: new Date("2026-01-01"),
    reportEndDate: new Date("2026-01-31"),
    totalRows: 0,
    importedCount: 0,
    importedBy: MANAGER_ID,
  }).run();
});

afterAll(() => {
  try {
    db.delete(rvxImportBatches).where(eq(rvxImportBatches.id, batchId)).run();
  } catch { /* best effort */ }
});

function createTestProspect(overrides: { email?: string | null; status?: "active" | "graduated" | "unsubscribed" | "rejected" } = {}): string {
  const id = randomUUID();
  db.insert(prospects).values({
    id,
    rvxCustomerId: `RVX-${id.slice(0, 8)}`,
    rvxStoreId: "STORE-01",
    importBatchId: batchId,
    firstName: "BulkTest",
    lastName: "Prospect",
    email: overrides.email ?? null,
    phone: null,
    status: overrides.status ?? "active",
    productsOfInterest: [],
  }).run();
  return id;
}

function cleanupProspects(ids: string[]) {
  if (ids.length === 0) return;
  try {
    db.delete(prospects).where(inArray(prospects.id, ids)).run();
  } catch { /* best effort */ }
}

function cleanupUnsubscribeEmails(emails: string[]) {
  for (const email of emails) {
    try {
      db.delete(unsubscribeList).where(eq(unsubscribeList.email, email)).run();
    } catch { /* best effort */ }
  }
}

describe("Bulk Prospect Operations", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockClear();
  });

  describe("bulkRejectProspects", () => {
    let testIds: string[] = [];

    afterEach(() => {
      cleanupProspects(testIds);
      testIds = [];
    });

    it("returns { ok: 0 } for an empty id list without error", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
      const result = await bulkRejectProspects([]);
      expect(result).toEqual({ ok: 0 });
    });

    it("sets status to rejected for all specified prospects", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
      testIds = [createTestProspect(), createTestProspect(), createTestProspect()];

      const result = await bulkRejectProspects(testIds);

      expect(result.ok).toBe(3);
      expect(result.error).toBeUndefined();
      for (const id of testIds) {
        const row = db.select().from(prospects).where(eq(prospects.id, id)).get();
        expect(row?.status).toBe("rejected");
      }
    });

    it("ignores ids that do not exist and counts only rows actually changed", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
      testIds = [createTestProspect(), createTestProspect()];
      const fakeId = randomUUID();

      const result = await bulkRejectProspects([...testIds, fakeId]);

      // Returns drizzle's `changes` count, not the length of the input list.
      expect(result.ok).toBe(2);
      for (const id of testIds) {
        const row = db.select().from(prospects).where(eq(prospects.id, id)).get();
        expect(row?.status).toBe("rejected");
      }
    });

    it("allows an associate session (requireAuth, not requireManager)", async () => {
      vi.mocked(getServerSession).mockResolvedValue(associateSession as any);
      testIds = [createTestProspect()];

      const result = await bulkRejectProspects(testIds);

      expect(result.ok).toBe(1);
      const row = db.select().from(prospects).where(eq(prospects.id, testIds[0])).get();
      expect(row?.status).toBe("rejected");
    });

    it("rejects unauthenticated requests", async () => {
      vi.mocked(getServerSession).mockResolvedValue(null as any);
      await expect(bulkRejectProspects([randomUUID()])).rejects.toThrow("Not authenticated");
    });
  });

  describe("bulkUnsubscribeProspects", () => {
    let testIds: string[] = [];
    let testEmails: string[] = [];

    afterEach(() => {
      cleanupProspects(testIds);
      cleanupUnsubscribeEmails(testEmails);
      testIds = [];
      testEmails = [];
    });

    it("returns { ok: 0 } for an empty id list", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
      const result = await bulkUnsubscribeProspects([]);
      expect(result).toEqual({ ok: 0 });
    });

    it("sets status to unsubscribed for all specified prospects", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
      const withEmail = createTestProspect({ email: "unsub-014-a@example.com" });
      const withoutEmail = createTestProspect({ email: null });
      testIds = [withEmail, withoutEmail];
      testEmails = ["unsub-014-a@example.com"];

      const result = await bulkUnsubscribeProspects(testIds);

      expect(result.ok).toBe(2);
      for (const id of testIds) {
        const row = db.select().from(prospects).where(eq(prospects.id, id)).get();
        expect(row?.status).toBe("unsubscribed");
      }
    });

    it("inserts into the unsubscribe list for prospects with an email", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
      const email = "unsub-014-b@example.com";
      testIds = [createTestProspect({ email })];
      testEmails = [email];

      await bulkUnsubscribeProspects(testIds);

      const rows = db.select().from(unsubscribeList).where(eq(unsubscribeList.email, email)).all();
      expect(rows.length).toBe(1);
    });

    it("does not insert a duplicate when the email is already unsubscribed", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
      const email = "unsub-014-c@example.com";
      testEmails = [email];
      db.insert(unsubscribeList).values({ id: randomUUID(), email }).run();
      testIds = [createTestProspect({ email })];

      const result = await bulkUnsubscribeProspects(testIds);

      expect(result.ok).toBe(1);
      const rows = db.select().from(unsubscribeList).where(eq(unsubscribeList.email, email)).all();
      expect(rows.length).toBe(1);
    });

    it("skips the unsubscribe-list insert for prospects without an email", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
      testIds = [createTestProspect({ email: null })];

      const before = db.select().from(unsubscribeList).all().length;
      const result = await bulkUnsubscribeProspects(testIds);
      const after = db.select().from(unsubscribeList).all().length;

      expect(result.ok).toBe(1);
      expect(after).toBe(before);
    });

    it("counts only prospects that exist, not the length of the id list", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
      testIds = [createTestProspect({ email: null })];

      const result = await bulkUnsubscribeProspects([...testIds, randomUUID()]);

      expect(result.ok).toBe(1);
    });

    it("handles two prospects sharing one email address", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
      const email = "unsub-014-shared@example.com";
      testEmails = [email];
      testIds = [createTestProspect({ email }), createTestProspect({ email })];

      const result = await bulkUnsubscribeProspects(testIds);

      // unsubscribe_list.email is UNIQUE while prospects.email is not, so the
      // pair must collapse to a single row rather than aborting the batch.
      expect(result.error).toBeUndefined();
      expect(result.ok).toBe(2);
      const rows = db.select().from(unsubscribeList).where(eq(unsubscribeList.email, email)).all();
      expect(rows.length).toBe(1);
    });

    it("allows an associate session (requireAuth, not requireManager)", async () => {
      vi.mocked(getServerSession).mockResolvedValue(associateSession as any);
      testIds = [createTestProspect({ email: null })];

      const result = await bulkUnsubscribeProspects(testIds);

      expect(result.ok).toBe(1);
    });

    it("rejects unauthenticated requests", async () => {
      vi.mocked(getServerSession).mockResolvedValue(null as any);
      await expect(bulkUnsubscribeProspects([randomUUID()])).rejects.toThrow("Not authenticated");
    });
  });
});
