---
plan: "013"
title: "Fix full table scan in graduateProspect duplicate check"
category: Performance
priority: P2
effort: S
risk: Low
confidence: High
written_against: 531d57b
depends_on: —
---

## Why this matters

`graduateProspect` in `lib/actions/prospects.ts:25–46` loads every non-deleted client
into memory to find a duplicate by email or phone:

```ts
const allClients = db
  .select({ id, firstName, lastName, email, phone, deletedAt })
  .from(clients)
  .all();                    // ← full table scan
...
const match = allClients.find(
  (c) =>
    c.deletedAt === null &&
    ((email && c.email?.toLowerCase() === email) ||
      (phone && normalizePhone(c.phone) === phone)),
);
```

At 1 000+ clients this is unnecessary — SQLite can do the filter in the storage layer.
The fix is a targeted SQL query that pushes both the email/phone match and the
`deletedAt IS NULL` filter into the WHERE clause, returning at most one row.

## Files in scope

- `lib/actions/prospects.ts` only.

## Files explicitly out of scope

Do not touch `lib/actions/bulk-prospects.ts`, any other prospect action, or test files.

## Step 1 — Drift check

```bash
git diff 531d57b -- lib/actions/prospects.ts
```

If the diff shows the targeted query already applied, verify correctness and mark DONE.

## Step 2 — Current state

`lib/actions/prospects.ts:1–4` imports:
```ts
import { clients, activityEvents, unsubscribeList, prospects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
```

`lib/actions/prospects.ts:24–46`:
```ts
  // Duplicate check against live clients
  const allClients = db
    .select({ id: clients.id, firstName: clients.firstName, lastName: clients.lastName, email: clients.email, phone: clients.phone, deletedAt: clients.deletedAt })
    .from(clients)
    .all();

  const email = parsed.email?.toLowerCase() ?? null;
  const phone = normalizePhone(parsed.phone ?? null);

  const match = allClients.find(
    (c) =>
      c.deletedAt === null &&
      ((email && c.email?.toLowerCase() === email) ||
        (phone && normalizePhone(c.phone) === phone)),
  );

  if (match) {
    return {
      type: "duplicate",
      existingClientId: match.id,
      existingClientName: fullName(match),
    };
  }
```

## Step 3 — Add required imports

`or` and `isNull` are not yet imported from `drizzle-orm`. Add them to the existing
import:

```ts
import { eq, or, isNull } from "drizzle-orm";
```

## Step 4 — Replace the full-table scan with a targeted query

Delete the `allClients` block and the in-memory `.find()`. Replace with a single query
that lets SQLite do the filtering:

```ts
  const email = parsed.email?.toLowerCase() ?? null;
  const phone = normalizePhone(parsed.phone ?? null);

  // Build email/phone OR conditions — only include clauses for non-null values
  const matchConditions = [
    email ? eq(clients.email, email) : null,
    phone ? eq(clients.phone, phone) : null,
  ].filter(Boolean) as Parameters<typeof or>[0][];

  const match = matchConditions.length > 0
    ? db
        .select({ id: clients.id, firstName: clients.firstName, lastName: clients.lastName })
        .from(clients)
        .where(and(isNull(clients.deletedAt), or(...matchConditions)))
        .get()
    : null;
```

Also add `and` to the `drizzle-orm` import (if not already present):
```ts
import { eq, or, and, isNull } from "drizzle-orm";
```

The `fullName(match)` call at line 44 uses `firstName` and `lastName`, which are
included in the new select. Nothing downstream changes.

**Important:** the original code normalized phone numbers with `normalizePhone` on
both sides of the comparison (calling it on each candidate row). The new query stores
raw phone strings in the DB. Check `lib/utils.ts → normalizePhone` to understand what
it does — if it strips non-digits, then the DB may store formatted strings like
`(555) 010-0`. In that case, the SQL `eq(clients.phone, phone)` compares the
normalized search value against whatever is stored. This is correct if all phones are
stored already normalized; if they are stored raw, the SQL match will miss some records.

**Escape hatch**: if `normalizePhone` in `lib/utils.ts` does anything beyond stripping
non-digits (e.g. adds country codes, handles international formats), STOP and report
back before completing this plan — the SQL-level match may need a different approach.

## Step 5 — Verify

```bash
pnpm lint
pnpm test
```

Expected: exits 0. The existing `__tests__/actions/prospect-actions.test.ts` must all
pass without modification.

## STOP conditions

- If `and` or `isNull` are already imported in `prospects.ts` under different names,
  do not re-import them — reuse what is there.
- If the prospect-actions tests break after the change, revert and STOP.
- If `normalizePhone` does non-trivial formatting (see escape hatch above), STOP and
  report back.

## Maintenance note

If a future plan adds a similar duplicate check in another graduation path, apply the
same SQL-filter pattern. Never load `.all()` and filter in memory when the filter
criteria are indexable columns.
