"use server";
import { db } from "@/lib/db";
import { outreachLogs, outreachTemplates } from "@/lib/db/schema";
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
  // outreach_logs.template_id has no FK, so clear it here rather than leave
  // logs pointing at a template that no longer exists.
  db.transaction((tx) => {
    tx.update(outreachLogs).set({ templateId: null }).where(eq(outreachLogs.templateId, id)).run();
    tx.delete(outreachTemplates).where(eq(outreachTemplates.id, id)).run();
  });
  revalidatePath("/settings");
}
