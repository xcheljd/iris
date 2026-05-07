"use server";
import { db } from "@/lib/db";
import { clients, outreachLogs, activityEvents, promoWatches, promoMatches, bannedCustomers, unsubscribeList, clientTags, outreachTemplates, employees, smartLists, approvalRequests } from "@/lib/db/schema";
import { eq, desc, sql, gte, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { calcHeatScore } from "@/lib/heat-score";
import { MS_PER_DAY } from "@/lib/constants";
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
  await requireAuth();
  const c = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!c) return;
  const ninetyDaysAgo = new Date(Date.now() - 90 * MS_PER_DAY);
  const last90 = db.select({ outcome: outreachLogs.outcome, date: outreachLogs.date }).from(outreachLogs).where(and(eq(outreachLogs.clientId, clientId), gte(outreachLogs.date, ninetyDaysAgo))).all();
  const { score, level } = calcHeatScore(c, last90);
  db.update(clients).set({ heatScore: score, heatLevel: level, updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
}

export async function logOutreach(data: OutreachInput) {
  const parsed = outreachInputSchema.parse(data);
  const user = await requireAuth();
  const id = randomUUID();
  const date = new Date();
  db.insert(outreachLogs).values({
    id,
    clientId: parsed.clientId,
    method: parsed.method,
    date,
    outcome: parsed.outcome,
    purchasedModel: parsed.outcome === "purchased" ? parsed.purchasedModel || null : null,
    notes: parsed.notes || null,
    employeeId: user.id,
    followUpDate: parsed.followUpDate ? new Date(parsed.followUpDate) : null,
    templateId: parsed.templateId || null,
    completed: false,
  }).run();
  const patch: Record<string, unknown> = { lastOutreachAt: date, updatedAt: date };
  if (parsed.outcome === "purchased") patch.lastPurchaseAt = date;
  db.update(clients).set(patch).where(eq(clients.id, parsed.clientId)).run();
  db.insert(activityEvents).values({
    id: randomUUID(),
    clientId: parsed.clientId,
    eventType: parsed.outcome === "purchased" ? "purchase" : "outreach_logged",
    description: `${parsed.method} — ${parsed.outcome.replace(/_/g, " ")}${parsed.purchasedModel ? ` (${parsed.purchasedModel})` : ""}`,
    employeeId: user.id,
    metadata: { method: parsed.method, outcome: parsed.outcome, ...(parsed.purchasedModel ? { purchasedModel: parsed.purchasedModel } : {}) },
  }).run();
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
  if (!c) return;
  const tags = Array.from(new Set([...(c.tags || []), tag]));
  db.update(clients).set({ tags, updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
  const existing = db.select().from(clientTags).where(eq(clientTags.name, tag)).get();
  if (existing) {
    db.update(clientTags).set({ usageCount: existing.usageCount + 1 }).where(eq(clientTags.id, existing.id)).run();
  }
  db.insert(activityEvents).values({
    id: randomUUID(), clientId, eventType: "tag_added", description: `Tag added: ${tag}`, employeeId: user.id, metadata: { tagName: tag },
  }).run();
  revalidatePath(`/clients/${clientId}`);
}

export async function removeTag(clientId: string, tag: string) {
  const user = await requireAuth();
  const c = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!c) return;
  const tags = (c.tags || []).filter((t) => t !== tag);
  db.update(clients).set({ tags, updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
  db.insert(activityEvents).values({
    id: randomUUID(), clientId, eventType: "tag_removed", description: `Tag removed: ${tag}`, employeeId: user.id, metadata: { tagName: tag },
  }).run();
  revalidatePath(`/clients/${clientId}`);
}

export async function banClient(clientId: string, category: "Reselling" | "Gift Card Fraud" | "Other", reason: string) {
  const user = await requireManager();
  const c = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!c) return;
  db.update(clients).set({ status: "banned", updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
  db.insert(bannedCustomers).values({
    id: randomUUID(),
    customerId: clientId,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    banReasonCategory: category,
    specificBanReason: reason,
  }).run();
  db.insert(activityEvents).values({
    id: randomUUID(), clientId, eventType: "status_changed", description: `Banned: ${category} — ${reason}`, metadata: { newStatus: "banned" }, employeeId: user.id,
  }).run();
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/banned");
}

export async function unsubscribeClient(clientId: string) {
  const user = await requireManager();
  const c = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!c) return;
  db.update(clients).set({ status: "unsubscribed", onEmailList: false, updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
  if (c.email) {
    const existing = db.select().from(unsubscribeList).where(eq(unsubscribeList.email, c.email)).get();
    if (!existing) db.insert(unsubscribeList).values({ id: randomUUID(), email: c.email }).run();
  }
  db.insert(activityEvents).values({
    id: randomUUID(), clientId, eventType: "status_changed", description: "Unsubscribed", metadata: { newStatus: "unsubscribed" }, employeeId: user.id,
  }).run();
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/unsubscribed");
}

function matchPromoToClients(
  promoId: string,
  modelNumber: string,
  collection: string,
  allClients: Array<{ id: string; productsOfInterest: string[] | null }>,
) {
  const modelLower = modelNumber.toLowerCase();
  const collectionLower = collection.toLowerCase();
  for (const c of allClients) {
    const poi = c.productsOfInterest || [];
    if (poi.some((p) => p.toLowerCase() === modelLower)) {
      db.insert(promoMatches).values({ id: randomUUID(), clientId: c.id, promoId, matchType: "model" }).run();
    } else if (poi.some((p) => p.toLowerCase().includes(collectionLower))) {
      db.insert(promoMatches).values({ id: randomUUID(), clientId: c.id, promoId, matchType: "collection" }).run();
    }
  }
}

export async function createPromo(modelNumber: string, collection: string, msrp?: number | null, discountPercent?: number | null, discountPrice?: number | null) {
  await requireManager();
  const id = randomUUID();
  db.insert(promoWatches).values({ id, modelNumber, collection, msrp: msrp ?? null, discountPercent: discountPercent ?? null, discountPrice: discountPrice ?? null }).run();
  const all = db.select().from(clients).all();
  matchPromoToClients(id, modelNumber, collection, all);
  revalidatePath("/promos");
}

export async function importPromos(rows: { modelNumber: string; collection: string; msrp?: number | null; discountPercent?: number | null; discountPrice?: number | null }[], promoStart?: string | null, promoEnd?: string | null) {
  await requireManager();
  const all = db.select().from(clients).all();
  let imported = 0;
  for (const row of rows) {
    if (!row.modelNumber?.trim() || !row.collection?.trim()) continue;
    const id = randomUUID();
    const modelNumber = row.modelNumber.trim();
    const collection = row.collection.trim();
    db.insert(promoWatches).values({
      id,
      modelNumber,
      collection,
      msrp: row.msrp ?? null,
      discountPercent: row.discountPercent ?? null,
      discountPrice: row.discountPrice ?? null,
      promoStart: promoStart ?? null,
      promoEnd: promoEnd ?? null,
    }).run();
    matchPromoToClients(id, modelNumber, collection, all);
    imported++;
  }
  revalidatePath("/promos");
  return { imported };
}

export async function clearAllPromos() {
  await requireManager();
  db.delete(promoMatches).run();
  db.delete(promoWatches).run();
  revalidatePath("/promos");
}

export async function deletePromo(id: string) {
  await requireManager();
  db.delete(promoMatches).where(eq(promoMatches.promoId, id)).run();
  db.delete(promoWatches).where(eq(promoWatches.id, id)).run();
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
  db.update(clients).set({ status: "active", updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
  if (c.email) {
    const row = db.select().from(bannedCustomers).where(eq(bannedCustomers.email, c.email)).get();
    if (row) db.delete(bannedCustomers).where(eq(bannedCustomers.id, row.id)).run();
  }
  db.insert(activityEvents).values({
    id: randomUUID(), clientId, eventType: "status_changed", description: "Unbanned", metadata: { newStatus: "active" }, employeeId: null,
  }).run();
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/banned");
}

export async function addUnsubscribeEmail(email: string) {
  await requireManager();
  const existing = db.select().from(unsubscribeList).where(eq(unsubscribeList.email, email)).get();
  if (existing) throw new Error("Email already exists");
  db.insert(unsubscribeList).values({ id: randomUUID(), email }).run();
  // Find matching client by email and update status
  const matchingClient = db.select().from(clients).where(eq(clients.email, email)).get();
  if (matchingClient) {
    db.update(clients).set({ status: "unsubscribed", onEmailList: false, updatedAt: new Date() }).where(eq(clients.id, matchingClient.id)).run();
    db.insert(activityEvents).values({
      id: randomUUID(), clientId: matchingClient.id, eventType: "status_changed", description: "Manually added to unsubscribe list", metadata: { newStatus: "unsubscribed" }, employeeId: null,
    }).run();
    revalidatePath(`/clients/${matchingClient.id}`);
  }
  revalidatePath("/unsubscribed");
}

export async function resubscribeClient(clientId: string) {
  await requireManager();
  const c = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!c) return;
  db.update(clients).set({ status: "active", updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
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
  if (!data.firstName || !data.username || !data.password || data.password.length < 6) {
    return { error: "First name, username, and password (min 6 chars) are required" };
  }
  const existing = db.select().from(employees).where(eq(employees.username, data.username)).get();
  if (existing) return { error: "Username already taken" };
  const passwordHash = await bcrypt.hash(data.password, 10);
  db.insert(employees).values({
    id: randomUUID(),
    firstName: data.firstName.trim(),
    lastName: data.lastName.trim() || null,
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

  const updates: Record<string, unknown> = { firstName: data.firstName.trim(), lastName: data.lastName.trim() || null, username: data.username.trim() };
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
  const passwordHash = await bcrypt.hash(newPassword, 10);
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
  const passwordHash = await bcrypt.hash(newPassword, 10);
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

  db.update(approvalRequests).set({
    status: approved ? "approved" : "rejected",
    reviewedById: user.id,
    reviewedAt: new Date(),
  }).where(eq(approvalRequests.id, requestId)).run();

  let eventType: string;
  if (request.type === "ban") eventType = approved ? "ban_approved" : "ban_rejected";
  else if (request.type === "unsubscribe") eventType = approved ? "unsub_approved" : "unsub_rejected";
  else eventType = approved ? "delete_approved" : "delete_rejected";

  db.insert(activityEvents).values({
    id: randomUUID(),
    clientId: request.clientId,
    eventType: eventType as "ban_approved" | "ban_rejected" | "unsub_approved" | "unsub_rejected" | "delete_approved" | "delete_rejected",
    description: approved
      ? `${request.type} request approved by ${user.name}`
      : `${request.type} request rejected by ${user.name}`,
    metadata: { requestId: request.id, requestorId: request.requestorId, reason: request.reason },
    employeeId: user.id,
  }).run();

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
}

export async function getPendingApprovalCount() {
  await requireManager();
  const result = db.select({ c: sql<number>`count(*)` }).from(approvalRequests).where(eq(approvalRequests.status, "pending")).get();
  return result?.c ?? 0;
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

  db.delete(activityEvents).where(eq(activityEvents.clientId, clientId)).run();
  db.delete(outreachLogs).where(eq(outreachLogs.clientId, clientId)).run();
  db.delete(clients).where(eq(clients.id, clientId)).run();

  revalidatePath("/clients");
  revalidatePath("/settings");
}

export async function setSecretQuestion(question: string, answer: string) {
  const user = await getSessionUser();
  if (!user) return { error: "Not authenticated" };
  if (!question || !question.trim()) return { error: "Question is required" };
  if (!answer || answer.trim().length < 2) return { error: "Answer must be at least 2 characters" };
  const normalizedAnswer = answer.trim().toLowerCase();
  const hash = await bcrypt.hash(normalizedAnswer, 10);
  db.update(employees)
    .set({ secretQuestion: question.trim(), secretAnswerHash: hash })
    .where(eq(employees.id, user.id))
    .run();
  return { success: true as const };
}
