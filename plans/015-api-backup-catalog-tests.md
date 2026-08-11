---
plan: "015"
title: "Tests for backup download and catalog API routes"
category: Test Coverage
priority: P2
effort: M
risk: Low
confidence: High
written_against: 531d57b
depends_on: —
---

## Why this matters

Two API routes have no test coverage at all:
- `GET /api/backup/download` — streams the raw SQLite file; requires manager auth
- `GET /api/catalog` — returns the model catalog map/index; requires any auth

Both are small and self-contained. Tests here serve as smoke tests for the auth wrappers
(`withManagerAuth` / `withAuth`) used across several routes.

## Routes under test

### `app/api/backup/download/route.ts`

```ts
import { withManagerAuth } from "@/lib/api-helpers";
import { readFileSync } from "fs";
import { join } from "path";
import { DATABASE_PATH } from "@/lib/constants";

export const GET = withManagerAuth(async () => {
  const dbPath = join(process.cwd(), DATABASE_PATH);
  const file = readFileSync(dbPath);
  const date = new Date().toISOString().split("T")[0];
  return new Response(file, {
    headers: {
      "Content-Type": "application/x-sqlite3",
      "Content-Disposition": `attachment; filename="iris-backup-${date}.db"`,
      "Content-Length": String(file.byteLength),
    },
  });
});
```

### `app/api/catalog/route.ts`

```ts
import { withAuth } from "@/lib/api-helpers";
import { getCatalogIndex } from "@/lib/actions/model-catalog";

export const GET = withAuth(async (session) => {
  const idx = getCatalogIndex();
  const map: Record<string, string> = {};
  for (const [k, v] of idx) map[k] = v.collection;
  return Response.json({
    map,
    index: Object.fromEntries(idx),
    isManager: session.user?.role === "manager",
  });
});
```

## File to create

`__tests__/api/backup-catalog.test.ts` — new file.

Follow the pattern established in `__tests__/api/clients.test.ts`:
- `vi.mock("next-auth", ...)` at the top before imports
- Fixture sessions defined as constants
- `beforeEach` to set the default session mock

## Step 1 — Read the api-helpers to understand withAuth / withManagerAuth

Read `lib/api-helpers.ts` (or wherever `withAuth` and `withManagerAuth` are defined)
before writing. Note:
- What session object shape do they pass to the handler?
- What do they return when `getServerSession` resolves to `null` (unauthenticated)?
- What do they return when the role is `"associate"` but `withManagerAuth` is used?

This determines what 401/403 responses look like in the tests.

## Step 2 — Write the catalog tests

```ts
describe("GET /api/catalog", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null as any);
    const res = await GET(new Request("http://localhost/api/catalog"));
    expect(res.status).toBe(401);
  });

  it("returns catalog data for authenticated associate", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession as any);
    const res = await GET(new Request("http://localhost/api/catalog"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("map");
    expect(data).toHaveProperty("index");
    expect(data.isManager).toBe(false);
  });

  it("sets isManager true for manager session", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
    const res = await GET(new Request("http://localhost/api/catalog"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isManager).toBe(true);
  });

  it("map values are strings (collection names)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
    const res = await GET(new Request("http://localhost/api/catalog"));
    const data = await res.json();
    for (const v of Object.values(data.map)) {
      expect(typeof v).toBe("string");
    }
  });
});
```

## Step 3 — Write the backup download tests

The backup route reads the real SQLite file from disk. In tests, `readFileSync` will read
the test DB (same `DATABASE_PATH`). This is acceptable — we are testing the auth and
response shape, not the DB contents.

```ts
describe("GET /api/backup/download", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null as any);
    const res = await GETBackup(new Request("http://localhost/api/backup/download"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated as associate", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession as any);
    const res = await GETBackup(new Request("http://localhost/api/backup/download"));
    expect(res.status).toBe(403);
  });

  it("returns binary SQLite file for manager", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
    const res = await GETBackup(new Request("http://localhost/api/backup/download"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/x-sqlite3");
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="iris-backup-\d{4}-\d{2}-\d{2}\.db"$/);
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(0);
    // SQLite magic bytes
    const magic = Buffer.from(buf).subarray(0, 6).toString("ascii");
    expect(magic).toBe("SQLite");
  });
});
```

Import names:
```ts
import { GET } from "@/app/api/catalog/route";
import { GET as GETBackup } from "@/app/api/backup/download/route";
```

## Step 4 — Verification gate

```bash
pnpm lint
pnpm test
```

Expected: exits 0. All new tests pass. Pre-existing tests unaffected.

## STOP conditions

- If `withManagerAuth` returns a status other than 401/403 for unauthenticated/associate
  requests (discovered in Step 1), adjust the expected status codes accordingly before
  writing the tests — do not hard-code 401/403 if the helper uses different codes.
- If `DATABASE_PATH` resolves to a path that does not exist in the test environment,
  the backup test will throw rather than returning a 200. In that case: skip the
  "returns binary" test or wrap it in a `try/catch` that marks it as skipped — do NOT
  create a fake DB file.

## Maintenance note

If `withAuth` or `withManagerAuth` are refactored to change their 401/403 response
shapes, update these tests in the same commit.
