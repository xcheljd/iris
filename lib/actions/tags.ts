"use server";
import { db } from "@/lib/db";
import { clients, clientTags, activityEvents, smartLists } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { requireAuth, requireManager } from "./_shared";

export async function addTag(clientId: string, rawTag: string) {
  const user = await requireAuth();
  const tag = rawTag.trim();
  if (!tag) return { error: "Tag name is required" };
  const c = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!c) return { error: "Client not found" };
  if (user.role !== "manager" && c.employeeId !== user.id) return { error: "Not authorized to tag this client" };
  if ((c.tags || []).includes(tag)) return;
  const tags = [...(c.tags || []), tag];
  try {
    db.transaction((tx) => {
      tx.update(clients).set({ tags, updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
      const existing = tx.select().from(clientTags).where(eq(clientTags.name, tag)).get();
      if (existing) {
        tx.update(clientTags).set({ usageCount: sql`${clientTags.usageCount} + 1` }).where(eq(clientTags.id, existing.id)).run();
      } else {
        tx.insert(clientTags).values({ id: randomUUID(), name: tag, usageCount: 1 }).run();
      }
      tx.insert(activityEvents).values({
        id: randomUUID(), clientId, eventType: "tag_added", description: `Tag added: ${tag}`, employeeId: user.id, metadata: { tagName: tag },
      }).run();
    });
    revalidatePath(`/clients/${clientId}`);
  } catch (err) {
    console.error("addTag failed:", err);
    return { error: "Failed to add tag" };
  }
}

export async function removeTag(clientId: string, tag: string) {
  const user = await requireAuth();
  const c = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!c) return { error: "Client not found" };
  if (user.role !== "manager" && c.employeeId !== user.id) return { error: "Not authorized to remove tags from this client" };
  if (!(c.tags || []).includes(tag)) return;
  const tags = (c.tags || []).filter((t) => t !== tag);
  try {
    db.transaction((tx) => {
      tx.update(clients).set({ tags, updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
      const existing = tx.select().from(clientTags).where(eq(clientTags.name, tag)).get();
      if (existing) {
        tx.update(clientTags).set({ usageCount: sql`CASE WHEN ${clientTags.usageCount} - 1 < 0 THEN 0 ELSE ${clientTags.usageCount} - 1 END` }).where(eq(clientTags.id, existing.id)).run();
      }
      tx.insert(activityEvents).values({
        id: randomUUID(), clientId, eventType: "tag_removed", description: `Tag removed: ${tag}`, employeeId: user.id, metadata: { tagName: tag },
      }).run();
    });
    revalidatePath(`/clients/${clientId}`);
  } catch (err) {
    console.error("removeTag failed:", err);
    return { error: "Failed to remove tag" };
  }
}

export async function createTag(name: string): Promise<{ error: string } | undefined> {
  await requireManager();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Tag name is required" };
  const existing = db.select({ id: clientTags.id }).from(clientTags).where(eq(clientTags.name, trimmed)).get();
  if (existing) return { error: "A tag with this name already exists" };
  db.insert(clientTags).values({ id: randomUUID(), name: trimmed }).run();
  revalidatePath("/settings");
}

/**
 * Rename a tag everywhere it is used: the registry row, every client's
 * tags[] array, and smart-list filters (`tags` and the legacy `tag`), all in
 * one transaction. No per-client activity events: the tag itself didn't
 * change on the client, only its name.
 */
export async function renameTag(id: string, rawName: string): Promise<{ error: string } | undefined> {
  await requireManager();
  const next = rawName.trim();
  if (!next) return { error: "Tag name is required" };
  const tag = db.select({ name: clientTags.name }).from(clientTags).where(eq(clientTags.id, id)).get();
  if (!tag) return { error: "Tag not found" };
  if (tag.name === next) return;
  const clash = db.select({ id: clientTags.id }).from(clientTags).where(eq(clientTags.name, next)).get();
  if (clash) return { error: "A tag with this name already exists" };
  const prev = tag.name;
  try {
    db.transaction((tx) => {
      const affected = tx
        .select({ id: clients.id, tags: clients.tags })
        .from(clients)
        .where(sql`EXISTS (SELECT 1 FROM json_each(${clients.tags}) WHERE json_each.value = ${prev})`)
        .all();
      for (const c of affected) {
        // Map then dedupe, in case a client somehow already carries the new name.
        const renamed = Array.from(new Set((c.tags || []).map((t) => (t === prev ? next : t))));
        tx.update(clients).set({ tags: renamed, updatedAt: new Date() }).where(eq(clients.id, c.id)).run();
      }
      for (const list of tx.select({ id: smartLists.id, filters: smartLists.filters }).from(smartLists).all()) {
        const f = list.filters;
        const hasTag = Array.isArray(f.tags) && f.tags.includes(prev);
        if (!hasTag && f.tag !== prev) continue;
        const nextFilters = { ...f };
        if (hasTag) nextFilters.tags = Array.from(new Set((f.tags as unknown[]).map((t) => (t === prev ? next : t))));
        if (f.tag === prev) nextFilters.tag = next;
        tx.update(smartLists).set({ filters: nextFilters }).where(eq(smartLists.id, list.id)).run();
      }
      tx.update(clientTags).set({ name: next }).where(eq(clientTags.id, id)).run();
    });
    revalidatePath("/settings");
    revalidatePath("/clients");
    revalidatePath("/smart-lists");
  } catch (err) {
    console.error("renameTag failed:", err);
    return { error: "Failed to rename tag" };
  }
}

export async function deleteTag(id: string): Promise<{ error: string } | undefined> {
  const user = await requireManager();
  const tag = db.select({ name: clientTags.name }).from(clientTags).where(eq(clientTags.id, id)).get();
  if (!tag) return { error: "Tag not found" };
  try {
    db.transaction((tx) => {
      // Remove the tag from every client's tags[] JSON array before
      // deleting the registry row — otherwise it orphans silently.
      // `clients.tags` is a JSON text column holding a string array, so the
      // membership test belongs in SQLite's json_each — the same idiom the
      // tag filter in lib/client-filter-conds.ts uses. This replaces a full
      // table scan pulled into JS. No status predicate, matching the old
      // behaviour: deleted/banned clients get the tag stripped too.
      const affected = tx
        .select({ id: clients.id, tags: clients.tags })
        .from(clients)
        .where(sql`EXISTS (SELECT 1 FROM json_each(${clients.tags}) WHERE json_each.value = ${tag.name})`)
        .all();
      const events = affected.map((c) => ({
        id: randomUUID(),
        clientId: c.id,
        eventType: "tag_removed" as const,
        description: `Tag removed (tag deleted): ${tag.name}`,
        employeeId: user.id,
        metadata: { tagName: tag.name, source: "tag_deleted" },
      }));
      for (const c of affected) {
        const next = (c.tags || []).filter((t) => t !== tag.name);
        tx.update(clients).set({ tags: next, updatedAt: new Date() }).where(eq(clients.id, c.id)).run();
      }
      if (events.length > 0) tx.insert(activityEvents).values(events).run();
      // Smart lists filtering on the tag would otherwise match nothing, with
      // no sign why. Drop it from `tags` (and the legacy single `tag`) so
      // each list keeps filtering on its surviving tags.
      for (const list of tx.select({ id: smartLists.id, filters: smartLists.filters }).from(smartLists).all()) {
        const f = list.filters;
        const hasTag = Array.isArray(f.tags) && f.tags.includes(tag.name);
        if (!hasTag && f.tag !== tag.name) continue;
        const next = { ...f };
        if (hasTag) {
          const remaining = (f.tags as unknown[]).filter((t) => t !== tag.name);
          if (remaining.length > 0) next.tags = remaining;
          else delete next.tags;
        }
        if (f.tag === tag.name) delete next.tag;
        tx.update(smartLists).set({ filters: next }).where(eq(smartLists.id, list.id)).run();
      }
      tx.delete(clientTags).where(eq(clientTags.id, id)).run();
    });
    revalidatePath("/settings");
    revalidatePath("/clients");
    revalidatePath("/smart-lists");
  } catch (err) {
    console.error("deleteTag failed:", err);
    return { error: "Failed to delete tag" };
  }
}
