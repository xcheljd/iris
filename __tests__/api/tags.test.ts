import { describe, it, expect, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { POST, DELETE } from "@/app/api/tags/route";
import { GET } from "@/app/api/clients/route";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("POST /api/tags", () => {
  it("should add a tag to an existing client", async () => {
    // Get an existing client
    const allReq = new Request("http://localhost:3000/api/clients");
    const allRes = await GET(allReq);
    const allData = await allRes.json();
    const clientId = allData[0].id;

    const req = new Request("http://localhost:3000/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        tag: "VIP",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    // Verify the tag was added
    const client = db.select().from(clients).where(eq(clients.id, clientId)).get();
    expect(client!.tags).toContain("VIP");

    // Clean up - remove the tag
    const deleteReq = new Request("http://localhost:3000/api/tags", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, tag: "VIP" }),
    });
    await DELETE(deleteReq);
  });

  it("should not add duplicate tags (Set behavior)", async () => {
    const allReq = new Request("http://localhost:3000/api/clients");
    const allRes = await GET(allReq);
    const allData = await allRes.json();
    const clientId = allData[0].id;

    // Add same tag twice
    const tag = "unique-test-tag";
    const req1 = new Request("http://localhost:3000/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, tag }),
    });
    await POST(req1);

    const req2 = new Request("http://localhost:3000/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, tag }),
    });
    await POST(req2);

    const client = db.select().from(clients).where(eq(clients.id, clientId)).get();
    const tagCount = client!.tags.filter((t) => t === tag).length;
    expect(tagCount).toBe(1);

    // Clean up
    const deleteReq = new Request("http://localhost:3000/api/tags", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, tag }),
    });
    await DELETE(deleteReq);
  });

  it("should return 400 when clientId is missing", async () => {
    const req = new Request("http://localhost:3000/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag: "test" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("clientId and tag are required");
  });

  it("should return 400 when tag is missing", async () => {
    const req = new Request("http://localhost:3000/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "some-id" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("clientId and tag are required");
  });

  it("should return 404 when client does not exist", async () => {
    const req = new Request("http://localhost:3000/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "nonexistent-id", tag: "test" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Client not found");
  });
});

describe("DELETE /api/tags", () => {
  it("should remove a tag from a client", async () => {
    const allReq = new Request("http://localhost:3000/api/clients");
    const allRes = await GET(allReq);
    const allData = await allRes.json();
    const clientId = allData[0].id;

    // Add a tag first
    const tag = "removable-tag";
    const addReq = new Request("http://localhost:3000/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, tag }),
    });
    await POST(addReq);

    // Verify tag was added
    let client = db.select().from(clients).where(eq(clients.id, clientId)).get();
    expect(client!.tags).toContain(tag);

    // Remove the tag
    const deleteReq = new Request("http://localhost:3000/api/tags", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, tag }),
    });
    const deleteRes = await DELETE(deleteReq);
    expect(deleteRes.status).toBe(200);
    const deleteData = await deleteRes.json();
    expect(deleteData.success).toBe(true);

    // Verify tag was removed
    client = db.select().from(clients).where(eq(clients.id, clientId)).get();
    expect(client!.tags).not.toContain(tag);
  });

  it("should return 400 when clientId is missing", async () => {
    const req = new Request("http://localhost:3000/api/tags", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag: "test" }),
    });
    const res = await DELETE(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("clientId and tag are required");
  });

  it("should return 400 when tag is missing", async () => {
    const req = new Request("http://localhost:3000/api/tags", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "some-id" }),
    });
    const res = await DELETE(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("clientId and tag are required");
  });

  it("should return 404 when client does not exist", async () => {
    const req = new Request("http://localhost:3000/api/tags", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "nonexistent-id", tag: "test" }),
    });
    const res = await DELETE(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Client not found");
  });
});
