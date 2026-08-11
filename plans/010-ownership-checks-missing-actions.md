---
plan: "010"
title: "Add ownership checks to addTag, removeTag, graduateProspectIntoExistingClient, markFollowUpComplete, rescheduleFollowUp"
category: Security
priority: P1
effort: S
risk: Low
confidence: High
written_against: 531d57b
depends_on: —
---

## Why this matters

Five mutating server actions accept a client/log ID but never verify that the
authenticated associate owns the target resource. Any associate can tag,
un-tag, enrich, or mark follow-ups on any other associate's client. The fix is
three lines per function, matching the established pattern already used by
`logOutreach`.

Affected functions (all in scope for this plan):
- `addTag` — `lib/actions/tags.ts:9`
- `removeTag` — `lib/actions/tags.ts:34`
- `graduateProspectIntoExistingClient` — `lib/actions/prospects.ts:89`
- `markFollowUpComplete` — `lib/actions/outreach.ts:101`
- `rescheduleFollowUp` — `lib/actions/outreach.ts:121`

## Established exemplar pattern

`logOutreach` in `lib/actions/outreach.ts:47–53` is the reference implementation:

```ts
const user = await requireAuth();

const client = db.select({ employeeId: clients.employeeId })
  .from(clients).where(eq(clients.id, parsed.clientId)).get();
if (!client) return { error: "Client not found" };
if (user.role !== "manager" && client.employeeId !== user.id) {
  return { error: "You can only log outreach for your own clients" };
}
```

Every fix in this plan follows this exact three-part shape:
1. Select only `{ employeeId }` from the relevant table.
2. Guard: `if (!record) return { error: "... not found" }`.
3. Guard: `if (user.role !== "manager" && record.employeeId !== user.id) return { error: "..." }`.

## Files in scope

- `lib/actions/tags.ts`
- `lib/actions/prospects.ts`
- `lib/actions/outreach.ts`

## Files explicitly out of scope

- Everything else. Do NOT touch `lib/actions/bulk-clients.ts`, `lib/actions/smart-lists.ts`,
  or any other file.

## Step 1 — Drift check

Run:
```
git diff 531d57b -- lib/actions/tags.ts lib/actions/prospects.ts lib/actions/outreach.ts
```

Expected: no changes to the ownership-check areas (lines 9–55 of tags.ts, lines 89–140
of prospects.ts, lines 101–139 of outreach.ts). If you see additions there, read the
diff carefully and skip the corresponding sub-step below if the ownership check was
already added.

## Step 2 — Fix `addTag` (tags.ts:9)

Current code at `lib/actions/tags.ts:9–13`:
```ts
export async function addTag(clientId: string, tag: string) {
  const user = await requireAuth();
  const c = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!c) return { error: "Client not found" };
  if ((c.tags || []).includes(tag)) return;
```

After the `if (!c)` guard, add the ownership check. The `select` already fetches the
full client row (needed for `c.tags`), so read `employeeId` from the existing `c`:

```ts
export async function addTag(clientId: string, tag: string) {
  const user = await requireAuth();
  const c = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!c) return { error: "Client not found" };
  if (user.role !== "manager" && c.employeeId !== user.id) return { error: "Not authorized to tag this client" };
  if ((c.tags || []).includes(tag)) return;
```

**Verify**: the ownership guard appears between the `if (!c)` guard and the duplicate-tag
check.

## Step 3 — Fix `removeTag` (tags.ts:34)

Current code at `lib/actions/tags.ts:34–38`:
```ts
export async function removeTag(clientId: string, tag: string) {
  const user = await requireAuth();
  const c = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!c) return { error: "Client not found" };
  if (!(c.tags || []).includes(tag)) return;
```

Same change as `addTag` — insert ownership check after the `if (!c)` guard:

```ts
export async function removeTag(clientId: string, tag: string) {
  const user = await requireAuth();
  const c = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!c) return { error: "Client not found" };
  if (user.role !== "manager" && c.employeeId !== user.id) return { error: "Not authorized to remove tags from this client" };
  if (!(c.tags || []).includes(tag)) return;
```

## Step 4 — Fix `graduateProspectIntoExistingClient` (prospects.ts:89)

Current code at `lib/actions/prospects.ts:96–100`:
```ts
  const prospect = db.select().from(prospects).where(eq(prospects.id, prospectId)).get();
  if (!prospect) return { error: "Prospect not found" };

  const existing = db.select().from(clients).where(eq(clients.id, existingClientId)).get();
  if (!existing) return { error: "Client not found" };
```

The risk is that an associate enriches a client they don't own. Add the ownership check
after the `if (!existing)` guard:

```ts
  const existing = db.select().from(clients).where(eq(clients.id, existingClientId)).get();
  if (!existing) return { error: "Client not found" };
  if (user.role !== "manager" && existing.employeeId !== user.id) return { error: "Not authorized to modify this client" };
```

No import changes needed — `clients` is already imported.

## Step 5 — Fix `markFollowUpComplete` (outreach.ts:101)

Current code at `lib/actions/outreach.ts:101–106`:
```ts
export async function markFollowUpComplete(logId: string): Promise<{ error: string } | undefined> {
  const user = await requireAuth();
  const log = db.select({ clientId: outreachLogs.clientId }).from(outreachLogs).where(eq(outreachLogs.id, logId)).get();
  try {
```

The `log` select already runs before the transaction. Expand the select to also fetch
`employeeId`, then guard with it. The `employeeId` column on `outreachLogs` records
which employee created the log entry.

Change the select to:
```ts
  const log = db.select({ clientId: outreachLogs.clientId, employeeId: outreachLogs.employeeId })
    .from(outreachLogs).where(eq(outreachLogs.id, logId)).get();
  if (!log) return { error: "Follow-up not found" };
  if (user.role !== "manager" && log.employeeId !== user.id) return { error: "Not authorized to complete this follow-up" };
```

The `if (!log)` check is new — currently the code silently proceeds if the log is
missing. Adding it is in scope because it is necessary to safely read `log.employeeId`.

## Step 6 — Fix `rescheduleFollowUp` (outreach.ts:121)

Current code at `lib/actions/outreach.ts:121–124`:
```ts
export async function rescheduleFollowUp(logId: string, newDate: string): Promise<{ error: string } | undefined> {
  const user = await requireAuth();
  const log = db.select({ clientId: outreachLogs.clientId }).from(outreachLogs).where(eq(outreachLogs.id, logId)).get();
  try {
```

Same change as `markFollowUpComplete`:
```ts
  const log = db.select({ clientId: outreachLogs.clientId, employeeId: outreachLogs.employeeId })
    .from(outreachLogs).where(eq(outreachLogs.id, logId)).get();
  if (!log) return { error: "Follow-up not found" };
  if (user.role !== "manager" && log.employeeId !== user.id) return { error: "Not authorized to reschedule this follow-up" };
```

## Step 7 — Write regression tests

Add tests to **`__tests__/actions/outreach-actions.test.ts`** (already exists — append to
the existing file, inside the outer `describe("Outreach Actions", ...)`):

```ts
describe("markFollowUpComplete ownership", () => {
  it("should reject an associate who tries to complete another employee's follow-up", async () => {
    // Create a log owned by MANAGER
    vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
    await logOutreach({ clientId: FIRST_CLIENT_ID, method: "call", outcome: "wants_to_come_in",
      followUpDate: "2026-12-01", notes: "ownership-test-010a" });
    const logs = db.select().from(outreachLogs).where(eq(outreachLogs.clientId, FIRST_CLIENT_ID)).all();
    const log = logs.find((l) => l.notes === "ownership-test-010a");
    createdLogIds.push(log!.id);

    // Now act as associate
    vi.mocked(getServerSession).mockResolvedValue(associateSession as any);
    const result = await markFollowUpComplete(log!.id);
    expect(result).toEqual({ error: "Not authorized to complete this follow-up" });
  });
});

describe("rescheduleFollowUp ownership", () => {
  it("should reject an associate who tries to reschedule another employee's follow-up", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
    await logOutreach({ clientId: FIRST_CLIENT_ID, method: "call", outcome: "wants_to_come_in",
      followUpDate: "2026-12-01", notes: "ownership-test-010b" });
    const logs = db.select().from(outreachLogs).where(eq(outreachLogs.clientId, FIRST_CLIENT_ID)).all();
    const log = logs.find((l) => l.notes === "ownership-test-010b");
    createdLogIds.push(log!.id);

    vi.mocked(getServerSession).mockResolvedValue(associateSession as any);
    const result = await rescheduleFollowUp(log!.id, "2027-01-01");
    expect(result).toEqual({ error: "Not authorized to reschedule this follow-up" });
  });
});
```

Also add tests to **`__tests__/actions/tag-actions.test.ts`** (already exists — read the
file first and follow its fixture IDs and cleanup pattern). Add two cases in its existing
associate-ownership describe block (or create one if absent):

```ts
it("should reject an associate who tries to tag another employee's client", async () => {
  // Use a client owned by a different employee than the session user
  vi.mocked(getServerSession).mockResolvedValue(associateSession as any);
  const result = await addTag(/* a client not owned by ASSOCIATE_ID */, "vip");
  expect(result).toEqual({ error: "Not authorized to tag this client" });
});
```

Read `__tests__/actions/tag-actions.test.ts` before writing to find the correct
fixture client IDs and any existing associate session setup.

Import `rescheduleFollowUp` alongside `markFollowUpComplete` at the top of
`outreach-actions.test.ts` if it isn't already imported.

## Step 8 — Verification gate

```bash
pnpm lint
pnpm test
```

Expected:
- `pnpm lint` exits 0 with no new errors.
- `pnpm test` exits 0; all pre-existing tests still pass; new ownership tests pass.

## STOP conditions

- If `outreachLogs.employeeId` does not exist on the schema, STOP and report back — the
  column may have a different name. Do NOT guess; read `lib/db/schema.ts` first.
- If the tag-actions test file has a completely different structure (no `vi.mock("next-auth")`),
  STOP and report back rather than re-architecting the test file.

## Maintenance note

If a future plan adds a new mutating action that takes a `clientId`, apply the same
three-part guard before merging. The `logOutreach` pattern is the canonical exemplar.
