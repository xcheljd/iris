---
plan: "011"
title: "Add ownership check to duplicateSmartList"
category: Security
priority: P1
effort: S
risk: Low
confidence: High
written_against: 531d57b
depends_on: —
---

## Why this matters

`duplicateSmartList` in `lib/actions/smart-lists.ts:22` is the only mutation in that
file that does NOT enforce ownership. `deleteSmartList` (line 13) and `renameSmartList`
(line 45) both have:

```ts
if (user.role !== "manager" && list.ownerId !== user.id)
  return { error: "Not authorized to ..." };
```

`duplicateSmartList` fetches the original list (line 24) and creates a copy owned by
the requester (`ownerId: user.id`, line 30), but any authenticated associate can
silently copy any other user's private smart list. The fix is one guard line.

## Files in scope

- `lib/actions/smart-lists.ts` only.

## Files explicitly out of scope

Do not touch `deleteSmartList`, `renameSmartList`, `createSmartList`, any test files
not listed here, or any other file.

## Step 1 — Drift check

```bash
git diff 531d57b -- lib/actions/smart-lists.ts
```

Expected: no changes. If a diff shows an ownership check already added to
`duplicateSmartList`, confirm it matches the pattern below and mark this plan DONE
without further changes.

## Step 2 — Current state

`lib/actions/smart-lists.ts:22–39` currently reads:

```ts
export async function duplicateSmartList(listId: string): Promise<{ error: string } | undefined> {
  const user = await requireAuth();
  const original = db.select().from(smartLists).where(eq(smartLists.id, listId)).get();
  if (!original) return { error: "Smart list not found" };
  try {
    db.insert(smartLists).values({
      id: randomUUID(),
      name: `${original.name} (Copy)`,
      ownerId: user.id,
      filters: original.filters,
      sort: original.sort,
      isShared: original.isShared,
    }).run();
    revalidatePath("/smart-lists");
  } catch {
    return { error: "Failed to duplicate smart list" };
  }
}
```

## Step 3 — Apply the fix

Add one line after `if (!original) return { error: "Smart list not found" };`:

```ts
export async function duplicateSmartList(listId: string): Promise<{ error: string } | undefined> {
  const user = await requireAuth();
  const original = db.select().from(smartLists).where(eq(smartLists.id, listId)).get();
  if (!original) return { error: "Smart list not found" };
  if (user.role !== "manager" && original.ownerId !== user.id) return { error: "Not authorized to duplicate this smart list" };
  try {
    db.insert(smartLists).values({
```

No import changes needed — `user`, `original`, and `smartLists` are already in scope.

## Step 4 — Write a regression test

Read `__tests__/actions/template-smartlist-actions.test.ts` first to understand the
test structure (fixture IDs, mock setup, cleanup). Then add a new test case that
verifies the ownership check:

The test must:
1. Create a smart list as manager (or use an existing fixture list owned by manager).
2. Attempt `duplicateSmartList(thatListId)` as an associate session.
3. Assert the result is `{ error: "Not authorized to duplicate this smart list" }`.
4. Assert no new row was inserted in the `smartLists` table with
   `ownerId === ASSOCIATE_ID` and a name matching `... (Copy)`.

Follow the existing test file's mock setup (`vi.mock("next-auth", ...)`) and cleanup
pattern exactly.

## Step 5 — Verification gate

```bash
pnpm lint
pnpm test
```

Expected: exits 0. All pre-existing tests pass; new ownership test passes.

## STOP conditions

- If `smartLists.ownerId` does not exist on the schema, STOP and report back — do not
  guess the column name.
- If the test file does not use `vi.mock("next-auth", ...)` to fake sessions, STOP and
  report back before inventing a different pattern.

## Maintenance note

If a new mutation is ever added to `lib/actions/smart-lists.ts`, apply the same
three-part pattern (`fetch → 404 guard → ownership guard`) before merging.
