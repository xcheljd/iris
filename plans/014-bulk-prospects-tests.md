---
plan: "014"
title: "Characterization tests for bulkRejectProspects and bulkUnsubscribeProspects"
category: Test Coverage
priority: P2
effort: M
risk: Low
confidence: High
written_against: 531d57b
depends_on: —
---

## Why this matters

`lib/actions/bulk-prospects.ts` has two exported bulk operations with zero test coverage.
Both functions touch the `prospects` table and `unsubscribeList`, and
`bulkUnsubscribeProspects` has an N+1 email lookup (addressed in a separate fix — see
plan 012's maintenance note). Characterization tests must land before any refactor so
regressions can be detected.

## Source under test

`lib/actions/bulk-prospects.ts` (full file, commit 531d57b):

```ts
export async function bulkRejectProspects(ids: string[]): Promise<BulkResult>
// Sets prospects.status = "rejected" for every id in the list.
// Returns { ok: count }. requireAuth — any authenticated user.

export async function bulkUnsubscribeProspects(ids: string[]): Promise<BulkResult>
// Sets prospects.status = "unsubscribed" for every id.
// For each prospect with an email: checks unsubscribeList, inserts if absent (N+1 pattern).
// Returns { ok: count }. requireAuth — any authenticated user.
```

`BulkResult = { ok: number; error?: string }`

## Files to create

`__tests__/actions/bulk-prospects.test.ts` — new file.

Do NOT create any other files.

## Test structure template

Follow the pattern established in `__tests__/actions/bulk-clients.test.ts` exactly:

```ts
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({}));

import { getServerSession } from "next-auth";
import { bulkRejectProspects, bulkUnsubscribeProspects } from "@/lib/actions/bulk-prospects";
import { db } from "@/lib/db";
import { prospects, unsubscribeList } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23";

const managerSession = { user: { id: MANAGER_ID, name: "Test Manager", role: "manager" as const } };
const associateSession = { user: { id: ASSOCIATE_ID, name: "Test Associate", role: "associate" as const } };
```

## Step 1 — Understand the prospects schema

Before writing the test file, read `lib/db/schema.ts` and find the `prospects` table
definition. Note every NOT NULL column so you can create valid prospect rows.

Key columns expected (verify against schema):
- `id` (text PK)
- `rvxCustomerId` (text, likely nullable or has default)
- `firstName`, `lastName` (text)
- `email` (text, nullable)
- `phone` (text, nullable)
- `status` (text — "active" | "rejected" | "unsubscribed" | "graduated")
- `source` (text)
- `updatedAt` (date)

If you find additional NOT NULL columns without defaults, include them in the
`createTestProspect` helper with synthetic values.

## Step 2 — Write the helper functions

```ts
function createTestProspect(overrides: Partial<{ email: string | null; status: string }> = {}): string {
  const id = randomUUID();
  db.insert(prospects).values({
    id,
    firstName: "BulkTest",
    lastName: "Prospect",
    email: overrides.email ?? null,
    phone: null,
    status: overrides.status ?? "active",
    source: "Walk-in",
    // add any other required NOT NULL columns found in Step 1
    updatedAt: new Date(),
  }).run();
  return id;
}

function cleanupProspects(ids: string[]) {
  if (ids.length === 0) return;
  try { db.delete(prospects).where(inArray(prospects.id, ids)).run(); } catch { /* best effort */ }
}

function cleanupUnsubscribeEmails(emails: string[]) {
  for (const email of emails) {
    try { db.delete(unsubscribeList).where(eq(unsubscribeList.email, email)).run(); } catch { /* best effort */ }
  }
}
```

## Step 3 — Write the test cases

### `bulkRejectProspects` — required test cases

```
describe("bulkRejectProspects", () => {
  let testIds: string[] = [];

  afterEach(() => {
    cleanupProspects(testIds);
    testIds = [];
  });

  it("returns { ok: 0 } for empty id list without error", ...)
    // arrange: managerSession
    // act: bulkRejectProspects([])
    // assert: result deepEquals { ok: 0 }, no error property

  it("sets status to rejected for all specified prospects", ...)
    // arrange: 3 active prospects
    // act: bulkRejectProspects([id1, id2, id3])
    // assert: result.ok === 3
    // assert: all 3 rows in DB have status "rejected"

  it("ignores ids that do not exist", ...)
    // arrange: 2 real prospects + 1 fake UUID
    // act: bulkRejectProspects([realId1, realId2, fakeId])
    // assert: result.ok === 2 (drizzle returns changes count)
    // assert: real rows have status "rejected"

  it("works with associate session (requireAuth, not requireManager)", ...)
    // arrange: associateSession, 1 active prospect
    // act: bulkRejectProspects([id])
    // assert: result.ok === 1

  it("rejects unauthenticated requests", ...)
    // arrange: getServerSession returns null
    // act: expect(bulkRejectProspects([anyId])).rejects.toThrow("Not authenticated")
});
```

### `bulkUnsubscribeProspects` — required test cases

```
describe("bulkUnsubscribeProspects", () => {
  let testIds: string[] = [];
  let testEmails: string[] = [];

  afterEach(() => {
    cleanupProspects(testIds);
    cleanupUnsubscribeEmails(testEmails);
    testIds = [];
    testEmails = [];
  });

  it("returns { ok: 0 } for empty id list", ...)

  it("sets status to unsubscribed for all specified prospects", ...)
    // arrange: 2 active prospects (one with email, one without)
    // act: bulkUnsubscribeProspects([id1, id2])
    // assert: result.ok === 2
    // assert: both rows have status "unsubscribed"

  it("inserts into unsubscribeList for prospects with email", ...)
    // arrange: 1 prospect with email = "test-014@example.com"
    // track email in testEmails for cleanup
    // act: bulkUnsubscribeProspects([id])
    // assert: db.select from unsubscribeList where email = "test-014@example.com" returns 1 row

  it("does not insert duplicate unsubscribeList entry if email already present", ...)
    // arrange: 1 prospect with email; pre-insert the email into unsubscribeList
    // act: bulkUnsubscribeProspects([id])
    // assert: unsubscribeList still has exactly 1 row for that email

  it("skips unsubscribeList insert for prospects without email", ...)
    // arrange: 1 prospect with email = null
    // act: bulkUnsubscribeProspects([id])
    // assert: result.ok === 1, no new row in unsubscribeList

  it("rejects unauthenticated requests", ...)
    // getServerSession returns null
    // expect(bulkUnsubscribeProspects([anyId])).rejects.toThrow("Not authenticated")
});
```

## Step 4 — Fix the N+1 in bulkUnsubscribeProspects (in-plan fix)

While writing the tests above you will notice the N+1 pattern at
`lib/actions/bulk-prospects.ts:68–77`:

```ts
for (const row of rows) {
  if (!row.email) continue;
  const alreadyUnsub = tx           // ← per-row query
    .select({ id: unsubscribeList.id })
    .from(unsubscribeList)
    .where(eq(unsubscribeList.email, row.email))
    .get();
  if (!alreadyUnsub) {
    tx.insert(unsubscribeList).values({ id: randomUUID(), email: row.email }).run();
  }
}
```

After the tests are green, apply the same batch fix used in plan 012 for
`bulkUnsubscribeClients`:

```ts
      const emails = rows.map((r) => r.email).filter((e): e is string => !!e);
      const alreadyUnsubbed = new Set(
        emails.length > 0
          ? tx.select({ email: unsubscribeList.email }).from(unsubscribeList)
              .where(inArray(unsubscribeList.email, emails)).all().map((r) => r.email)
          : [],
      );

      for (const row of rows) {
        if (row.email && !alreadyUnsubbed.has(row.email)) {
          tx.insert(unsubscribeList).values({ id: randomUUID(), email: row.email }).run();
        }
      }
```

Run `pnpm test` again after applying this fix — the tests written above are the
regression gate.

## Step 5 — Verification gate

```bash
pnpm lint
pnpm test
```

Expected:
- `pnpm lint` exits 0.
- `pnpm test` exits 0. All new tests pass. All pre-existing tests still pass.

## STOP conditions

- If the `prospects` schema has required NOT NULL columns that cannot be inferred from
  the schema definition, STOP and report back with the column names rather than
  inserting invalid rows.
- If `pnpm test` fails on a pre-existing test file after adding the new test file, STOP
  — the shared SQLite DB may have state contamination. Do not silence the failure.

## Maintenance note

These are characterization tests, not contract tests. If `bulkUnsubscribeProspects` is
refactored in the future, update the tests to reflect the new behaviour — don't delete
them to make the suite pass.
