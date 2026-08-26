"use server";
import { db } from "@/lib/db";
import { clients, clientTags, activityEvents } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { requireAuth, requireManager } from "./_shared";

export async function addTag(clientId: string, tag: string) {
  const user = await requireAuth();
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
  } catch (_err) {
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
  } catch (_err) {
    return { error: "Failed to remove tag" };
  }
}

export async function createTag(name: string, color: string): Promise<{ error: string } | undefined> {
  await requireManager();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Tag name is required" };
  const existing = db.select({ id: clientTags.id }).from(clientTags).where(eq(clientTags.name, trimmed)).get();
  if (existing) return { error: "A tag with this name already exists" };
  db.insert(clientTags).values({ id: randomUUID(), name: trimmed, color }).run();
  revalidatePath("/settings");
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
      tx.delete(clientTags).where(eq(clientTags.id, id)).run();
    });
    revalidatePath("/settings");
    revalidatePath("/clients");
  } catch {
    return { error: "Failed to delete tag" };
  }
}
