"use server";
import { db } from "@/lib/db";
import { clients, outreachLogs, activityEvents, promoWatches, promoMatches } from "@/lib/db/schema";
import { eq, gte, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { calcHeatScore } from "@/lib/heat-score";
import { MS_PER_DAY, HEAT_LOOKBACK_DAYS } from "@/lib/constants";
import { outreachInputSchema, type OutreachInput } from "@/lib/validation/outreach";
import { format } from "date-fns";
import { getSessionUser, requireAuth } from "./_shared";

export async function recalcHeat(clientId: string) {
  try {
    const c = db.select().from(clients).where(eq(clients.id, clientId)).get();
    if (!c) return;
    const ninetyDaysAgo = new Date(Date.now() - HEAT_LOOKBACK_DAYS * MS_PER_DAY);
    const last90 = db.select({ outcome: outreachLogs.outcome, date: outreachLogs.date }).from(outreachLogs).where(and(eq(outreachLogs.clientId, clientId), gte(outreachLogs.date, ninetyDaysAgo))).all();
    const { score, level } = calcHeatScore(c, last90);
    db.update(clients).set({ heatScore: score, heatLevel: level, updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
  } catch (err) {
    console.error(`recalcHeat failed for client ${clientId}:`, err);
  }
}

// Matches by exact model only (intentionally narrower than matchPromoToClients in promos.ts,
// which also matches by collection). At purchase time the model is known precisely.
// onConflictDoNothing handles clients who were already collection-matched when the promo was created.
async function createPromoMatchIfApplies(clientId: string, modelNumber: string) {
  const promos = db.select().from(promoWatches).all();
  for (const p of promos) {
    if (p.modelNumber.toLowerCase() === modelNumber.toLowerCase()) {
      db.insert(promoMatches).values({ id: randomUUID(), clientId, promoId: p.id, matchType: "model" }).onConflictDoNothing().run();
    }
  }
}

export async function logOutreach(data: OutreachInput): Promise<{ error: string } | undefined> {
  const result = outreachInputSchema.safeParse(data);
  if (!result.success) return { error: "Invalid outreach data" };
  const parsed = result.data;
  // B-5: getSessionUser() intentionally used instead of requireAuth() — outreach can be
  // logged without attributing it to an employee (employeeId is nullable by design).
  const user = await getSessionUser();
  const id = randomUUID();
  const date = new Date();
  const patch: Record<string, unknown> = { lastOutreachAt: date, updatedAt: date };
  if (parsed.outcome === "purchased") patch.lastPurchaseAt = date;
  try {
    db.transaction((tx) => {
      tx.insert(outreachLogs).values({
        id,
        clientId: parsed.clientId,
        method: parsed.method,
        date,
        outcome: parsed.outcome,
        purchasedModel: parsed.outcome === "purchased" ? parsed.purchasedModel || null : null,
        notes: parsed.notes || null,
        employeeId: user?.id ?? null,
        followUpDate: parsed.followUpDate ? new Date(parsed.followUpDate) : null,
        templateId: parsed.templateId || null,
        completed: false,
      }).run();
      tx.update(clients).set(patch).where(eq(clients.id, parsed.clientId)).run();
      tx.insert(activityEvents).values({
        id: randomUUID(),
        clientId: parsed.clientId,
        eventType: parsed.outcome === "purchased" ? "purchase" : "outreach_logged",
        description: `${parsed.method} — ${parsed.outcome.replace(/_/g, " ")}${parsed.purchasedModel ? ` (${parsed.purchasedModel})` : ""}`,
        employeeId: user?.id ?? null,
        metadata: { method: parsed.method, outcome: parsed.outcome, ...(parsed.purchasedModel ? { purchasedModel: parsed.purchasedModel } : {}) },
      }).run();
    });
  } catch (err) {
    console.error("logOutreach failed:", err);
    return { error: "Failed to log outreach" };
  }
  await recalcHeat(parsed.clientId);
  if (parsed.outcome === "purchased" && parsed.purchasedModel) {
    try {
      await createPromoMatchIfApplies(parsed.clientId, parsed.purchasedModel);
    } catch (err) {
      console.error("createPromoMatchIfApplies failed:", err);
    }
  }
  revalidatePath(`/clients/${parsed.clientId}`);
  revalidatePath("/follow-ups");
  revalidatePath("/");
}

export async function markFollowUpComplete(logId: string) {
  const user = await requireAuth();
  const log = db.select({ clientId: outreachLogs.clientId }).from(outreachLogs).where(eq(outreachLogs.id, logId)).get();
  db.transaction((tx) => {
    tx.update(outreachLogs).set({ completed: true }).where(eq(outreachLogs.id, logId)).run();
    if (log) {
      tx.insert(activityEvents).values({
        id: randomUUID(), clientId: log.clientId, eventType: "outreach_logged", description: `Follow-up marked complete by ${user.name}`, employeeId: user.id,
      }).run();
    }
  });
  if (log) revalidatePath(`/clients/${log.clientId}`);
  revalidatePath("/follow-ups");
}

export async function rescheduleFollowUp(logId: string, newDate: string) {
  const user = await requireAuth();
  const log = db.select({ clientId: outreachLogs.clientId }).from(outreachLogs).where(eq(outreachLogs.id, logId)).get();
  db.transaction((tx) => {
    tx.update(outreachLogs).set({ followUpDate: new Date(newDate) }).where(eq(outreachLogs.id, logId)).run();
    if (log) {
      tx.insert(activityEvents).values({
        id: randomUUID(), clientId: log.clientId, eventType: "outreach_logged", description: `Follow-up rescheduled to ${format(new Date(newDate), "MMM d, yyyy")} by ${user.name}`, employeeId: user.id,
      }).run();
    }
  });
  if (log) revalidatePath(`/clients/${log.clientId}`);
  revalidatePath("/follow-ups");
}
