---
plan: "016"
title: "Associate-session tests for REST API routes"
category: Test Coverage
priority: P3
effort: M
risk: Low
confidence: High
written_against: 531d57b
depends_on: —
---

## Why this matters

All existing REST API tests (`__tests__/api/`) run exclusively with a manager session.
Key auth boundaries — `withAuth` (associate-ok) vs `withManagerAuth` (manager-only) —
are not exercised by the test suite. An associate-only test pass would have caught the
ownership bugs fixed in plans 002, 010, and 011.

This plan adds associate-session tests to the three highest-value API test files:
- `__tests__/api/clients.test.ts` — `withAuth` routes; tests that associates can read
  and that POST correctly assigns `employeeId` to the requesting associate
- `__tests__/api/notes.test.ts` — `withManagerAuth` on POST; test that associates are
  rejected; `withAuth` on GET; test that associates can read
- `__tests__/api/misc.test.ts` — catch-all; confirm auth behavior on any routes not
  covered above

Do NOT rewrite the existing tests. Add new `describe` blocks only.

## Step 1 — Inventory the existing test files

Before writing, read each file in full:
- `__tests__/api/clients.test.ts`
- `__tests__/api/notes.test.ts`
- `__tests__/api/misc.test.ts`

Note:
- Which route handlers are already imported.
- Which fixtures (client IDs, note IDs) are used.
- Whether an `associateSession` constant already exists.

## Step 2 — Confirm route auth wrappers

Read `lib/api-helpers.ts` to confirm:
- `withAuth`: passes for both `associate` and `manager` sessions; returns 401 when
  `getServerSession` is null.
- `withManagerAuth`: returns 403 (or another status — read the actual code) when the
  session role is `"associate"`.

Confirm the exact error status codes before writing assertions.

## Step 3 — Add associate-session tests to `__tests__/api/clients.test.ts`

Add a new `describe("associate session", ...)` block at the bottom of the file (do not
modify existing describes). The associate session fixture:

```ts
const associateSession = {
  user: { id: "590628cf-d623-456d-bdad-d16ab0ec2b23", name: "Test Associate", role: "associate" },
};
```

Required new test cases:

1. **`GET /api/clients` — associate can list clients**  
   Set session to `associateSession`. Call `GET`. Assert status 200 and array response.

2. **`GET /api/clients/[id]` — associate can fetch a single client**  
   Use a known client ID from the seed data (same ID used in the existing manager tests).
   Assert status 200.

3. **`POST /api/clients` — associate creates client; employeeId is set to associate**  
   Set session to `associateSession`. POST a new client. Assert status 200. Then GET
   the created client and assert `data.employeeId` equals the associate's user ID
   (`"590628cf-d623-456d-bdad-d16ab0ec2b23"`). Track the created ID for cleanup in
   `afterAll`.

4. **`GET /api/clients` — unauthenticated returns 401**  
   Set `getServerSession` to resolve `null`. Assert status 401.

## Step 4 — Add associate-session tests to `__tests__/api/notes.test.ts`

Read the file first to see which routes are imported and what fixture data is used.

Required new test cases:

1. **`GET /api/notes?clientId=...` — associate can read notes**  
   `withAuth` — should succeed for associate. Assert status 200.

2. **`POST /api/notes` — associate is rejected (manager-only)**  
   `withManagerAuth` — associate session should return 403. Assert status 403.
   No note should be created.

3. **`GET /api/notes?clientId=...` — unauthenticated returns 401**

## Step 5 — Add tests to `__tests__/api/misc.test.ts` if applicable

Read `__tests__/api/misc.test.ts` to see what routes it covers. Add associate-session
variants only for routes that use `withAuth` (not `withManagerAuth`) and have no
existing associate-session test.

If the file is already well-covered or has no `withAuth` routes, this step is a no-op.
Note what you found in a comment at the bottom of the file.

## Step 6 — Verification gate

```bash
pnpm lint
pnpm test
```

Expected: exits 0. All new associate-session tests pass. All pre-existing tests still pass.

## STOP conditions

- If `withManagerAuth` returns a status code other than 403 for associate sessions,
  adjust the assertions to match the actual code (discovered in Step 2) rather than
  hard-coding 403.
- If the notes POST route uses `withAuth` instead of `withManagerAuth` (verify in Step 1),
  the "associate is rejected" test does not apply — note this and skip it.
- If adding associate-session tests causes a pre-existing test to fail due to shared
  state (shared SQLite DB), investigate the source of contamination before proceeding —
  do NOT suppress the failure.

## Maintenance note

Any new API route added under `app/api/` should include both a manager-session test and
an associate-session test (or a clear comment explaining why only one session type is
relevant). This plan establishes the pattern; the PR template or AGENTS.md should
reference it.
