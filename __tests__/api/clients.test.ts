import { describe, it, expect, afterAll, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { GET, POST, PUT } from "@/app/api/clients/route";
import { GET as GETById } from "@/app/api/clients/[id]/route";
import { GET as GETDuplicates } from "@/app/api/clients/check-duplicates/route";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const managerSession = {
  user: { id: "2d7a352d-53a0-4544-b515-902e7dd59206", name: "Marcus", role: "manager" },
};

beforeEach(() => {
  vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
});

// Track created test client IDs for cleanup
const createdIds: string[] = [];

afterAll(() => {
  for (const id of createdIds) {
    try {
      db.delete(clients).where(eq(clients.id, id)).run();
    } catch {}
  }
});

describe("GET /api/clients", () => {
  it("should return all clients as an array", async () => {
    const req = new Request("http://localhost:3000/api/clients");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    // Should have client properties
    expect(data[0]).toHaveProperty("id");
    expect(data[0]).toHaveProperty("firstName");
  });

  it("should return clients sorted by heatScore descending", async () => {
    const req = new Request("http://localhost:3000/api/clients");
    const res = await GET(req);
    const data = await res.json();
    for (let i = 1; i < data.length; i++) {
      expect(data[i].heatScore).toBeLessThanOrEqual(data[i - 1].heatScore);
    }
  });

  it("should return a single client when id param is provided", async () => {
    // First get all clients to find a valid ID
    const allReq = new Request("http://localhost:3000/api/clients");
    const allRes = await GET(allReq);
    const allData = await allRes.json();
    const firstId = allData[0].id;

    const req = new Request(`http://localhost:3000/api/clients?id=${firstId}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(firstId);
    expect(data).toHaveProperty("firstName");
  });

  it("should return 404 for non-existent client id param", async () => {
    const req = new Request("http://localhost:3000/api/clients?id=nonexistent-id");
    const res = await GET(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data).toHaveProperty("error");
    expect(data.error).toBe("Client not found");
  });
});

describe("GET /api/clients/[id]", () => {
  it("should return a client by id", async () => {
    // Get all clients first to find a valid ID
    const allReq = new Request("http://localhost:3000/api/clients");
    const allRes = await GET(allReq);
    const allData = await allRes.json();
    const firstId = allData[0].id;

    const req = new Request(`http://localhost:3000/api/clients/${firstId}`);
    const res = await GETById(req, { params: Promise.resolve({ id: firstId }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(firstId);
    expect(data).toHaveProperty("firstName");
    expect(data).toHaveProperty("lastName");
    expect(data).toHaveProperty("phone");
    expect(data).toHaveProperty("email");
  });

  it("should return 404 for non-existent client", async () => {
    const req = new Request("http://localhost:3000/api/clients/nonexistent-id");
    const res = await GETById(req, { params: Promise.resolve({ id: "nonexistent-id" }) });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Client not found");
  });
});

describe("POST /api/clients", () => {
  it("should create a new client", async () => {
    const uniqueSuffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const req = new Request("http://localhost:3000/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "Test",
        lastName: "Client",
        phone: `555-${uniqueSuffix}`,
        email: `test-create-${uniqueSuffix}@example.com`,
        source: "Walk-in",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("id");
    expect(typeof data.id).toBe("string");
    createdIds.push(data.id);

    // Verify the client exists
    const getReq = new Request(`http://localhost:3000/api/clients/${data.id}`);
    const getRes = await GETById(getReq, { params: Promise.resolve({ id: data.id }) });
    expect(getRes.status).toBe(200);
    const client = await getRes.json();
    expect(client.firstName).toBe("Test");
    expect(client.lastName).toBe("Client");
    expect(client.email).toBe(`test-create-${uniqueSuffix}@example.com`);
  });

  it("should create a client with minimal fields", async () => {
    const req = new Request("http://localhost:3000/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "Minimal",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("id");
    createdIds.push(data.id);
  });

  it("should return 409 for duplicate email", async () => {
    // Create first client
    const req1 = new Request("http://localhost:3000/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "Dup1",
        email: "duplicate-test@example.com",
      }),
    });
    const res1 = await POST(req1);
    const data1 = await res1.json();
    createdIds.push(data1.id);

    // Try duplicate
    const req2 = new Request("http://localhost:3000/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "Dup2",
        email: "duplicate-test@example.com",
      }),
    });
    const res2 = await POST(req2);
    expect(res2.status).toBe(409);
    const data2 = await res2.json();
    expect(data2.error).toBe("Duplicate found");
    expect(data2).toHaveProperty("duplicate");
  });

  it("should return 409 for duplicate phone", async () => {
    const req1 = new Request("http://localhost:3000/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "PhoneDup1",
        phone: "555-DUPPHONE",
      }),
    });
    const res1 = await POST(req1);
    const data1 = await res1.json();
    createdIds.push(data1.id);

    const req2 = new Request("http://localhost:3000/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "PhoneDup2",
        phone: "555-DUPPHONE",
      }),
    });
    const res2 = await POST(req2);
    expect(res2.status).toBe(409);
    const data2 = await res2.json();
    expect(data2.error).toBe("Duplicate found");
  });
});

describe("PUT /api/clients", () => {
  it("should update an existing client", async () => {
    // Create a client to update
    const createReq = new Request("http://localhost:3000/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName: "ToUpdate", lastName: "Me" }),
    });
    const createRes = await POST(createReq);
    const createData = await createRes.json();
    createdIds.push(createData.id);

    // Update it
    const updateReq = new Request("http://localhost:3000/api/clients", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: createData.id,
        firstName: "Updated",
        lastName: "Name",
      }),
    });
    const updateRes = await PUT(updateReq);
    expect(updateRes.status).toBe(200);
    const updateData = await updateRes.json();
    expect(updateData.success).toBe(true);

    // Verify update
    const getReq = new Request(`http://localhost:3000/api/clients/${createData.id}`);
    const getRes = await GETById(getReq, { params: Promise.resolve({ id: createData.id }) });
    const client = await getRes.json();
    expect(client.firstName).toBe("Updated");
    expect(client.lastName).toBe("Name");
  });

  it("should return 400 when id is missing", async () => {
    const req = new Request("http://localhost:3000/api/clients", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName: "NoId" }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Client ID is required");
  });
});

describe("GET /api/clients/check-duplicates", () => {
  it("should return duplicate null when no params provided", async () => {
    const req = new Request("http://localhost:3000/api/clients/check-duplicates");
    const res = await GETDuplicates(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("duplicate");
    expect(data.duplicate).toBeNull();
  });

  it("should find duplicate by email", async () => {
    // Create a client with a specific email
    const createReq = new Request("http://localhost:3000/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "DupCheck",
        email: "dup-check@example.com",
      }),
    });
    const createRes = await POST(createReq);
    const createData = await createRes.json();
    createdIds.push(createData.id);

    // Check for duplicates by email
    const checkReq = new Request(
      "http://localhost:3000/api/clients/check-duplicates?email=dup-check@example.com"
    );
    const checkRes = await GETDuplicates(checkReq);
    expect(checkRes.status).toBe(200);
    const data = await checkRes.json();
    expect(data.duplicate).not.toBeNull();
    expect(data.duplicate.email).toBe("dup-check@example.com");
  });

  it("should find duplicate by phone", async () => {
    const createReq = new Request("http://localhost:3000/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "PhoneCheck",
        phone: "5550001234",
      }),
    });
    const createRes = await POST(createReq);
    const createData = await createRes.json();
    createdIds.push(createData.id);

    const checkReq = new Request(
      "http://localhost:3000/api/clients/check-duplicates?phone=5550001234"
    );
    const checkRes = await GETDuplicates(checkReq);
    expect(checkRes.status).toBe(200);
    const data = await checkRes.json();
    expect(data.duplicate).not.toBeNull();
    expect(data.duplicate.phone).toBe("5550001234");
  });

  it("should find duplicate by first name", async () => {
    // Use an existing seed client's first and last name (route requires both)
    const allReq = new Request("http://localhost:3000/api/clients");
    const allRes = await GET(allReq);
    const allData = await allRes.json();
    const { firstName, lastName } = allData[0];

    const checkReq = new Request(
      `http://localhost:3000/api/clients/check-duplicates?firstName=${encodeURIComponent(firstName)}&lastName=${encodeURIComponent(lastName ?? "")}`
    );
    const checkRes = await GETDuplicates(checkReq);
    expect(checkRes.status).toBe(200);
    const data = await checkRes.json();
    expect(data.duplicate).not.toBeNull();
    expect(data.duplicate.firstName.toLowerCase()).toBe(firstName.toLowerCase());
  });

  it("should return null duplicate for non-matching data", async () => {
    const checkReq = new Request(
      "http://localhost:3000/api/clients/check-duplicates?email=nonexistent-no-match@example.com&phone=999-NOMATCH"
    );
    const checkRes = await GETDuplicates(checkReq);
    expect(checkRes.status).toBe(200);
    const data = await checkRes.json();
    expect(data.duplicate).toBeNull();
  });
});
