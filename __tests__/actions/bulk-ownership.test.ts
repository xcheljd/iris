import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({}));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { bulkAddTags, bulkRemoveTags, bulkSetEmailList } from "@/lib/actions/bulk-clients";
import { db } from "@/lib/db";
import { clients, activityEvents, clientTags } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

// Fixture employees from __tests__/setup.ts. The "foreign" client is owned by
// the manager so the associate demonstrably does not own it — the shared setup
// client belongs to the associate and cannot serve that role.
const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23";

const associateSession: Session = {
  user: { id: ASSOCIATE_ID, name: "Test Associate", role: "associate", firstName: "Test", lastName: "Associate" },
  expires: "2099-12-31T23:59:59.000Z",
};
const managerSession: Session = {
  user: { id: MANAGER_ID, name: "Test Manager", role: "manager", firstName: "Test", lastName: "Manager" },
  expires: "2099-12-31T23:59:59.000Z",
};

function insertClient(ownerId: string, status: "active" | "unsubscribed" = "active"): string {
  const id = randomUUID();
  db.insert(clients).values({
    id,
    firstName: "BulkOwnership",
    lastName: "Fixture",
    employeeId: ownerId,
    source: "Walk-in",
    productsOfInterest: [],
    tags: [],
    onEmailList: true,
    status,
  }).run();
  return id;
}

describe("bulk actions honour client ownership", () => {
  let ownId = "";
  let foreignId = "";
  const extraIds: string[] = [];

  beforeEach(() => {
    vi.mocked(getServerSession).mockClear();
    ownId = insertClient(ASSOCIATE_ID);
    foreignId = insertClient(MANAGER_ID);
  });

  afterEach(() => {
    for (const id of [ownId, foreignId, ...extraIds]) {
      try {
        db.delete(activityEvents).where(eq(activityEvents.clientId, id)).run();
        db.delete(clients).where(eq(clients.id, id)).run();
      } catch { /* best effort */ }
    }
    extraIds.length = 0;
  });

  it("bulkAddTags only tags the clients the associate owns", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession);
    const tag = "bulk-ownership-add";
    const result = await bulkAddTags([ownId, foreignId], [tag]);
    expect(result.ok).toBe(1);

    expect(db.select().from(clients).where(eq(clients.id, ownId)).get()?.tags).toContain(tag);
    expect(db.select().from(clients).where(eq(clients.id, foreignId)).get()?.tags).not.toContain(tag);

    db.delete(clientTags).where(eq(clientTags.name, tag)).run();
  });

  it("bulkRemoveTags leaves another employee's client untouched", async () => {
    const tag = "bulk-ownership-remove";
    for (const id of [ownId, foreignId]) {
      db.update(clients).set({ tags: [tag] }).where(eq(clients.id, id)).run();
    }

    vi.mocked(getServerSession).mockResolvedValue(associateSession);
    const result = await bulkRemoveTags([ownId, foreignId], [tag]);
    expect(result.ok).toBe(1);

    expect(db.select().from(clients).where(eq(clients.id, ownId)).get()?.tags).not.toContain(tag);
    expect(db.select().from(clients).where(eq(clients.id, foreignId)).get()?.tags).toContain(tag);

    db.delete(clientTags).where(eq(clientTags.name, tag)).run();
  });

  it("a manager still reaches every client in the selection", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    const tag = "bulk-ownership-manager";
    const result = await bulkAddTags([ownId, foreignId], [tag]);
    expect(result.ok).toBe(2);

    for (const id of [ownId, foreignId]) {
      expect(db.select().from(clients).where(eq(clients.id, id)).get()?.tags).toContain(tag);
    }

    db.delete(clientTags).where(eq(clientTags.name, tag)).run();
  });

  it("bulkSetEmailList skips clients the associate does not own", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession);
    const result = await bulkSetEmailList([ownId, foreignId], false);
    expect(result.ok).toBe(1);

    expect(db.select().from(clients).where(eq(clients.id, ownId)).get()?.onEmailList).toBeFalsy();
    expect(db.select().from(clients).where(eq(clients.id, foreignId)).get()?.onEmailList).toBeTruthy();
  });

  it("bulkSetEmailList does not flip an unsubscribed client", async () => {
    const unsubId = insertClient(ASSOCIATE_ID, "unsubscribed");
    extraIds.push(unsubId);

    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    const result = await bulkSetEmailList([ownId, unsubId], false);
    expect(result.ok).toBe(1);

    const unsub = db.select().from(clients).where(eq(clients.id, unsubId)).get();
    expect(unsub?.onEmailList).toBeTruthy();
    expect(unsub?.status).toBe("unsubscribed");
    expect(db.select().from(clients).where(eq(clients.id, ownId)).get()?.onEmailList).toBeFalsy();
  });
});
