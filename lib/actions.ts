"use server";
import { db } from "@/lib/db";
import { clients, outreachLogs, activityEvents, promoWatches, promoMatches, bannedCustomers, unsubscribeList, clientTags, outreachTemplates, employees, smartLists, approvalRequests, rvxImportBatches, prospects } from "@/lib/db/schema";
import { parseRvxCsv, findWithinImportDuplicates, selectBestRecord, serializeDuplicatesToCsv, type RvxRawRow } from "@/lib/rvx-parser";
import { graduateProspectSchema, type GraduateProspectInput } from "@/lib/validation/rvx";
import { eq, desc, sql, gte, and, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { calcHeatScore } from "@/lib/heat-score";
import { MS_PER_DAY, HEAT_LOOKBACK_DAYS, MIN_PASSWORD_LENGTH, BCRYPT_SALT_ROUNDS } from "@/lib/constants";
import { normalizePhone, fullName } from "@/lib/utils";
import { outreachInputSchema, type OutreachInput } from "@/lib/validation/outreach";
import { format } from "date-fns";
import bcrypt from "bcryptjs";

async function getSessionUser() {
  const session = await getServerSession(authOptions);
  return session?.user;
}

async function requireAuth() {
  const user = await getSessionUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

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

export async function logOutreach(data: OutreachInput) {
  const parsed = outreachInputSchema.parse(data);
  // B-5: getSessionUser() intentionally used instead of requireAuth() — outreach can be
  // logged without attributing it to an employee (employeeId is nullable by design).
  const user = await getSessionUser();
  const id = randomUUID();
  const date = new Date();
  const patch: Record<string, unknown> = { lastOutreachAt: date, updatedAt: date };
  if (parsed.outcome === "purchased") patch.lastPurchaseAt = date;
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
  await recalcHeat(parsed.clientId);
  if (parsed.outcome === "purchased" && parsed.purchasedModel) {
    await createPromoMatchIfApplies(parsed.clientId, parsed.purchasedModel);
  }
  revalidatePath(`/clients/${parsed.clientId}`);
  revalidatePath("/follow-ups");
  revalidatePath("/");
}

async function createPromoMatchIfApplies(clientId: string, modelNumber: string) {
  const promos = db.select().from(promoWatches).all();
  for (const p of promos) {
    if (p.modelNumber === modelNumber) {
      db.insert(promoMatches).values({ id: randomUUID(), clientId, promoId: p.id, matchType: "model" }).run();
    }
  }
}

export async function markFollowUpComplete(logId: string) {
  const user = await requireAuth();
  const log = db.select({ clientId: outreachLogs.clientId }).from(outreachLogs).where(eq(outreachLogs.id, logId)).get();
  db.update(outreachLogs).set({ completed: true }).where(eq(outreachLogs.id, logId)).run();
  if (log) {
    db.insert(activityEvents).values({
      id: randomUUID(), clientId: log.clientId, eventType: "outreach_logged", description: `Follow-up marked complete by ${user.name}`, employeeId: user.id,
    }).run();
    revalidatePath(`/clients/${log.clientId}`);
  }
  revalidatePath("/follow-ups");
}

export async function rescheduleFollowUp(logId: string, newDate: string) {
  const user = await requireAuth();
  const log = db.select({ clientId: outreachLogs.clientId }).from(outreachLogs).where(eq(outreachLogs.id, logId)).get();
  db.update(outreachLogs).set({ followUpDate: new Date(newDate) }).where(eq(outreachLogs.id, logId)).run();
  if (log) {
    db.insert(activityEvents).values({
      id: randomUUID(), clientId: log.clientId, eventType: "outreach_logged", description: `Follow-up rescheduled to ${format(new Date(newDate), "MMM d, yyyy")} by ${user.name}`, employeeId: user.id,
    }).run();
    revalidatePath(`/clients/${log.clientId}`);
  }
  revalidatePath("/follow-ups");
}

export async function deleteSmartList(listId: string) {
  const user = await requireAuth();
  const list = db.select().from(smartLists).where(eq(smartLists.id, listId)).get();
  if (!list) throw new Error("Smart list not found");
  if (user.role !== "manager" && list.ownerId !== user.id) throw new Error("Not authorized to delete this smart list");
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

export async function renameSmartList(listId: string, newName: string) {
  const user = await requireAuth();
  const list = db.select().from(smartLists).where(eq(smartLists.id, listId)).get();
  if (!list) throw new Error("Smart list not found");
  if (user.role !== "manager" && list.ownerId !== user.id) throw new Error("Not authorized to rename this smart list");
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

export async function addTag(clientId: string, tag: string) {
  const user = await requireAuth();
  const c = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!c) return { error: "Client not found" };
  if ((c.tags || []).includes(tag)) return;
  const tags = [...(c.tags || []), tag];
  try {
    db.transaction((tx) => {
      tx.update(clients).set({ tags, updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
      const existing = tx.select().from(clientTags).where(eq(clientTags.name, tag)).get();
      if (existing) {
        tx.update(clientTags).set({ usageCount: sql`${clientTags.usageCount} + 1` }).where(eq(clientTags.id, existing.id)).run();
      } else {
        tx.insert(clientTags).values({ id: randomUUID(), name: tag, usageCount: 1 }).run();
      }
      tx.insert(activityEvents).values({
        id: randomUUID(), clientId, eventType: "tag_added", description: `Tag added: ${tag}`, employeeId: user.id, metadata: { tagName: tag },
      }).run();
    });
    revalidatePath(`/clients/${clientId}`);
  } catch (_err) {
    return { error: "Failed to add tag" };
  }
}

export async function removeTag(clientId: string, tag: string) {
  const user = await requireAuth();
  const c = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!c) return { error: "Client not found" };
  if (!(c.tags || []).includes(tag)) return;
  const tags = (c.tags || []).filter((t) => t !== tag);
  try {
    db.transaction((tx) => {
      tx.update(clients).set({ tags, updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
      const existing = tx.select().from(clientTags).where(eq(clientTags.name, tag)).get();
      if (existing) {
        tx.update(clientTags).set({ usageCount: sql`CASE WHEN ${clientTags.usageCount} - 1 < 0 THEN 0 ELSE ${clientTags.usageCount} - 1 END` }).where(eq(clientTags.id, existing.id)).run();
      }
      tx.insert(activityEvents).values({
        id: randomUUID(), clientId, eventType: "tag_removed", description: `Tag removed: ${tag}`, employeeId: user.id, metadata: { tagName: tag },
      }).run();
    });
    revalidatePath(`/clients/${clientId}`);
  } catch (_err) {
    return { error: "Failed to remove tag" };
  }
}

export async function banClient(clientId: string, category: "Reselling" | "Gift Card Fraud" | "Other", reason: string) {
  const user = await requireManager();
  const c = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!c) return;
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

export async function unsubscribeClient(clientId: string) {
  const user = await requireManager();
  const c = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!c) return;
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

interface PromoClientEntry {
  id: string;
  poiLower: string[];
}
interface PromoClientIndex {
  modelMap: Map<string, string[]>; // lowercase poi → clientIds (for O(1) exact model lookup)
  entries: PromoClientEntry[];     // pre-lowercased for collection substring scan
}

function buildPromoClientIndex(
  all: Array<{ id: string; productsOfInterest: string[] | null }>,
): PromoClientIndex {
  const modelMap = new Map<string, string[]>();
  const entries: PromoClientEntry[] = [];
  for (const c of all) {
    const poiLower = (c.productsOfInterest ?? []).map((p) => p.toLowerCase());
    entries.push({ id: c.id, poiLower });
    for (const p of poiLower) {
      const arr = modelMap.get(p);
      if (arr) arr.push(c.id);
      else modelMap.set(p, [c.id]);
    }
  }
  return { modelMap, entries };
}

function matchPromoToClients(
  tx: Pick<typeof db, "insert">,
  promoId: string,
  modelNumber: string,
  collection: string,
  index: PromoClientIndex,
) {
  const modelLower = modelNumber.toLowerCase();
  const collectionLower = collection.toLowerCase();
  const matches: { id: string; clientId: string; promoId: string; matchType: "model" | "collection" }[] = [];

  const modelClientIds = index.modelMap.get(modelLower) ?? [];
  const modelMatchSet = new Set(modelClientIds);
  for (const clientId of modelClientIds) {
    matches.push({ id: randomUUID(), clientId, promoId, matchType: "model" });
  }

  if (collectionLower) {
    for (const entry of index.entries) {
      if (!modelMatchSet.has(entry.id) && entry.poiLower.some((p) => p.includes(collectionLower))) {
        matches.push({ id: randomUUID(), clientId: entry.id, promoId, matchType: "collection" });
      }
    }
  }

  if (matches.length > 0) {
    tx.insert(promoMatches).values(matches).run();
  }
}

export async function createPromo(modelNumber: string, collection: string, msrp?: number | null, discountPercent?: number | null, discountPrice?: number | null) {
  await requireManager();
  if (!modelNumber?.trim() || !collection?.trim()) return { error: "Model number and collection are required" };
  try {
    const all = db.select({ id: clients.id, productsOfInterest: clients.productsOfInterest }).from(clients).all();
    const index = buildPromoClientIndex(all);
    const id = randomUUID();
    db.transaction((tx) => {
      tx.insert(promoWatches).values({ id, modelNumber, collection, msrp: msrp ?? null, discountPercent: discountPercent ?? null, discountPrice: discountPrice ?? null }).run();
      matchPromoToClients(tx, id, modelNumber, collection, index);
    });
    revalidatePath("/promos");
  } catch (_err) {
    return { error: "Failed to create promo" };
  }
}

export async function importPromos(rows: { modelNumber: string; collection: string; msrp?: number | null; discountPercent?: number | null; discountPrice?: number | null }[], promoStart?: string | null, promoEnd?: string | null) {
  await requireManager();
  try {
    const all = db.select({ id: clients.id, productsOfInterest: clients.productsOfInterest }).from(clients).all();
    const index = buildPromoClientIndex(all);
    let imported = 0;
    db.transaction((tx) => {
      for (const row of rows) {
        if (!row.modelNumber?.trim() || !row.collection?.trim()) continue;
        const id = randomUUID();
        const modelNumber = row.modelNumber.trim();
        const collection = row.collection.trim();
        tx.insert(promoWatches).values({
          id,
          modelNumber,
          collection,
          msrp: row.msrp ?? null,
          discountPercent: row.discountPercent ?? null,
          discountPrice: row.discountPrice ?? null,
          promoStart: promoStart ?? null,
          promoEnd: promoEnd ?? null,
        }).run();
        matchPromoToClients(tx, id, modelNumber, collection, index);
        imported++;
      }
    });
    revalidatePath("/promos");
    return { imported };
  } catch (_err) {
    return { error: "Failed to import promos" };
  }
}

export async function clearAllPromos() {
  await requireManager();
  try {
    db.transaction((tx) => {
      tx.delete(promoMatches).run();
      tx.delete(promoWatches).run();
    });
    revalidatePath("/promos");
  } catch (_err) {
    return { error: "Failed to clear promos" };
  }
}

export async function deletePromo(id: string) {
  await requireManager();
  db.transaction((tx) => {
    tx.delete(promoMatches).where(eq(promoMatches.promoId, id)).run();
    tx.delete(promoWatches).where(eq(promoWatches.id, id)).run();
  });
  revalidatePath("/promos");
}

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

export async function createTag(name: string, color: string) {
  await requireManager();
  db.insert(clientTags).values({ id: randomUUID(), name, color }).run();
  revalidatePath("/settings");
}

export async function deleteTag(id: string) {
  await requireManager();
  db.delete(clientTags).where(eq(clientTags.id, id)).run();
  revalidatePath("/settings");
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

export async function addUnsubscribeEmail(email: string) {
  await requireManager();
  const existing = db.select().from(unsubscribeList).where(eq(unsubscribeList.email, email)).get();
  if (existing) throw new Error("Email already exists");
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
  db.update(clients).set({ status: "active", onEmailList: true, updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
  if (c.email) {
    db.delete(unsubscribeList).where(eq(unsubscribeList.email, c.email)).run();
  }
  db.insert(activityEvents).values({
    id: randomUUID(), clientId, eventType: "status_changed", description: "Resubscribed", metadata: { newStatus: "active" }, employeeId: null,
  }).run();
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/unsubscribed");
}

export async function toggleEmailList(clientId: string) {
  await requireAuth();
  const c = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!c) throw new Error("Client not found");
  if (c.status === "unsubscribed") throw new Error("Cannot toggle email list for unsubscribed client");
  const newValue = !c.onEmailList;
  db.update(clients).set({ onEmailList: newValue, updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
  db.insert(activityEvents).values({
    id: randomUUID(), clientId, eventType: "edited", description: newValue ? "Added to email list" : "Removed from email list", metadata: { onEmailList: newValue }, employeeId: null,
  }).run();
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
}

export async function createEmployee(data: {
  firstName: string;
  lastName: string;
  username: string;
  password: string;
  role: "manager" | "associate";
}) {
  const user = await getSessionUser();
  if (user?.role !== "manager") return { error: "Unauthorized" };
  if (!data.firstName || !data.username || !data.password || data.password.length < MIN_PASSWORD_LENGTH) {
    return { error: "First name, username, and password (min 6 chars) are required" };
  }
  const existing = db.select().from(employees).where(eq(employees.username, data.username)).get();
  if (existing) return { error: "Username already taken" };
  const passwordHash = await bcrypt.hash(data.password, BCRYPT_SALT_ROUNDS);
  const firstName = data.firstName.trim();
  const lastName = data.lastName?.trim() || null;
  db.insert(employees).values({
    id: randomUUID(),
    name: lastName ? `${firstName} ${lastName}` : firstName,
    firstName,
    lastName,
    username: data.username,
    passwordHash,
    role: data.role,
    active: true,
  }).run();
  revalidatePath("/settings");
  return { success: true as const };
}

export async function updateEmployee(employeeId: string, data: { firstName: string; lastName: string; username: string; role?: "manager" | "associate"; active?: boolean }) {
  const user = await getSessionUser();
  if (!user) return { error: "Not authenticated" };
  const isSelf = user.id === employeeId;
  const isManager = user.role === "manager";
  if (!isSelf && !isManager) return { error: "Unauthorized" };

  if (!data.firstName?.trim() || !data.username?.trim()) {
    return { error: "First name and username are required" };
  }

  const target = db.select().from(employees).where(eq(employees.id, employeeId)).get();
  if (!target) return { error: "Employee not found" };

  if (data.username !== target.username) {
    const existing = db.select().from(employees).where(eq(employees.username, data.username)).get();
    if (existing) return { error: "Username already taken" };
  }

  const firstName = data.firstName.trim();
  const lastName = data.lastName.trim() || null;
  const updates: Record<string, unknown> = {
    firstName,
    lastName,
    username: data.username.trim(),
    name: lastName ? `${firstName} ${lastName}` : firstName,
  };
  if (isManager && !isSelf) {
    if (data.role) updates.role = data.role;
    if (data.active !== undefined) updates.active = data.active;
  }

  db.update(employees).set(updates).where(eq(employees.id, employeeId)).run();
  revalidatePath("/settings");
  return { success: true as const };
}

export async function resetEmployeePassword(employeeId: string, newPassword: string) {
  const user = await getSessionUser();
  if (user?.role !== "manager") return { error: "Unauthorized" };
  if (!newPassword || newPassword.length < 6) return { error: "Password must be at least 6 characters" };
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
  db.update(employees).set({ passwordHash }).where(eq(employees.id, employeeId)).run();
  return { success: true as const };
}

export async function updateEmployeeRole(employeeId: string, newRole: "manager" | "associate") {
  const user = await getSessionUser();
  if (user?.role !== "manager") return { error: "Unauthorized" };
  db.update(employees).set({ role: newRole }).where(eq(employees.id, employeeId)).run();
  revalidatePath("/settings");
  return { success: true as const };
}

export async function toggleEmployeeActive(employeeId: string, active: boolean) {
  const user = await getSessionUser();
  if (user?.role !== "manager") return { error: "Unauthorized" };
  if (user.id === employeeId && !active) return { error: "Cannot deactivate your own account" };
  db.update(employees).set({ active }).where(eq(employees.id, employeeId)).run();
  revalidatePath("/settings");
  return { success: true as const };
}

export async function changeOwnPassword(currentPassword: string, newPassword: string) {
  const user = await getSessionUser();
  if (!user) return { error: "Not authenticated" };
  const userRecord = db.select().from(employees).where(eq(employees.id, user.id)).get();
  if (!userRecord) return { error: "User not found" };
  const valid = await bcrypt.compare(currentPassword, userRecord.passwordHash);
  if (!valid) return { error: "Current password is incorrect" };
  if (!newPassword || newPassword.length < 6) return { error: "New password must be at least 6 characters" };
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
  db.update(employees).set({ passwordHash }).where(eq(employees.id, user.id)).run();
  return { success: true as const };
}

export async function createApprovalRequest(
  type: "ban" | "unsubscribe" | "delete",
  clientId: string,
  reason: string,
  metadata?: Record<string, unknown>,
) {
  const user = await requireAuth();
  if (!reason.trim()) throw new Error("Reason is required");
  const id = randomUUID();
  db.insert(approvalRequests).values({
    id,
    type,
    clientId,
    requestorId: user.id,
    reason: reason.trim(),
    status: "pending",
    metadata: metadata || null,
  }).run();

  let requestEventType: string;
  if (type === "ban") requestEventType = "ban_requested";
  else if (type === "unsubscribe") requestEventType = "unsub_requested";
  else requestEventType = "delete_requested";

  db.insert(activityEvents).values({
    id: randomUUID(),
    clientId,
    eventType: requestEventType as "ban_requested" | "unsub_requested" | "delete_requested",
    description: `${type} requested by ${user.name}: ${reason.trim()}`,
    metadata: { requestId: id },
    employeeId: user.id,
  }).run();

  revalidatePath("/");
  return { id };
}

export async function reviewApprovalRequest(
  requestId: string,
  approved: boolean,
) {
  const user = await requireManager();
  const request = db.select().from(approvalRequests).where(eq(approvalRequests.id, requestId)).get();
  if (!request) throw new Error("Request not found");
  if (request.status !== "pending") throw new Error("Request already reviewed");

  // Run the downstream action first — if it throws, approval stays "pending" and is retryable.
  // Previously the status was committed before the action, making failures unrecoverable.
  if (approved) {
    switch (request.type) {
      case "ban":
        await banClient(request.clientId, "Other", request.reason);
        break;
      case "unsubscribe":
        await unsubscribeClient(request.clientId);
        break;
      case "delete":
        await deleteClient(request.clientId);
        break;
    }
  }

  let eventType: string;
  if (request.type === "ban") eventType = approved ? "ban_approved" : "ban_rejected";
  else if (request.type === "unsubscribe") eventType = approved ? "unsub_approved" : "unsub_rejected";
  else eventType = approved ? "delete_approved" : "delete_rejected";

  db.transaction((tx) => {
    tx.update(approvalRequests).set({
      status: approved ? "approved" : "rejected",
      reviewedById: user.id,
      reviewedAt: new Date(),
    }).where(eq(approvalRequests.id, requestId)).run();

    tx.insert(activityEvents).values({
      id: randomUUID(),
      clientId: request.clientId,
      eventType: eventType as "ban_approved" | "ban_rejected" | "unsub_approved" | "unsub_rejected" | "delete_approved" | "delete_rejected",
      description: approved
        ? `${request.type} request approved by ${user.name}`
        : `${request.type} request rejected by ${user.name}`,
      metadata: { requestId: request.id, requestorId: request.requestorId, reason: request.reason },
      employeeId: user.id,
    }).run();
  });
}

export async function getPendingApprovalRequests() {
  await requireManager();
  const requests = db.select({
    request: approvalRequests,
    clientName: sql<string>`COALESCE(${clients.firstName}, '') || ' ' || COALESCE(${clients.lastName}, '')`,
    requestorName: sql<string>`COALESCE(${employees.firstName}, '') || ' ' || COALESCE(${employees.lastName}, '')`,
  }).from(approvalRequests)
    .leftJoin(clients, eq(approvalRequests.clientId, clients.id))
    .leftJoin(employees, eq(approvalRequests.requestorId, employees.id))
    .where(eq(approvalRequests.status, "pending"))
    .orderBy(desc(approvalRequests.createdAt))
    .all();
  return requests;
}

async function requireManager() {
  const user = await requireAuth();
  if (user.role !== "manager") throw new Error("Manager access required");
  return user;
}

export async function transferClient(clientId: string, newEmployeeId: string) {
  const user = await requireManager();

  const clientRow = db.select({ employeeId: clients.employeeId }).from(clients).where(eq(clients.id, clientId)).get();
  if (!clientRow) throw new Error("Client not found");

  const newEmployee = db.select({ firstName: employees.firstName, lastName: employees.lastName }).from(employees).where(eq(employees.id, newEmployeeId)).get();
  if (!newEmployee) throw new Error("Employee not found");

  const previousEmployee = clientRow.employeeId
    ? db.select({ firstName: employees.firstName, lastName: employees.lastName }).from(employees).where(eq(employees.id, clientRow.employeeId)).get()
    : null;

  db.update(clients).set({ employeeId: newEmployeeId, updatedAt: new Date() }).where(eq(clients.id, clientId)).run();

  const newEmployeeName = `${newEmployee.firstName} ${newEmployee.lastName ?? ""}`.trim();
  const previousEmployeeName = previousEmployee ? `${previousEmployee.firstName} ${previousEmployee.lastName ?? ""}`.trim() : undefined;

  db.insert(activityEvents).values({
    id: randomUUID(),
    clientId,
    eventType: "transferred",
    description: `Transferred to ${newEmployeeName}`,
    employeeId: user.id,
    metadata: { newEmployeeName, ...(previousEmployeeName ? { previousEmployeeName } : {}) },
  }).run();

  revalidatePath(`/clients/${clientId}`);
}

export async function deleteClient(clientId: string) {
  const user = await requireManager();

  const client = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!client) throw new Error("Client not found");
  if (client.status === "deleted") throw new Error("Client already deleted");

  db.update(clients).set({
    status: "deleted",
    previousStatus: client.status,
    deletedAt: new Date(),
    deletedBy: user.id,
    updatedAt: new Date(),
  }).where(eq(clients.id, clientId)).run();

  db.insert(activityEvents).values({
    id: randomUUID(),
    clientId,
    eventType: "status_changed",
    description: `Client deleted by ${user.name}`,
    employeeId: user.id,
  }).run();

  revalidatePath("/clients");
  revalidatePath("/settings");
}

export async function restoreClient(clientId: string) {
  const user = await requireManager();

  const client = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!client) throw new Error("Client not found");
  if (client.status !== "deleted") throw new Error("Client is not deleted");

  db.update(clients).set({
    status: client.previousStatus ?? "active",
    previousStatus: null,
    deletedAt: null,
    deletedBy: null,
    updatedAt: new Date(),
  }).where(eq(clients.id, clientId)).run();

  db.insert(activityEvents).values({
    id: randomUUID(),
    clientId,
    eventType: "status_changed",
    description: `Client restored to ${client.previousStatus ?? "active"} by ${user.name}`,
    employeeId: user.id,
  }).run();

  revalidatePath("/clients");
  revalidatePath("/settings");
}

export async function purgeClient(clientId: string) {
  await requireManager();

  const client = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!client) throw new Error("Client not found");

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
): Promise<{ winnerId: string }> {
  const user = await requireManager();

  const clientA = db.select().from(clients).where(eq(clients.id, clientAId)).get();
  const clientB = db.select().from(clients).where(eq(clients.id, clientBId)).get();
  if (!clientA || !clientB) throw new Error("Client not found");

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

  db.update(clients).set({
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
    productsOfInterest: Array.from(new Set([...(clientA.productsOfInterest || []), ...(clientB.productsOfInterest || [])])),
    tags: Array.from(new Set([...(clientA.tags || []), ...(clientB.tags || [])])),
    lastOutreachAt: latestOf(clientA.lastOutreachAt, clientB.lastOutreachAt),
    lastPurchaseAt: latestOf(clientA.lastPurchaseAt, clientB.lastPurchaseAt),
    updatedAt: new Date(),
  }).where(eq(clients.id, winner.id)).run();

  // Migrate FK references from loser to winner
  db.update(outreachLogs).set({ clientId: winner.id }).where(eq(outreachLogs.clientId, loser.id)).run();
  db.update(activityEvents).set({ clientId: winner.id }).where(eq(activityEvents.clientId, loser.id)).run();
  db.update(approvalRequests).set({ clientId: winner.id }).where(eq(approvalRequests.clientId, loser.id)).run();

  // promoMatches: delete loser's entries that conflict with winner's, then migrate the rest
  const winnerPromoIds = db.select({ promoId: promoMatches.promoId })
    .from(promoMatches).where(eq(promoMatches.clientId, winner.id)).all()
    .map((r) => r.promoId);
  if (winnerPromoIds.length > 0) {
    db.delete(promoMatches)
      .where(and(eq(promoMatches.clientId, loser.id), inArray(promoMatches.promoId, winnerPromoIds)))
      .run();
  }
  db.update(promoMatches).set({ clientId: winner.id }).where(eq(promoMatches.clientId, loser.id)).run();

  const loserName = `${loser.firstName} ${loser.lastName ?? ""}`.trim();
  db.insert(activityEvents).values({
    id: randomUUID(),
    clientId: winner.id,
    eventType: "merged",
    description: `Merged from ${loserName}`,
    employeeId: user.id,
    metadata: { sourceClientId: loser.id, sourceClientName: loserName },
  }).run();

  db.delete(clients).where(eq(clients.id, loser.id)).run();

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
    productsOfInterest?: string[];
    tags?: string[];
  },
): Promise<void> {
  const user = await requireManager();
  const existing = db.select().from(clients).where(eq(clients.id, existingId)).get();
  if (!existing) throw new Error("Client not found");

  db.update(clients).set({
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

  db.insert(activityEvents).values({
    id: randomUUID(),
    clientId: existingId,
    eventType: "merged",
    description: "Merged from new client form entry",
    employeeId: user.id,
    metadata: { sourceClientName: "new form entry" },
  }).run();

  await recalcHeat(existingId);
  revalidatePath(`/clients/${existingId}`);
}

export async function setSecretQuestion(question: string, answer: string) {
  const user = await getSessionUser();
  if (!user) return { error: "Not authenticated" };
  if (!question || !question.trim()) return { error: "Question is required" };
  if (!answer || answer.trim().length < 2) return { error: "Answer must be at least 2 characters" };
  const normalizedAnswer = answer.trim().toLowerCase();
  const hash = await bcrypt.hash(normalizedAnswer, BCRYPT_SALT_ROUNDS);
  db.update(employees)
    .set({ secretQuestion: question.trim(), secretAnswerHash: hash })
    .where(eq(employees.id, user.id))
    .run();
  return { success: true as const };
}

// ─── RVX Import ───────────────────────────────────────────────────────────────

export interface RvxAnalysisResult {
  newCount: number;
  alreadyClientCount: number;
  bannedCount: number;
  unsubscribedCount: number;
  deletedCount: number;
  duplicateCount: number;
  duplicateCsv: string;
  readyToImport: RvxRawRow[];
  reportStartDate: Date;
  reportEndDate: Date;
  parseErrors: string[];
}

async function categorizeRvxRows(rows: RvxRawRow[]): Promise<{
  newRows: RvxRawRow[];
  alreadyClientCount: number;
  bannedCount: number;
  unsubscribedCount: number;
  deletedCount: number;
}> {
  // Batch-load all comparison sets (4 queries total)
  const allBanned = db.select({ email: bannedCustomers.email, phone: bannedCustomers.phone }).from(bannedCustomers).all();
  const bannedEmails = new Set(allBanned.map((r) => r.email?.toLowerCase()).filter(Boolean) as string[]);
  const bannedPhones = new Set(allBanned.map((r) => r.phone?.replace(/\D/g, "")).filter(Boolean) as string[]);

  const allUnsub = db.select({ email: unsubscribeList.email }).from(unsubscribeList).all();
  const unsubEmails = new Set(allUnsub.map((r) => r.email.toLowerCase()));

  const allClients = db
    .select({ email: clients.email, phone: clients.phone, deletedAt: clients.deletedAt })
    .from(clients)
    .all();
  const activeClientEmails = new Set<string>();
  const activeClientPhones = new Set<string>();
  const deletedClientEmails = new Set<string>();
  const deletedClientPhones = new Set<string>();
  for (const c of allClients) {
    if (c.deletedAt) {
      if (c.email) deletedClientEmails.add(c.email.toLowerCase());
      if (c.phone) deletedClientPhones.add(c.phone.replace(/\D/g, ""));
    } else {
      if (c.email) activeClientEmails.add(c.email.toLowerCase());
      if (c.phone) activeClientPhones.add(c.phone.replace(/\D/g, ""));
    }
  }

  const newRows: RvxRawRow[] = [];
  let alreadyClientCount = 0;
  let bannedCount = 0;
  let unsubscribedCount = 0;
  let deletedCount = 0;

  for (const row of rows) {
    const email = row.email?.toLowerCase() ?? null;
    const phone = row.phone ?? null;

    if (email && bannedEmails.has(email) || phone && bannedPhones.has(phone)) {
      bannedCount++;
    } else if (email && unsubEmails.has(email)) {
      unsubscribedCount++;
    } else if (
      (email && deletedClientEmails.has(email)) ||
      (phone && deletedClientPhones.has(phone))
    ) {
      deletedCount++;
    } else if (
      (email && activeClientEmails.has(email)) ||
      (phone && activeClientPhones.has(phone))
    ) {
      alreadyClientCount++;
    } else {
      newRows.push(row);
    }
  }

  return { newRows, alreadyClientCount, bannedCount, unsubscribedCount, deletedCount };
}

export async function analyzeRvxImport(csvText: string): Promise<RvxAnalysisResult> {
  await requireManager();

  const { rows, reportStartDate, reportEndDate, parseErrors } = parseRvxCsv(csvText);

  const dupeGroups = findWithinImportDuplicates(rows);
  const dupeRowSet = new Set<RvxRawRow>();
  const dedupedBestSet = new Set<RvxRawRow>();
  const deduped: RvxRawRow[] = [];

  for (const row of rows) {
    const key = [
      row.firstName.toLowerCase(),
      row.lastName?.toLowerCase() ?? "",
      row.phone ?? "",
      row.email?.toLowerCase() ?? "",
    ].join("|");
    const group = dupeGroups.get(key);
    if (group) {
      for (const r of group) dupeRowSet.add(r);
      const best = selectBestRecord(group);
      if (!dedupedBestSet.has(best)) {
        dedupedBestSet.add(best);
        deduped.push(best);
      }
    } else {
      deduped.push(row);
    }
  }
  const dupeRows = Array.from(dupeRowSet);

  const { newRows, alreadyClientCount, bannedCount, unsubscribedCount, deletedCount } =
    await categorizeRvxRows(deduped);

  return {
    newCount: newRows.length,
    alreadyClientCount,
    bannedCount,
    unsubscribedCount,
    deletedCount,
    duplicateCount: dupeRows.length,
    duplicateCsv: serializeDuplicatesToCsv(dupeRows),
    readyToImport: newRows,
    reportStartDate,
    reportEndDate,
    parseErrors,
  };
}

export async function importProspectsFromRvx(
  csvText: string,
): Promise<{ importedCount: number }> {
  const user = await requireManager();

  const { rows, reportStartDate, reportEndDate } = parseRvxCsv(csvText);

  const dupeGroups = findWithinImportDuplicates(rows);
  const deduped: RvxRawRow[] = [];
  const seen = new Set<RvxRawRow>();

  for (const row of rows) {
    const key = [
      row.firstName.toLowerCase(),
      row.lastName?.toLowerCase() ?? "",
      row.phone ?? "",
      row.email?.toLowerCase() ?? "",
    ].join("|");
    const group = dupeGroups.get(key);
    if (group) {
      const best = selectBestRecord(group);
      if (!seen.has(best)) {
        seen.add(best);
        deduped.push(best);
      }
    } else {
      deduped.push(row);
    }
  }

  const { newRows } = await categorizeRvxRows(deduped);

  const batchId = randomUUID();

  db.transaction(() => {
    db.insert(rvxImportBatches).values({
      id: batchId,
      reportStartDate,
      reportEndDate,
      totalRows: rows.length,
      importedCount: newRows.length,
      importedBy: user.id,
    }).run();

    for (const row of newRows) {
      db.insert(prospects).values({
        id: randomUUID(),
        rvxCustomerId: row.customerId,
        rvxStoreId: row.storeId,
        rvxSpend: row.spend,
        importBatchId: batchId,
        firstName: row.firstName,
        lastName: row.lastName,
        phone: row.phone,
        email: row.email,
        productsOfInterest: [],
      }).run();
    }
  });

  revalidatePath("/prospects");
  return { importedCount: newRows.length };
}

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
