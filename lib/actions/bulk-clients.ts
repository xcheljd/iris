"use server";

import { db } from "@/lib/db";
import { clients, activityEvents, bannedCustomers, unsubscribeList, clientTags } from "@/lib/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { requireAuth, requireManager } from "./_shared";

interface BulkResult {
  ok: number;
  /** Optional error if the whole operation failed. */
  error?: string;
}

/* -------------------------------------------------------------------------- */
/* Shared transaction wrapper                                                  */
/*                                                                            */
/* Every bulk action below follows the same shape:                            */
/*   1. early-return on empty id list                                         */
/*   2. open a transaction                                                    */
/*   3. mutate                                                                */
/*   4. catch + return error                                                  */
/*   5. revalidatePath after success                                          */
/*                                                                            */
/* runBulk centralizes that boilerplate so each action only writes the        */
/* per-row business logic. The mutate fn receives the transaction handle      */
/* and returns the count of successfully-touched rows.                        */
/* -------------------------------------------------------------------------- */

type TxHandle = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Narrows a caller-supplied id list to the clients the user may mutate.
 *  Managers keep the full list; an associate keeps only the ones they own.
 *  Ids that drop out are silently skipped — BulkResult.ok then reports the
 *  rows actually touched, which is the semantics the callers already expect. */
function scopeToOwned(user: { id: string; role?: string | null }, clientIds: string[]): string[] {
  if (user.role === "manager" || clientIds.length === 0) return clientIds;
  return db
    .select({ id: clients.id })
    .from(clients)
    .where(and(inArray(clients.id, clientIds), eq(clients.employeeId, user.id)))
    .all()
    .map((r) => r.id);
}

function runBulk(opts: {
  clientIds: string[];
  errorMessage: string;
  revalidate?: string[];
  mutate(tx: TxHandle): number;
}): BulkResult {
  if (opts.clientIds.length === 0) return { ok: 0 };
  let ok = 0;
  try {
    db.transaction((tx) => {
      ok = opts.mutate(tx);
    });
  } catch {
    return { ok: 0, error: opts.errorMessage };
  }
  for (const p of opts.revalidate ?? ["/clients"]) revalidatePath(p);
  return { ok };
}

/* -------------------------------------------------------------------------- */
/* Bulk add / remove tags                                                      */
/*                                                                            */
/* Both anyone-callable (matches single-row addTag/removeTag).                 */
/* Each affected client gets one activity event per bulk operation; tag       */
/* usage counts are updated transactionally.                                  */
/* -------------------------------------------------------------------------- */

/** Shared per-client tag mutation: applies `transformTags` to each client's
 *  tag array, logs an activity event when the array changed, and rolls up
 *  per-tag usage-count deltas. Used by bulkAddTags / bulkRemoveTags. */
function mutateClientTags(opts: {
  tx: TxHandle;
  clientIds: string[];
  userId: string;
  /** Returns the new tag array OR null if no change for this client. */
  transformTags(existing: string[]): { next: string[]; changed: string[] } | null;
  eventType: "tag_added" | "tag_removed";
  describe(changed: string[]): string;
  /** Sign of the usage-count update (+1 for add, -1 for remove). */
  deltaSign: 1 | -1;
}): number {
  const { tx, clientIds, userId, transformTags, eventType, describe, deltaSign } = opts;
  const rows = tx.select().from(clients).where(inArray(clients.id, clientIds)).all();
  const tagDeltas = new Map<string, number>();
  let ok = 0;
  for (const row of rows) {
    const existing = (row.tags || []) as string[];
    const result = transformTags(existing);
    if (!result) continue;
    tx.update(clients).set({ tags: result.next, updatedAt: new Date() }).where(eq(clients.id, row.id)).run();
    tx.insert(activityEvents).values({
      id: randomUUID(),
      clientId: row.id,
      eventType,
      description: describe(result.changed),
      employeeId: userId,
      metadata: { tags: result.changed },
    }).run();
    for (const t of result.changed) tagDeltas.set(t, (tagDeltas.get(t) ?? 0) + 1);
    ok++;
  }
  // Roll up usage-count adjustments in one pass per tag name
  for (const [tag, count] of tagDeltas) {
    const existing = tx.select().from(clientTags).where(eq(clientTags.name, tag)).get();
    if (existing) {
      const delta = deltaSign * count;
      tx.update(clientTags).set({
        usageCount: sql`CASE WHEN ${clientTags.usageCount} + ${delta} < 0 THEN 0 ELSE ${clientTags.usageCount} + ${delta} END`,
      }).where(eq(clientTags.id, existing.id)).run();
    } else if (deltaSign === 1) {
      tx.insert(clientTags).values({ id: randomUUID(), name: tag, usageCount: count }).run();
    }
  }
  return ok;
}

export async function bulkAddTags(clientIds: string[], tags: string[]): Promise<BulkResult> {
  const user = await requireAuth();
  if (tags.length === 0) return { ok: 0 };
  const scoped = scopeToOwned(user, clientIds);
  return runBulk({
    clientIds: scoped,
    errorMessage: "Failed to add tags to some clients",
    mutate: (tx) => mutateClientTags({
      tx, clientIds: scoped, userId: user.id,
      transformTags: (existing) => {
        const added = tags.filter((t) => !existing.includes(t));
        if (added.length === 0) return null;
        return { next: [...existing, ...added], changed: added };
      },
      eventType: "tag_added",
      describe: (changed) => `Tags added: ${changed.join(", ")}`,
      deltaSign: 1,
    }),
  });
}

export async function bulkRemoveTags(clientIds: string[], tags: string[]): Promise<BulkResult> {
  const user = await requireAuth();
  if (tags.length === 0) return { ok: 0 };
  const scoped = scopeToOwned(user, clientIds);
  return runBulk({
    clientIds: scoped,
    errorMessage: "Failed to remove tags from some clients",
    mutate: (tx) => mutateClientTags({
      tx, clientIds: scoped, userId: user.id,
      transformTags: (existing) => {
        const removed = tags.filter((t) => existing.includes(t));
        if (removed.length === 0) return null;
        return { next: existing.filter((t) => !removed.includes(t)), changed: removed };
      },
      eventType: "tag_removed",
      describe: (changed) => `Tags removed: ${changed.join(", ")}`,
      deltaSign: -1,
    }),
  });
}

/* -------------------------------------------------------------------------- */
/* Bulk reassign owner (manager only)                                          */
/* -------------------------------------------------------------------------- */

export async function bulkReassignOwner(
  clientIds: string[],
  newEmployeeId: string | null,
): Promise<BulkResult> {
  const user = await requireManager();
  return runBulk({
    clientIds,
    errorMessage: "Failed to reassign owner",
    mutate: (tx) => {
      tx.update(clients).set({ employeeId: newEmployeeId, updatedAt: new Date() }).where(inArray(clients.id, clientIds)).run();
      for (const id of clientIds) {
        tx.insert(activityEvents).values({
          id: randomUUID(),
          clientId: id,
          eventType: "transferred",
          description: newEmployeeId ? "Owner reassigned (bulk)" : "Owner cleared (bulk)",
          employeeId: user.id,
          metadata: { newEmployeeId },
        }).run();
      }
      return clientIds.length;
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Bulk toggle email-list opt-in                                               */
/* -------------------------------------------------------------------------- */

export async function bulkSetEmailList(
  clientIds: string[],
  onEmailList: boolean,
): Promise<BulkResult> {
  const user = await requireAuth();
  const scoped = scopeToOwned(user, clientIds);
  return runBulk({
    clientIds: scoped,
    errorMessage: "Failed to update email-list opt-in",
    mutate: (tx) => {
      // Unsubscribed clients are off-limits, mirroring toggleEmailList's guard —
      // a bulk selection must not be a back door around the suppression list.
      const eligible = tx.select({ id: clients.id, status: clients.status }).from(clients)
        .where(inArray(clients.id, scoped)).all()
        .filter((r) => r.status !== "unsubscribed")
        .map((r) => r.id);
      if (eligible.length === 0) return 0;
      tx.update(clients).set({ onEmailList, updatedAt: new Date() }).where(inArray(clients.id, eligible)).run();
      for (const id of eligible) {
        tx.insert(activityEvents).values({
          id: randomUUID(),
          clientId: id,
          eventType: "edited",
          description: onEmailList ? "Added to email list (bulk)" : "Removed from email list (bulk)",
          employeeId: user.id,
          metadata: { onEmailList },
        }).run();
      }
      return eligible.length;
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Bulk delete (manager only — soft-delete; recoverable from Settings)         */
/* -------------------------------------------------------------------------- */

export async function bulkDeleteClients(clientIds: string[]): Promise<BulkResult> {
  const user = await requireManager();
  return runBulk({
    clientIds,
    errorMessage: "Failed to delete clients",
    revalidate: ["/clients", "/settings"],
    mutate: (tx) => {
      const rows = tx.select().from(clients).where(inArray(clients.id, clientIds)).all();
      const now = new Date();
      let ok = 0;
      for (const row of rows) {
        if (row.status === "deleted") continue;
        tx.update(clients).set({
          previousStatus: row.status === "active" || row.status === "inactive" || row.status === "banned" || row.status === "unsubscribed" ? row.status : "active",
          status: "deleted",
          deletedAt: now,
          deletedBy: user.id,
          updatedAt: now,
        }).where(eq(clients.id, row.id)).run();
        tx.insert(activityEvents).values({
          id: randomUUID(),
          clientId: row.id,
          eventType: "status_changed",
          description: "Deleted (bulk)",
          employeeId: user.id,
          metadata: { newStatus: "deleted", previousStatus: row.status },
        }).run();
        ok++;
      }
      return ok;
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Bulk ban (manager only)                                                     */
/* -------------------------------------------------------------------------- */

export async function bulkBanClients(
  clientIds: string[],
  category: "Reselling" | "Gift Card Fraud" | "Other",
  reason: string,
): Promise<BulkResult> {
  const user = await requireManager();
  return runBulk({
    clientIds,
    errorMessage: "Failed to ban clients",
    revalidate: ["/clients", "/banned"],
    mutate: (tx) => {
      const rows = tx.select().from(clients).where(inArray(clients.id, clientIds)).all();
      const now = new Date();
      let ok = 0;
      for (const row of rows) {
        // banned_customers has no unique constraint on customer_id, so re-banning
        // an already-banned client would silently add a second row.
        if (row.status === "banned") continue;
        tx.update(clients).set({ status: "banned", updatedAt: now }).where(eq(clients.id, row.id)).run();
        tx.insert(bannedCustomers).values({
          id: randomUUID(),
          customerId: row.id,
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
          phone: row.phone,
          banReasonCategory: category,
          specificBanReason: reason,
        }).run();
        tx.insert(activityEvents).values({
          id: randomUUID(),
          clientId: row.id,
          eventType: "status_changed",
          description: `Banned (bulk): ${category} — ${reason}`,
          employeeId: user.id,
          metadata: { newStatus: "banned", category, reason },
        }).run();
        ok++;
      }
      return ok;
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Bulk unsubscribe (manager only)                                             */
/* -------------------------------------------------------------------------- */

export async function bulkUnsubscribeClients(clientIds: string[]): Promise<BulkResult> {
  const user = await requireManager();
  return runBulk({
    clientIds,
    errorMessage: "Failed to unsubscribe clients",
    revalidate: ["/clients", "/unsubscribed"],
    mutate: (tx) => {
      const rows = tx.select().from(clients).where(inArray(clients.id, clientIds)).all();
      const now = new Date();
      tx.update(clients).set({ status: "unsubscribed", onEmailList: false, updatedAt: now }).where(inArray(clients.id, clientIds)).run();

      // One query for the whole batch instead of one per row. Seeded with the
      // emails already on the list, then extended as we insert — two clients can
      // share an email, and unsubscribe_list.email is UNIQUE.
      const emails = rows.map((r) => r.email).filter((e): e is string => !!e);
      const alreadyUnsubbed = new Set(
        emails.length > 0
          ? tx.select({ email: unsubscribeList.email }).from(unsubscribeList).where(inArray(unsubscribeList.email, emails)).all().map((r) => r.email)
          : [],
      );

      for (const row of rows) {
        if (row.email && !alreadyUnsubbed.has(row.email)) {
          tx.insert(unsubscribeList).values({ id: randomUUID(), email: row.email }).run();
          alreadyUnsubbed.add(row.email);
        }
        tx.insert(activityEvents).values({
          id: randomUUID(),
          clientId: row.id,
          eventType: "status_changed",
          description: "Unsubscribed (bulk)",
          employeeId: user.id,
          metadata: { newStatus: "unsubscribed" },
        }).run();
      }
      return clientIds.length;
    },
  });
}
