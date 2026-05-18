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

const managerSession = {
  user: { id: "2d7a352d-53a0-4544-b515-902e7dd59206", name: "Marcus", role: "manager" },
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
