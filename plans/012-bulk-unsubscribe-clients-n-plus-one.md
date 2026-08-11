---
plan: "012"
title: "Fix N+1 per-row email lookup in bulkUnsubscribeClients"
category: Performance
priority: P2
effort: S
risk: Low
confidence: High
written_against: 531d57b
depends_on: —
---

## Why this matters

`bulkUnsubscribeClients` in `lib/actions/bulk-clients.ts:292` runs O(n) SQLite queries
inside a single transaction — one `SELECT` per client row to check the unsubscribe
list. For a 500-client bulk operation this is 500 round trips inside one transaction
(SQLite serialises them sequentially).

The fix: collect all emails from the already-fetched rows, batch-query the unsubscribe
list once with `inArray`, build an in-memory Set, then replace each per-row query with a
Set lookup.

The same N+1 pattern exists in `bulkUnsubscribeProspects` (`lib/actions/bulk-prospects.ts:68–77`),
but that function is out of scope for this plan — it is addressed in plan 014.

## Files in scope

- `lib/actions/bulk-clients.ts` only.

## Files explicitly out of scope

Do not touch `lib/actions/bulk-prospects.ts`, any other bulk action, or any test file
(the existing characterization tests in `__tests__/actions/bulk-clients.test.ts` cover
this function and must keep passing without modification).

## Step 1 — Drift check

```bash
git diff 531d57b -- lib/actions/bulk-clients.ts
```

If the diff shows the `inArray` batch pattern already applied to the
`bulkUnsubscribeClients` mutate callback, confirm correctness and mark DONE.

## Step 2 — Current state

`lib/actions/bulk-clients.ts:292–319` (the `bulkUnsubscribeClients` function):

```ts
export async function bulkUnsubscribeClients(clientIds: string[]): Promise<BulkResult> {
  const user = await requireManager();
  return runBulk({
    clientIds,
    errorMessage: "Failed to unsubscribe clients",
    revalidate: ["/clients", "/unsubscribed"],
    mutate: (tx) => {
      const rows = tx.select().from(clients).where(inArray(clients.id, clientIds)).all();
      const now = new Date();
      tx.update(clients).set({ status: "unsubscribed", onEmailList: false, updatedAt: now }).where(inArray(clients.id, clientIds)).run();
      for (const row of rows) {
        if (row.email) {
          const existing = tx.select().from(unsubscribeList).where(eq(unsubscribeList.email, row.email)).get();  // ← N+1
          if (!existing) tx.insert(unsubscribeList).values({ id: randomUUID(), email: row.email }).run();
        }
        tx.insert(activityEvents).values({ ... }).run();
      }
      return clientIds.length;
    },
  });
}
```

## Step 3 — Apply the fix

Replace the `mutate` callback with the batch version. The change is inside the callback
only — the surrounding `runBulk` call and its options are untouched.

```ts
    mutate: (tx) => {
      const rows = tx.select().from(clients).where(inArray(clients.id, clientIds)).all();
      const now = new Date();
      tx.update(clients).set({ status: "unsubscribed", onEmailList: false, updatedAt: now }).where(inArray(clients.id, clientIds)).run();

      // Batch-query unsubscribe list instead of one query per row
      const emails = rows.map((r) => r.email).filter((e): e is string => !!e);
      const alreadyUnsubbed = new Set(
        emails.length > 0
          ? tx.select({ email: unsubscribeList.email }).from(unsubscribeList).where(inArray(unsubscribeList.email, emails)).all().map((r) => r.email)
          : [],
      );

      for (const row of rows) {
        if (row.email && !alreadyUnsubbed.has(row.email)) {
          tx.insert(unsubscribeList).values({ id: randomUUID(), email: row.email }).run();
        }
        tx.insert(activityEvents).values({
          id: randomUUID(),
          clientId: row.id,
          eventType: "status_changed",
          description: "Unsubscribed (bulk)",
          employeeId: user.id,
          metadata: { newStatus: "unsubscribed" },
        }).run();
      }
      return clientIds.length;
    },
```

`inArray` and `unsubscribeList` are already imported at the top of `bulk-clients.ts`.
No new imports are needed.

The `emails.length > 0` guard is required: `inArray` with an empty array generates
invalid SQL in drizzle-orm.

## Step 4 — Verify

```bash
pnpm lint
pnpm test
```

Expected:
- `pnpm lint` exits 0.
- `pnpm test` exits 0. The existing `bulkUnsubscribeClients` tests in
  `__tests__/actions/bulk-clients.test.ts` must all pass without modification.

## STOP conditions

- If `inArray` is NOT already imported at the top of `bulk-clients.ts`, add it to the
  existing import from `drizzle-orm`. Do not change anything else.
- If `unsubscribeList` is NOT already imported from `@/lib/db/schema`, add it to the
  existing schema import. Do not change anything else.
- If the tests break after the change, revert and STOP — do not attempt to fix the tests
  without understanding why they broke.

## Maintenance note

The same N+1 pattern exists in `bulkUnsubscribeProspects` (`lib/actions/bulk-prospects.ts`).
When plan 014 is executed, apply the identical batch pattern there too.
