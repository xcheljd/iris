"use server";

import { db } from "@/lib/db";
import { clients, activityEvents, bannedCustomers, unsubscribeList, clientTags } from "@/lib/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { requireAuth, requireManager } from "./_shared";

interface BulkResult {
  ok: number;
  /** Optional error if the whole operation failed. */
  error?: string;
}

/* -------------------------------------------------------------------------- */
/* Bulk add / remove tags                                                      */
/*                                                                            */
/* Both anyone-callable (matches single-row addTag/removeTag).                 */
/* Each affected client gets one activity event per bulk operation; tag       */
/* usage counts are updated transactionally.                                  */
/* -------------------------------------------------------------------------- */

export async function bulkAddTags(clientIds: string[], tags: string[]): Promise<BulkResult> {
  const user = await requireAuth();
  if (clientIds.length === 0 || tags.length === 0) return { ok: 0 };

  let ok = 0;
  try {
    db.transaction((tx) => {
      const rows = tx.select().from(clients).where(inArray(clients.id, clientIds)).all();
      const tagDeltas = new Map<string, number>();
      for (const row of rows) {
        const existing = (row.tags || []) as string[];
        const added = tags.filter((t) => !existing.includes(t));
        if (added.length === 0) continue;
        const next = [...existing, ...added];
        tx.update(clients).set({ tags: next, updatedAt: new Date() }).where(eq(clients.id, row.id)).run();
        tx.insert(activityEvents).values({
          id: randomUUID(),
          clientId: row.id,
          eventType: "tag_added",
          description: `Tags added: ${added.join(", ")}`,
          employeeId: user.id,
          metadata: { tags: added },
        }).run();
        for (const t of added) tagDeltas.set(t, (tagDeltas.get(t) ?? 0) + 1);
        ok++;
      }
      // Update tag usage counts in one pass
      for (const [tag, delta] of tagDeltas) {
        const existing = tx.select().from(clientTags).where(eq(clientTags.name, tag)).get();
        if (existing) {
          tx.update(clientTags).set({ usageCount: sql`${clientTags.usageCount} + ${delta}` }).where(eq(clientTags.id, existing.id)).run();
        } else {
          tx.insert(clientTags).values({ id: randomUUID(), name: tag, usageCount: delta }).run();
        }
      }
    });
    revalidatePath("/clients");
    return { ok };
  } catch {
    return { ok, error: "Failed to add tags to some clients" };
  }
}

export async function bulkRemoveTags(clientIds: string[], tags: string[]): Promise<BulkResult> {
  const user = await requireAuth();
  if (clientIds.length === 0 || tags.length === 0) return { ok: 0 };

  let ok = 0;
  try {
    db.transaction((tx) => {
      const rows = tx.select().from(clients).where(inArray(clients.id, clientIds)).all();
      const tagDeltas = new Map<string, number>();
      for (const row of rows) {
        const existing = (row.tags || []) as string[];
        const removed = tags.filter((t) => existing.includes(t));
        if (removed.length === 0) continue;
        const next = existing.filter((t) => !removed.includes(t));
        tx.update(clients).set({ tags: next, updatedAt: new Date() }).where(eq(clients.id, row.id)).run();
        tx.insert(activityEvents).values({
          id: randomUUID(),
          clientId: row.id,
          eventType: "tag_removed",
          description: `Tags removed: ${removed.join(", ")}`,
          employeeId: user.id,
          metadata: { tags: removed },
        }).run();
        for (const t of removed) tagDeltas.set(t, (tagDeltas.get(t) ?? 0) + 1);
        ok++;
      }
      for (const [tag, delta] of tagDeltas) {
        const existing = tx.select().from(clientTags).where(eq(clientTags.name, tag)).get();
        if (existing) {
          tx.update(clientTags).set({
            usageCount: sql`CASE WHEN ${clientTags.usageCount} - ${delta} < 0 THEN 0 ELSE ${clientTags.usageCount} - ${delta} END`,
          }).where(eq(clientTags.id, existing.id)).run();
        }
      }
    });
    revalidatePath("/clients");
    return { ok };
  } catch {
    return { ok, error: "Failed to remove tags from some clients" };
  }
}

/* -------------------------------------------------------------------------- */
/* Bulk reassign owner (manager only)                                          */
/* -------------------------------------------------------------------------- */

export async function bulkReassignOwner(
  clientIds: string[],
  newEmployeeId: string | null,
): Promise<BulkResult> {
  const user = await requireManager();
  if (clientIds.length === 0) return { ok: 0 };

  try {
    db.transaction((tx) => {
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
    });
    revalidatePath("/clients");
    return { ok: clientIds.length };
  } catch {
    return { ok: 0, error: "Failed to reassign owner" };
  }
}

/* -------------------------------------------------------------------------- */
/* Bulk toggle email-list opt-in                                               */
/* -------------------------------------------------------------------------- */

export async function bulkSetEmailList(
  clientIds: string[],
  onEmailList: boolean,
): Promise<BulkResult> {
  const user = await requireAuth();
  if (clientIds.length === 0) return { ok: 0 };

  try {
    db.transaction((tx) => {
      tx.update(clients).set({ onEmailList, updatedAt: new Date() }).where(inArray(clients.id, clientIds)).run();
      for (const id of clientIds) {
        tx.insert(activityEvents).values({
          id: randomUUID(),
          clientId: id,
          eventType: "edited",
          description: onEmailList ? "Added to email list (bulk)" : "Removed from email list (bulk)",
          employeeId: user.id,
          metadata: { onEmailList },
        }).run();
      }
    });
    revalidatePath("/clients");
    return { ok: clientIds.length };
  } catch {
    return { ok: 0, error: "Failed to update email-list opt-in" };
  }
}

/* -------------------------------------------------------------------------- */
/* Bulk delete (manager only — soft-delete; recoverable from Settings)         */
/* -------------------------------------------------------------------------- */

export async function bulkDeleteClients(clientIds: string[]): Promise<BulkResult> {
  const user = await requireManager();
  if (clientIds.length === 0) return { ok: 0 };

  try {
    db.transaction((tx) => {
      const rows = tx.select().from(clients).where(inArray(clients.id, clientIds)).all();
      const now = new Date();
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
      }
    });
    revalidatePath("/clients");
    revalidatePath("/settings");
    return { ok: clientIds.length };
  } catch {
    return { ok: 0, error: "Failed to delete clients" };
  }
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
  if (clientIds.length === 0) return { ok: 0 };

  try {
    db.transaction((tx) => {
      const rows = tx.select().from(clients).where(inArray(clients.id, clientIds)).all();
      const now = new Date();
      tx.update(clients).set({ status: "banned", updatedAt: now }).where(inArray(clients.id, clientIds)).run();
      for (const row of rows) {
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
      }
    });
    revalidatePath("/clients");
    revalidatePath("/banned");
    return { ok: clientIds.length };
  } catch {
    return { ok: 0, error: "Failed to ban clients" };
  }
}

/* -------------------------------------------------------------------------- */
/* Bulk unsubscribe (manager only)                                             */
/* -------------------------------------------------------------------------- */

export async function bulkUnsubscribeClients(clientIds: string[]): Promise<BulkResult> {
  const user = await requireManager();
  if (clientIds.length === 0) return { ok: 0 };

  try {
    db.transaction((tx) => {
      const rows = tx.select().from(clients).where(inArray(clients.id, clientIds)).all();
      const now = new Date();
      tx.update(clients).set({ status: "unsubscribed", onEmailList: false, updatedAt: now }).where(inArray(clients.id, clientIds)).run();
      for (const row of rows) {
        if (row.email) {
          const existing = tx.select().from(unsubscribeList).where(eq(unsubscribeList.email, row.email)).get();
          if (!existing) tx.insert(unsubscribeList).values({ id: randomUUID(), email: row.email }).run();
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
    });
    revalidatePath("/clients");
    revalidatePath("/unsubscribed");
    return { ok: clientIds.length };
  } catch {
    return { ok: 0, error: "Failed to unsubscribe clients" };
  }
}
