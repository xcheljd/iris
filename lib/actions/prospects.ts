"use server";
import { db } from "@/lib/db";
import { clients, activityEvents, unsubscribeList, prospects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { fullName } from "@/lib/utils";
import { findDuplicateClient } from "@/lib/duplicate-client";
import {
  graduateEnrichmentSchema,
  graduateProspectSchema,
  type GraduateProspectInput,
} from "@/lib/validation/rvx";
import { requireAuth } from "./_shared";
import { recordProductsOfInterest } from "./model-catalog";

export async function graduateProspect(input: GraduateProspectInput): Promise<
  | { type: "created"; clientId: string }
  | { type: "duplicate"; existingClientId: string; existingClientName: string }
  | { type: "error"; error: string }
> {
  const user = await requireAuth();
  const parsed = graduateProspectSchema.parse(input);

  const prospect = db.select().from(prospects).where(eq(prospects.id, parsed.prospectId)).get();
  if (!prospect) return { type: "error", error: "Prospect not found" };
  if (prospect.status !== "active") return { type: "error", error: "Prospect is not active" };

  // Duplicate check against live clients — contact details only, same rule
  // and same implementation as the new-client form and POST /api/clients.
  const match = findDuplicateClient({ email: parsed.email, phone: parsed.phone });

  if (match) {
    return {
      type: "duplicate",
      existingClientId: match.id,
      existingClientName: fullName(match),
    };
  }

  const newClientId = randomUUID();

  db.transaction((tx) => {
    tx.insert(clients).values({
      id: newClientId,
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      preferredContact: parsed.preferredContact,
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

    recordProductsOfInterest(tx, parsed.productsOfInterest);

    tx.update(prospects)
      .set({ status: "graduated", graduatedToClientId: newClientId, updatedAt: new Date() })
      .where(eq(prospects.id, parsed.prospectId))
      .run();

    tx.insert(activityEvents).values({
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
  rawEnrichment: Partial<GraduateProspectInput>,
): Promise<{ error: string } | undefined> {
  const user = await requireAuth();
  const enrichment = graduateEnrichmentSchema.parse(rawEnrichment);

  const prospect = db.select().from(prospects).where(eq(prospects.id, prospectId)).get();
  if (!prospect) return { error: "Prospect not found" };
  if (prospect.status !== "active") return { error: "Cannot graduate a prospect that is not active" };

  const existing = db.select().from(clients).where(eq(clients.id, existingClientId)).get();
  if (!existing) return { error: "Client not found" };
  if (user.role !== "manager" && existing.employeeId !== user.id) return { error: "Not authorized to modify this client" };

  // Only backfill fields that are currently null/empty on the existing client
  const patch: Partial<typeof clients.$inferInsert> = { updatedAt: new Date() };
  if (!existing.phone && enrichment.phone) patch.phone = enrichment.phone;
  if (!existing.email && enrichment.email) patch.email = enrichment.email;
  if (!existing.birthday && enrichment.birthday) patch.birthday = enrichment.birthday;
  if (!existing.anniversary && enrichment.anniversary) patch.anniversary = enrichment.anniversary;
  if (!existing.notes && enrichment.notes) patch.notes = enrichment.notes;
  if (!existing.preferredContact && enrichment.preferredContact) patch.preferredContact = enrichment.preferredContact;
  if (!existing.customerId && prospect.rvxCustomerId) patch.customerId = prospect.rvxCustomerId;
  if (
    (!existing.productsOfInterest || existing.productsOfInterest.length === 0) &&
    enrichment.productsOfInterest?.length
  ) {
    patch.productsOfInterest = enrichment.productsOfInterest;
  }

  db.transaction((tx) => {
    tx.update(clients).set(patch).where(eq(clients.id, existingClientId)).run();
    if (patch.productsOfInterest) recordProductsOfInterest(tx, patch.productsOfInterest);

    tx.update(prospects)
      .set({ status: "graduated", graduatedToClientId: existingClientId, updatedAt: new Date() })
      .where(eq(prospects.id, prospectId))
      .run();

    tx.insert(activityEvents).values({
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

export async function rejectProspect(prospectId: string): Promise<{ error: string } | undefined> {
  await requireAuth();

  const prospect = db.select().from(prospects).where(eq(prospects.id, prospectId)).get();
  if (!prospect) return { error: "Prospect not found" };
  if (prospect.status !== "active") return { error: "Cannot reject a prospect that is not active" };

  db.update(prospects)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(eq(prospects.id, prospectId))
    .run();
  revalidatePath("/prospects");
}

export async function unsubscribeProspect(prospectId: string): Promise<{ error: string } | undefined> {
  await requireAuth();

  const prospect = db.select().from(prospects).where(eq(prospects.id, prospectId)).get();
  if (!prospect) return { error: "Prospect not found" };
  if (prospect.status !== "active") return { error: "Cannot unsubscribe a prospect that is not active" };

  db.transaction((tx) => {
    tx.update(prospects)
      .set({ status: "unsubscribed", updatedAt: new Date() })
      .where(eq(prospects.id, prospectId))
      .run();

    if (prospect.email) {
      const alreadyUnsub = tx
        .select({ id: unsubscribeList.id })
        .from(unsubscribeList)
        .where(eq(unsubscribeList.email, prospect.email))
        .get();
      if (!alreadyUnsub) {
        tx.insert(unsubscribeList).values({
          id: randomUUID(),
          email: prospect.email,
        }).run();
      }
    }
  });

  revalidatePath("/prospects");
}
