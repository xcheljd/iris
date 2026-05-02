import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { outreachLogs, activityEvents, clients } from "@/lib/db/schema";
import { eq, gte, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { calcHeatScore } from "@/lib/heat-score";
import { MS_PER_DAY } from "@/lib/constants";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const body = await request.json();
    const { clientId, method, outcome, purchasedModel, notes, followUpDate, templateId } = body;

    if (!clientId || !method || !outcome) {
      return NextResponse.json({ error: "clientId, method, and outcome are required" }, { status: 400 });
    }

    const id = randomUUID();
    const date = new Date();

    db.insert(outreachLogs).values({
      id,
      clientId,
      method,
      date,
      outcome,
      purchasedModel: outcome === "purchased" ? purchasedModel || null : null,
      notes: notes || null,
      followUpDate: followUpDate ? new Date(followUpDate) : null,
      templateId: templateId || null,
      completed: false,
    }).run();

    const patch: Record<string, unknown> = { lastOutreachAt: date, updatedAt: date };
    if (outcome === "purchased") patch.lastPurchaseAt = date;
    db.update(clients).set(patch).where(eq(clients.id, clientId)).run();

    db.insert(activityEvents).values({
      id: randomUUID(),
      clientId,
      eventType: outcome === "purchased" ? "purchase" : "outreach_logged",
      description: `${method} — ${outcome.replace(/_/g, " ")}${purchasedModel ? ` (${purchasedModel})` : ""}`,
      metadata: { method, outcome },
    }).run();

    // Recalc heat
    const c = db.select().from(clients).where(eq(clients.id, clientId)).get();
    if (c) {
      const ninetyDaysAgo = new Date(Date.now() - 90 * MS_PER_DAY);
      const last90 = db.select({ outcome: outreachLogs.outcome, date: outreachLogs.date }).from(outreachLogs).where(and(eq(outreachLogs.clientId, clientId), gte(outreachLogs.date, ninetyDaysAgo))).all();
      const { score, level } = calcHeatScore(c, last90);
      db.update(clients).set({ heatScore: score, heatLevel: level, updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
    }

    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/follow-ups");
    revalidatePath("/");

    return NextResponse.json({ success: true, id });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to log outreach" }, { status: 500 });
  }
}