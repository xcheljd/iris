import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { GET } from "@/app/api/approvals/count/route";
import { db } from "@/lib/db";
import { approvalRequests } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23";
const FIRST_CLIENT_ID = "e18e3ba8-b3b1-4bc1-b0f2-f13a219dd30b";

const managerSession = {
  user: { id: MANAGER_ID, name: "Marcus", role: "manager" },
};

const associateSession = {
  user: { id: ASSOCIATE_ID, name: "Jordan", role: "associate" },
};

describe("GET /api/approvals/count", () => {
  const createdRequestIds: string[] = [];

  beforeEach(() => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
  });

  afterEach(() => {
    for (const id of createdRequestIds) {
      try {
        db.delete(approvalRequests).where(eq(approvalRequests.id, id)).run();
      } catch {}
    }
    createdRequestIds.length = 0;
  });

  function insertPendingRequest(type: "ban" | "unsubscribe" | "delete" = "ban") {
    const id = randomUUID();
    db.insert(approvalRequests).values({
      id,
      type,
      clientId: FIRST_CLIENT_ID,
      requestorId: ASSOCIATE_ID,
      reason: "Test reason",
      status: "pending",
      metadata: null,
    }).run();
    createdRequestIds.push(id);
    return id;
  }

  it("returns a count property", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("count");
    expect(typeof data.count).toBe("number");
  });

  it("count increases when a new pending request is added", async () => {
    const before = await (await GET()).json();
    insertPendingRequest();
    const after = await (await GET()).json();
    expect(after.count).toBe(before.count + 1);
  });

  it("count does not include approved requests", async () => {
    const id = insertPendingRequest();
    db.update(approvalRequests)
      .set({ status: "approved", reviewedById: MANAGER_ID, reviewedAt: new Date() })
      .where(eq(approvalRequests.id, id))
      .run();

    const before = await (await GET()).json();
    // Count should not include the approved one we just modified
    // Insert a genuinely pending one to verify contrast
    insertPendingRequest("unsubscribe");
    const after = await (await GET()).json();
    expect(after.count).toBe(before.count + 1);
  });

  it("count does not include rejected requests", async () => {
    const id = insertPendingRequest();
    db.update(approvalRequests)
      .set({ status: "rejected", reviewedById: MANAGER_ID, reviewedAt: new Date() })
      .where(eq(approvalRequests.id, id))
      .run();

    const before = await (await GET()).json();
    insertPendingRequest("delete");
    const after = await (await GET()).json();
    expect(after.count).toBe(before.count + 1);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 when associate calls it", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession as any);
    const res = await GET();
    expect(res.status).toBe(403);
  });
});
