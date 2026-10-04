"use server";

import { db } from "@/lib/db";
import { clients, activityEvents, bannedCustomers, unsubscribeList, clientTags, promoMatches } from "@/lib/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { assertAssignableEmployee, requireAuth, requireManager } from "./_shared";
import { BANNABLE_STATUSES, UNSUBSCRIBABLE_STATUSES } from "./_client-status-core";
import { recalcHeat } from "@/lib/heat-recalc";
import { normalizeEmail } from "@/lib/email-identity";
import { banClientSchema } from "@/lib/validation/client";

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
/*   5. recompute heat for rows whose scored fields changed, after commit     */
/*   6. revalidatePath after success                                          */
/*                                                                            */
/* runBulk centralizes that boilerplate so each action only writes the        */
/* per-row business logic. The mutate fn receives the transaction handle      */
/* and returns the count of successfully-touched rows.                        */
/* -------------------------------------------------------------------------- */

type TxHandle = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ActivityEventInsert = typeof activityEvents.$inferInsert;

/** Emits collected activity events as a single multi-row INSERT.
 *  Bulk actions build their event rows inside the per-client loop and flush
 *  once, instead of one round trip per client (same shape as the batched
 *  promo_matches insert in lib/promo-match.ts). */
function insertActivityEvents(tx: TxHandle, rows: ActivityEventInsert[]): void {
  if (rows.length > 0) tx.insert(activityEvents).values(rows).run();
}

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

async function runBulk(opts: {
  clientIds: string[];
  errorMessage: string;
  revalidate?: string[];
  /** Filled by mutate with the ids whose status or email-list flag it wrote;
   *  each gets a recalcHeat once the transaction has committed. */
  heatIds?: string[];
  mutate(tx: TxHandle): number;
}): Promise<BulkResult> {
  if (opts.clientIds.length === 0) return { ok: 0 };
  let ok = 0;
  try {
    db.transaction((tx) => {
      ok = opts.mutate(tx);
    });
  } catch (err) {
    console.error(`${opts.errorMessage}:`, err);
    return { ok: 0, error: opts.errorMessage };
  }
  for (const id of opts.heatIds ?? []) await recalcHeat(id);
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
  const events: ActivityEventInsert[] = [];
  let ok = 0;
  for (const row of rows) {
    const existing = (row.tags || []) as string[];
    const result = transformTags(existing);
    if (!result) continue;
    tx.update(clients).set({ tags: result.next, updatedAt: new Date() }).where(eq(clients.id, row.id)).run();
    events.push({
      id: randomUUID(),
      clientId: row.id,
      eventType,
      description: describe(result.changed),
      employeeId: userId,
      metadata: { tags: result.changed },
    });
    for (const t of result.changed) tagDeltas.set(t, (tagDeltas.get(t) ?? 0) + 1);
    ok++;
  }
  insertActivityEvents(tx, events);
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
  // null clears the owner; any real target must be able to work the clients.
  if (newEmployeeId !== null) {
    const target = assertAssignableEmployee(newEmployeeId);
    if (target.error !== undefined) return { ok: 0, error: target.error };
  }
  return runBulk({
    clientIds,
    errorMessage: "Failed to reassign owner",
    mutate: (tx) => {
      // Resolve the ids first: `clientIds.length` counted ids that match no
      // row, and the activity event for one of those would fail its FK and
      // roll the whole batch back.
      const ids = tx.select({ id: clients.id }).from(clients).where(inArray(clients.id, clientIds)).all().map((r) => r.id);
      if (ids.length === 0) return 0;
      tx.update(clients).set({ employeeId: newEmployeeId, updatedAt: new Date() }).where(inArray(clients.id, ids)).run();
      insertActivityEvents(tx, ids.map((id) => ({
        id: randomUUID(),
        clientId: id,
        eventType: "transferred" as const,
        description: newEmployeeId ? "Owner reassigned (bulk)" : "Owner cleared (bulk)",
        employeeId: user.id,
        metadata: { newEmployeeId },
      })));
      return ids.length;
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
  const heatIds: string[] = [];
  return runBulk({
    clientIds: scoped,
    errorMessage: "Failed to update email-list opt-in",
    heatIds,
    mutate: (tx) => {
      // Unsubscribed clients are off-limits, mirroring toggleEmailList's guard —
      // a bulk selection must not be a back door around the suppression list.
      const eligible = tx.select({ id: clients.id, status: clients.status }).from(clients)
        .where(inArray(clients.id, scoped)).all()
        .filter((r) => r.status !== "unsubscribed")
        .map((r) => r.id);
      if (eligible.length === 0) return 0;
      tx.update(clients).set({ onEmailList, updatedAt: new Date() }).where(inArray(clients.id, eligible)).run();
      heatIds.push(...eligible);
      insertActivityEvents(tx, eligible.map((id) => ({
        id: randomUUID(),
        clientId: id,
        eventType: "edited" as const,
        description: onEmailList ? "Added to email list (bulk)" : "Removed from email list (bulk)",
        employeeId: user.id,
        metadata: { onEmailList },
      })));
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
      const events: ActivityEventInsert[] = [];
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
        events.push({
          id: randomUUID(),
          clientId: row.id,
          eventType: "status_changed",
          description: "Deleted (bulk)",
          employeeId: user.id,
          metadata: { newStatus: "deleted", previousStatus: row.status },
        });
        ok++;
      }
      insertActivityEvents(tx, events);
      return ok;
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Bulk ban (manager only)                                                     */
/* -------------------------------------------------------------------------- */

export async function bulkBanClients(
  clientIds: string[],
  rawCategory: "Reselling" | "Gift Card Fraud" | "Other",
  rawReason: string,
): Promise<BulkResult> {
  const user = await requireManager();
  const parsed = banClientSchema.safeParse({ category: rawCategory, reason: rawReason });
  if (!parsed.success) return { ok: 0, error: parsed.error.issues[0]?.message ?? "Invalid request" };
  const { category, reason } = parsed.data;
  const heatIds: string[] = [];
  return runBulk({
    clientIds,
    errorMessage: "Failed to ban clients",
    heatIds,
    revalidate: ["/clients", "/banned"],
    mutate: (tx) => {
      const rows = tx.select().from(clients).where(inArray(clients.id, clientIds)).all();
      const now = new Date();
      const events: ActivityEventInsert[] = [];
      let ok = 0;
      for (const row of rows) {
        // banned_customers has no unique constraint on customer_id, so re-banning
        // an already-banned client would silently add a second row; a deleted
        // client must not be resurrected as banned.
        if (!(BANNABLE_STATUSES as readonly string[]).includes(row.status)) continue;
        tx.update(clients).set({ status: "banned", updatedAt: now }).where(eq(clients.id, row.id)).run();
        heatIds.push(row.id);
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
        events.push({
          id: randomUUID(),
          clientId: row.id,
          eventType: "status_changed",
          description: `Banned (bulk): ${category} — ${reason}`,
          employeeId: user.id,
          metadata: { newStatus: "banned", category, reason },
        });
        ok++;
      }
      // Same as applyBanUnchecked: a banned client keeps no promo matches.
      if (heatIds.length > 0) tx.delete(promoMatches).where(inArray(promoMatches.clientId, heatIds)).run();
      insertActivityEvents(tx, events);
      return ok;
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Bulk unsubscribe (manager only)                                             */
/* -------------------------------------------------------------------------- */

export async function bulkUnsubscribeClients(clientIds: string[]): Promise<BulkResult> {
  const user = await requireManager();
  const heatIds: string[] = [];
  return runBulk({
    clientIds,
    errorMessage: "Failed to unsubscribe clients",
    heatIds,
    revalidate: ["/clients", "/unsubscribed"],
    mutate: (tx) => {
      // Only active/inactive clients move — the blanket UPDATE used to
      // resurrect a soft-deleted client as "unsubscribed", and an already
      // unsubscribed one would get a second audit event. Same source guard as
      // bulkBanClients and applyUnsubscribeUnchecked.
      const rows = tx.select().from(clients).where(inArray(clients.id, clientIds)).all()
        .filter((r) => (UNSUBSCRIBABLE_STATUSES as readonly string[]).includes(r.status));
      if (rows.length === 0) return 0;
      const eligible = rows.map((r) => r.id);
      const now = new Date();
      tx.update(clients).set({ status: "unsubscribed", onEmailList: false, updatedAt: now }).where(inArray(clients.id, eligible)).run();
      heatIds.push(...eligible);

      // One query for the whole batch instead of one per row. Seeded with the
      // emails already on the list, then extended as we insert — two clients can
      // share an email, and unsubscribe_list.email is UNIQUE. Normalized both
      // ways, as in applyUnsubscribeUnchecked: the UNIQUE index is BINARY, so a
      // mixed-case address would otherwise land as a second row.
      const emails = [...new Set(rows.map((r) => normalizeEmail(r.email)).filter((e): e is string => !!e))];
      const alreadyUnsubbed = new Set(
        emails.length > 0
          ? tx.select({ email: unsubscribeList.email }).from(unsubscribeList).where(inArray(sql`lower(${unsubscribeList.email})`, emails)).all().map((r) => normalizeEmail(r.email))
          : [],
      );

      const events: ActivityEventInsert[] = [];
      for (const row of rows) {
        const email = normalizeEmail(row.email);
        if (email && !alreadyUnsubbed.has(email)) {
          tx.insert(unsubscribeList).values({ id: randomUUID(), email }).run();
          alreadyUnsubbed.add(email);
        }
        events.push({
          id: randomUUID(),
          clientId: row.id,
          eventType: "status_changed",
          description: "Unsubscribed (bulk)",
          employeeId: user.id,
          metadata: { newStatus: "unsubscribed" },
        });
      }
      insertActivityEvents(tx, events);
      return eligible.length;
    },
  });
}
