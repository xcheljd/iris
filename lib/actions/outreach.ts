"use server";
import { db } from "@/lib/db";
import { clients, outreachLogs, activityEvents, promoWatches, promoMatches } from "@/lib/db/schema";
import { and, eq, isNotNull, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { outreachInputSchema, followUpDateSchema, isPastFollowUpDay, PAST_FOLLOW_UP_ERROR, type OutreachInput } from "@/lib/validation/outreach";
import { addDays, format, parseISO, startOfDay } from "date-fns";
import { requireAuth } from "./_shared";
import { recalcHeat } from "@/lib/heat-recalc";

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
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `${i.path.join(".") || "form"}: ${i.message}`)
      .join("; ");
    return { error: `Invalid outreach data — ${details}` };
  }
  const parsed = result.data;
  const user = await requireAuth();
  if (parsed.followUpDate && isPastFollowUpDay(parsed.followUpDate)) return { error: PAST_FOLLOW_UP_ERROR };

  const client = db.select({ employeeId: clients.employeeId }).from(clients).where(eq(clients.id, parsed.clientId)).get();
  if (!client) return { error: "Client not found" };
  if (user.role !== "manager" && client.employeeId !== user.id) {
    return { error: "You can only log outreach for your own clients" };
  }

  const id = randomUUID();
  const date = new Date();
  const patch: Record<string, unknown> = { lastOutreachAt: date, updatedAt: date };
  if (parsed.outcome === "purchased") patch.lastPurchaseAt = date;
  // A new outreach answers the client's follow-ups that are due (today or
  // overdue): close them so they stop showing as overdue. Future follow-ups
  // stay open; they were scheduled for a later reason.
  const dueBy = addDays(startOfDay(date), 1);
  try {
    db.transaction((tx) => {
      const closed = tx.update(outreachLogs).set({ completed: true }).where(and(
        eq(outreachLogs.clientId, parsed.clientId),
        eq(outreachLogs.completed, false),
        isNotNull(outreachLogs.followUpDate),
        lt(outreachLogs.followUpDate, dueBy),
      )).run();
      if (closed.changes > 0) {
        tx.insert(activityEvents).values({
          id: randomUUID(),
          clientId: parsed.clientId,
          eventType: "outreach_logged",
          description: `${closed.changes === 1 ? "Follow-up" : `${closed.changes} follow-ups`} closed by new outreach (${user.name})`,
          employeeId: user.id,
        }).run();
      }
      tx.insert(outreachLogs).values({
        id,
        clientId: parsed.clientId,
        method: parsed.method,
        date,
        outcome: parsed.outcome,
        purchasedModel: parsed.outcome === "purchased" ? parsed.purchasedModel || null : null,
        notes: parsed.notes || null,
        employeeId: user.id,
        followUpDate: parsed.followUpDate ? parseISO(parsed.followUpDate) : null,
        templateId: parsed.templateId || null,
        completed: false,
      }).run();
      tx.update(clients).set(patch).where(eq(clients.id, parsed.clientId)).run();
      tx.insert(activityEvents).values({
        id: randomUUID(),
        clientId: parsed.clientId,
        eventType: parsed.outcome === "purchased" ? "purchase" : "outreach_logged",
        description: `${parsed.method} — ${parsed.outcome.replace(/_/g, " ")}${parsed.purchasedModel ? ` (${parsed.purchasedModel})` : ""}`,
        employeeId: user.id,
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

// Follow-ups belong to the client relationship: the Follow-ups list shows an
// associate the follow-ups on clients they own now, so that is who may act on
// them — not whoever logged the outreach (who may have since lost the client).
function getFollowUpOwner(logId: string) {
  return db.select({ clientId: outreachLogs.clientId, ownerId: clients.employeeId })
    .from(outreachLogs)
    .innerJoin(clients, eq(outreachLogs.clientId, clients.id))
    .where(eq(outreachLogs.id, logId))
    .get();
}

export async function markFollowUpComplete(logId: string): Promise<{ error: string } | undefined> {
  const user = await requireAuth();
  const log = getFollowUpOwner(logId);
  if (!log) return { error: "Follow-up not found" };
  if (user.role !== "manager" && log.ownerId !== user.id) return { error: "Not authorized to complete this follow-up" };
  try {
    db.transaction((tx) => {
      tx.update(outreachLogs).set({ completed: true }).where(eq(outreachLogs.id, logId)).run();
      tx.insert(activityEvents).values({
        id: randomUUID(), clientId: log.clientId, eventType: "outreach_logged", description: `Follow-up marked complete by ${user.name}`, employeeId: user.id,
      }).run();
    });
  } catch (err) {
    console.error("markFollowUpComplete failed:", err);
    return { error: "Failed to complete follow-up" };
  }
  revalidatePath(`/clients/${log.clientId}`);
  revalidatePath("/follow-ups");
}

/** Undo for markFollowUpComplete: same auth, flips `completed` back. */
export async function reopenFollowUp(logId: string): Promise<{ error: string } | undefined> {
  const user = await requireAuth();
  const log = getFollowUpOwner(logId);
  if (!log) return { error: "Follow-up not found" };
  if (user.role !== "manager" && log.ownerId !== user.id) return { error: "Not authorized to reopen this follow-up" };
  try {
    db.transaction((tx) => {
      tx.update(outreachLogs).set({ completed: false }).where(eq(outreachLogs.id, logId)).run();
      tx.insert(activityEvents).values({
        id: randomUUID(), clientId: log.clientId, eventType: "outreach_logged", description: `Follow-up reopened by ${user.name}`, employeeId: user.id,
      }).run();
    });
  } catch (err) {
    console.error("reopenFollowUp failed:", err);
    return { error: "Failed to reopen follow-up" };
  }
  revalidatePath(`/clients/${log.clientId}`);
  revalidatePath("/follow-ups");
}

export async function rescheduleFollowUp(logId: string, newDate: string): Promise<{ error: string } | undefined> {
  const user = await requireAuth();
  // `new Date("whatever")` yields an Invalid Date, which Drizzle happily writes as NaN.
  if (!followUpDateSchema.safeParse(newDate).success) return { error: "Invalid date" };
  if (isPastFollowUpDay(newDate)) return { error: PAST_FOLLOW_UP_ERROR };
  // parseISO reads a date-only string as local midnight; `new Date("2026-09-25")` is UTC
  // midnight, which is the evening of the 24th west of Greenwich.
  const followUpDate = parseISO(newDate);
  const log = getFollowUpOwner(logId);
  if (!log) return { error: "Follow-up not found" };
  if (user.role !== "manager" && log.ownerId !== user.id) return { error: "Not authorized to reschedule this follow-up" };
  try {
    db.transaction((tx) => {
      tx.update(outreachLogs).set({ followUpDate }).where(eq(outreachLogs.id, logId)).run();
      tx.insert(activityEvents).values({
        id: randomUUID(), clientId: log.clientId, eventType: "outreach_logged", description: `Follow-up rescheduled to ${format(followUpDate, "MMM d, yyyy")} by ${user.name}`, employeeId: user.id,
      }).run();
    });
  } catch (err) {
    console.error("rescheduleFollowUp failed:", err);
    return { error: "Failed to reschedule follow-up" };
  }
  revalidatePath(`/clients/${log.clientId}`);
  revalidatePath("/follow-ups");
}
