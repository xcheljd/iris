import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { bannedCustomers, clients, employees, outreachLogs, unsubscribeList } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getStats } from "@/lib/queries";

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";

// Regression (m4): an associate's banned/unsubscribed counts were the whole
// store's lists (walk-ins and duplicate bans included), and outreach was
// scoped by logger while clients/follow-ups were scoped by owner.
describe("getStats owner scoping", () => {
  const ids = { employees: [] as string[], clients: [] as string[], bans: [] as string[], unsubs: [] as string[], logs: [] as string[] };

  afterEach(() => {
    if (ids.logs.length) db.delete(outreachLogs).where(inArray(outreachLogs.id, ids.logs)).run();
    if (ids.bans.length) db.delete(bannedCustomers).where(inArray(bannedCustomers.id, ids.bans)).run();
    if (ids.unsubs.length) db.delete(unsubscribeList).where(inArray(unsubscribeList.id, ids.unsubs)).run();
    for (const id of ids.clients) db.delete(clients).where(eq(clients.id, id)).run();
    for (const id of ids.employees) db.delete(employees).where(eq(employees.id, id)).run();
    for (const list of Object.values(ids)) list.length = 0;
  });

  it("an associate sees only their own book; the store view stays store-wide", async () => {
    const ts = Date.now();
    const assoc = randomUUID();
    ids.employees.push(assoc);
    db.insert(employees).values({
      id: assoc, name: `Stats${ts}`, firstName: `Stats${ts}`, username: `stats-${ts}`,
      passwordHash: "x", role: "associate",
    }).run();

    const mine = randomUUID();
    const theirs = randomUUID();
    ids.clients.push(mine, theirs);
    db.insert(clients).values({ id: mine, firstName: "Mine", employeeId: assoc, email: `Mine-${ts}@x.com` }).run();
    db.insert(clients).values({ id: theirs, firstName: "Theirs", employeeId: MANAGER_ID, email: `theirs-${ts}@x.com` }).run();

    const ban = (customerId: string | null) => {
      const id = randomUUID();
      ids.bans.push(id);
      db.insert(bannedCustomers).values({ id, customerId, firstName: "B" }).run();
    };
    ban(mine);
    ban(mine); // duplicate ban row for the same client
    ban(null); // walk-in, no client
    ban(theirs);

    const unsub = (email: string) => {
      const id = randomUUID();
      ids.unsubs.push(id);
      db.insert(unsubscribeList).values({ id, email }).run();
    };
    unsub(`mine-${ts}@x.com`); // case differs from the client's address
    unsub(`walkin-${ts}@x.com`);
    unsub(`theirs-${ts}@x.com`);

    const logPurchase = (clientId: string, employeeId: string) => {
      const id = randomUUID();
      ids.logs.push(id);
      db.insert(outreachLogs).values({ id, clientId, employeeId, method: "call", outcome: "purchased" }).run();
    };
    logPurchase(mine, MANAGER_ID); // someone else logged it, but it's my client
    logPurchase(theirs, assoc); // I logged it, but it's not my client

    const scoped = await getStats(assoc);
    expect(scoped).toMatchObject({
      total: 1, banned: 1, unsubscribed: 1, outreachWeek: 1, purchasesWeek: 1,
    });

    const store = await getStats();
    expect(store.banned).toBeGreaterThanOrEqual(4);
    expect(store.unsubscribed).toBeGreaterThanOrEqual(3);
    expect(store.outreachWeek).toBeGreaterThanOrEqual(2);
  });
});
