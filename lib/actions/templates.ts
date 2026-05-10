"use server";
import { db } from "@/lib/db";
import { outreachTemplates } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { requireManager } from "./_shared";

export async function createTemplate(name: string, body: string, subject: string | null, channel: "text" | "email" | "general") {
  const user = await requireManager();
  db.insert(outreachTemplates).values({ id: randomUUID(), name, body, subject, channel, createdBy: user.id }).run();
  revalidatePath("/settings");
}

export async function deleteTemplate(id: string) {
  await requireManager();
  db.delete(outreachTemplates).where(eq(outreachTemplates.id, id)).run();
  revalidatePath("/settings");
}
