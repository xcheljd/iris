"use server";
import { db } from "@/lib/db";
import { smartLists } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { requireAuth } from "./_shared";
import { smartListNameSchema, smartListFiltersSchema } from "@/lib/validation/smart-list";

export async function deleteSmartList(listId: string): Promise<{ error: string } | undefined> {
  const user = await requireAuth();
  const list = db.select().from(smartLists).where(eq(smartLists.id, listId)).get();
  if (!list) return { error: "Smart list not found" };
  if (user.role !== "manager" && list.ownerId !== user.id) return { error: "Not authorized to delete this smart list" };
  try {
    db.delete(smartLists).where(eq(smartLists.id, listId)).run();
    revalidatePath("/smart-lists");
  } catch {
    return { error: "Failed to delete smart list" };
  }
}

export async function duplicateSmartList(listId: string): Promise<{ error: string } | undefined> {
  const user = await requireAuth();
  const original = db.select().from(smartLists).where(eq(smartLists.id, listId)).get();
  if (!original) return { error: "Smart list not found" };
  if (!original.isShared && original.ownerId !== user.id && user.role !== "manager") {
    return { error: "Not authorized to duplicate this list" };
  }
  try {
    db.insert(smartLists).values({
      id: randomUUID(),
      name: `${original.name} (Copy)`,
      ownerId: user.id,
      filters: original.filters,
      sort: original.sort,
      isShared: original.isShared,
    }).run();
    revalidatePath("/smart-lists");
  } catch {
    return { error: "Failed to duplicate smart list" };
  }
}

export async function renameSmartList(listId: string, newName: string): Promise<{ error: string } | undefined> {
  const user = await requireAuth();
  const list = db.select().from(smartLists).where(eq(smartLists.id, listId)).get();
  if (!list) return { error: "Smart list not found" };
  if (user.role !== "manager" && list.ownerId !== user.id) return { error: "Not authorized to rename this smart list" };
  const name = smartListNameSchema.safeParse(newName);
  if (!name.success) return { error: name.error.issues[0]?.message ?? "Invalid list name" };
  try {
    db.update(smartLists).set({ name: name.data }).where(eq(smartLists.id, listId)).run();
    revalidatePath("/smart-lists");
  } catch {
    return { error: "Failed to rename smart list" };
  }
}

export async function createSmartList(
  name: string,
  filters: Record<string, unknown>,
  options: { isShared?: boolean } = {},
): Promise<{ id: string } | { error: string }> {
  const user = await requireAuth();
  const parsedName = smartListNameSchema.safeParse(name);
  if (!parsedName.success) return { error: parsedName.error.issues[0]?.message ?? "Invalid list name" };
  const parsedFilters = smartListFiltersSchema.safeParse(filters);
  if (!parsedFilters.success) return { error: "Invalid smart list filters" };
  const id = randomUUID();
  try {
    db.insert(smartLists).values({
      id,
      name: parsedName.data,
      ownerId: user.id,
      filters: parsedFilters.data,
      isShared: options.isShared ?? false,
    }).run();
    revalidatePath("/smart-lists");
    return { id };
  } catch {
    return { error: "Failed to create smart list" };
  }
}
