import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// The review path applies the ban/unsubscribe/delete through the raw core so
// the change can share reviewApprovalRequest's transaction; spy there.
vi.mock("@/lib/actions/_client-status-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/actions/_client-status-core")>();
  return {
    ...actual,
    applyBanUnchecked: vi.fn().mockImplementation(actual.applyBanUnchecked),
    applyUnsubscribeUnchecked: vi.fn().mockImplementation(actual.applyUnsubscribeUnchecked),
    applyDeleteUnchecked: vi.fn().mockImplementation(actual.applyDeleteUnchecked),
  };
});

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { createApprovalRequest, reviewApprovalRequest } from "@/lib/actions";
import { applyBanUnchecked } from "@/lib/actions/_client-status-core";
import { db } from "@/lib/db";
import {
  approvalRequests,
  activityEvents,
  clients,
  bannedCustomers,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23";
const FIRST_CLIENT_ID = "e18e3ba8-b3b1-4bc1-b0f2-f13a219dd30b";

const managerSession: Session = {
  user: { id: MANAGER_ID, name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};

const associateSession: Session = {
  user: { id: ASSOCIATE_ID, name: "Jordan", role: "associate", firstName: "Jordan", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
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
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
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
    vi.mocked(getServerSession).mockResolvedValue(associateSession);
    const { id } = await createApprovalRequest("unsubscribe", FIRST_CLIENT_ID, "Client asked to unsub") as { id: string };
    createdRequestIds.push(id);

    const row = db.select().from(approvalRequests).where(eq(approvalRequests.id, id)).get();
    expect(row).toBeDefined();
    expect(row!.requestorId).toBe(ASSOCIATE_ID);
  });

  it("logs the correct activity event type for ban", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
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
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
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
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
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
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
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
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
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
    vi.mocked(getServerSession).mockResolvedValue(associateSession);
    const requestId = await createPendingRequest("ban");

    vi.mocked(getServerSession).mockResolvedValue(associateSession);
    await expect(reviewApprovalRequest(requestId, true)).rejects.toThrow();
  });

  it("returns error and leaves request pending when the downstream action fails", async () => {
    vi.mocked(applyBanUnchecked).mockReturnValueOnce({ error: "Simulated ban failure" });

    const requestId = await createPendingRequest("ban");
    const result = await reviewApprovalRequest(requestId, true);

    expect(result?.error).toBeDefined();
    const row = db.select().from(approvalRequests).where(eq(approvalRequests.id, requestId)).get();
    expect(row!.status).toBe("pending");
    expect(row!.reviewedById).toBeNull();
    // The audit event is part of the same transaction — it must not survive.
    expect(
      db.select().from(activityEvents).where(eq(activityEvents.clientId, FIRST_CLIENT_ID)).all()
        .filter((e) => e.eventType === "ban_approved"),
    ).toHaveLength(0);
    expect(db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get()!.status).toBe("active");
  });

  it("rolls the whole review back when the downstream action throws", async () => {
    vi.mocked(applyBanUnchecked).mockImplementationOnce(() => {
      throw new Error("Simulated crash mid-action");
    });

    const requestId = await createPendingRequest("ban");
    await expect(reviewApprovalRequest(requestId, true)).rejects.toThrow("Simulated crash mid-action");

    const row = db.select().from(approvalRequests).where(eq(approvalRequests.id, requestId)).get();
    expect(row!.status).toBe("pending");
    expect(row!.reviewedAt).toBeNull();
    expect(
      db.select().from(activityEvents).where(eq(activityEvents.clientId, FIRST_CLIENT_ID)).all()
        .filter((e) => e.eventType === "ban_approved"),
    ).toHaveLength(0);
    expect(
      db.select().from(bannedCustomers).where(eq(bannedCustomers.customerId, FIRST_CLIENT_ID)).all(),
    ).toHaveLength(0);
    expect(db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get()!.status).toBe("active");
  });

  it("does not re-run the downstream action on a second review of the same request", async () => {
    const requestId = await createPendingRequest("ban");

    const callsBefore = vi.mocked(applyBanUnchecked).mock.calls.length;
    await reviewApprovalRequest(requestId, true);
    expect(vi.mocked(applyBanUnchecked).mock.calls.length).toBe(callsBefore + 1);

    const bannedRowsAfterFirst = db
      .select().from(bannedCustomers).where(eq(bannedCustomers.customerId, FIRST_CLIENT_ID)).all().length;
    const approvedEventsAfterFirst = db
      .select().from(activityEvents).where(eq(activityEvents.clientId, FIRST_CLIENT_ID)).all()
      .filter((e) => e.eventType === "ban_approved").length;

    const second = await reviewApprovalRequest(requestId, true);

    expect(second?.error).toBe("Request already reviewed");
    // Downstream action and its side effects ran exactly once.
    expect(vi.mocked(applyBanUnchecked).mock.calls.length).toBe(callsBefore + 1);
    expect(
      db.select().from(bannedCustomers).where(eq(bannedCustomers.customerId, FIRST_CLIENT_ID)).all(),
    ).toHaveLength(bannedRowsAfterFirst);
    expect(
      db.select().from(activityEvents).where(eq(activityEvents.clientId, FIRST_CLIENT_ID)).all()
        .filter((e) => e.eventType === "ban_approved"),
    ).toHaveLength(approvedEventsAfterFirst);
    expect(
      db.select().from(approvalRequests).where(eq(approvalRequests.id, requestId)).get()!.status,
    ).toBe("approved");
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
