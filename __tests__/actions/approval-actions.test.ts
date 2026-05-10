import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { createApprovalRequest, reviewApprovalRequest } from "@/lib/actions";
import { db } from "@/lib/db";
import {
  approvalRequests,
  activityEvents,
  clients,
  bannedCustomers,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const MANAGER_ID = "e09564a0-2ef8-4470-a149-fc8fcf695636";
const ASSOCIATE_ID = "85d655c4-4196-43ed-82d5-34474d22c782";
const FIRST_CLIENT_ID = "5aff9797-ad89-4661-906c-cde72c306181";

const managerSession = {
  user: { id: MANAGER_ID, name: "Marcus", role: "manager" },
};

const associateSession = {
  user: { id: ASSOCIATE_ID, name: "Jordan", role: "associate" },
};

describe("createApprovalRequest", () => {
  const createdRequestIds: string[] = [];

  afterEach(() => {
    for (const id of createdRequestIds) {
      try {
        db.delete(activityEvents)
          .where(and(eq(activityEvents.clientId, FIRST_CLIENT_ID)))
          .run();
        db.delete(approvalRequests).where(eq(approvalRequests.id, id)).run();
      } catch {}
    }
    createdRequestIds.length = 0;
  });

  it("creates a pending approval request", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
    const { id } = await createApprovalRequest("ban", FIRST_CLIENT_ID, "Testing ban request") as { id: string };
    createdRequestIds.push(id);

    const row = db.select().from(approvalRequests).where(eq(approvalRequests.id, id)).get();
    expect(row).toBeDefined();
    expect(row!.type).toBe("ban");
    expect(row!.clientId).toBe(FIRST_CLIENT_ID);
    expect(row!.status).toBe("pending");
    expect(row!.reason).toBe("Testing ban request");
    expect(row!.requestorId).toBe(MANAGER_ID);
  });

  it("associates can create approval requests", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession as any);
    const { id } = await createApprovalRequest("unsubscribe", FIRST_CLIENT_ID, "Client asked to unsub") as { id: string };
    createdRequestIds.push(id);

    const row = db.select().from(approvalRequests).where(eq(approvalRequests.id, id)).get();
    expect(row).toBeDefined();
    expect(row!.requestorId).toBe(ASSOCIATE_ID);
  });

  it("logs the correct activity event type for ban", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
    const { id } = await createApprovalRequest("ban", FIRST_CLIENT_ID, "Reason A") as { id: string };
    createdRequestIds.push(id);

    const events = db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.clientId, FIRST_CLIENT_ID))
      .all();
    const event = events.find((e) => e.eventType === "ban_requested");
    expect(event).toBeDefined();
  });

  it("logs the correct activity event type for unsubscribe", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
    const { id } = await createApprovalRequest("unsubscribe", FIRST_CLIENT_ID, "Reason B") as { id: string };
    createdRequestIds.push(id);

    const events = db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.clientId, FIRST_CLIENT_ID))
      .all();
    const event = events.find((e) => e.eventType === "unsub_requested");
    expect(event).toBeDefined();
  });

  it("logs the correct activity event type for delete", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
    const { id } = await createApprovalRequest("delete", FIRST_CLIENT_ID, "Reason C") as { id: string };
    createdRequestIds.push(id);

    const events = db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.clientId, FIRST_CLIENT_ID))
      .all();
    const event = events.find((e) => e.eventType === "delete_requested");
    expect(event).toBeDefined();
  });

  it("returns an error when reason is empty", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
    const result = await createApprovalRequest("ban", FIRST_CLIENT_ID, "   ");
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toBe("Reason is required");
  });

  it("throws when not authenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    await expect(createApprovalRequest("ban", FIRST_CLIENT_ID, "reason")).rejects.toThrow();
  });
});

describe("reviewApprovalRequest", () => {
  const createdRequestIds: string[] = [];
  const createdClientIds: string[] = [];

  beforeEach(() => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
    // Ensure seed client is active before each test
    db.update(clients)
      .set({ status: "active", onEmailList: true, deletedAt: null, updatedAt: new Date() })
      .where(eq(clients.id, FIRST_CLIENT_ID))
      .run();
  });

  afterEach(() => {
    for (const id of createdRequestIds) {
      try {
        db.delete(approvalRequests).where(eq(approvalRequests.id, id)).run();
      } catch {}
    }
    createdRequestIds.length = 0;

    for (const id of createdClientIds) {
      try {
        db.delete(activityEvents).where(eq(activityEvents.clientId, id)).run();
        db.delete(clients).where(eq(clients.id, id)).run();
      } catch {}
    }
    createdClientIds.length = 0;

    // Clean up side effects on seed client
    try {
      db.delete(bannedCustomers).where(eq(bannedCustomers.customerId, FIRST_CLIENT_ID)).run();
      db.delete(activityEvents)
        .where(eq(activityEvents.clientId, FIRST_CLIENT_ID))
        .run();
      db.update(clients)
        .set({ status: "active", onEmailList: true, deletedAt: null, updatedAt: new Date() })
        .where(eq(clients.id, FIRST_CLIENT_ID))
        .run();
    } catch {}
  });

  async function createPendingRequest(type: "ban" | "unsubscribe" | "delete") {
    const { id } = await createApprovalRequest(type, FIRST_CLIENT_ID, `Test ${type} reason`) as { id: string };
    createdRequestIds.push(id);
    return id;
  }

  it("approving a ban request sets request to approved", async () => {
    const requestId = await createPendingRequest("ban");
    await reviewApprovalRequest(requestId, true);

    const row = db.select().from(approvalRequests).where(eq(approvalRequests.id, requestId)).get();
    expect(row!.status).toBe("approved");
    expect(row!.reviewedById).toBe(MANAGER_ID);
  });

  it("rejecting a ban request sets request to rejected without banning the client", async () => {
    const requestId = await createPendingRequest("ban");
    await reviewApprovalRequest(requestId, false);

    const row = db.select().from(approvalRequests).where(eq(approvalRequests.id, requestId)).get();
    expect(row!.status).toBe("rejected");

    const client = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
    expect(client!.status).toBe("active");
  });

  it("approving a ban request bans the client", async () => {
    const requestId = await createPendingRequest("ban");
    await reviewApprovalRequest(requestId, true);

    const client = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
    expect(client!.status).toBe("banned");
  });

  it("approving an unsubscribe request sets onEmailList to false", async () => {
    const requestId = await createPendingRequest("unsubscribe");
    await reviewApprovalRequest(requestId, true);

    const client = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
    expect(client!.onEmailList).toBe(false);
  });

  it("approving a delete request soft-deletes the client", async () => {
    const requestId = await createPendingRequest("delete");
    await reviewApprovalRequest(requestId, true);

    const client = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
    expect(client!.status).toBe("deleted");
    expect(client!.deletedAt).not.toBeNull();
  });

  it("returns an error when request does not exist", async () => {
    const result = await reviewApprovalRequest("00000000-0000-0000-0000-000000000000", true);
    expect(result?.error).toBe("Request not found");
  });

  it("returns an error when request is already reviewed", async () => {
    const requestId = await createPendingRequest("ban");
    await reviewApprovalRequest(requestId, false);

    const result = await reviewApprovalRequest(requestId, true);
    expect(result?.error).toBe("Request already reviewed");
  });

  it("throws when associate tries to review", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession as any);
    const requestId = await createPendingRequest("ban");

    vi.mocked(getServerSession).mockResolvedValue(associateSession as any);
    await expect(reviewApprovalRequest(requestId, true)).rejects.toThrow();
  });

  it("logs a review activity event on approval", async () => {
    const requestId = await createPendingRequest("ban");
    await reviewApprovalRequest(requestId, true);

    const events = db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.clientId, FIRST_CLIENT_ID))
      .all();
    const reviewEvent = events.find((e) => e.eventType === "ban_approved");
    expect(reviewEvent).toBeDefined();
  });

  it("logs a review activity event on rejection", async () => {
    const requestId = await createPendingRequest("unsubscribe");
    await reviewApprovalRequest(requestId, false);

    const events = db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.clientId, FIRST_CLIENT_ID))
      .all();
    const reviewEvent = events.find((e) => e.eventType === "unsub_rejected");
    expect(reviewEvent).toBeDefined();
  });
});
