import { vi, describe, it, expect, afterEach } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { transferClient, mergeClients } from "@/lib/actions";
import { db } from "@/lib/db";
import { clients, activityEvents, outreachLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23";
const FIRST_CLIENT_ID = "e18e3ba8-b3b1-4bc1-b0f2-f13a219dd30b";

const managerSession = {
  user: { id: MANAGER_ID, name: "Marcus", role: "manager" },
};

const associateSession = {
  user: { id: ASSOCIATE_ID, name: "Jordan", role: "associate" },
};

function createTestClient(overrides: { firstName?: string; lastName?: string; email?: string | null; phone?: string | null; dateAdded?: Date } = {}) {
  const id = randomUUID();
  db.insert(clients).values({
    id,
    firstName: overrides.firstName ?? "Test",
    lastName: overrides.lastName ?? "Client",
    email: overrides.email ?? null,
    phone: overrides.phone ?? null,
    source: "Walk-in",
    status: "active",
    onEmailList: false,
    dateAdded: overrides.dateAdded ?? new Date(),
    productsOfInterest: [],
    tags: [],
  }).run();
  return id;
}

describe("transferClient", () => {
  const createdClientIds: string[] = [];

  afterEach(() => {
    for (const id of createdClientIds) {
      try {
        db.delete(activityEvents).where(eq(activityEvents.clientId, id)).run();
        db.delete(clients).where(eq(clients.id, id)).run();
      } catch {}
    }
    createdClientIds.length = 0;

    // Restore seed client's original employeeId (Marcus = MANAGER_ID)
    try {
      db.update(clients)
        .set({ employeeId: MANAGER_ID, updatedAt: new Date() })
        .where(eq(clients.id, FIRST_CLIENT_ID))
        .run();
      db.delete(activityEvents)
        .where(eq(activityEvents.clientId, FIRST_CLIENT_ID))
        .run();
    } catch {}
  });

  it("updates the client's employeeId to the new employee", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
    await transferClient(FIRST_CLIENT_ID, ASSOCIATE_ID);

    const client = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
    expect(client!.employeeId).toBe(ASSOCIATE_ID);
  });

  it("logs a 'transferred' activity event", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
    await transferClient(FIRST_CLIENT_ID, ASSOCIATE_ID);

    const events = db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.clientId, FIRST_CLIENT_ID))
      .all();
    const event = events.find((e) => e.eventType === "transferred");
    expect(event).toBeDefined();
    expect(event!.description).toContain("Transferred to");
  });

  it("event metadata includes new employee name", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
    await transferClient(FIRST_CLIENT_ID, ASSOCIATE_ID);

    const events = db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.clientId, FIRST_CLIENT_ID))
      .all();
    const event = events.find((e) => e.eventType === "transferred");
    expect((event!.metadata as any)?.newEmployeeName).toBeTruthy();
  });

  it("returns an error when client does not exist", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
    const result = await transferClient("00000000-0000-0000-0000-000000000000", ASSOCIATE_ID);
    expect((result as any)?.error).toBe("Client not found");
  });

  it("returns an error when new employee does not exist", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
    const result = await transferClient(FIRST_CLIENT_ID, "00000000-0000-0000-0000-000000000000");
    expect((result as any)?.error).toBe("Employee not found");
  });

  it("throws when associate calls it", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession as any);
    await expect(transferClient(FIRST_CLIENT_ID, ASSOCIATE_ID)).rejects.toThrow();
  });
});

describe("mergeClients", () => {
  const createdClientIds: string[] = [];

  afterEach(() => {
    for (const id of createdClientIds) {
      try {
        db.delete(activityEvents).where(eq(activityEvents.clientId, id)).run();
        db.delete(outreachLogs).where(eq(outreachLogs.clientId, id)).run();
        db.delete(clients).where(eq(clients.id, id)).run();
      } catch {}
    }
    createdClientIds.length = 0;
  });

  it("returns the winner's ID", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
    const olderId = createTestClient({ firstName: "Older", dateAdded: new Date("2020-01-01") });
    const newerId = createTestClient({ firstName: "Newer", dateAdded: new Date("2022-01-01") });
    createdClientIds.push(olderId, newerId);

    const { winnerId } = await mergeClients(olderId, newerId, {}, null) as { winnerId: string };
    expect(winnerId).toBe(olderId);
    createdClientIds.splice(createdClientIds.indexOf(newerId), 1); // loser was deleted
  });

  it("the older client (by dateAdded) survives", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
    const olderId = createTestClient({ firstName: "Older", dateAdded: new Date("2019-06-01") });
    const newerId = createTestClient({ firstName: "Newer", dateAdded: new Date("2023-06-01") });
    createdClientIds.push(olderId, newerId);

    await mergeClients(olderId, newerId, {}, null);

    const winner = db.select().from(clients).where(eq(clients.id, olderId)).get();
    const loser = db.select().from(clients).where(eq(clients.id, newerId)).get();
    expect(winner).toBeDefined();
    expect(loser).toBeUndefined();
    createdClientIds.splice(createdClientIds.indexOf(newerId), 1);
  });

  it("respects fieldChoices to pick fields from client B", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
    const aId = createTestClient({ firstName: "Alice", phone: "1111111111", dateAdded: new Date("2019-01-01") });
    const bId = createTestClient({ firstName: "Alicia", phone: "2222222222", dateAdded: new Date("2022-01-01") });
    createdClientIds.push(aId, bId);

    const { winnerId } = await mergeClients(aId, bId, { firstName: "b", phone: "b" }, null) as { winnerId: string };
    createdClientIds.splice(createdClientIds.indexOf(bId), 1);

    const winner = db.select().from(clients).where(eq(clients.id, winnerId)).get();
    expect(winner!.firstName).toBe("Alicia");
    expect(winner!.phone).toBe("2222222222");
  });

  it("logs a 'merged' activity event on the winner", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
    const aId = createTestClient({ firstName: "Alpha", dateAdded: new Date("2019-01-01") });
    const bId = createTestClient({ firstName: "Beta", dateAdded: new Date("2022-01-01") });
    createdClientIds.push(aId, bId);

    const { winnerId } = await mergeClients(aId, bId, {}, null) as { winnerId: string };
    createdClientIds.splice(createdClientIds.indexOf(bId), 1);

    const events = db.select().from(activityEvents).where(eq(activityEvents.clientId, winnerId)).all();
    const mergeEvent = events.find((e) => e.eventType === "merged");
    expect(mergeEvent).toBeDefined();
    expect(mergeEvent!.description).toContain("Merged from");
  });

  it("merges productsOfInterest from both clients into a union", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
    const aId = createTestClient({ firstName: "A", dateAdded: new Date("2019-01-01") });
    const bId = createTestClient({ firstName: "B", dateAdded: new Date("2022-01-01") });
    createdClientIds.push(aId, bId);

    db.update(clients).set({ productsOfInterest: [{ model: "SKU-001", collection: null }] }).where(eq(clients.id, aId)).run();
    db.update(clients).set({ productsOfInterest: [{ model: "SKU-002", collection: null }] }).where(eq(clients.id, bId)).run();

    const { winnerId } = await mergeClients(aId, bId, {}, null) as { winnerId: string };
    createdClientIds.splice(createdClientIds.indexOf(bId), 1);

    const winner = db.select().from(clients).where(eq(clients.id, winnerId)).get();
    const winnerModels = (winner!.productsOfInterest ?? []).map((p) => p.model);
    expect(winnerModels).toContain("SKU-001");
    expect(winnerModels).toContain("SKU-002");
  });

  it("uses finalNotes as the winner's notes", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
    const aId = createTestClient({ firstName: "A", dateAdded: new Date("2019-01-01") });
    const bId = createTestClient({ firstName: "B", dateAdded: new Date("2022-01-01") });
    createdClientIds.push(aId, bId);

    const { winnerId } = await mergeClients(aId, bId, {}, "Merged notes here") as { winnerId: string };
    createdClientIds.splice(createdClientIds.indexOf(bId), 1);

    const winner = db.select().from(clients).where(eq(clients.id, winnerId)).get();
    expect(winner!.notes).toBe("Merged notes here");
  });

  it("returns an error when either client does not exist", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
    const validId = createTestClient({ firstName: "Valid" });
    createdClientIds.push(validId);

    const result = await mergeClients(validId, "00000000-0000-0000-0000-000000000000", {}, null);
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toBe("Client not found");
  });

  it("throws when associate calls it", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession as any);
    const aId = createTestClient({ firstName: "A" });
    const bId = createTestClient({ firstName: "B" });
    createdClientIds.push(aId, bId);

    await expect(mergeClients(aId, bId, {}, null)).rejects.toThrow();
  });

  it("rolls back both clients when the transaction fails mid-merge", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
    const aId = createTestClient({ firstName: "TxWinner", dateAdded: new Date("2019-01-01") });
    const bId = createTestClient({ firstName: "TxLoser", dateAdded: new Date("2022-01-01") });
    createdClientIds.push(aId, bId);

    // Spy on db.transaction: run the real callback (so all updates execute),
    // then throw after it returns — better-sqlite3 rolls back the whole transaction.
    const realTransaction = (db.transaction as Function).bind(db);
    vi.spyOn(db, "transaction").mockImplementationOnce((fn: unknown) => {
      return realTransaction((tx: unknown) => {
        (fn as Function)(tx);
        throw new Error("Simulated post-callback failure");
      });
    });

    // Choosing firstName from B makes the update visible; rollback must revert it.
    await expect(mergeClients(aId, bId, { firstName: "b" }, null)).rejects.toThrow("Simulated post-callback failure");

    const a = db.select().from(clients).where(eq(clients.id, aId)).get();
    const b = db.select().from(clients).where(eq(clients.id, bId)).get();
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a!.firstName).toBe("TxWinner"); // winner's profile was not permanently changed
  });
});
