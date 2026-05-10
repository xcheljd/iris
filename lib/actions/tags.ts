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

export async function createTag(name: string, color: string) {
  await requireManager();
  db.insert(clientTags).values({ id: randomUUID(), name, color }).run();
  revalidatePath("/settings");
}

export async function deleteTag(id: string) {
  await requireManager();
  db.delete(clientTags).where(eq(clientTags.id, id)).run();
  revalidatePath("/settings");
}
