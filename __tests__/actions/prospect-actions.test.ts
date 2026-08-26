import { vi, describe, it, expect, afterEach } from "vitest";

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
  importProspectsFromRvx,
  graduateProspect,
  graduateProspectIntoExistingClient,
  rejectProspect,
  unsubscribeProspect,
  analyzeRvxImport,
} from "@/lib/actions";
import { db } from "@/lib/db";
import {
  prospects,
  rvxImportBatches,
  clients,
  activityEvents,
  unsubscribeList,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23";

const managerSession: Session = {
  user: { id: MANAGER_ID, name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};

const associateSession: Session = {
  user: { id: ASSOCIATE_ID, name: "Jordan", role: "associate", firstName: "Jordan", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};

// Minimal valid RVX CSV with 2 unique rows
function buildRvxCsv(dataRows: string[]): string {
  return [
    "SALES BY CUSTOMER",
    "FROM 01/01/25 TO 12/31/25",
    "",
    "STORE #,CUST #,FIRST NAME,LAST NAME,TELEPHONE,EMAIL ADDRESS,TOTAL SALES",
    ...dataRows,
  ].join("\n");
}

const UNIQUE_SUFFIX = Date.now().toString(36);

const SAMPLE_CSV = buildRvxCsv([
  `100,RVX-${UNIQUE_SUFFIX}-A,ProspTest,Alpha,555-0001,prosptest-alpha-${UNIQUE_SUFFIX}@example.com,100.00`,
  `100,RVX-${UNIQUE_SUFFIX}-B,ProspTest,Beta,555-0002,prosptest-beta-${UNIQUE_SUFFIX}@example.com,200.00`,
]);

// Helper to insert a prospect directly for tests that need one to already exist
function insertProspect(overrides: {
  firstName?: string;
  email?: string | null;
  phone?: string | null;
} = {}) {
  const batchId = randomUUID();
  db.insert(rvxImportBatches).values({
    id: batchId,
    reportStartDate: new Date("2025-01-01"),
    reportEndDate: new Date("2025-12-31"),
    totalRows: 1,
    importedCount: 1,
    importedBy: MANAGER_ID,
  }).run();

  const prospectId = randomUUID();
  db.insert(prospects).values({
    id: prospectId,
    rvxCustomerId: `RVX-TEST-${prospectId.slice(0, 8)}`,
    rvxStoreId: "100",
    importBatchId: batchId,
    firstName: overrides.firstName ?? "TestProspect",
    lastName: "Direct",
    phone: overrides.phone ?? null,
    email: overrides.email ?? null,
    productsOfInterest: [],
    status: "active",
  }).run();

  return { prospectId, batchId };
}

describe("importProspectsFromRvx", () => {
  const importedBatchIds: string[] = [];

  afterEach(() => {
    for (const batchId of importedBatchIds) {
      try {
        const prospectRows = db
          .select({ id: prospects.id })
          .from(prospects)
          .where(eq(prospects.importBatchId, batchId))
          .all();
        for (const p of prospectRows) {
          db.delete(activityEvents).where(eq(activityEvents.clientId, p.id)).run();
          db.delete(prospects).where(eq(prospects.id, p.id)).run();
        }
        db.delete(rvxImportBatches).where(eq(rvxImportBatches.id, batchId)).run();
      } catch {}
    }
    importedBatchIds.length = 0;
  });

  it("inserts a rvxImportBatch record", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    const suffix = randomUUID().slice(0, 8);
    const csv = buildRvxCsv([
      `100,RVX-BATCH-${suffix},BatchTest,Import,,,100.00`,
    ]);
    await importProspectsFromRvx(csv);

    const batches = db
      .select()
      .from(rvxImportBatches)
      .where(eq(rvxImportBatches.importedBy, MANAGER_ID))
      .all();
    const batch = batches.find((b) => b.importedCount === 1);
    expect(batch).toBeDefined();
    if (batch) importedBatchIds.push(batch.id);
  });

  it("returns correct importedCount", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    const suffix = randomUUID().slice(0, 8);
    const csv = buildRvxCsv([
      `100,RVX-${suffix}-1,RetCount,One,,,`,
      `100,RVX-${suffix}-2,RetCount,Two,,,`,
    ]);
    const result1 = await importProspectsFromRvx(csv);
    if ("error" in result1) throw new Error(result1.error);
    expect(result1.importedCount).toBe(2);

    const batches = db
      .select()
      .from(rvxImportBatches)
      .where(eq(rvxImportBatches.importedBy, MANAGER_ID))
      .all();
    const batch = batches.find((b) => b.importedCount === 2);
    if (batch) importedBatchIds.push(batch.id);
  });

  it("deduplicates within-import duplicate rows", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    const suffix = randomUUID().slice(0, 8);
    const csv = buildRvxCsv([
      `100,RVX-${suffix}-1,Dedupe,Test,5559999${suffix.slice(0,4)},dedupe-${suffix}@example.com,100.00`,
      `100,RVX-${suffix}-2,dedupe,test,5559999${suffix.slice(0,4)},dedupe-${suffix}@example.com,50.00`,
    ]);
    const result2 = await importProspectsFromRvx(csv);
    if ("error" in result2) throw new Error(result2.error);
    expect(result2.importedCount).toBe(1);

    const batches = db
      .select()
      .from(rvxImportBatches)
      .where(eq(rvxImportBatches.importedBy, MANAGER_ID))
      .all();
    const batch = batches.find((b) => b.importedCount === 1 && b.totalRows === 2);
    if (batch) importedBatchIds.push(batch.id);
  });

  it("throws when associate calls it", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession);
    await expect(importProspectsFromRvx(SAMPLE_CSV)).rejects.toThrow();
  });
});

describe("analyzeRvxImport", () => {
  it("returns correct counts for a clean CSV", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    const suffix = randomUUID().slice(0, 8);
    const csv = buildRvxCsv([
      `100,RVX-ANA-${suffix},AnalyzeTest,One,,,`,
      `100,RVX-ANA-${suffix}B,AnalyzeTest,Two,,,`,
    ]);
    const result3 = await analyzeRvxImport(csv);
    if ("error" in result3) throw new Error(result3.error);
    expect(result3.newCount).toBeGreaterThanOrEqual(2);
    expect(result3.duplicateCount).toBe(0);
    expect(result3.parseErrors).toHaveLength(0);
  });

  it("reports duplicate count for within-import duplicates", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    const suffix = randomUUID().slice(0, 8);
    const csv = buildRvxCsv([
      `100,RVX-DUP1-${suffix},DupAnalyze,Test,555${suffix.slice(0,7)},dup-${suffix}@example.com,100.00`,
      `100,RVX-DUP2-${suffix},dupanalyze,test,555${suffix.slice(0,7)},dup-${suffix}@example.com,50.00`,
    ]);
    const result4 = await analyzeRvxImport(csv);
    if ("error" in result4) throw new Error(result4.error);
    expect(result4.duplicateCount).toBe(2);
    expect(result4.newCount).toBe(1); // best record selected
  });

  it("throws when associate calls it", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession);
    await expect(analyzeRvxImport(SAMPLE_CSV)).rejects.toThrow();
  });
});

describe("graduateProspect", () => {
  const createdProspectIds: string[] = [];
  const createdClientIds: string[] = [];
  const createdBatchIds: string[] = [];

  afterEach(() => {
    for (const id of createdClientIds) {
      try {
        db.delete(activityEvents).where(eq(activityEvents.clientId, id)).run();
        db.delete(clients).where(eq(clients.id, id)).run();
      } catch {}
    }
    createdClientIds.length = 0;

    for (const id of createdProspectIds) {
      try {
        db.delete(prospects).where(eq(prospects.id, id)).run();
      } catch {}
    }
    createdProspectIds.length = 0;

    for (const id of createdBatchIds) {
      try {
        db.delete(rvxImportBatches).where(eq(rvxImportBatches.id, id)).run();
      } catch {}
    }
    createdBatchIds.length = 0;
  });

  it("creates a new client and returns type=created", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    const { prospectId, batchId } = insertProspect({ firstName: "GradTest" });
    createdProspectIds.push(prospectId);
    createdBatchIds.push(batchId);

    const result = await graduateProspect({
      prospectId,
      firstName: "GradTest",
      lastName: "Graduate",
      preferredContact: "call",
      productsOfInterest: [],
    });

    expect(result.type).toBe("created");
    if (result.type === "created") {
      createdClientIds.push(result.clientId);
      const client = db.select().from(clients).where(eq(clients.id, result.clientId)).get();
      expect(client).toBeDefined();
      expect(client!.firstName).toBe("GradTest");
      expect(client!.source).toBe("Customer Report");
    }
  });

  it("sets the prospect status to graduated after graduation", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    const { prospectId, batchId } = insertProspect({ firstName: "GradStatus" });
    createdProspectIds.push(prospectId);
    createdBatchIds.push(batchId);

    const result = await graduateProspect({ prospectId, firstName: "GradStatus", lastName: "T", preferredContact: "call", productsOfInterest: [] });
    if (result.type === "created") createdClientIds.push(result.clientId);

    const prospect = db.select().from(prospects).where(eq(prospects.id, prospectId)).get();
    expect(prospect!.status).toBe("graduated");
    expect(prospect!.graduatedToClientId).not.toBeNull();
  });

  it("logs a 'created' activity event on the new client", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    const { prospectId, batchId } = insertProspect({ firstName: "GradEvent" });
    createdProspectIds.push(prospectId);
    createdBatchIds.push(batchId);

    const result = await graduateProspect({ prospectId, firstName: "GradEvent", lastName: "T", preferredContact: "call", productsOfInterest: [] });
    expect(result.type).toBe("created");
    if (result.type === "created") {
      createdClientIds.push(result.clientId);
      const events = db
        .select()
        .from(activityEvents)
        .where(eq(activityEvents.clientId, result.clientId))
        .all();
      const event = events.find((e) => e.eventType === "created");
      expect(event).toBeDefined();
      expect(event!.metadata?.source).toBe("prospect_graduation");
    }
  });

  it("returns type=duplicate when email matches an existing client", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    const uniqueEmail = `grad-dup-${randomUUID().slice(0, 8)}@example.com`;

    // Create an existing client with the same email
    const existingClientId = randomUUID();
    db.insert(clients).values({
      id: existingClientId,
      firstName: "Existing",
      email: uniqueEmail,
      source: "Walk-in",
      status: "active",
      onEmailList: false,
      dateAdded: new Date(),
      productsOfInterest: [],
      tags: [],
    }).run();
    createdClientIds.push(existingClientId);

    const { prospectId, batchId } = insertProspect({ email: uniqueEmail });
    createdProspectIds.push(prospectId);
    createdBatchIds.push(batchId);

    const result = await graduateProspect({
      prospectId,
      firstName: "DupGrad",
      lastName: "T",
      preferredContact: "call",
      email: uniqueEmail,
      productsOfInterest: [],
    });

    expect(result.type).toBe("duplicate");
    if (result.type === "duplicate") {
      expect(result.existingClientId).toBe(existingClientId);
      expect(result.existingClientName).toContain("Existing");
    }
  });

  it("returns type=duplicate when phone matches an existing client", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    const uniquePhone = `555${randomUUID().replace(/-/g, "").slice(0, 7)}`;

    const existingClientId = randomUUID();
    db.insert(clients).values({
      id: existingClientId,
      firstName: "PhoneMatch",
      phone: uniquePhone,
      source: "Walk-in",
      status: "active",
      onEmailList: false,
      dateAdded: new Date(),
      productsOfInterest: [],
      tags: [],
    }).run();
    createdClientIds.push(existingClientId);

    const { prospectId, batchId } = insertProspect({ phone: uniquePhone });
    createdProspectIds.push(prospectId);
    createdBatchIds.push(batchId);

    const result = await graduateProspect({
      prospectId,
      firstName: "PhoneGrad",
      lastName: "T",
      preferredContact: "call",
      phone: uniquePhone,
      productsOfInterest: [],
    });

    expect(result.type).toBe("duplicate");
  });

  it("returns error when prospect does not exist", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    const result = await graduateProspect({
      prospectId: "00000000-0000-0000-0000-000000000000",
      firstName: "Ghost",
      lastName: "T",
      preferredContact: "call",
      productsOfInterest: [],
    });
    expect(result).toEqual({ type: "error", error: "Prospect not found" });
  });

  it("returns error when prospect is not active", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    const { prospectId, batchId } = insertProspect({ firstName: "Rejected" });
    createdProspectIds.push(prospectId);
    createdBatchIds.push(batchId);

    // First graduate it, then try again
    const result = await graduateProspect({ prospectId, firstName: "Rejected", lastName: "T", preferredContact: "call", productsOfInterest: [] });
    if (result.type === "created") createdClientIds.push(result.clientId);

    const result2 = await graduateProspect({ prospectId, firstName: "Rejected", lastName: "T", preferredContact: "call", productsOfInterest: [] });
    expect(result2).toEqual({ type: "error", error: "Prospect is not active" });
  });

  it("associates can graduate prospects", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession);
    const { prospectId, batchId } = insertProspect({ firstName: "AssocGrad" });
    createdProspectIds.push(prospectId);
    createdBatchIds.push(batchId);

    const result = await graduateProspect({ prospectId, firstName: "AssocGrad", lastName: "T", preferredContact: "call", productsOfInterest: [] });
    expect(result.type).toBe("created");
    if (result.type === "created") createdClientIds.push(result.clientId);
  });
});

describe("graduateProspectIntoExistingClient", () => {
  const createdProspectIds: string[] = [];
  const createdClientIds: string[] = [];
  const createdBatchIds: string[] = [];

  afterEach(() => {
    for (const id of createdClientIds) {
      try {
        db.delete(activityEvents).where(eq(activityEvents.clientId, id)).run();
        db.delete(clients).where(eq(clients.id, id)).run();
      } catch {}
    }
    createdClientIds.length = 0;

    for (const id of createdProspectIds) {
      try {
        db.delete(prospects).where(eq(prospects.id, id)).run();
      } catch {}
    }
    createdProspectIds.length = 0;

    for (const id of createdBatchIds) {
      try {
        db.delete(rvxImportBatches).where(eq(rvxImportBatches.id, id)).run();
      } catch {}
    }
    createdBatchIds.length = 0;
  });

  it("sets prospect status to graduated with the existing client's ID", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);

    const existingClientId = randomUUID();
    db.insert(clients).values({
      id: existingClientId,
      firstName: "Existing",
      source: "Walk-in",
      status: "active",
      onEmailList: false,
      dateAdded: new Date(),
      productsOfInterest: [],
      tags: [],
    }).run();
    createdClientIds.push(existingClientId);

    const { prospectId, batchId } = insertProspect({ firstName: "Merge" });
    createdProspectIds.push(prospectId);
    createdBatchIds.push(batchId);

    await graduateProspectIntoExistingClient(prospectId, existingClientId, {});

    const prospect = db.select().from(prospects).where(eq(prospects.id, prospectId)).get();
    expect(prospect!.status).toBe("graduated");
    expect(prospect!.graduatedToClientId).toBe(existingClientId);
  });

  it("backfills only null fields on the existing client", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);

    const existingClientId = randomUUID();
    db.insert(clients).values({
      id: existingClientId,
      firstName: "ExistingFilled",
      phone: null,       // empty — should be backfilled
      email: "existing@example.com",  // has value — should NOT be overwritten
      source: "Walk-in",
      status: "active",
      onEmailList: false,
      dateAdded: new Date(),
      productsOfInterest: [],
      tags: [],
    }).run();
    createdClientIds.push(existingClientId);

    const { prospectId, batchId } = insertProspect({ firstName: "Enrichment" });
    createdProspectIds.push(prospectId);
    createdBatchIds.push(batchId);

    await graduateProspectIntoExistingClient(prospectId, existingClientId, {
      phone: "5551234567",
      email: "should-not-overwrite@example.com",
    });

    const updated = db.select().from(clients).where(eq(clients.id, existingClientId)).get();
    expect(updated!.phone).toBe("5551234567");           // backfilled
    expect(updated!.email).toBe("existing@example.com"); // preserved
  });

  it("logs a 'created' activity event on the existing client", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);

    const existingClientId = randomUUID();
    db.insert(clients).values({
      id: existingClientId,
      firstName: "EventClient",
      source: "Walk-in",
      status: "active",
      onEmailList: false,
      dateAdded: new Date(),
      productsOfInterest: [],
      tags: [],
    }).run();
    createdClientIds.push(existingClientId);

    const { prospectId, batchId } = insertProspect({ firstName: "EventProspect" });
    createdProspectIds.push(prospectId);
    createdBatchIds.push(batchId);

    await graduateProspectIntoExistingClient(prospectId, existingClientId, {});

    const events = db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.clientId, existingClientId))
      .all();
    const event = events.find(
      (e) => e.eventType === "edited" && e.metadata?.source === "prospect_graduation"
    );
    expect(event).toBeDefined();
  });

  it("returns an error when prospect does not exist", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    const result = await graduateProspectIntoExistingClient("00000000-0000-0000-0000-000000000000", "00000000-0000-0000-0000-000000000001", {});
    expect(result?.error).toBe("Prospect not found");
  });
});

describe("rejectProspect", () => {
  const createdProspectIds: string[] = [];
  const createdBatchIds: string[] = [];
  const createdClientIds: string[] = [];

  afterEach(() => {
    // Prospects first — `graduated_to_client_id` is an FK into clients.
    for (const id of createdProspectIds) {
      try {
        db.delete(prospects).where(eq(prospects.id, id)).run();
      } catch {}
    }
    createdProspectIds.length = 0;
    for (const id of createdClientIds) {
      try {
        db.delete(activityEvents).where(eq(activityEvents.clientId, id)).run();
        db.delete(clients).where(eq(clients.id, id)).run();
      } catch {}
    }
    createdClientIds.length = 0;
    for (const id of createdBatchIds) {
      try {
        db.delete(rvxImportBatches).where(eq(rvxImportBatches.id, id)).run();
      } catch {}
    }
    createdBatchIds.length = 0;
  });

  it("sets prospect status to rejected", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    const { prospectId, batchId } = insertProspect({ firstName: "ToReject" });
    createdProspectIds.push(prospectId);
    createdBatchIds.push(batchId);

    await rejectProspect(prospectId);

    const prospect = db.select().from(prospects).where(eq(prospects.id, prospectId)).get();
    expect(prospect!.status).toBe("rejected");
  });

  it("associates can reject prospects", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession);
    const { prospectId, batchId } = insertProspect({ firstName: "AssocReject" });
    createdProspectIds.push(prospectId);
    createdBatchIds.push(batchId);

    await rejectProspect(prospectId);

    const prospect = db.select().from(prospects).where(eq(prospects.id, prospectId)).get();
    expect(prospect!.status).toBe("rejected");
  });

  it("throws when not authenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const { prospectId, batchId } = insertProspect();
    createdProspectIds.push(prospectId);
    createdBatchIds.push(batchId);
    await expect(rejectProspect(prospectId)).rejects.toThrow();
  });

  it("refuses to reject a graduated prospect, leaving status and link intact", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    const { prospectId, batchId } = insertProspect({ firstName: "AlreadyGrad" });
    createdProspectIds.push(prospectId);
    createdBatchIds.push(batchId);

    const linkedClientId = randomUUID();
    db.insert(clients).values({
      id: linkedClientId,
      firstName: "GradTarget",
      source: "Walk-in",
      status: "active",
      onEmailList: false,
      dateAdded: new Date(),
      productsOfInterest: [],
      tags: [],
    }).run();
    createdClientIds.push(linkedClientId);

    db.update(prospects)
      .set({ status: "graduated", graduatedToClientId: linkedClientId })
      .where(eq(prospects.id, prospectId))
      .run();

    const result = await rejectProspect(prospectId);

    expect(result?.error).toBe("Cannot reject a prospect that is not active");
    const prospect = db.select().from(prospects).where(eq(prospects.id, prospectId)).get();
    expect(prospect!.status).toBe("graduated");
    expect(prospect!.graduatedToClientId).toBe(linkedClientId);
  });
});

describe("unsubscribeProspect", () => {
  const createdProspectIds: string[] = [];
  const createdBatchIds: string[] = [];
  const createdUnsubEmails: string[] = [];

  afterEach(() => {
    for (const email of createdUnsubEmails) {
      try {
        db.delete(unsubscribeList).where(eq(unsubscribeList.email, email)).run();
      } catch {}
    }
    createdUnsubEmails.length = 0;

    for (const id of createdProspectIds) {
      try {
        db.delete(prospects).where(eq(prospects.id, id)).run();
      } catch {}
    }
    createdProspectIds.length = 0;

    for (const id of createdBatchIds) {
      try {
        db.delete(rvxImportBatches).where(eq(rvxImportBatches.id, id)).run();
      } catch {}
    }
    createdBatchIds.length = 0;
  });

  it("sets prospect status to unsubscribed", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession);
    const { prospectId, batchId } = insertProspect({ firstName: "ToUnsub" });
    createdProspectIds.push(prospectId);
    createdBatchIds.push(batchId);

    await unsubscribeProspect(prospectId);

    const prospect = db.select().from(prospects).where(eq(prospects.id, prospectId)).get();
    expect(prospect!.status).toBe("unsubscribed");
  });

  it("inserts the prospect's email into unsubscribeList", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    const email = `unsub-prospect-${randomUUID().slice(0, 8)}@example.com`;
    const { prospectId, batchId } = insertProspect({ firstName: "EmailUnsub", email });
    createdProspectIds.push(prospectId);
    createdBatchIds.push(batchId);
    createdUnsubEmails.push(email);

    await unsubscribeProspect(prospectId);

    const unsubRow = db
      .select()
      .from(unsubscribeList)
      .where(eq(unsubscribeList.email, email))
      .get();
    expect(unsubRow).toBeDefined();
  });

  it("does not insert a duplicate unsubscribe entry", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    const email = `unsub-nodup-${randomUUID().slice(0, 8)}@example.com`;
    const { prospectId, batchId } = insertProspect({ firstName: "NoDup", email });
    createdProspectIds.push(prospectId);
    createdBatchIds.push(batchId);
    createdUnsubEmails.push(email);

    // Pre-insert into unsubscribe list
    const existingId = randomUUID();
    db.insert(unsubscribeList).values({ id: existingId, email }).run();

    await unsubscribeProspect(prospectId); // should not throw

    const rows = db
      .select()
      .from(unsubscribeList)
      .where(eq(unsubscribeList.email, email))
      .all();
    expect(rows).toHaveLength(1); // still just one entry
  });

  it("unsubscribes a prospect with no email without error", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    const { prospectId, batchId } = insertProspect({ firstName: "NoEmail", email: null });
    createdProspectIds.push(prospectId);
    createdBatchIds.push(batchId);

    await expect(unsubscribeProspect(prospectId)).resolves.not.toThrow();

    const prospect = db.select().from(prospects).where(eq(prospects.id, prospectId)).get();
    expect(prospect!.status).toBe("unsubscribed");
  });

  it("returns an error when prospect does not exist", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    const result = await unsubscribeProspect("00000000-0000-0000-0000-000000000000");
    expect(result?.error).toBe("Prospect not found");
  });

  it("errors on a second unsubscribe instead of re-writing the terminal state", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    const email = `unsub-twice-${randomUUID().slice(0, 8)}@example.com`;
    const { prospectId, batchId } = insertProspect({ firstName: "Twice", email });
    createdProspectIds.push(prospectId);
    createdBatchIds.push(batchId);
    createdUnsubEmails.push(email);

    expect(await unsubscribeProspect(prospectId)).toBeUndefined();
    const first = db.select().from(prospects).where(eq(prospects.id, prospectId)).get();

    const second = await unsubscribeProspect(prospectId);

    expect(second?.error).toBe("Cannot unsubscribe a prospect that is not active");
    const after = db.select().from(prospects).where(eq(prospects.id, prospectId)).get();
    expect(after!.updatedAt).toEqual(first!.updatedAt);
    expect(
      db.select().from(unsubscribeList).where(eq(unsubscribeList.email, email)).all(),
    ).toHaveLength(1);
  });
});
