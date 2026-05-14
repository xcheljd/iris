import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { GET } from "@/app/api/search/route";

const managerSession = {
  user: { id: "2d7a352d-53a0-4544-b515-902e7dd59206", name: "Marcus", role: "manager" },
};

beforeEach(() => {
  vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
});

// Helper to create a mock NextRequest with nextUrl.searchParams
function createNextRequest(url: string) {
  const parsedUrl = new URL(url);
  return {
    nextUrl: {
      searchParams: parsedUrl.searchParams,
      href: parsedUrl.href,
      origin: parsedUrl.origin,
      pathname: parsedUrl.pathname,
    },
    json: () => Promise.resolve({}),
  } as any;
}

describe("GET /api/search", () => {
  it("returns recentlyViewed and empty hits when no query provided", async () => {
    const req = createNextRequest("http://localhost:3000/api/search");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.hits)).toBe(true);
    expect(data.hits.length).toBe(0);
    expect(Array.isArray(data.recentlyViewed)).toBe(true);
  });

  it("returns empty hits + recentlyViewed for empty query", async () => {
    const req = createNextRequest("http://localhost:3000/api/search?q=");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.hits)).toBe(true);
    expect(data.hits.length).toBe(0);
    expect(Array.isArray(data.recentlyViewed)).toBe(true);
  });

  it("searches and returns matching clients in `hits`", async () => {
    const req = createNextRequest("http://localhost:3000/api/search?q=a");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.hits)).toBe(true);
    if (data.hits.length > 0) {
      expect(data.hits[0]).toHaveProperty("id");
      expect(data.hits[0]).toHaveProperty("firstName");
      expect(data.hits[0]).toHaveProperty("lastName");
      expect(data.hits[0]).toHaveProperty("phone");
      // FTS5 snippet is part of the new response shape
      expect(data.hits[0]).toHaveProperty("snippet");
    }
  });

  it("returns empty hits for non-matching query", async () => {
    const req = createNextRequest("http://localhost:3000/api/search?q=zzzznonexistentxyz");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.hits)).toBe(true);
    expect(data.hits.length).toBe(0);
  });

  it("limits client hits to 10", async () => {
    const req = createNextRequest("http://localhost:3000/api/search?q=a");
    const res = await GET(req);
    const data = await res.json();
    expect(data.hits.length).toBeLessThanOrEqual(10);
  });

  it("searches case-insensitively (FTS5 tokenizer is case-folded)", async () => {
    const req1 = createNextRequest("http://localhost:3000/api/search?q=a");
    const res1 = await GET(req1);
    const data1 = await res1.json();

    const req2 = createNextRequest("http://localhost:3000/api/search?q=A");
    const res2 = await GET(req2);
    const data2 = await res2.json();

    expect(data1.hits.length).toBe(data2.hits.length);
  });

  it("returns all four group keys + isPhoneticFallback in the envelope", async () => {
    const req = createNextRequest("http://localhost:3000/api/search?q=foo");
    const res = await GET(req);
    const data = await res.json();
    expect(data).toHaveProperty("hits");
    expect(data).toHaveProperty("prospects");
    expect(data).toHaveProperty("lists");
    expect(data).toHaveProperty("recentlyViewed");
    expect(data).toHaveProperty("isPhoneticFallback");
  });
});
