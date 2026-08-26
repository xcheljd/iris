"use server";
import { db } from "@/lib/db";
import { clients, activityEvents, approvalRequests, employees } from "@/lib/db/schema";
import { and, eq, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { requireAuth, requireManager } from "./_shared";
import { banClient, unsubscribeClient, deleteClient } from "./clients";

export async function createApprovalRequest(
  type: "ban" | "unsubscribe" | "delete",
  clientId: string,
  reason: string,
  metadata?: Record<string, unknown>,
): Promise<{ id: string } | { error: string }> {
  const user = await requireAuth();
  if (!reason.trim()) return { error: "Reason is required" };
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
): Promise<{ error: string } | undefined> {
  const user = await requireManager();
  const request = db.select().from(approvalRequests).where(eq(approvalRequests.id, requestId)).get();
  if (!request) return { error: "Request not found" };

  // Claim the request atomically before doing anything else: a plain read-then-write
  // let two concurrent reviews (double-click, double submit) both see "pending" and
  // both run the downstream action. `WHERE status = 'pending'` makes exactly one win.
  const targetStatus = approved ? "approved" : "rejected";
  const claim = db.update(approvalRequests).set({
    status: targetStatus,
    reviewedById: user.id,
    reviewedAt: new Date(),
  }).where(and(
    eq(approvalRequests.id, requestId),
    eq(approvalRequests.status, "pending"),
  )).run();
  if (claim.changes === 0) return { error: "Request already reviewed" };

  // The downstream action still decides the outcome — if it fails, the claim is
  // released back to "pending" so the request stays retryable. Previously the
  // status was committed before the action, making failures unrecoverable.
  const release = (error: string) => {
    db.update(approvalRequests).set({ status: "pending", reviewedById: null, reviewedAt: null })
      .where(eq(approvalRequests.id, requestId)).run();
    return { error };
  };

  if (approved) {
    try {
      switch (request.type) {
        case "ban": {
          const r = await banClient(request.clientId, "Other", request.reason);
          if (r?.error) return release(r.error);
          break;
        }
        case "unsubscribe": {
          const r = await unsubscribeClient(request.clientId);
          if (r?.error) return release(r.error);
          break;
        }
        case "delete": {
          const r = await deleteClient(request.clientId);
          if (r?.error) return release(r.error);
          break;
        }
      }
    } catch (err) {
      release("Failed to apply the approved action");
      throw err;
    }
  }

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

  // Invalidates the (app) layout so the sidebar badge re-reads `getPendingApprovalCount`.
  revalidatePath("/", "layout");
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

export async function getPendingApprovalCount(): Promise<number> {
  await requireManager();
  const result = db
    .select({ c: sql<number>`count(*)` })
    .from(approvalRequests)
    .where(eq(approvalRequests.status, "pending"))
    .get();
  return result?.c ?? 0;
}
