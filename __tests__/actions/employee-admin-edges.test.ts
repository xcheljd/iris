import { vi, describe, it, expect, afterEach, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { activityEvents, clients, employees } from "@/lib/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createEmployee, deactivateEmployee, reorderEmployee, transferClient } from "@/lib/actions";
import { bulkReassignOwner } from "@/lib/actions/bulk-clients";

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const mgr: Session = {
  user: { id: MANAGER_ID, name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};

// Regressions (m5): the create race, reorder over soft-deleted rows,
// deactivate moving clients it never reported, and transfers to employees
// who can no longer work the client.
describe("employee admin edges", () => {
  const employeeIds: string[] = [];
  const clientIds: string[] = [];
  const usernames: string[] = [];

  beforeEach(() => vi.mocked(getServerSession).mockResolvedValue(mgr as never));
  afterEach(() => {
    if (clientIds.length) {
      db.delete(activityEvents).where(inArray(activityEvents.clientId, clientIds)).run();
      db.delete(clients).where(inArray(clients.id, clientIds)).run();
    }
    if (usernames.length) db.delete(employees).where(inArray(employees.username, usernames)).run();
    if (employeeIds.length) db.delete(employees).where(inArray(employees.id, employeeIds)).run();
    employeeIds.length = clientIds.length = usernames.length = 0;
  });

  const addEmployee = (opts: { sortOrder?: number; active?: boolean; deleted?: boolean } = {}) => {
    const id = randomUUID();
    employeeIds.push(id);
    db.insert(employees).values({
      id, name: "Edge", firstName: "Edge", username: `edge-${id}`, passwordHash: "x", role: "associate",
      sortOrder: opts.sortOrder ?? 0, active: opts.active ?? true, deletedAt: opts.deleted ? new Date() : null,
    }).run();
    return id;
  };
  const addClient = (employeeId: string, status: "active" | "banned" = "active") => {
    const id = randomUUID();
    clientIds.push(id);
    db.insert(clients).values({ id, firstName: "Edge", employeeId, status }).run();
    return id;
  };
  const ownerOf = (id: string) => db.select({ e: clients.employeeId }).from(clients).where(eq(clients.id, id)).get()!.e;
  const input = (username: string) => ({ firstName: "Race", lastName: null, username, password: "password123", role: "associate" });

  it("maps a lost create race to the friendly duplicate error", async () => {
    const username = `race_${Date.now()}`;
    usernames.push(username);
    // Both pass the pre-check before either reaches its insert (bcrypt awaits in between).
    const results = await Promise.allSettled([createEmployee(input(username)), createEmployee(input(username))]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    const values = results.map((r) => (r as PromiseFulfilledResult<unknown>).value);
    expect(values).toContainEqual({ success: true });
    expect(values).toContainEqual({ error: "Username already taken" });
  });

  it("treats usernames that differ only in case as taken", async () => {
    const username = `CaseUser_${Date.now()}`;
    usernames.push(username, username.toLowerCase());
    expect(await createEmployee(input(username))).toEqual({ success: true });
    expect(await createEmployee(input(username.toLowerCase()))).toEqual({ error: "Username already taken" });
  });

  it("reorder skips soft-deleted employees", async () => {
    const a = addEmployee({ sortOrder: 900001 });
    addEmployee({ sortOrder: 900002, deleted: true });
    const b = addEmployee({ sortOrder: 900003 });
    expect(await reorderEmployee(a, "down")).toEqual({ success: true });
    const order = (id: string) => db.select({ s: employees.sortOrder }).from(employees).where(eq(employees.id, id)).get()!.s;
    expect(order(b)).toBeLessThan(order(a));
  });

  it("deactivate moves exactly the clients it reports, leaving banned ones", async () => {
    const leaving = addEmployee();
    const active = addClient(leaving);
    const banned = addClient(leaving, "banned");
    expect(await deactivateEmployee(leaving, { clientHandling: "unassign" })).toEqual({ success: true });
    expect(ownerOf(active)).toBeNull();
    expect(ownerOf(banned)).toBe(leaving);
    const events = db.select({ c: activityEvents.clientId }).from(activityEvents)
      .where(sql`${activityEvents.clientId} IN (${active}, ${banned})`).all();
    expect(events.map((e) => e.c)).toEqual([active]);
  });

  it("transfer and bulk reassign reject inactive or deleted targets", async () => {
    const inactive = addEmployee({ active: false });
    const deleted = addEmployee({ active: false, deleted: true });
    const client = addClient(MANAGER_ID);

    expect(await transferClient(client, inactive)).toEqual({ error: "Employee is inactive" });
    expect(await transferClient(client, deleted)).toEqual({ error: "Employee not found" });
    expect(await bulkReassignOwner([client], inactive)).toEqual({ ok: 0, error: "Employee is inactive" });
    expect(await bulkReassignOwner([client], deleted)).toEqual({ ok: 0, error: "Employee not found" });
    expect(ownerOf(client)).toBe(MANAGER_ID);
  });
});
