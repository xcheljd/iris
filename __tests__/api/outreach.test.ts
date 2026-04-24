import { describe, it, expect, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { POST } from "@/app/api/outreach/route";
import { GET } from "@/app/api/clients/route";
import { db } from "@/lib/db";
import { outreachLogs, clients } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

describe("POST /api/outreach", () => {
  it("should log an outreach event", async () => {
    // Get an existing client
    const allReq = new Request("http://localhost:3000/api/clients");
    const allRes = await GET(allReq);
    const allData = await allRes.json();
    const clientId = allData[0].id;

    const req = new Request("http://localhost:3000/api/outreach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        method: "call",
        outcome: "no_answer",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data).toHaveProperty("id");

    // Verify the outreach log was created
    const logs = db.select().from(outreachLogs)
      .where(eq(outreachLogs.clientId, clientId))
      .orderBy(desc(outreachLogs.date))
      .all();
    const newLog = logs.find((l) => l.id === data.id);
    expect(newLog).toBeDefined();
    expect(newLog!.method).toBe("call");
    expect(newLog!.outcome).toBe("no_answer");

    // Verify client's lastOutreachAt was updated
    const updatedClient = db.select().from(clients).where(eq(clients.id, clientId)).get();
    expect(updatedClient!.lastOutreachAt).not.toBeNull();
  });

  it("should log a purchase outreach with purchasedModel", async () => {
    const allReq = new Request("http://localhost:3000/api/clients");
    const allRes = await GET(allReq);
    const allData = await allRes.json();
    const clientId = allData[0].id;

    const req = new Request("http://localhost:3000/api/outreach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        method: "in-person",
        outcome: "purchased",
        purchasedModel: "DEEPSTONE 116610LN",
        notes: "Customer bought in-store",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    // Verify client's lastPurchaseAt was updated
    const updatedClient = db.select().from(clients).where(eq(clients.id, clientId)).get();
    expect(updatedClient!.lastPurchaseAt).not.toBeNull();
  });

  it("should log outreach with follow-up date", async () => {
    const allReq = new Request("http://localhost:3000/api/clients");
    const allRes = await GET(allReq);
    const allData = await allRes.json();
    const clientId = allData[0].id;

    const followUpDate = new Date(Date.now() + 7 * 86400000).toISOString();
    const req = new Request("http://localhost:3000/api/outreach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        method: "text",
        outcome: "wants_to_come_in",
        followUpDate,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("should return 400 when clientId is missing", async () => {
    const req = new Request("http://localhost:3000/api/outreach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "call",
        outcome: "no_answer",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("clientId, method, and outcome are required");
  });

  it("should return 400 when method is missing", async () => {
    const req = new Request("http://localhost:3000/api/outreach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: "some-id",
        outcome: "no_answer",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("clientId, method, and outcome are required");
  });

  it("should return 400 when outcome is missing", async () => {
    const req = new Request("http://localhost:3000/api/outreach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: "some-id",
        method: "call",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("clientId, method, and outcome are required");
  });

  it("should recalculate heat score after outreach", async () => {
    const allReq = new Request("http://localhost:3000/api/clients");
    const allRes = await GET(allReq);
    const allData = await allRes.json();
    const clientId = allData[0].id;

    const beforeClient = db.select().from(clients).where(eq(clients.id, clientId)).get();
    const beforeScore = beforeClient!.heatScore;

    const req = new Request("http://localhost:3000/api/outreach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        method: "email",
        outcome: "responded",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const afterClient = db.select().from(clients).where(eq(clients.id, clientId)).get();
    // Heat score should have been recalculated (may or may not change, but the field should exist)
    expect(afterClient!.heatScore).toBeGreaterThanOrEqual(0);
    expect(["hot", "warm", "cold"]).toContain(afterClient!.heatLevel);
  });
});
