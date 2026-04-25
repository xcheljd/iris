"use server";
import { db } from "@/lib/db";
import { clients, outreachLogs, activityEvents, promoWatches, promoMatches, bannedCustomers, unsubscribeList, clientTags, outreachTemplates, employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { calcHeatScore } from "@/lib/heat-score";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";

async function getSessionUser() {
  const session = await getServerSession(authOptions);
  return session?.user;
}

export async function recalcHeat(clientId: string) {
  const c = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!c) return;
  const recent = db.select().from(outreachLogs).where(eq(outreachLogs.clientId, clientId)).all();
  const last90 = recent.filter((r) => r.date && (Date.now() - new Date(r.date).getTime()) < 90 * 86400000);
  const { score, level } = calcHeatScore(c, last90);
  db.update(clients).set({ heatScore: score, heatLevel: level, updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
}

export async function createClient(data: {
  firstName: string;
  lastName?: string;
  phone?: string;
  email?: string;
  productsOfInterest?: string[];
  notes?: string;
  onEmailList?: boolean;
  source?: string;
  birthday?: string;
  anniversary?: string;
  tags?: string[];
}) {
  const user = await getSessionUser();
  const id = randomUUID();
  db.insert(clients).values({
    id,
    firstName: data.firstName,
    lastName: data.lastName || null,
    phone: data.phone || null,
    email: data.email || null,
    employeeId: user?.id ?? null,
    productsOfInterest: data.productsOfInterest || [],
    notes: data.notes || null,
    onEmailList: data.onEmailList ?? false,
    source: (data.source as "Client Log" | "Customer Report" | "Walk-in" | "Referral") || "Walk-in",
    birthday: data.birthday || null,
    anniversary: data.anniversary || null,
    tags: data.tags || [],
  }).run();
  db.insert(activityEvents).values({
    id: randomUUID(),
    clientId: id,
    eventType: "created",
    description: `Client added by ${user?.name || "system"}`,
    employeeId: user?.id ?? null,
  }).run();
  await recalcHeat(id);
  revalidatePath("/clients");
  revalidatePath("/");
  redirect(`/clients/${id}`);
}

export async function updateClient(id: string, data: Partial<{
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  productsOfInterest: string[];
  notes: string;
  onEmailList: boolean;
  source: string;
  birthday: string;
  anniversary: string;
  tags: string[];
  status: string;
  employeeId: string | null;
}>) {
  const user = await getSessionUser();
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(data)) if (v !== undefined) patch[k] = v;
  db.update(clients).set(patch).where(eq(clients.id, id)).run();
  db.insert(activityEvents).values({
    id: randomUUID(),
    clientId: id,
    eventType: "edited",
    description: `Profile updated by ${user?.name || "system"}`,
    employeeId: user?.id ?? null,
  }).run();
  await recalcHeat(id);
  revalidatePath(`/clients/${id}`);
  revalidatePath("/clients");
}

export async function transferClient(id: string, toEmployeeId: string) {
  const user = await getSessionUser();
  db.update(clients).set({ employeeId: toEmployeeId, updatedAt: new Date() }).where(eq(clients.id, id)).run();
  db.insert(activityEvents).values({
    id: randomUUID(),
    clientId: id,
    eventType: "transferred",
    description: `Transferred by ${user?.name || "system"}`,
    employeeId: user?.id ?? null,
  }).run();
  revalidatePath(`/clients/${id}`);
}

export async function logOutreach(data: {
  clientId: string;
  method: "call" | "text" | "email" | "in-person";
  outcome: "no_answer" | "voicemail" | "voicemail_full" | "responded" | "not_interested" | "wants_to_come_in" | "purchased";
  purchasedModel?: string;
  notes?: string;
  followUpDate?: string | null;
  templateId?: string;
}) {
  const user = await getSessionUser();
  const id = randomUUID();
  const date = new Date();
  db.insert(outreachLogs).values({
    id,
    clientId: data.clientId,
    method: data.method,
    date,
    outcome: data.outcome,
    purchasedModel: data.outcome === "purchased" ? data.purchasedModel || null : null,
    notes: data.notes || null,
    employeeId: user?.id ?? null,
    followUpDate: data.followUpDate ? new Date(data.followUpDate) : null,
    templateId: data.templateId || null,
    completed: false,
  }).run();
  const patch: Record<string, unknown> = { lastOutreachAt: date, updatedAt: date };
  if (data.outcome === "purchased") patch.lastPurchaseAt = date;
  db.update(clients).set(patch).where(eq(clients.id, data.clientId)).run();
  db.insert(activityEvents).values({
    id: randomUUID(),
    clientId: data.clientId,
    eventType: data.outcome === "purchased" ? "purchase" : "outreach_logged",
    description: `${data.method} — ${data.outcome.replace(/_/g, " ")}${data.purchasedModel ? ` (${data.purchasedModel})` : ""}`,
    employeeId: user?.id ?? null,
    metadata: { method: data.method, outcome: data.outcome },
  }).run();
  await recalcHeat(data.clientId);
  if (data.outcome === "purchased" && data.purchasedModel) {
    await createPromoMatchIfApplies(data.clientId, data.purchasedModel);
  }
  revalidatePath(`/clients/${data.clientId}`);
  revalidatePath("/follow-ups");
  revalidatePath("/");
}

async function createPromoMatchIfApplies(clientId: string, modelNumber: string) {
  const promos = db.select().from(promoWatches).where(eq(promoWatches.active, true)).all();
  for (const p of promos) {
    if (p.modelNumber === modelNumber) {
      db.insert(promoMatches).values({ id: randomUUID(), clientId, promoId: p.id, matchType: "model" }).run();
    }
  }
}

export async function markFollowUpComplete(logId: string) {
  db.update(outreachLogs).set({ completed: true }).where(eq(outreachLogs.id, logId)).run();
  revalidatePath("/follow-ups");
}

export async function addTag(clientId: string, tag: string) {
  const user = await getSessionUser();
  const c = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!c) return;
  const tags = Array.from(new Set([...(c.tags || []), tag]));
  db.update(clients).set({ tags, updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
  const existing = db.select().from(clientTags).where(eq(clientTags.name, tag)).get();
  if (existing) {
    db.update(clientTags).set({ usageCount: existing.usageCount + 1 }).where(eq(clientTags.id, existing.id)).run();
  }
  db.insert(activityEvents).values({
    id: randomUUID(), clientId, eventType: "tag_added", description: `Tag added: ${tag}`, employeeId: user?.id ?? null,
  }).run();
  revalidatePath(`/clients/${clientId}`);
}

export async function removeTag(clientId: string, tag: string) {
  const user = await getSessionUser();
  const c = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!c) return;
  const tags = (c.tags || []).filter((t) => t !== tag);
  db.update(clients).set({ tags, updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
  db.insert(activityEvents).values({
    id: randomUUID(), clientId, eventType: "tag_removed", description: `Tag removed: ${tag}`, employeeId: user?.id ?? null,
  }).run();
  revalidatePath(`/clients/${clientId}`);
}

export async function banClient(clientId: string, category: "Reselling" | "Gift Card Fraud" | "Other", reason: string) {
  const user = await getSessionUser();
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
    id: randomUUID(), clientId, eventType: "status_changed", description: `Banned: ${category} — ${reason}`, employeeId: user?.id ?? null,
  }).run();
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/banned");
}

export async function unsubscribeClient(clientId: string) {
  const user = await getSessionUser();
  const c = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!c) return;
  db.update(clients).set({ status: "unsubscribed", onEmailList: false, updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
  if (c.email) {
    const existing = db.select().from(unsubscribeList).where(eq(unsubscribeList.email, c.email)).get();
    if (!existing) db.insert(unsubscribeList).values({ id: randomUUID(), email: c.email }).run();
  }
  db.insert(activityEvents).values({
    id: randomUUID(), clientId, eventType: "status_changed", description: "Unsubscribed", employeeId: user?.id ?? null,
  }).run();
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/unsubscribed");
}

export async function createPromo(modelNumber: string, collection: string) {
  const id = randomUUID();
  db.insert(promoWatches).values({ id, modelNumber, collection, active: true }).run();
  const all = db.select().from(clients).all();
  for (const c of all) {
    const poi = c.productsOfInterest || [];
    if (poi.some((p) => p.toLowerCase() === modelNumber.toLowerCase())) {
      db.insert(promoMatches).values({ id: randomUUID(), clientId: c.id, promoId: id, matchType: "model" }).run();
    } else if (poi.some((p) => p.toLowerCase().includes(collection.toLowerCase()))) {
      db.insert(promoMatches).values({ id: randomUUID(), clientId: c.id, promoId: id, matchType: "collection" }).run();
    }
  }
  revalidatePath("/promos");
}

export async function togglePromo(id: string, active: boolean) {
  db.update(promoWatches).set({ active }).where(eq(promoWatches.id, id)).run();
  revalidatePath("/promos");
}

export async function deletePromo(id: string) {
  db.delete(promoMatches).where(eq(promoMatches.promoId, id)).run();
  db.delete(promoWatches).where(eq(promoWatches.id, id)).run();
  revalidatePath("/promos");
}

export async function createTemplate(name: string, body: string, subject: string | null, channel: "text" | "email" | "general") {
  const user = await getSessionUser();
  db.insert(outreachTemplates).values({ id: randomUUID(), name, body, subject, channel, createdBy: user?.id ?? null }).run();
  revalidatePath("/settings");
}

export async function deleteTemplate(id: string) {
  db.delete(outreachTemplates).where(eq(outreachTemplates.id, id)).run();
  revalidatePath("/settings");
}

export async function createTag(name: string, color: string) {
  db.insert(clientTags).values({ id: randomUUID(), name, color }).run();
  revalidatePath("/settings");
}

export async function deleteTag(id: string) {
  db.delete(clientTags).where(eq(clientTags.id, id)).run();
  revalidatePath("/settings");
}

export async function unbanCustomer(id: string) {
  const row = db.select().from(bannedCustomers).where(eq(bannedCustomers.id, id)).get();
  if (row?.customerId) {
    db.update(clients).set({ status: "active", updatedAt: new Date() }).where(eq(clients.id, row.customerId)).run();
  }
  db.delete(bannedCustomers).where(eq(bannedCustomers.id, id)).run();
  revalidatePath("/banned");
}

export async function removeUnsubscribe(id: string) {
  db.delete(unsubscribeList).where(eq(unsubscribeList.id, id)).run();
  revalidatePath("/unsubscribed");
}

export async function resubscribeClient(clientId: string) {
  const c = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!c) return;
  db.update(clients).set({ status: "active", onEmailList: true, updatedAt: new Date() }).where(eq(clients.id, clientId)).run();
  if (c.email) {
    db.delete(unsubscribeList).where(eq(unsubscribeList.email, c.email)).run();
  }
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/unsubscribed");
}

export async function createEmployee(data: {
  name: string;
  username: string;
  password: string;
  role: "manager" | "associate";
}) {
  const user = await getSessionUser();
  if (user?.role !== "manager") return { error: "Unauthorized" };
  if (!data.name || !data.username || !data.password || data.password.length < 6) {
    return { error: "Name, username, and password (min 6 chars) are required" };
  }
  const existing = db.select().from(employees).where(eq(employees.username, data.username)).get();
  if (existing) return { error: "Username already taken" };
  const passwordHash = bcrypt.hashSync(data.password, 10);
  db.insert(employees).values({
    id: randomUUID(),
    name: data.name,
    username: data.username,
    passwordHash,
    role: data.role,
    active: true,
  }).run();
  revalidatePath("/settings");
  return { success: true as const };
}

export async function resetEmployeePassword(employeeId: string, newPassword: string) {
  const user = await getSessionUser();
  if (user?.role !== "manager") return { error: "Unauthorized" };
  if (!newPassword || newPassword.length < 6) return { error: "Password must be at least 6 characters" };
  const passwordHash = bcrypt.hashSync(newPassword, 10);
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
  const passwordHash = bcrypt.hashSync(newPassword, 10);
  db.update(employees).set({ passwordHash }).where(eq(employees.id, user.id)).run();
  return { success: true as const };
}

export async function setSecretQuestion(question: string, answer: string) {
  const user = await getSessionUser();
  if (!user) return { error: "Not authenticated" };
  if (!question || !question.trim()) return { error: "Question is required" };
  if (!answer || answer.trim().length < 2) return { error: "Answer must be at least 2 characters" };
  const normalizedAnswer = answer.trim().toLowerCase();
  const hash = bcrypt.hashSync(normalizedAnswer, 10);
  db.update(employees)
    .set({ secretQuestion: question.trim(), secretAnswerHash: hash })
    .where(eq(employees.id, user.id))
    .run();
  return { success: true as const };
}
