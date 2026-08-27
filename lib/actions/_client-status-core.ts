// Raw ban / unsubscribe / delete DB logic, deliberately NOT a "use server"
// module — each function performs no auth and takes an explicit transaction
// handle so a caller can make the status change part of a larger unit of work
// (see reviewApprovalRequest, which claims the request in the same tx).
// Auth + revalidation live with the callers in ./clients.ts.
import { db } from "@/lib/db";
import { clients, activityEvents, bannedCustomers, unsubscribeList } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

// drizzle better-sqlite3 transaction handle (same shape as `db`).
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbOrTx = typeof db | Tx;

export type StatusChangeResult = { error: string } | undefined;

/**
 * Thrown to unwind a better-sqlite3 transaction when a status change reports a
 * business error. Carries the message so the caller can turn it back into a
 * `{ error }` return instead of a crash.
 */
export class ClientStatusError extends Error {}

/**
 * Run a status change in its own transaction, converting a `{ error }` result
 * into a rollback. Returns the same `{ error }` to the caller.
 */
export function runStatusChange(fn: (tx: Tx) => StatusChangeResult): StatusChangeResult {
  try {
    db.transaction((tx) => {
      const result = fn(tx);
      if (result?.error) throw new ClientStatusError(result.error);
    });
  } catch (err) {
    if (err instanceof ClientStatusError) return { error: err.message };
    throw err;
  }
}

export function applyBanUnchecked(
  tx: DbOrTx,
  clientId: string,
  category: "Reselling" | "Gift Card Fraud" | "Other",
  reason: string,
  employeeId: string,
): StatusChangeResult {
  const c = tx.select({ firstName: clients.firstName, lastName: clients.lastName, email: clients.email, phone: clients.phone })
    .from(clients).where(eq(clients.id, clientId)).get();
  if (!c) return { error: "Client not found" };

  tx.update(clients).set({ status: "banned", updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
  tx.insert(bannedCustomers).values({
    id: randomUUID(),
    customerId: clientId,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    banReasonCategory: category,
    specificBanReason: reason,
  }).run();
  tx.insert(activityEvents).values({
    id: randomUUID(), clientId, eventType: "status_changed", description: `Banned: ${category} — ${reason}`, metadata: { newStatus: "banned" }, employeeId,
  }).run();
}

export function applyUnsubscribeUnchecked(
  tx: DbOrTx,
  clientId: string,
  employeeId: string,
): StatusChangeResult {
  const c = tx.select({ email: clients.email }).from(clients).where(eq(clients.id, clientId)).get();
  if (!c) return { error: "Client not found" };

  tx.update(clients).set({ status: "unsubscribed", onEmailList: false, updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
  if (c.email) {
    const existing = tx.select().from(unsubscribeList).where(eq(unsubscribeList.email, c.email)).get();
    if (!existing) tx.insert(unsubscribeList).values({ id: randomUUID(), email: c.email }).run();
  }
  tx.insert(activityEvents).values({
    id: randomUUID(), clientId, eventType: "status_changed", description: "Unsubscribed", metadata: { newStatus: "unsubscribed" }, employeeId,
  }).run();
}

export function applyDeleteUnchecked(
  tx: DbOrTx,
  clientId: string,
  employeeId: string,
  actorName: string | null | undefined,
): StatusChangeResult {
  const client = tx.select({ status: clients.status }).from(clients).where(eq(clients.id, clientId)).get();
  if (!client) return { error: "Client not found" };
  if (client.status === "deleted") return { error: "Client already deleted" };

  tx.update(clients).set({
    status: "deleted",
    previousStatus: client.status as "active" | "inactive" | "banned" | "unsubscribed",
    deletedAt: new Date(),
    deletedBy: employeeId,
    updatedAt: new Date(),
  }).where(eq(clients.id, clientId)).run();

  tx.insert(activityEvents).values({
    id: randomUUID(),
    clientId,
    eventType: "status_changed",
    description: `Client deleted by ${actorName}`,
    employeeId,
  }).run();
}
