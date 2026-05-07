import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { GET as GETEmployees } from "@/app/api/employees/route";
import { GET as GETTemplates } from "@/app/api/templates/route";
import { GET as GETPromoMatches } from "@/app/api/promos/matches/route";

const managerSession = {
  user: { id: "e09564a0-2ef8-4470-a149-fc8fcf695636", name: "Marcus", role: "manager" },
};

beforeEach(() => {
  vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
});

describe("GET /api/employees", () => {
  it("should return all employees as an array", async () => {
    const res = await GETEmployees();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty("id");
    expect(data[0]).toHaveProperty("name");
    expect(data[0]).toHaveProperty("username");
    expect(data[0]).toHaveProperty("role");
  });

  it("should return employees sorted by name", async () => {
    const res = await GETEmployees();
    const data = await res.json();
    for (let i = 1; i < data.length; i++) {
      expect(data[i].name.localeCompare(data[i - 1].name)).toBeGreaterThanOrEqual(0);
    }
  });

  it("should return employees with expected properties", async () => {
    const res = await GETEmployees();
    const data = await res.json();
    for (const emp of data) {
      expect(emp).toHaveProperty("id");
      expect(emp).toHaveProperty("name");
      expect(emp).toHaveProperty("username");
      expect(emp).toHaveProperty("role");
      expect(emp).toHaveProperty("active");
    }
  });
});

describe("GET /api/templates", () => {
  it("should return all templates as an array", async () => {
    const res = await GETTemplates();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toHaveProperty("id");
      expect(data[0]).toHaveProperty("name");
      expect(data[0]).toHaveProperty("body");
    }
  });

  it("should return templates sorted by name", async () => {
    const res = await GETTemplates();
    const data = await res.json();
    for (let i = 1; i < data.length; i++) {
      expect(data[i].name.localeCompare(data[i - 1].name)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("GET /api/promos/matches", () => {
  it("should return 400 when promoId is missing", async () => {
    const req = new Request("http://localhost:3000/api/promos/matches");
    const res = await GETPromoMatches(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("promoId is required");
  });

  it("should return matches for a valid promoId", async () => {
    // First check if there are any promos - use a direct DB call
    const { db } = await import("@/lib/db");
    const { promoWatches } = await import("@/lib/db/schema");
    const promos = db.select().from(promoWatches).all();

    if (promos.length > 0) {
      const promoId = promos[0].id;
      const req = new Request(`http://localhost:3000/api/promos/matches?promoId=${promoId}`);
      const res = await GETPromoMatches(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    }
  });

  it("should return empty array for non-existent promoId", async () => {
    const req = new Request("http://localhost:3000/api/promos/matches?promoId=nonexistent-promo-id");
    const res = await GETPromoMatches(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });
});
