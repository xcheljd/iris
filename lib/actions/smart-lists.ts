"use server";
import { db } from "@/lib/db";
import { smartLists } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { requireAuth } from "./_shared";

export async function deleteSmartList(listId: string): Promise<{ error: string } | undefined> {
  const user = await requireAuth();
  const list = db.select().from(smartLists).where(eq(smartLists.id, listId)).get();
  if (!list) return { error: "Smart list not found" };
  if (user.role !== "manager" && list.ownerId !== user.id) return { error: "Not authorized to delete this smart list" };
  db.delete(smartLists).where(eq(smartLists.id, listId)).run();
  revalidatePath("/smart-lists");
}

export async function duplicateSmartList(listId: string) {
  await requireAuth();
  const original = db.select().from(smartLists).where(eq(smartLists.id, listId)).get();
  if (!original) return;
  db.insert(smartLists).values({
    id: randomUUID(),
    name: `${original.name} (Copy)`,
    ownerId: original.ownerId,
    filters: original.filters,
    sort: original.sort,
    isShared: original.isShared,
  }).run();
  revalidatePath("/smart-lists");
}

export async function renameSmartList(listId: string, newName: string): Promise<{ error: string } | undefined> {
  const user = await requireAuth();
  const list = db.select().from(smartLists).where(eq(smartLists.id, listId)).get();
  if (!list) return { error: "Smart list not found" };
  if (user.role !== "manager" && list.ownerId !== user.id) return { error: "Not authorized to rename this smart list" };
  db.update(smartLists).set({ name: newName }).where(eq(smartLists.id, listId)).run();
  revalidatePath("/smart-lists");
}

export async function createSmartList(name: string, filters: Record<string, unknown>) {
  const user = await requireAuth();
  db.insert(smartLists).values({
    id: randomUUID(),
    name,
    ownerId: user.id,
    filters,
  }).run();
  revalidatePath("/smart-lists");
}
