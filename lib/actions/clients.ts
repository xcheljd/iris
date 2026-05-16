"use server";
import { db } from "@/lib/db";
import { clients, outreachLogs, activityEvents, promoMatches, bannedCustomers, unsubscribeList, approvalRequests, employees, type ProductOfInterest } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { requireAuth, requireManager } from "./_shared";
import { recalcHeat } from "./outreach";
import { fullName } from "@/lib/utils";
import { recordProductsOfInterest } from "./model-catalog";

// Structural de-dupe for products of interest (objects, so Set won't dedupe).
function dedupeProducts(list: ProductOfInterest[]): ProductOfInterest[] {
  const seen = new Set<string>();
  const out: ProductOfInterest[] = [];
  for (const p of list) {
    const key = `${(p.model ?? "").toUpperCase()}|${(p.collection ?? "").toUpperCase()}`;
    if (!seen.has(key)) { seen.add(key); out.push(p); }
  }
  return out;
}

export async function applyClientPatch(clientId: string, data: Record<string, unknown>): Promise<void> {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) patch[k] = v;
  }
  db.update(clients).set(patch).where(eq(clients.id, clientId)).run();
  if (data.productsOfInterest !== undefined) {
    recordProductsOfInterest(db, data.productsOfInterest as ProductOfInterest[]);
  }
  db.insert(activityEvents).values({
    id: randomUUID(),
    clientId,
    eventType: "edited",
    description: "Profile updated",
    metadata: { fieldChanges: data },
  }).run();
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
}

export async function banClient(clientId: string, category: "Reselling" | "Gift Card Fraud" | "Other", reason: string): Promise<{ error: string } | undefined> {
  const user = await requireManager();
  const c = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!c) return { error: "Client not found" };
  db.transaction((tx) => {
    tx.update(clients).set({ status: "banned", updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
    tx.insert(bannedCustomers).values({
      id: randomUUID(),
      customerId: clientId,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      banReasonCategory: category,
      specificBanReason: reason,
    }).run();
    tx.insert(activityEvents).values({
      id: randomUUID(), clientId, eventType: "status_changed", description: `Banned: ${category} — ${reason}`, metadata: { newStatus: "banned" }, employeeId: user.id,
    }).run();
  });
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/banned");
}

export async function unsubscribeClient(clientId: string): Promise<{ error: string } | undefined> {
  const user = await requireManager();
  const c = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!c) return { error: "Client not found" };
  db.transaction((tx) => {
    tx.update(clients).set({ status: "unsubscribed", onEmailList: false, updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
    if (c.email) {
      const existing = tx.select().from(unsubscribeList).where(eq(unsubscribeList.email, c.email)).get();
      if (!existing) tx.insert(unsubscribeList).values({ id: randomUUID(), email: c.email }).run();
    }
    tx.insert(activityEvents).values({
      id: randomUUID(), clientId, eventType: "status_changed", description: "Unsubscribed", metadata: { newStatus: "unsubscribed" }, employeeId: user.id,
    }).run();
  });
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/unsubscribed");
}

export async function unbanClient(clientId: string) {
  await requireManager();
  const c = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!c || c.status !== "banned") return;
  db.transaction((tx) => {
    tx.update(clients).set({ status: "active", updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
    tx.delete(bannedCustomers).where(eq(bannedCustomers.customerId, clientId)).run();
    tx.insert(activityEvents).values({
      id: randomUUID(), clientId, eventType: "status_changed", description: "Unbanned", metadata: { newStatus: "active" }, employeeId: null,
    }).run();
  });
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/banned");
}

export async function addUnsubscribeEmail(email: string): Promise<{ error: string } | undefined> {
  await requireManager();
  const existing = db.select().from(unsubscribeList).where(eq(unsubscribeList.email, email)).get();
  if (existing) return { error: "Email already exists" };
  const matchingClient = db.select().from(clients).where(eq(clients.email, email)).get();
  db.transaction((tx) => {
    tx.insert(unsubscribeList).values({ id: randomUUID(), email }).run();
    if (matchingClient) {
      tx.update(clients).set({ status: "unsubscribed", onEmailList: false, updatedAt: new Date() }).where(eq(clients.id, matchingClient.id)).run();
      tx.insert(activityEvents).values({
        id: randomUUID(), clientId: matchingClient.id, eventType: "status_changed", description: "Manually added to unsubscribe list", metadata: { newStatus: "unsubscribed" }, employeeId: null,
      }).run();
    }
  });
  if (matchingClient) revalidatePath(`/clients/${matchingClient.id}`);
  revalidatePath("/unsubscribed");
}

export async function resubscribeClient(clientId: string) {
  await requireManager();
  const c = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!c) return;
  db.transaction((tx) => {
    tx.update(clients).set({ status: "active", onEmailList: true, updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
    if (c.email) {
      tx.delete(unsubscribeList).where(eq(unsubscribeList.email, c.email)).run();
    }
    tx.insert(activityEvents).values({
      id: randomUUID(), clientId, eventType: "status_changed", description: "Resubscribed", metadata: { newStatus: "active" }, employeeId: null,
    }).run();
  });
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/unsubscribed");
}

export async function toggleEmailList(clientId: string): Promise<{ error: string } | undefined> {
  await requireAuth();
  const c = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!c) return { error: "Client not found" };
  if (c.status === "unsubscribed") return { error: "Cannot toggle email list for unsubscribed client" };
  const newValue = !c.onEmailList;
  db.transaction((tx) => {
    tx.update(clients).set({ onEmailList: newValue, updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
    tx.insert(activityEvents).values({
      id: randomUUID(), clientId, eventType: "edited", description: newValue ? "Added to email list" : "Removed from email list", metadata: { onEmailList: newValue }, employeeId: null,
    }).run();
  });
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
}

export async function transferClient(clientId: string, newEmployeeId: string): Promise<{ error: string } | undefined> {
  const user = await requireManager();

  const clientRow = db.select({ employeeId: clients.employeeId }).from(clients).where(eq(clients.id, clientId)).get();
  if (!clientRow) return { error: "Client not found" };

  const newEmployee = db.select({ firstName: employees.firstName, lastName: employees.lastName }).from(employees).where(eq(employees.id, newEmployeeId)).get();
  if (!newEmployee) return { error: "Employee not found" };

  const previousEmployee = clientRow.employeeId
    ? db.select({ firstName: employees.firstName, lastName: employees.lastName }).from(employees).where(eq(employees.id, clientRow.employeeId)).get()
    : null;

  const newEmployeeName = fullName(newEmployee);
  const previousEmployeeName = previousEmployee ? fullName(previousEmployee) : undefined;

  db.transaction((tx) => {
    tx.update(clients).set({ employeeId: newEmployeeId, updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
    tx.insert(activityEvents).values({
      id: randomUUID(),
      clientId,
      eventType: "transferred",
      description: `Transferred to ${newEmployeeName}`,
      employeeId: user.id,
      metadata: { newEmployeeName, ...(previousEmployeeName ? { previousEmployeeName } : {}) },
    }).run();
  });

  revalidatePath(`/clients/${clientId}`);
}

export async function deleteClient(clientId: string): Promise<{ error: string } | undefined> {
  const user = await requireManager();

  const client = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!client) return { error: "Client not found" };
  if (client.status === "deleted") return { error: "Client already deleted" };

  db.transaction((tx) => {
    tx.update(clients).set({
      status: "deleted",
      previousStatus: client.status as "active" | "inactive" | "banned" | "unsubscribed",
      deletedAt: new Date(),
      deletedBy: user.id,
      updatedAt: new Date(),
    }).where(eq(clients.id, clientId)).run();

    tx.insert(activityEvents).values({
      id: randomUUID(),
      clientId,
      eventType: "status_changed",
      description: `Client deleted by ${user.name}`,
      employeeId: user.id,
    }).run();
  });

  revalidatePath("/clients");
  revalidatePath("/settings");
}

export async function restoreClient(clientId: string): Promise<{ error: string } | undefined> {
  const user = await requireManager();

  const client = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!client) return { error: "Client not found" };
  if (client.status !== "deleted") return { error: "Client is not deleted" };

  db.transaction((tx) => {
    tx.update(clients).set({
      status: client.previousStatus ?? "active",
      previousStatus: null,
      deletedAt: null,
      deletedBy: null,
      updatedAt: new Date(),
    }).where(eq(clients.id, clientId)).run();

    tx.insert(activityEvents).values({
      id: randomUUID(),
      clientId,
      eventType: "status_changed",
      description: `Client restored to ${client.previousStatus ?? "active"} by ${user.name}`,
      employeeId: user.id,
    }).run();
  });

  revalidatePath("/clients");
  revalidatePath("/settings");
}

export async function purgeClient(clientId: string): Promise<{ error: string } | undefined> {
  await requireManager();

  const client = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!client) return { error: "Client not found" };

  db.transaction((tx) => {
    tx.delete(activityEvents).where(eq(activityEvents.clientId, clientId)).run();
    tx.delete(outreachLogs).where(eq(outreachLogs.clientId, clientId)).run();
    tx.delete(promoMatches).where(eq(promoMatches.clientId, clientId)).run();
    tx.delete(approvalRequests).where(eq(approvalRequests.clientId, clientId)).run();
    tx.delete(clients).where(eq(clients.id, clientId)).run();
  });

  revalidatePath("/clients");
  revalidatePath("/settings");
}

export async function mergeClients(
  clientAId: string,
  clientBId: string,
  fieldChoices: Record<string, "a" | "b">,
  finalNotes: string | null,
): Promise<{ winnerId: string } | { error: string }> {
  const user = await requireManager();

  const clientA = db.select().from(clients).where(eq(clients.id, clientAId)).get();
  const clientB = db.select().from(clients).where(eq(clients.id, clientBId)).get();
  if (!clientA || !clientB) return { error: "Client not found" };

  // Older dateAdded survives
  const aIsOlder = new Date(clientA.dateAdded).getTime() <= new Date(clientB.dateAdded).getTime();
  const winner = aIsOlder ? clientA : clientB;
  const loser = aIsOlder ? clientB : clientA;

  const pick = (key: string): unknown =>
    fieldChoices[key] === "b"
      ? (clientB as Record<string, unknown>)[key]
      : (clientA as Record<string, unknown>)[key];

  const latestOf = (a: Date | null | undefined, b: Date | null | undefined) => {
    if (!a && !b) return null;
    if (!a) return b;
    if (!b) return a;
    return a.getTime() >= b.getTime() ? a : b;
  };

  const mergedProducts = dedupeProducts([
    ...(clientA.productsOfInterest || []),
    ...(clientB.productsOfInterest || []),
  ]);

  db.transaction((tx) => {
    tx.update(clients).set({
      firstName: pick("firstName") as string || winner.firstName,
      lastName: pick("lastName") as string | null,
      phone: pick("phone") as string | null,
      email: pick("email") as string | null,
      birthday: pick("birthday") as string | null,
      anniversary: pick("anniversary") as string | null,
      customerId: pick("customerId") as string | null,
      source: pick("source") as typeof clients.$inferSelect.source,
      onEmailList: (clientA.onEmailList || clientB.onEmailList),
      notes: finalNotes ?? null,
      productsOfInterest: mergedProducts,
      tags: Array.from(new Set([...(clientA.tags || []), ...(clientB.tags || [])])),
      lastOutreachAt: latestOf(clientA.lastOutreachAt, clientB.lastOutreachAt),
      lastPurchaseAt: latestOf(clientA.lastPurchaseAt, clientB.lastPurchaseAt),
      updatedAt: new Date(),
    }).where(eq(clients.id, winner.id)).run();

    // Migrate FK references from loser to winner
    tx.update(outreachLogs).set({ clientId: winner.id }).where(eq(outreachLogs.clientId, loser.id)).run();
    tx.update(activityEvents).set({ clientId: winner.id }).where(eq(activityEvents.clientId, loser.id)).run();
    tx.update(approvalRequests).set({ clientId: winner.id }).where(eq(approvalRequests.clientId, loser.id)).run();

    // promoMatches: delete loser's entries that conflict with winner's, then migrate the rest
    const winnerPromoIds = tx.select({ promoId: promoMatches.promoId })
      .from(promoMatches).where(eq(promoMatches.clientId, winner.id)).all()
      .map((r) => r.promoId);
    if (winnerPromoIds.length > 0) {
      tx.delete(promoMatches)
        .where(and(eq(promoMatches.clientId, loser.id), inArray(promoMatches.promoId, winnerPromoIds)))
        .run();
    }
    tx.update(promoMatches).set({ clientId: winner.id }).where(eq(promoMatches.clientId, loser.id)).run();

    const loserName = fullName(loser);
    tx.insert(activityEvents).values({
      id: randomUUID(),
      clientId: winner.id,
      eventType: "merged",
      description: `Merged from ${loserName}`,
      employeeId: user.id,
      metadata: { sourceClientId: loser.id, sourceClientName: loserName },
    }).run();

    tx.delete(clients).where(eq(clients.id, loser.id)).run();
    recordProductsOfInterest(tx, mergedProducts);
  });

  await recalcHeat(winner.id);
  revalidatePath(`/clients/${winner.id}`);
  revalidatePath("/clients");

  return { winnerId: winner.id };
}

export async function patchClientFromFormMerge(
  existingId: string,
  patch: {
    firstName: string;
    lastName?: string | null;
    phone?: string | null;
    email?: string | null;
    birthday?: string | null;
    anniversary?: string | null;
    customerId?: string | null;
    source?: string;
    onEmailList?: boolean;
    notes?: string | null;
    productsOfInterest?: ProductOfInterest[];
    tags?: string[];
  },
): Promise<{ error: string } | undefined> {
  const user = await requireManager();
  const existing = db.select().from(clients).where(eq(clients.id, existingId)).get();
  if (!existing) return { error: "Client not found" };

  db.transaction((tx) => {
    tx.update(clients).set({
      firstName: patch.firstName,
      lastName: patch.lastName ?? null,
      phone: patch.phone ?? null,
      email: patch.email ?? null,
      birthday: patch.birthday ?? null,
      anniversary: patch.anniversary ?? null,
      customerId: patch.customerId ?? null,
      source: (patch.source as typeof clients.$inferSelect.source) ?? existing.source,
      onEmailList: patch.onEmailList ?? existing.onEmailList,
      notes: patch.notes ?? null,
      productsOfInterest: patch.productsOfInterest ?? existing.productsOfInterest,
      tags: patch.tags ?? existing.tags,
      updatedAt: new Date(),
    }).where(eq(clients.id, existingId)).run();

    recordProductsOfInterest(tx, patch.productsOfInterest ?? existing.productsOfInterest);

    tx.insert(activityEvents).values({
      id: randomUUID(),
      clientId: existingId,
      eventType: "merged",
      description: "Merged from new client form entry",
      employeeId: user.id,
      metadata: { sourceClientName: "new form entry" },
    }).run();
  });

  await recalcHeat(existingId);
  revalidatePath(`/clients/${existingId}`);
}
