import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { GET as GETEmployees } from "@/app/api/employees/route";

const managerSession: Session = {
  user: { id: "2d7a352d-53a0-4544-b515-902e7dd59206", name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};

beforeEach(() => {
  vi.mocked(getServerSession).mockResolvedValue(managerSession);
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

// Plan 016 — associate-session coverage. GET /api/employees uses withAuth
// (any authenticated user may list employees; role filtering happens client-side).
describe("associate session", () => {
  const associateSession: Session = {
    user: { id: "590628cf-d623-456d-bdad-d16ab0ec2b23", name: "Test Associate", role: "associate", firstName: "Test", lastName: "Associate" },
    expires: "2099-12-31T23:59:59.000Z",
  };

  it("GET /api/employees — associate can list employees", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession);
    const res = await GETEmployees();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it("GET /api/employees — unauthenticated returns 401", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await GETEmployees();
    expect(res.status).toBe(401);
  });
});
