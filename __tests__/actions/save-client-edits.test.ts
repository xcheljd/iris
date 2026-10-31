import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({}));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { saveClientEdits } from "@/lib/actions/clients";
import { db } from "@/lib/db";
import { clients, activityEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

// Both ids are __tests__/setup.ts fixtures. The shared setup client is owned by
// the associate, so it cannot stand in for "a client this associate does not
// own" — each test inserts its own pair with the owner it needs.
const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23";

const managerSession: Session = {
  user: { id: MANAGER_ID, name: "Test Manager", role: "manager", firstName: "Test", lastName: "Manager" },
  expires: "2099-12-31T23:59:59.000Z",
};
const associateSession: Session = {
  user: { id: ASSOCIATE_ID, name: "Test Associate", role: "associate", firstName: "Test", lastName: "Associate" },
  expires: "2099-12-31T23:59:59.000Z",
};

function insertClient(ownerId: string): string {
  const id = randomUUID();
  db.insert(clients).values({
    id,
    firstName: "Patch",
    lastName: "Target",
    employeeId: ownerId,
    source: "Walk-in",
    productsOfInterest: [],
    tags: [],
    onEmailList: false,
    status: "active",
  }).run();
  return id;
}

describe("saveClientEdits", () => {
  let ownId = "";
  let foreignId = "";

  beforeEach(() => {
    vi.mocked(getServerSession).mockClear();
    ownId = insertClient(ASSOCIATE_ID);
    foreignId = insertClient(MANAGER_ID);
  });

  afterEach(() => {
    for (const id of [ownId, foreignId]) {
      try {
        db.delete(activityEvents).where(eq(activityEvents.clientId, id)).run();
        db.delete(clients).where(eq(clients.id, id)).run();
      } catch { /* best effort */ }
    }
  });

  it("lets an associate patch their own client", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession);
    const result = await saveClientEdits(ownId, { firstName: "Renamed" });
    expect(result).toBeUndefined();

    const row = db.select().from(clients).where(eq(clients.id, ownId)).get();
    expect(row?.firstName).toBe("Renamed");
  });

  it("refuses an associate patching another employee's client", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession);
    const result = await saveClientEdits(foreignId, { firstName: "Hijacked" });
    expect(result).toEqual({ error: "Not authorized" });

    const row = db.select().from(clients).where(eq(clients.id, foreignId)).get();
    expect(row?.firstName).toBe("Patch");
  });

  it("lets a manager patch any client", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    const result = await saveClientEdits(ownId, { firstName: "ManagerEdit" });
    expect(result).toBeUndefined();

    const row = db.select().from(clients).where(eq(clients.id, ownId)).get();
    expect(row?.firstName).toBe("ManagerEdit");
  });

  it("strips protected fields not on the patch allowlist", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession);
    const result = await saveClientEdits(ownId, {
      firstName: "Allowed",
      status: "banned",
      employeeId: MANAGER_ID,
      heatScore: 999,
    });
    expect(result).toBeUndefined();

    const row = db.select().from(clients).where(eq(clients.id, ownId)).get();
    expect(row?.firstName).toBe("Allowed");
    expect(row?.status).toBe("active");
    expect(row?.employeeId).toBe(ASSOCIATE_ID);
    expect(row?.heatScore).not.toBe(999);
  });

  it("rejects a payload that fails the patch schema", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession);
    const result = await saveClientEdits(ownId, { email: "not-an-email" });
    expect(result).toEqual({ error: "Invalid request" });

    const row = db.select().from(clients).where(eq(clients.id, ownId)).get();
    expect(row?.email).toBeFalsy();
  });

  it("returns not-found for an unknown client", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession);
    expect(await saveClientEdits("no-such-client", { firstName: "X" })).toEqual({ error: "Client not found" });
  });

  it("throws when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    await expect(saveClientEdits(ownId, { firstName: "Anon" })).rejects.toThrow("Not authenticated");
  });
});
