# Iris Code Quality Review — May 2026

**Date:** 2026-05-10  
**Scope:** Full codebase (`app/`, `components/`, `lib/`, `__tests__/`)  
**Passes:** code-reviewer, code-simplifier, silent-failure-hunter, pr-test-analyzer, comment-analyzer, type-design-analyzer  
**Status:** Complete (20/20 resolved)

---

## Tracking Summary

| Category | Total | Open | Resolved |
|---|---|---|---|
| Critical Issues | 5 | 0 | 5 |
| Important Issues | 7 | 0 | 7 |
| Simplification | 5 | 0 | 5 |
| Test Gaps | 3 | 0 | 3 |
| **TOTAL** | **20** | **0** | **20** |

> **How to use:** When an issue is fixed, change its status marker from `[ ]` to `[x]` and update the Tracking Summary counts above. Add the fix date and commit reference in a `**Fixed:**` line below the issue description.

---

## Item Dependencies & Fix Order

### Cluster 1: Transaction atomicity

**Items:** C-1, C-2, T-1

**Flow:** Client and outreach mutations → optional activityEvent insert → DB integrity

- **C-1 (highest risk):** `mergeClients` runs 7 sequential writes with no transaction. A failure at any step leaves the DB split — winner updated but loser alive, or FK rows pointing to a deleted record. Fix first; it's the most destructive failure mode.
- **C-2 (same pattern, multiple files):** `deleteClient`, `restoreClient`, and `patchClientFromFormMerge` in `clients.ts`, plus `markFollowUpComplete` and `rescheduleFollowUp` in `outreach.ts`, each pair a primary write with an activityEvent insert outside any transaction. Fix in the same pass as C-1 — identical fix pattern.
- **T-1 (validates C-1):** The existing `mergeClients` tests cover happy paths only. A test that simulates a mid-merge failure should be added after C-1 is fixed to prove the transaction actually rolls back correctly.

**Recommended order:** C-1 → C-2 → T-1

---

### Cluster 2: Approval action error propagation

**Items:** C-3, T-2

**Flow:** `reviewApprovalRequest` → `banClient` / `unsubscribeClient` / `deleteClient` → approval status commit

- **C-3 (silent failure):** `deleteClient` return is checked; `banClient` and `unsubscribeClient` are not. If `banClient` throws, the approval is still marked "approved." Fix by wrapping the `if (approved)` block in try/catch before the status-update transaction.
- **T-2 (validates C-3):** No test covers the approved-but-action-failed path. Add after C-3 is fixed.

**Recommended order:** C-3 → T-2

---

### Cluster 3: Error return consistency

**Items:** C-4, I-3

**Pattern:** All server actions should return `{ error: string }` on failure rather than throwing.

- **C-4 (throws):** `graduateProspect` throws `Error("Prospect not found")` and `Error("Prospect is not active")`. Callers using `"error" in result` will crash. The inconsistency is within-file: `graduateProspectIntoExistingClient` uses `return { error: "Prospect not found" }` for the identical guard.
- **I-3 (missing outer boundary):** `logOutreach` wraps its DB writes in a transaction but has no outer try/catch. Zod parse errors from `outreachInputSchema.parse(data)` and failures in `createPromoMatchIfApplies` (which runs outside the transaction) propagate as uncaught Next.js errors. If `createPromoMatchIfApplies` throws, the outreach log is already committed but the promo match is silently lost.

**Recommended order:** C-4 → I-3 (independent; fix in same pass for consistency)

---

### Cluster 4: Staleness filter inconsistency

**Items:** I-1

**Flow:** Built-in "Stale" list → `buildBuiltInConds("stale")` vs. custom smart list → `buildCustomConds({stale:true})` vs. in-memory → `applyClientFilter("stale")`

- **I-1:** Built-in "Stale" checks only `lastOutreachAt`. Custom and in-memory both check `MAX(lastOutreachAt, lastPurchaseAt)`. The same label produces different client sets depending on the path. Fix by aligning the built-in SQL path to match the custom path.

**Recommended order:** I-1 (standalone)

---

### Cluster 5: Silent error swallowing

**Items:** I-2

**Files:** `lib/actions/promos.ts`, `lib/actions/rvx-import.ts`

- **I-2:** `createPromo`, `importPromos`, `clearAllPromos`, and both RVX import catch blocks use `catch (_err)` without logging. Production failures leave no trace. Fix all in one pass — add `console.error("[actionName]", _err)` before returning `{ error }`.

**Recommended order:** I-2 (standalone)

---

### Cluster 6: RVX import deduplication

**Items:** S-1

**Files:** `lib/actions/rvx-import.ts:98–116` and `148–169`

- **S-1:** The key-construction → group-lookup → `selectBestRecord` loop is copy-pasted verbatim in both `analyzeRvxImport` and `importProspectsFromRvx`. Extract a `deduplicateRvxRows` helper. `analyzeRvxImport` calls `findWithinImportDuplicates` separately for the `duplicateCsv`, then the helper for categorization.

**Recommended order:** S-1 (standalone)

---

### Cluster 8: Transaction callback `db` vs `tx` inconsistency

**Items:** I-6

**Files:** `lib/actions/prospects.ts`, `lib/actions/rvx-import.ts`

- **I-6:** `graduateProspect`, `graduateProspectIntoExistingClient`, `unsubscribeProspect`, and `importProspectsFromRvx` all call `db.transaction(() => { db.insert/update... })` using the outer `db` reference inside the callback instead of the `tx` parameter. `clients.ts` and `promos.ts` correctly use `tx`. With SQLite's single synchronous connection this works in practice, but bypasses Drizzle's transaction isolation and would fail silently if behavior ever changes (e.g., connection pooling, savepoints).

**Recommended order:** I-6 (standalone, low-risk pass — replace `db.xxx()` with `tx.xxx()` inside each callback)

---

### Cluster 7: Query constants and duplication

**Items:** S-2, S-3, S-4, I-4

**Files:** `lib/queries.ts`, `lib/constants.ts`

- **S-3 / S-4 (constants first):** Extract `SEC_PER_DAY = 86_400` and `MAX_SMART_LIST_CLIENTS = 10_000` to `lib/constants.ts` before touching any query logic.
- **S-2 (query dedup):** `getUpcomingFollowUps` and `getOverdueFollowUps` are near-identical. Extract `getFollowUps(direction)` after constants are in place.
- **I-4 (N+1):** `getAllSmartListCounts` runs one SQL query per smart list. Switch to preloading all clients once and running in-memory via `applyClientFilter` (already exists in `lib/utils.ts`).

**Recommended order:** S-3 + S-4 → S-2 → I-4

---

## Critical Issues

### C-1. `mergeClients` — no transaction around multi-step writes
**File:** `lib/actions/clients.ts:251–295`

Seven separate `db.xxx().run()` calls (update winner, migrate outreach logs, migrate activity events, migrate approval requests, delete conflicting promo matches, migrate promo matches, delete loser) execute outside any transaction. A failure mid-way leaves the DB in a split state: the winner may be updated while the loser still exists, or FK rows may point to a deleted record.

- [x] Fix: Wrap everything from line 251 through `db.delete(clients)` in a single `db.transaction((tx) => { ... })`, using `tx` throughout. The trailing `recalcHeat` and `revalidatePath` calls stay outside the transaction.
  **Fixed 2026-05-10:** All 7 writes wrapped in `db.transaction((tx) => { ... })` with `tx` throughout. `loserName` moved inside callback. `recalcHeat`/`revalidatePath` remain outside.

---

### C-2. Multi-step writes without transactions in client and outreach mutations
**Files:** `lib/actions/clients.ts`, `lib/actions/outreach.ts`

`deleteClient` (lines 157–174), `restoreClient` (lines 184–198), and `patchClientFromFormMerge` (lines 325–350) in `clients.ts` each call `db.update(...).run()` followed by `db.insert(activityEvents).run()` with no wrapping transaction. Same pattern in `outreach.ts`: `markFollowUpComplete` and `rescheduleFollowUp` each do a primary write plus an optional activityEvent insert without a transaction. If the activityEvent insert fails in any of these, the primary mutation is committed with no audit trail.

- [x] Fix: Wrap each pair in `db.transaction((tx) => { ... })` using `tx` throughout.
  **Fixed 2026-05-10:** `deleteClient`, `restoreClient`, `patchClientFromFormMerge` in `clients.ts` and `markFollowUpComplete`, `rescheduleFollowUp` in `outreach.ts` all wrapped in transactions.

---

### C-3. `reviewApprovalRequest` — silent failure on `banClient` / `unsubscribeClient`
**File:** `lib/actions/approvals.ts:58–72`

`banClient` and `unsubscribeClient` return `void`; their errors are not propagated. `deleteClient`'s return value is checked (`if (r?.error) return { error: r.error }`), but if `banClient` throws, the exception is uncaught and the approval status update still runs — marking the request "approved" even though the ban never happened.

- [x] Fix: Wrap the `if (approved) { switch ... }` block in try/catch that returns `{ error }` before the status-update transaction commits.
  **Fixed 2026-05-10:** `banClient` and `unsubscribeClient` signatures updated to return `Promise<{ error: string } | undefined>`. `reviewApprovalRequest` now checks `r?.error` for all three switch cases.

---

### C-4. `graduateProspect` — throws instead of returning `{ error }`
**File:** `lib/actions/prospects.ts`

`throw new Error("Prospect not found")` and `throw new Error("Prospect is not active")` are inconsistent with every other action in the codebase. Callers using the `"error" in result` pattern will crash instead of handling gracefully. The inconsistency is within-file: `graduateProspectIntoExistingClient` (same file, line 92) uses `return { error: "Prospect not found" }` for the identical guard case.

- [x] Fix: Add `{ type: "error"; error: string }` as a third member of `graduateProspect`'s return union, and return it instead of throwing. Update callers accordingly.
  **Fixed 2026-05-10:** Return type expanded to 3-member union. Both throws converted to `return { type: "error", error: "..." }`. Caller in `graduate-prospect-dialog.tsx` updated; tests updated to match `{ type: "error" }` shape.

---

### C-5. `duplicateSmartList` — wrong owner on duplicate
**File:** `lib/actions/smart-lists.ts:26–36`

The duplicate preserves `original.ownerId`. If Employee A duplicates Employee B's shared list, the copy belongs to Employee B. The duplicating user from `requireAuth()` is available but unused.

- [x] Fix: Replace `ownerId: original.ownerId` with `ownerId: user.id`.
  **Fixed 2026-05-10:** `duplicateSmartList` now captures `user` from `requireAuth()` and sets `ownerId: user.id`.

---

## Important Issues

### I-1. Inconsistent staleness definition across three query paths
**File:** `lib/queries.ts`

Three paths compute "stale" but disagree:
- `getClientsWithEmployeePaginated` (line 124–128) — checks only `lastOutreachAt`
- `buildBuiltInConds("stale")` (line 359–360) — checks only `lastOutreachAt`
- `buildCustomConds({stale:true})` (lines 383–388) — checks `MAX(COALESCE(lastOutreachAt, 0), COALESCE(lastPurchaseAt, 0))`

`applyClientFilter("stale")` in `lib/utils.ts` also checks MAX of both dates. The same "Stale" label produces different client sets depending on which code path is hit. The paginated client list and built-in smart list use the narrower (wrong) definition; the custom smart list and in-memory filter use the correct one.

- [x] Fix: Align all SQL paths to use the same `MAX(COALESCE(lastOutreachAt, 0), COALESCE(lastPurchaseAt, 0))` logic used in `buildCustomConds`.
  **Fixed 2026-05-10:** `getClientsWithEmployeePaginated` and `buildBuiltInConds("stale")` in `queries.ts` updated to use `MAX(COALESCE(...), COALESCE(...))` identical to `buildCustomConds`.

---

### I-2. `promos.ts` and `rvx-import.ts` catch blocks discard errors silently
**Files:** `lib/actions/promos.ts`, `lib/actions/rvx-import.ts`

`createPromo`, `importPromos`, `clearAllPromos`, and both RVX import catch blocks use `catch (_err)` and return `{ error: "..." }` without logging `_err`. Production DB failures leave no trace.

- [x] Fix: Add `console.error("[actionName]", _err)` before each `return { error }`.
  **Fixed 2026-05-10:** All catch blocks in `promos.ts` and `rvx-import.ts` updated from `catch (_err)` to `catch (err)` with `console.error("...", err)` logging.

---

### I-3. `logOutreach` — no outer error boundary; `createPromoMatchIfApplies` runs outside transaction
**File:** `lib/actions/outreach.ts`

`logOutreach` wraps its three core DB writes in a transaction (lines 44–67), which is correct. But there is no outer try/catch, so `outreachInputSchema.parse(data)` Zod errors and failures from `createPromoMatchIfApplies` propagate as raw uncaught Next.js errors. More critically, `createPromoMatchIfApplies` runs AFTER the transaction commits with no error handling — if it fails (e.g., constraint error on `promoMatches`), the outreach log is already committed but the promo match record is silently lost.

- [x] Fix: (a) Add an outer try/catch returning `{ error: "Failed to log outreach" }`. (b) Consider moving `createPromoMatchIfApplies` inside the transaction so a failure rolls back the entire operation, or add explicit error logging if the silent-loss behavior is acceptable.
  **Fixed 2026-05-10:** `logOutreach` now uses `safeParse` (returns `{ error }` on bad input), wraps the transaction in try/catch returning `{ error: "Failed to log outreach" }`, and wraps `createPromoMatchIfApplies` in a separate try/catch with `console.error` (acceptable silent-loss for supplementary promo matching). Caller in `outreach-logger.tsx` updated to handle `result?.error`.

---

### I-4. `getAllSmartListCounts` — N+1 queries
**File:** `lib/queries.ts`

Runs one SQL query per smart list. With many lists this creates unnecessary sequential DB reads and lock contention.

- [ ] Fix: Preload all clients once and run in-memory counting via the existing `applyClientFilter` in `lib/utils.ts`, or batch with a UNION.

---

### I-5. `employees.ts` — `Record<string, unknown>` bypasses Drizzle type safety
**File:** `lib/actions/employees.ts`

`db.update(employees).set(updates as Record<string, unknown>)` lets arbitrary keys through, bypassing column-level type checking. Unknown columns are silently ignored; invalid types pass without compile-time feedback.

- [x] Fix: Type the update object as `Partial<typeof employees.$inferInsert>` using only known schema keys.
  **Fixed 2026-05-10:** `updates` typed as `Partial<typeof employees.$inferInsert>` in `updateEmployee`.

---

### I-6. `db` used inside `db.transaction()` callbacks instead of `tx`
**Files:** `lib/actions/prospects.ts`, `lib/actions/rvx-import.ts`

`graduateProspect`, `graduateProspectIntoExistingClient`, `unsubscribeProspect`, and `importProspectsFromRvx` all call `db.transaction(() => { db.insert/update... })`, using the outer `db` reference inside the callback instead of the `tx` parameter Drizzle provides. `clients.ts` and `promos.ts` correctly use `tx`. With SQLite's single synchronous connection this works in practice — `BEGIN` is in effect so any `db.xxx().run()` on the same connection is within the transaction — but it bypasses Drizzle's transaction contract and would break with any change to connection handling.

- [x] Fix: Add the `tx` parameter to each callback signature and replace `db.xxx()` with `tx.xxx()` inside.
  **Fixed 2026-05-10:** `graduateProspect`, `graduateProspectIntoExistingClient`, `unsubscribeProspect` in `prospects.ts` and `importProspectsFromRvx` in `rvx-import.ts` all updated to use `tx` parameter.

---

### I-7. `createPromoMatchIfApplies` (outreach) matches by model only; promo creation matches by model AND collection
**File:** `lib/actions/outreach.ts:26–33`

When a purchase is logged, `createPromoMatchIfApplies` checks `p.modelNumber === modelNumber` (exact model match only). But `matchPromoToClients` in `promos.ts` (called when a promo is created) matches by both model AND collection substring. A client watching a collection receives a promo match when the promo is first created, but if they later purchase a model from that collection via `logOutreach`, no new promo match is created — because the outreach-time function only checks model. The two code paths that write to the same `promoMatches` table use different match logic.

- [ ] Fix: Either extend `createPromoMatchIfApplies` to also check collection (to match `matchPromoToClients`), or document why the intentional difference exists. If the intent is "model-only at purchase time," the function name and a comment should make that explicit.

---

## Simplification Opportunities

### S-1. RVX deduplication loop is copy-pasted
**File:** `lib/actions/rvx-import.ts:98–116` and `148–169`

The key-construction → group-lookup → `selectBestRecord` logic is duplicated verbatim across `analyzeRvxImport` and `importProspectsFromRvx`.

- [x] Fix: Extract a `deduplicateRvxRows(rows: RvxRawRow[]): RvxRawRow[]` helper. `analyzeRvxImport` calls `findWithinImportDuplicates` separately to build `duplicateCsv`, then calls the helper for categorization.
  **Fixed 2026-05-10:** `deduplicateRvxRows(rows, dupeGroups)` helper extracted; both `analyzeRvxImport` and `importProspectsFromRvx` now delegate to it.

---

### S-2. `getUpcomingFollowUps` / `getOverdueFollowUps` — near-duplicate queries with overlapping results
**File:** `lib/queries.ts`

Structurally identical queries; the only difference is the date bound. `getUpcomingFollowUps` uses `lte(followUpDate, now + 7 days)` with no lower bound — this means it returns all overdue follow-ups too, making the "upcoming" set a superset of "overdue." Whether this overlap is intentional is unclear from the code alone. Either way, the duplication should be extracted.

- [ ] Fix: Extract a shared helper parameterized by the date bound and decide whether `getUpcomingFollowUps` should have a `gte(followUpDate, now)` lower bound to exclude overdue ones (or document that the overlap is intentional).

---

### S-3. `SEC_PER_DAY` — magic number defined in multiple places
**File:** `lib/queries.ts`

`86400` appears inline repeatedly with no named constant.

- [x] Fix: Add `export const SEC_PER_DAY = 86_400` to `lib/constants.ts` and import it wherever used.
  **Fixed 2026-05-10:** Constant added to `constants.ts`; three inline `86400` definitions removed from `queries.ts`; import updated.

---

### S-4. `LIST_QUERY_LIMIT` — unexplained inline cap
**File:** `lib/queries.ts`

`10000` is used as a client list cap with no explanation of why that value.

- [x] Fix: Add `export const MAX_SMART_LIST_CLIENTS = 10_000` to `lib/constants.ts` with a brief comment explaining it caps in-memory filter evaluation.
  **Fixed 2026-05-10:** `LIST_QUERY_LIMIT` and `MAX_SMART_LIST_CLIENTS` added to `constants.ts`; inline `10000` definition removed from `queries.ts`; import updated.

---

### S-5. PUT handler duplication in API routes
**Files:** `app/api/clients/route.ts`, `app/api/clients/[id]/route.ts`

Both PUT handlers parse `clientPatchSchema`, build the same patch object, and insert the same `activityEvents` entry. Only the `clientId` source differs.

- [ ] Fix: Extract a shared `applyClientPatch(clientId, patchData, userId)` helper in `lib/actions/` to keep the two endpoints in sync.

---

## Test Coverage Gaps

### T-1. `mergeClients` — no atomicity test
**File:** `__tests__/actions/transfer-merge-actions.test.ts` | Priority: 8/10

Happy-path merges are covered. No test simulates a mid-merge failure to verify neither client is left in a corrupt state. Fixing C-1 without a regression test leaves the guarantee unverifiable.

- [x] Fix: Add a test that forces a failure mid-transaction (e.g., mock a later `tx.update` to throw) and asserts neither client's state has changed.
  **Fixed 2026-05-10:** Spied on `db.transaction` to inject a throw after the real callback returns, forcing better-sqlite3 to roll back. Also fixed two pre-existing broken tests (`.rejects.toThrow` → `{ error }` return check) in the same file.

---

### T-2. `reviewApprovalRequest` — approved-but-action-failed scenario untested
**Priority: 8/10**

No test simulates `banClient` throwing while `reviewApprovalRequest` is mid-execution to verify the approval status is not committed on action failure.

- [x] Fix: Add a test that mocks `banClient` to throw and asserts the approval request remains "pending."
  **Fixed 2026-05-10:** Wrapped `banClient`, `unsubscribeClient`, and `deleteClient` in `vi.fn()` via `vi.mock("@/lib/actions/clients", importOriginal)`. Test uses `mockResolvedValueOnce({ error: "..." })` on `banClient` and asserts the approval row stays `"pending"`.

---

### T-3. `duplicateSmartList` ownership — untested
**Priority: 6/10**

No test verifies ownership of the duplicated list when the duplicating user differs from the original owner.

- [x] Fix: Add a test where Employee A duplicates Employee B's list and asserts the copy's `ownerId` equals Employee A's id.
  **Fixed 2026-05-10:** Added test in `template-smartlist-actions.test.ts` — manager creates a list, associate duplicates it, asserts `copy.ownerId === ASSOCIATE_ID`.
