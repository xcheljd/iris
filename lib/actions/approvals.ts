"use server";
import { db } from "@/lib/db";
import { clients, activityEvents, approvalRequests, bannedCustomers, employees, type ApprovalRequestType } from "@/lib/db/schema";
import { approvalRequestInputSchema } from "@/lib/validation/approval";
import { and, eq, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { requireAuth, requireManager } from "./_shared";
import { recalcHeat } from "@/lib/heat-recalc";
import {
  ClientStatusError,
  applyBanUnchecked,
  applyUnsubscribeUnchecked,
  applyDeleteUnchecked,
  type StatusChangeResult,
} from "./_client-status-core";

const BAN_CATEGORIES = bannedCustomers.banReasonCategory.enumValues;

export async function createApprovalRequest(
  type: ApprovalRequestType,
  clientId: string,
  reason: string,
  metadata?: Record<string, unknown>,
): Promise<{ id: string } | { error: string }> {
  const user = await requireAuth();
  const result = approvalRequestInputSchema.safeParse({ type, clientId, reason, metadata });
  if (!result.success) return { error: result.error.issues[0].message };
  const parsed = result.data;

  const client = db.select({ employeeId: clients.employeeId, status: clients.status }).from(clients).where(eq(clients.id, parsed.clientId)).get();
  if (!client) return { error: "Client not found" };
  // Nothing left to request: approving would be a no-op or a resurrection.
  if (client.status === "banned" || client.status === "deleted") {
    return { error: `Cannot request approval for a ${client.status} client` };
  }
  if (user.role !== "manager" && client.employeeId !== user.id) {
    return { error: "You can only request approval for your own clients" };
  }

  let requestEventType: "ban_requested" | "unsub_requested" | "delete_requested";
  if (parsed.type === "ban") requestEventType = "ban_requested";
  else if (parsed.type === "unsubscribe") requestEventType = "unsub_requested";
  else requestEventType = "delete_requested";

  const id = randomUUID();
  // Duplicate check + both inserts in one transaction: a second identical
  // request can't slip in between, and the request never exists without
  // its activity event.
  const created = db.transaction((tx) => {
    const pending = tx.select({ id: approvalRequests.id }).from(approvalRequests).where(and(
      eq(approvalRequests.clientId, parsed.clientId),
      eq(approvalRequests.type, parsed.type),
      eq(approvalRequests.status, "pending"),
    )).get();
    if (pending) return false;

    tx.insert(approvalRequests).values({
      id,
      type: parsed.type,
      clientId: parsed.clientId,
      requestorId: user.id,
      reason: parsed.reason,
      status: "pending",
      metadata: parsed.metadata || null,
    }).run();
    tx.insert(activityEvents).values({
      id: randomUUID(),
      clientId: parsed.clientId,
      eventType: requestEventType,
      description: `${parsed.type} requested by ${user.name}: ${parsed.reason}`,
      metadata: { requestId: id },
      employeeId: user.id,
    }).run();
    return true;
  });
  if (!created) return { error: `This client already has a pending ${parsed.type} request` };

  // Invalidates the (app) layout so the sidebar badge re-reads `getPendingApprovalCount`.
  revalidatePath("/", "layout");
  return { id };
}

export async function reviewApprovalRequest(
  requestId: string,
  approved: boolean,
): Promise<{ error: string } | undefined> {
  const user = await requireManager();
  const request = db.select().from(approvalRequests).where(eq(approvalRequests.id, requestId)).get();
  if (!request) return { error: "Request not found" };

  const targetStatus = approved ? "approved" : "rejected";

  let eventType: string;
  if (request.type === "ban") eventType = approved ? "ban_approved" : "ban_rejected";
  else if (request.type === "unsubscribe") eventType = approved ? "unsub_approved" : "unsub_rejected";
  else eventType = approved ? "delete_approved" : "delete_rejected";

  // Claim + downstream action + audit event are ONE unit of work. The claim
  // (`WHERE status = 'pending'`) still makes exactly one of two concurrent
  // reviews win; committing it in the same transaction as the action means a
  // failure — or a crash — can't leave a request marked `approved` with the
  // ban/unsubscribe/delete never applied. The downstream helpers' DB bodies
  // live in _client-status-core so they can join this transaction; auth was
  // already enforced by requireManager above.
  try {
    db.transaction((tx) => {
      const claim = tx.update(approvalRequests).set({
        status: targetStatus,
        reviewedById: user.id,
        reviewedAt: new Date(),
      }).where(and(
        eq(approvalRequests.id, requestId),
        eq(approvalRequests.status, "pending"),
      )).run();
      if (claim.changes === 0) throw new ClientStatusError("Request already reviewed");

      if (approved) {
        let outcome: StatusChangeResult;
        switch (request.type) {
          case "ban": {
            // The associate's category rides on the request's metadata
            // (unvalidated JSON), so only a known category is carried over.
            const requested = request.metadata?.category;
            const category = BAN_CATEGORIES.find((c) => c === requested) ?? "Other";
            outcome = applyBanUnchecked(tx, request.clientId, category, request.reason, user.id);
            break;
          }
          case "unsubscribe":
            outcome = applyUnsubscribeUnchecked(tx, request.clientId, user.id);
            break;
          case "delete":
            outcome = applyDeleteUnchecked(tx, request.clientId, user.id, user.name);
            break;
        }
        if (outcome?.error) throw new ClientStatusError(outcome.error);
      }

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
  } catch (err) {
    // Rolled back: the request is still `pending` and no audit event was written.
    if (err instanceof ClientStatusError) return { error: err.message };
    throw err;
  }

  if (approved && request.type === "unsubscribe") await recalcHeat(request.clientId);
  revalidatePath(`/clients/${request.clientId}`);
  if (request.type === "ban") revalidatePath("/banned");
  else if (request.type === "unsubscribe") revalidatePath("/unsubscribed");
  else revalidatePath("/clients");
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
