import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/navigation", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { mergeClients, purgeClient } from "@/lib/actions";
import { db } from "@/lib/db";
import { activityEvents, bannedCustomers, clients } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

// M5: merge and purge ignored banned_customers.customer_id (no FK), so a
// merged-away banned client's ban row pointed at nothing and the winner came
// out active; purge left the ban row dangling. Merging a client with itself
// deleted it as its own "loser".

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206"; // setup.ts
const managerSession: Session = {
  user: { id: MANAGER_ID, name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};

const clientIds: string[] = [];

function createClient(dateAdded: Date, banned = false) {
  const id = randomUUID();
  db.insert(clients).values({
    id, firstName: "Ban", lastName: "Merge", employeeId: MANAGER_ID, dateAdded,
    status: banned ? "banned" : "active",
  }).run();
  if (banned) {
    db.insert(bannedCustomers).values({ id: randomUUID(), customerId: id, firstName: "Ban", lastName: "Merge" }).run();
  }
  clientIds.push(id);
  return id;
}

const banRowsFor = (id: string) => db.select().from(bannedCustomers).where(eq(bannedCustomers.customerId, id)).all();

beforeEach(() => vi.mocked(getServerSession).mockResolvedValue(managerSession));

afterEach(() => {
  db.delete(bannedCustomers).where(inArray(bannedCustomers.customerId, clientIds)).run();
  db.delete(activityEvents).where(inArray(activityEvents.clientId, clientIds)).run();
  db.delete(clients).where(inArray(clients.id, clientIds)).run();
  clientIds.length = 0;
});

describe("mergeClients and bans", () => {
  it("refuses to merge a client with itself", async () => {
    const id = createClient(new Date("2020-01-01"));
    expect(await mergeClients(id, id, {}, null)).toEqual({ error: expect.any(String) });
    expect(db.select().from(clients).where(eq(clients.id, id)).get()).toBeDefined();
  });

  it("moves a banned loser's ban row to the winner and bans the winner", async () => {
    const winnerId = createClient(new Date("2019-01-01"));
    const loserId = createClient(new Date("2023-01-01"), true);

    expect(await mergeClients(winnerId, loserId, {}, null)).toEqual({ winnerId });

    expect(banRowsFor(loserId)).toHaveLength(0);
    expect(banRowsFor(winnerId)).toHaveLength(1);
    expect(db.select().from(clients).where(eq(clients.id, winnerId)).get()!.status).toBe("banned");
  });

  it("keeps a banned winner banned", async () => {
    const winnerId = createClient(new Date("2019-01-01"), true);
    const loserId = createClient(new Date("2023-01-01"));

    await mergeClients(loserId, winnerId, {}, null);

    expect(db.select().from(clients).where(eq(clients.id, winnerId)).get()!.status).toBe("banned");
  });
});

describe("purgeClient and bans", () => {
  it("deletes the purged client's ban rows", async () => {
    const id = createClient(new Date("2020-01-01"), true);
    expect(await purgeClient(id)).toBeUndefined();
    expect(banRowsFor(id)).toHaveLength(0);
  });
});
