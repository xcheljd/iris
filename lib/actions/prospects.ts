"use server";
import { db } from "@/lib/db";
import { clients, activityEvents, unsubscribeList, prospects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { normalizePhone, fullName } from "@/lib/utils";
import { graduateProspectSchema, type GraduateProspectInput } from "@/lib/validation/rvx";
import { requireAuth } from "./_shared";

export async function graduateProspect(input: GraduateProspectInput): Promise<
  | { type: "created"; clientId: string }
  | { type: "duplicate"; existingClientId: string; existingClientName: string }
> {
  const user = await requireAuth();
  const parsed = graduateProspectSchema.parse(input);

  const prospect = db.select().from(prospects).where(eq(prospects.id, parsed.prospectId)).get();
  if (!prospect) throw new Error("Prospect not found");
  if (prospect.status !== "active") throw new Error("Prospect is not active");

  // Duplicate check against live clients
  const allClients = db
    .select({ id: clients.id, firstName: clients.firstName, lastName: clients.lastName, email: clients.email, phone: clients.phone, deletedAt: clients.deletedAt })
    .from(clients)
    .all();

  const email = parsed.email?.toLowerCase() ?? null;
  const phone = normalizePhone(parsed.phone ?? null);

  const match = allClients.find(
    (c) =>
      c.deletedAt === null &&
      ((email && c.email?.toLowerCase() === email) ||
        (phone && normalizePhone(c.phone) === phone)),
  );

  if (match) {
    return {
      type: "duplicate",
      existingClientId: match.id,
      existingClientName: fullName(match),
    };
  }

  const newClientId = randomUUID();

  db.transaction(() => {
    db.insert(clients).values({
      id: newClientId,
      firstName: parsed.firstName,
      lastName: parsed.lastName ?? null,
      phone: parsed.phone ?? null,
      email: parsed.email ?? null,
      birthday: parsed.birthday ?? null,
      anniversary: parsed.anniversary ?? null,
      notes: parsed.notes ?? null,
      productsOfInterest: parsed.productsOfInterest,
      source: "Customer Report",
      customerId: prospect.rvxCustomerId,
      employeeId: user.role === "associate" ? user.id : undefined,
    }).run();

    db.update(prospects)
      .set({ status: "graduated", graduatedToClientId: newClientId, updatedAt: new Date() })
      .where(eq(prospects.id, parsed.prospectId))
      .run();

    db.insert(activityEvents).values({
      id: randomUUID(),
      clientId: newClientId,
      eventType: "created",
      description: "Client created from prospect graduation",
      employeeId: user.id,
      metadata: { source: "prospect_graduation", prospectId: parsed.prospectId },
    }).run();
  });

  revalidatePath("/prospects");
  revalidatePath("/clients");
  return { type: "created", clientId: newClientId };
}

export async function graduateProspectIntoExistingClient(
  prospectId: string,
  existingClientId: string,
  enrichment: Partial<GraduateProspectInput>,
): Promise<void> {
  const user = await requireAuth();

  const prospect = db.select().from(prospects).where(eq(prospects.id, prospectId)).get();
  if (!prospect) throw new Error("Prospect not found");

  const existing = db.select().from(clients).where(eq(clients.id, existingClientId)).get();
  if (!existing) throw new Error("Client not found");

  // Only backfill fields that are currently null/empty on the existing client
  const patch: Partial<typeof clients.$inferInsert> = { updatedAt: new Date() };
  if (!existing.phone && enrichment.phone) patch.phone = enrichment.phone;
  if (!existing.email && enrichment.email) patch.email = enrichment.email;
  if (!existing.birthday && enrichment.birthday) patch.birthday = enrichment.birthday;
  if (!existing.anniversary && enrichment.anniversary) patch.anniversary = enrichment.anniversary;
  if (!existing.notes && enrichment.notes) patch.notes = enrichment.notes;
  if (!existing.customerId && prospect.rvxCustomerId) patch.customerId = prospect.rvxCustomerId;
  if (
    (!existing.productsOfInterest || existing.productsOfInterest.length === 0) &&
    enrichment.productsOfInterest?.length
  ) {
    patch.productsOfInterest = enrichment.productsOfInterest;
  }

  db.transaction(() => {
    db.update(clients).set(patch).where(eq(clients.id, existingClientId)).run();

    db.update(prospects)
      .set({ status: "graduated", graduatedToClientId: existingClientId, updatedAt: new Date() })
      .where(eq(prospects.id, prospectId))
      .run();

    db.insert(activityEvents).values({
      id: randomUUID(),
      clientId: existingClientId,
      eventType: "edited",
      description: "Prospect graduated into this client record",
      employeeId: user.id,
      metadata: { source: "prospect_graduation", prospectId },
    }).run();
  });

  revalidatePath("/prospects");
  revalidatePath(`/clients/${existingClientId}`);
}

export async function rejectProspect(prospectId: string): Promise<void> {
  await requireAuth();
  db.update(prospects)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(eq(prospects.id, prospectId))
    .run();
  revalidatePath("/prospects");
}

export async function unsubscribeProspect(prospectId: string): Promise<void> {
  await requireAuth();

  const prospect = db.select().from(prospects).where(eq(prospects.id, prospectId)).get();
  if (!prospect) throw new Error("Prospect not found");

  db.transaction(() => {
    db.update(prospects)
      .set({ status: "unsubscribed", updatedAt: new Date() })
      .where(eq(prospects.id, prospectId))
      .run();

    if (prospect.email) {
      const alreadyUnsub = db
        .select({ id: unsubscribeList.id })
        .from(unsubscribeList)
        .where(eq(unsubscribeList.email, prospect.email))
        .get();
      if (!alreadyUnsub) {
        db.insert(unsubscribeList).values({
          id: randomUUID(),
          email: prospect.email,
        }).run();
      }
    }
  });

  revalidatePath("/prospects");
}
