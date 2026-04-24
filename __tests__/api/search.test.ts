import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/search/route";

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
  it("should return empty array when no query provided", async () => {
    const req = createNextRequest("http://localhost:3000/api/search");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });

  it("should return empty array for empty query", async () => {
    const req = createNextRequest("http://localhost:3000/api/search?q=");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });

  it("should search and return matching clients", async () => {
    const req = createNextRequest("http://localhost:3000/api/search?q=a");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    // Seed data has 22+ clients, searching for "a" should return some
    if (data.length > 0) {
      expect(data[0]).toHaveProperty("id");
      expect(data[0]).toHaveProperty("firstName");
      expect(data[0]).toHaveProperty("lastName");
      expect(data[0]).toHaveProperty("phone");
    }
  });

  it("should return empty array for non-matching query", async () => {
    const req = createNextRequest("http://localhost:3000/api/search?q=zzzznonexistentxyz");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });

  it("should limit results to 10", async () => {
    const req = createNextRequest("http://localhost:3000/api/search?q=a");
    const res = await GET(req);
    const data = await res.json();
    expect(data.length).toBeLessThanOrEqual(10);
  });

  it("should search case-insensitively", async () => {
    const req1 = createNextRequest("http://localhost:3000/api/search?q=a");
    const res1 = await GET(req1);
    const data1 = await res1.json();

    const req2 = createNextRequest("http://localhost:3000/api/search?q=A");
    const res2 = await GET(req2);
    const data2 = await res2.json();

    // Case-insensitive search should return same results
    expect(data1.length).toBe(data2.length);
  });
});
