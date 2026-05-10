# Iris Code Review — May 2026

**Date**: 2026-05-07
**Last updated**: 2026-05-10
**Scope**: Full codebase (`app/`, `components/`, `lib/`, `middleware.ts`, config files)
**Excluded**: `node_modules/`, `.next/`, `components/ui/` (shadcn primitives)
**Total Source**: ~18,600+ lines across ~90 files

---

## Tracking Summary

| Category | Total | Open | Resolved |
|----------|-------|------|----------|
| Silent Bugs — Critical | 4 | 0 | 4 |
| Silent Bugs — Medium | 12 | 1 | 11 |
| Dead Code / Unwired | 7 | 7 | 0 |
| Code Quality — Large Files | 5 | 5 | 0 |
| Code Quality — Duplication | 6 | 6 | 0 |
| Code Quality — Inconsistency | 4 | 4 | 0 |
| Code Quality — Missing Error Handling | 8 | 8 | 0 |
| Code Quality — Hardcoded Values | 10 | 10 | 0 |
| Performance | 6 | 6 | 0 |
| Accessibility | 6 | 6 | 0 |
| Security | 6 | 1 | 5 |
| **TOTAL** | **74** | **54** | **20** |

> **How to use:** When an issue is fixed, change its status marker from `[ ]` to `[x]` and update the Tracking Summary counts above. Add the fix date and commit reference in a `**Fix:**` line below the issue description.

---

## Item Dependencies & Cross-Impact

Items that interact or compound. Check before resolving — fixing linked items in the wrong order can cause rework, regressions, or leave partial fixes that make things worse.

---

### Cluster 1: Promo matching pipeline
**Items:** B-12, B-13, P-4, E-7

**Flow:** `createPromo` / `importPromos` → `matchPromoToClients` → writes `promoMatches`

- **B-13 → B-12 (causal chain):** `createPromo` (B-13) allows empty modelNumber/collection. An empty collection flows into `matchPromoToClients` where B-12's empty-string `.includes("")` matches every client. Fix B-13 first (add input validation at the entry point), then B-12 (add defensive guard inside the matcher). Fixing only B-12 still allows bad data creation.
- **P-4 ↔ B-12 (amplifier):** P-4 (O(promos × clients) loop) is already a performance concern. B-12 makes it catastrophic — an empty collection matches all clients, so a single bad promo triggers a full cross-product of inserts. Fixing B-12 mitigates the worst case of P-4.
- **E-7 (shared code path):** `logOutreach` calls `createPromoMatchIfApplies` (L68) which does the same model-number match without the collection bug. But it also lacks transaction wrapping (E-7). When E-7 is fixed (wrapping `logOutreach` in a transaction), ensure `createPromoMatchIfApplies` is included inside it.

**Recommended order:** B-13 → B-12 → P-4 → E-7

---

### Cluster 2: RVX import categorization & phone normalization
**Items:** B-1, B-6, B-8, B-14, P-5

**Flow:** `analyzeRvxImport` → `categorizeRvxRows` → phone/email lookups against banned/deleted/active sets; `graduateProspect` → duplicate check against clients; `check-duplicates` API → exact phone match

- **B-1 (root cause — RVX import):** Phone normalization mismatch means `bannedPhones.has(phone)`, `deletedClientPhones.has(phone)`, and `activeClientPhones.has(phone)` all fail silently because `phone` is raw while the sets contain digit-only values. Rows that should be flagged as banned/deleted/existing are miscategorized as "new."
- **B-8 (API endpoint):** The `check-duplicates` API uses `eq(clients.phone, phone)` — exact match without normalization. If a form submits `(555) 123-4567` but the DB stores `5551234567`, no match is found. Related to B-1 but a separate code path.
- **B-14 (graduation path):** `graduateProspect` at L1072 normalizes both sides (`c.phone?.replace(/\D/g, "") === phone?.replace(/\D/g, "")`), so it's currently correct. But it uses inline normalization instead of a shared utility, making it fragile.
- **B-6 (downstream):** If a RVX row for a client that was previously purged is imported as "new" (because B-1 phone matching failed), and the user then tries to purge that new client, B-6's FK constraint failure prevents the purge. These are separate bugs but B-1 creates the scenario.
- **P-5 (compounds with B-1):** P-5 loads all banned/unsubscribed/clients into memory for the categorization. B-1 means this expensive work produces wrong results. Fixing B-1 first ensures the data loading at least produces correct results; P-5 can then optimize the loading strategy.

**Systemic fix:** Add a `normalizePhone()` utility to `lib/utils.ts`. Use it in B-1 (categorizeRvxRows lookups), B-8 (check-duplicates comparison), and B-14 (graduateProspect comparison).

**Recommended order:** Add `normalizePhone()` utility → B-1 → B-8 → B-14. B-6 is independent but test the purge path with a client imported via RVX. P-5 can follow later.

---

### Cluster 3: `logOutreach` correctness
**Items:** B-5, E-7, E-1, Q-INCON-1

**Function:** `logOutreach` in `lib/actions.ts` (L37)

- **B-5 (auth gap — design tradeoff):** Uses `getSessionUser()` instead of `requireAuth()`, allowing `employeeId: null` inserts. Commit `6077935` intentionally reverted a prior `requireAuth()` fix, accepting nullable `employeeId` as a design choice. The security exposure is low (server action, no direct HTTP path) but non-zero. Before fixing E-7, decide whether the null-employee case is intended — if so, E-7's transaction should still run even when `user` is null.
- **E-7 (transaction):** The function does 5 sequential non-transactional operations (insert log → update client → insert event → recalcHeat → createPromoMatchIfApplies). A failure at any step leaves inconsistent data. The transaction fix should encompass all steps while accommodating the nullable `user` from B-5.
- **E-1 (recalcHeat):** `recalcHeat` is called from `logOutreach` (L66) and has no error handling. If recalcHeat throws silently, E-7's transaction would roll back the entire outreach log — which is actually safer than the current behavior. But E-1 should still be fixed to provide meaningful error feedback.
- **Q-INCON-1 (pattern):** `logOutreach` currently doesn't follow a consistent error pattern (it uses `getSessionUser` + optional chaining, not `requireAuth` + typed return). When Q-INCON-1 standardizes error handling, `logOutreach` should return `{ error: string }` rather than throwing.

**Recommended order:** E-7 → E-1 → Q-INCON-1 (B-5 is a design decision, resolve it separately before starting this cluster)

---

### Cluster 4: Employee name staleness
**Items:** B-3, Q-DUP-6

**Flow:** `updateEmployee` → `employees.name` column → session token → activity descriptions

- **B-3 (core bug):** `updateEmployee` updates `firstName`/`lastName` but not `name`. The `name` column is used in 8+ places for activity event descriptions (`${user.name}`), and in `auth.ts` L26 for session token creation. After a name change, all new activity descriptions still show the old name because the session token's `name` field was set at login time from the stale column.
- **Q-DUP-6 (related):** The `fullName` helper (`[firstName, lastName].filter(Boolean).join(" ")`) is re-implemented in 4+ files instead of being centralized. B-3's fix needs to construct `name` from `firstName`/`lastName` — this is exactly the pattern Q-DUP-6 wants to centralize. Fix Q-DUP-6 first, then B-3 uses the shared helper.

**Recommended order:** Q-DUP-6 → B-3

---

### Cluster 5: Client API routes
**Items:** B-7, B-8, B-9, SC-5, P-6, E-8

**Files:** `app/api/clients/route.ts`, `app/api/clients/[id]/route.ts`, `app/api/clients/check-duplicates/route.ts`, `app/api/notes/route.ts`

- **B-7 ↔ P-6 ↔ E-8 (same file):** `GET /api/clients` (B-7) returns banned/deleted clients, has no pagination (P-6), and could OOM (E-8). All three affect the same route handler. Fix together: add status filter + pagination + limit.
- **B-8 (adjacent route):** `check-duplicates` doesn't exclude banned/deleted clients (B-8). When B-7 adds the status filter pattern, apply the same pattern to B-8. Same file directory, likely same developer touch.
- **B-9 (adjacent route):** `PUT /api/clients/[id]` logs raw body (B-9). Not directly related to B-7/B-8 but in the same `[id]/route.ts` file. If you're already editing client API routes, fix B-9 in the same pass.
- **SC-5 (same pattern):** `DELETE /app/api/notes/route.ts` lacks ownership checks. Not the same file but the same "API route missing authorization" pattern. Fix alongside the client routes for a consistent "harden all API routes" pass.

**Recommended order:** B-7 + P-6 + E-8 (same handler) → B-8 → B-9 → SC-5

---

### Cluster 6: `purgeClient` foreign key chain
**Items:** B-6, DC-4

**Function:** `purgeClient` in `lib/actions.ts` (~L698)

- **B-6 (FK failure):** `purgeClient` deletes `activityEvents`, `outreachLogs`, then `clients` — but `promoMatches` and `approvalRequests` reference `clients.id`. The DELETE throws on FK constraint. The `mergeClients` function (L762-773) correctly migrates both `promoMatches` (L764-773) and `approvalRequests` (L762) before deleting the loser client — the pattern is already in the codebase. The `approvalRequests` FK is now confirmed as a live constraint (approvals feature shipped).
- **DC-4 (data.db):** The orphaned 0-byte `data.db` in the root (DC-4) should be removed and gitignored at the same time to prevent confusion about which database file is the live one. If someone manually deletes `data/iris.db` thinking `data.db` is the real one, purge operations would fail differently.

**Recommended order:** B-6 → DC-4

---

### Cluster 7: Unban/unsubscribe consistency
**Items:** B-10, B-11

**Functions:** `unbanClient`, `addUnsubscribeEmail` in `lib/actions.ts`

- **B-10 (lookup key):** `unbanClient` uses `email` instead of `customerId` to find the banned record. This is fragile because: (a) `banClient` correctly stores both `customerId` and `email`, so the better lookup key is `customerId`; (b) if email changes after ban, the record is orphaned.
- **B-11 (atomicity):** `addUnsubscribeEmail` does insert + status update non-transactionally. Same pattern as B-10's unban (which does delete + status update). Both should be wrapped in transactions. Fix together as a "make status-change operations transactional" pass.

**Recommended order:** B-10 → B-11 (same conceptual fix: wrap in transaction + use correct lookup key)

---

### Cluster 8: `actions.ts` decomposition
**Items:** Q-LARGE-1, Q-INCON-1, Q-INCON-2, E-1, E-2, E-3, Q-DUP-5, H-1 through H-5

**File:** `lib/actions.ts` (1208 lines)

Splitting `actions.ts` into domain modules (Q-LARGE-1) is a high-touch refactor that affects most other findings in this file. Many small fixes become trivial or get "free" fixes during the split:

- **Q-INCON-1:** Standardize error returns per module as you split. Each new module adopts the correct pattern from the start.
- **Q-INCON-2:** Loading state patterns are in the consuming components, but the split makes it clearer which actions are called from where, making standardization easier.
- **E-1, E-2, E-3:** Add try/catch to each function as it moves to its new module.
- **Q-DUP-5:** The auth check boilerplate in API routes is in `app/api/`, not `actions.ts`, but the split makes `withAuth()` (Q-DUP-5) more natural to introduce since you're already thinking about auth patterns.
- **H-1 through H-5:** Extract constants to `lib/constants.ts` as part of the split. Each module imports what it needs.

**Recommended order:** H-1 through H-5 (extract constants first) → Q-LARGE-1 (split) → Q-INCON-1 + E-1 + E-2 + E-3 (fix per module as you split)

---

### Cluster 9: Dialog component accessibility
**Items:** A-1, A-2, Q-DUP-1, Q-LARGE-5, Q-INCON-4

**Files:** `components/client-status-actions.tsx`, `components/merge-client-dialog.tsx`, `components/transfer-client-dialog.tsx`, `components/confirm-dialog.tsx`, `components/edit-client-dialog.tsx`

- **A-1 (pervasive pattern):** The invisible `<div onClick>` trigger pattern (A-1) is used in 10+ instances across 4 files: `client-status-actions.tsx` (7 instances — 3 ban/unsubscribe/delete × 2 roles), `merge-client-dialog.tsx` (1), `transfer-client-dialog.tsx` (1), `confirm-dialog.tsx` (1). Fix all instances in one pass.
- **A-2 + Q-INCON-4:** A-2 is a subset of A-1 (the merge dialog instance). Q-INCON-4 wants to standardize all dialog triggers. These are the same fix.
- **Q-DUP-1 + Q-LARGE-5:** The three duplicate status action dialogs should become a generic `ApprovalActionDialog`. When building the generic component, build it with proper `<DialogTrigger>` from the start (solving A-1 for the 6 instances in this file). Don't fix A-1 on the existing dialogs just to throw them away when Q-LARGE-5 extracts the generic.
- **A-2 (merge dialog):** The merge dialog is a separate extraction (Q-LARGE-4). Fix as part of that extraction, not standalone.
- **transfer-client-dialog.tsx + confirm-dialog.tsx:** These also use the `<div onClick>` pattern but aren't being refactored. Fix A-1 on these two independently after the status-actions refactor.

**Recommended order:** Q-LARGE-5 (extract generic, build accessible from day 1 — fixes 6 A-1 instances) → Q-LARGE-4 (extract merge, fix A-1 instance) → A-1 standalone fix (fix remaining instances in `transfer-client-dialog.tsx` and `confirm-dialog.tsx`) → Q-INCON-4 (standardize any remaining dialog triggers)

---

### Cluster 10: Backup/restore path
**Items:** B-4, SC-4, E-4, H-6, H-7

**Files:** `app/api/backup/restore/route.ts`, `lib/db/index.ts`, `app/api/backup/download/route.ts`

- **B-4 + SC-4 + E-4 (same file):** The restore route has three independent problems: response killed by process.exit (B-4), insufficient integrity check (SC-4), no error handling on file ops (E-4). Fix as a single rewrite of this route.
- **H-6 + H-7 (shared constants):** The DB path (`"data/iris.db"`) is hardcoded in `lib/db/index.ts` (H-6) and backup routes reference `"iris.db"` and `"data"` (H-7). Extract the path constant first, then the backup routes import it. This also ensures the restore route writes to the correct path defined in one place.

**Recommended order:** H-6 → H-7 → B-4 + SC-4 + E-4 (rewrite restore route using shared constants)

---

### Cluster 11: Smart lists client-side filtering
**Items:** P-3, H-9, P-1

**Flow:** Smart lists receives `allClients` prop → filters client-side in JavaScript

- **P-3 (core issue):** Entire client dataset transferred to browser. For small datasets this works, but it blocks scaling.
- **H-9 (compounds P-3):** Smart lists re-implements threshold constants (`STALE_THRESHOLD_DAYS`, etc.) inline instead of importing from `lib/utils.ts`. If server-side filtering is added (P-3), these thresholds need to be available server-side — which H-9's fix already enables.
- **P-1 (upstream):** `LIST_QUERY_LIMIT = 10000` in queries.ts feeds the smart lists component. If P-1 adds real server-side pagination, P-3's client-side filtering approach needs to change completely.

**Recommended order:** H-9 → P-3 → P-1

---

### Cluster 12: Recovery endpoint security
**Items:** SC-1, SC-2

**File:** `app/api/recover/route.ts`

- **SC-1 (rate limiting):** No rate limiting means brute-force is trivial.
- **SC-2 (enumeration):** Different error messages for "no account" vs "no recovery options" reveal information.
- **Cross-impact:** SC-2's fix (generic response messages) interacts with SC-1's fix (rate limiting). If you fix SC-2 first with generic messages, the rate limiter from SC-1 can count attempts per IP rather than per username (since the response no longer confirms the username exists). Fix SC-2 first so the rate limiting strategy is simpler.

**Recommended order:** SC-2 → SC-1

---

### Cross-Cluster Impact Map

Quick reference for items that appear in multiple clusters:

| Item | Clusters | Note |
|------|----------|------|
| B-1 | 2 | **RESOLVED** — phone normalization was already correct; parser normalizes before return |
| B-6 | 2, 6 | FK failure in purge — now confirmed against live `approvalRequests` FK |
| B-8 | 2, 5 | Phone normalization in check-duplicates + client API filter |
| B-14 | 2 | Phone normalization in graduateProspect (currently correct, fragile) |
| B-15 | 3, 6 | Approvals non-transactional — same class as B-6 FK failure; compound risk if banClient throws |
| B-7 | 5 | Client API filter |
| E-7 | 1, 3 | Transaction wrapping (logOutreach + promo match) |
| P-1 | 11 | Upstream query limit affects multiple consumers |
| P-4 | 1 | Promo matching performance |
| P-5 | 2 | Memory usage in RVX categorization |
| Q-INCON-1 | 3, 8 | Error pattern standardization |
| Q-LARGE-1 | 8 | The big refactor — touch point for many small fixes |
| A-1 | 9 | 10+ instances across 4 component files |

---

## Silent Bugs — Critical

### B-1. ~~Phone normalization mismatch in RVX import categorization~~ — RESOLVED (not a real bug)
**Severity:** ~~CRITICAL~~
**File:** `lib/actions.ts` (~L884-930, `categorizeRvxRows`)
**Description:** Original assessment was incorrect. `parseRvxCsv` in `lib/rvx-parser.ts` calls `normalizePhone()` (L42) on every row before returning, so `row.phone` is already digits-only by the time `categorizeRvxRows` receives it. The `bannedPhones`, `activeClientPhones`, and `deletedClientPhones` sets are built with `.replace(/\D/g, "")`, and `phone = row.phone ?? null` is also digits-only — the comparisons work correctly.

Residual style note: The condition `if (email && bannedEmails.has(email) || phone && bannedPhones.has(phone))` on L917 relies on `&&`-before-`||` operator precedence. It is correct as-is but diverges from the explicit-parentheses style used elsewhere in the function.
- [x] Fix: Not needed — phone matching is correct. Consider adding explicit parentheses to the banned-check condition for style consistency.

### B-2. `removeTag` uses SQL aggregate `MAX()` in UPDATE SET clause
**Severity:** CRITICAL
**File:** `lib/actions.ts` (~L183)
**Description:** `tx.update(clientTags).set({ usageCount: sql\`MAX(0, ${clientTags.usageCount} - 1)\` })` — SQLite's `MAX()` is an aggregate function for SELECT. Using it in UPDATE SET is semantically undefined. Works by accident but could break with different SQLite builds or ORM versions.
- [x] Fix: Replaced with `CASE WHEN ${clientTags.usageCount} - 1 < 0 THEN 0 ELSE ${clientTags.usageCount} - 1 END`.

### B-3. `updateEmployee` doesn't rebuild `name` column
**Severity:** CRITICAL
**File:** `lib/actions.ts` (~L454, `updateEmployee`)
**Description:** When firstName/lastName change, `employees.name` retains the old value. Activity logs, UI display, and session data show stale names. `createEmployee` correctly sets `name: lastName ? \`${firstName} ${lastName}\` : firstName` (added by commit `6077935`), but `updateEmployee` at L454 builds `updates` with only `firstName`, `lastName`, and `username` — omitting `name`. Bug is confirmed in current code.
- [x] Fix: Added `name` to the `updates` object in `updateEmployee`, using the same pattern as `createEmployee`.

### B-4. Backup restore `process.exit(0)` may kill response before it reaches client
**Severity:** CRITICAL
**File:** `app/api/backup/restore/route.ts` (L28-31)
**Description:** `setTimeout(() => process.exit(0), 500)` kills the server 500ms after returning `NextResponse.json({ ok: true })`. On slow connections, the response may not flush. Users see a network error, think restore failed, and may retry — overwriting the `.bak` file.
- [x] Fix: Moved `process.exit` scheduling inside a `ReadableStream` `start()` callback after `controller.close()`. The exit timer now starts only after the body bytes are fully produced, eliminating the race between response flushing and process termination.

---

## Silent Bugs — Medium

### B-5. `logOutreach` allows unauthenticated writes
**Severity:** MEDIUM
**File:** `lib/actions.ts` (L39)
**Description:** Uses `getSessionUser()` (returns `undefined` if unauthenticated) instead of `requireAuth()`. Results in `employeeId: null` inserts if called without a valid session. Most other mutations use `requireAuth()` or `requireManager()`.

**Status note (2026-05-10):** Commit `6077935` explicitly reverted a prior `requireAuth()` fix back to `getSessionUser()`, with the stated rationale that `employeeId` is nullable by design (outreach can be logged without attributing it to an employee). This is a deliberate design tradeoff, not an oversight. The security concern remains: a crafted server action call without a session would succeed and insert a null-employee outreach record. Whether this is acceptable depends on the threat model — at minimum, it should be documented.
- [ ] Fix: Either keep `getSessionUser()` and document the null-employee intent, or add a guard `if (!user) return` to prevent unauthenticated inserts without throwing.

### B-6. `purgeClient` doesn't delete `promoMatches` or `approvalRequests` — FK constraint failure
**Severity:** MEDIUM
**File:** `lib/actions.ts` (~L704, `purgeClient`)
**Description:** Deletes `activityEvents`, `outreachLogs`, then `clients` — but `promoMatches` and `approvalRequests` also reference `clients.id` with FK constraints. With `PRAGMA foreign_keys = ON`, the DELETE throws a constraint error. `purgeClient` silently fails when the client has promo matches or pending/reviewed approval requests. `mergeClients` correctly handles both tables before deleting the loser client (L762-773), showing the fix pattern exists. The `approvalRequests` FK is confirmed as a live constraint now that the approvals feature is shipped.
- [x] Fix: Wrapped all five deletes (`activityEvents`, `outreachLogs`, `promoMatches`, `approvalRequests`, `clients`) in a single `db.transaction()`. FK constraint failures on purge are now resolved.

### B-7. `GET /api/clients` returns ALL clients including banned/deleted
**Severity:** MEDIUM
**File:** `app/api/clients/route.ts` (L20)
**Description:** Uses `db.select().from(clients).orderBy(desc(clients.heatScore)).all()` without status filtering. `getAllClients` in `lib/queries.ts` correctly filters, but this route doesn't use it.
- [x] Fix: Added `notInArray(clients.status, ["banned", "deleted"])` to the GET /api/clients list query.

### B-8. `check-duplicates` API matches against deleted/banned clients + no phone normalization
**Severity:** MEDIUM
**File:** `app/api/clients/check-duplicates/route.ts`
**Description:** Two issues: (1) Duplicate check queries all clients without status filter — previously deleted or banned clients match as "duplicates," blocking re-creation. (2) Phone matching uses `eq(clients.phone, phone)` which is exact-match only. A client stored as `(555) 123-4567` won't match a query for `5551234567`. The RVX import's `categorizeRvxRows` (B-1) and `graduateProspect` (B-14) both normalize to digits — this endpoint should do the same.
- [x] Fix: Added `notInArray(clients.status, ["banned", "deleted"])` filter. Phone is now normalized via `normalizePhone()` from `lib/utils.ts` before the `eq()` comparison.

### B-9. `PUT /api/clients/[id]` logs raw `body` in activity metadata
**Severity:** MEDIUM
**File:** `app/api/clients/[id]/route.ts` (L63)
**Description:** `metadata: { fieldChanges: body }` persists the raw unvalidated JSON. Should use the zod-parsed `parsed.data` to avoid storing arbitrary client-sent fields. Note: the flat `app/api/clients/route.ts` PUT handler has the same route but correctly uses `parsed.data` — this bug is only in the `[id]` variant.
- [x] Fix: Replaced `body` with `parsed.data` in the metadata object in `app/api/clients/[id]/route.ts`.

### B-10. `unbanClient` looks up by email instead of customerId
**Severity:** MEDIUM
**File:** `lib/actions.ts` (~L335)
**Description:** `eq(bannedCustomers.email, c.email)` instead of `eq(bannedCustomers.customerId, clientId)`. Shared emails cause partial unbans; email changes after ban cause orphaned records.
- [x] Fix: Replaced email lookup with `eq(bannedCustomers.customerId, clientId)` — direct, stable, and handles email-after-ban changes correctly. Removed intermediate `row` variable.

### B-11. `addUnsubscribeEmail` is non-transactional
**Severity:** MEDIUM
**File:** `lib/actions.ts` (~L376-390)
**Description:** Unsubscribe list insert and client status update are separate operations. A crash between them leaves inconsistent state.
- [x] Fix: Wrapped unsubscribe list insert, client status update, and activity event in a single `db.transaction()`.

### B-12. Empty `collection` string in `matchPromoToClients` matches everything
**Severity:** MEDIUM
**File:** `lib/actions.ts` (~L252)
**Description:** `poi.some((p) => p.toLowerCase().includes(collectionLower))` — an empty `collectionLower` matches every string, flooding promo matches.
- [x] Fix: Added `collectionLower &&` guard before the `.includes()` check — empty collection no longer matches all clients.

### B-13. `createPromo` doesn't validate non-empty modelNumber/collection
**Severity:** MEDIUM
**File:** `lib/actions.ts` (~L259)
**Description:** `importPromos` checks for empty strings, but `createPromo` inserts directly. Combined with B-12, creates promos that match all clients.
- [x] Fix: Added empty-string guard at the top of `createPromo` — returns `{ error }` before inserting if either field is blank. (`importPromos` already had this guard.)

### B-14. `graduateProspect` phone normalization inconsistency
**Severity:** MEDIUM
**File:** `lib/actions.ts` (~L1072)
**Description:** The duplicate check in `graduateProspect` does `c.phone?.replace(/\D/g, "") === phone?.replace(/\D/g, "")` — normalizing the *client* phone for comparison but also normalizing the *prospect* phone with the same `.replace(/\D/g, "")`. This specific instance is actually correct (both sides are normalized). However, if the prospect's phone was stored with formatting from the RVX import (which stores raw phone values at L999/L1037), the `phone` variable (`parsed.phone ?? null`) comes from zod-validated input which may or may not be normalized. The comparison works today but is fragile — any change to how prospects store phone values would break it silently.

Note: `normalizePhone()` already exists as a module-private function in `lib/rvx-parser.ts` (L42). Promoting it to `lib/utils.ts` satisfies the systemic fix for B-8 and B-14.
- [x] Fix: Exported `normalizePhone()` from `lib/utils.ts`. Used in `graduateProspect` for both prospect phone and client phone comparison, replacing the inline `.replace(/\D/g, "")` expressions. Also used in check-duplicates (B-8).

### B-15. `reviewApprovalRequest` non-transactional — approval recorded before action executes
**Severity:** MEDIUM
**File:** `lib/actions.ts` (~L541, `reviewApprovalRequest`)
**Description:** Three separate operations happen in sequence without an outer transaction:
1. `db.update(approvalRequests)` marks the request as "approved" or "rejected" — **committed immediately**
2. `db.insert(activityEvents)` inserts the review event — **committed immediately**
3. If approved: calls `banClient()`, `unsubscribeClient()`, or `deleteClient()` — each with its own internal transaction

If step 3 throws (client not found, FK constraint, concurrent modification), the approval request is permanently marked "approved" with no way to reprocess it — the guard `if (request.status !== "pending") throw new Error("Request already reviewed")` at L548 blocks retry. The client remains in its original state with no audit trail of the failed action.
- [x] Fix: Moved downstream action (`banClient`/`unsubscribeClient`/`deleteClient`) to execute *before* the approval status update. If the action throws, the request remains "pending" and is retryable. Status update and activity event are now committed together in a single transaction after the action succeeds.

### B-16. `graduateProspectIntoExistingClient` logs wrong `eventType`
**Severity:** MEDIUM
**File:** `lib/actions.ts` (~L1157, `graduateProspectIntoExistingClient`)
**Description:** When a prospect is graduated into an existing client record (the merge-into-existing path), the activity event is logged with `eventType: "created"`. The client already exists — this is an enrichment of an existing record, not a creation. Using `"created"` makes the timeline misleading and could break UI logic that filters activity events by type to identify record creation (e.g., the "Client created from prospect graduation" description would appear alongside the original creation event).
- [x] Fix: Changed `eventType: "created"` to `eventType: "edited"` — this is enrichment of an existing record, not a creation event.

---

## Dead Code / Unwired

### DC-1. Unused shadcn form component
**File:** `components/ui/form.tsx`
**Description:** Scaffold from `npx shadcn add form` never imported anywhere. Likely pulls in `react-hook-form` and `@hookform/resolvers` as unused dependencies.
- [ ] Remove file and check if `react-hook-form` / `@hookform/resolvers` can be removed from `package.json`.

### DC-2. Unused pagination component
**File:** `components/ui/pagination.tsx`
**Description:** Never imported. The project uses a custom `components/pagination-footer.tsx` instead.
- [ ] Remove file.

### DC-3. Dead API route: templates
**File:** `app/api/templates/route.ts`
**Description:** Template data is fetched server-side via `lib/queries.ts`. This API route has no consumers.
- [ ] Remove file.

### DC-4. Orphaned `data.db` file in git history
**File:** `data.db` (project root, 0 bytes)
**Description:** Runtime database is at `data/iris.db`. This 0-byte file was committed before `*.db` was added to `.gitignore`. It's now excluded from new commits but remains in git history. The `ls` output still shows it because the file exists locally (likely created before gitignore took effect).
- [ ] Run `git rm --cached data.db` to remove from tracking. The local file can be deleted.

### DC-5. Unused exported functions
**Files:** `lib/queries.ts`, `lib/actions.ts`
**Functions:** `getImportBatches` (queries.ts), `getPromoMatchesForClient` (queries.ts), `getPromoMatchesForPromo` (queries.ts), `getPendingApprovalCount` (actions.ts)
**Description:** Exported but never imported by any other file in the project. Note: `getProspect` is used internally by `getProspectWithBatch` and `applyClientFilter` is used by smart-lists-content.tsx — both were initially reported as unused but are actually consumed.
- [ ] Remove or wire. Decide per function whether it's planned for future use or dead.

### DC-6. Unused type exports from schema
**File:** `lib/db/schema.ts`
**Types:** `NewClient` (`$inferInsert`), `RvxImportBatch` (`$inferSelect`), `ApprovalRequest` (`$inferSelect`), `Employee` (`$inferSelect`)
**Description:** Exported but never imported elsewhere. These are standard Drizzle ORM type inference exports. Keeping them is a valid pattern for library-style API surfaces and test typing, but they currently have no consumers in the app or test code.
- [ ] Low priority. Keep as public API surface or remove.

### DC-7. PNG screenshots tracked in git history despite gitignore
**Files:** `flow35c-sidebar-contact-info.png`, `flow45b-mobile-375.png`, `flow4a-client-detail-full.png`, `flow4b-mobile-sidebar-collapse-check.png`, `flow6b-edit-dialog.png`, `login-page.png`, `mobile-analytics-375.png`, `mobile-clients-375.png`, `mobile-clients.png`, `mobile-followups-375.png`, `mobile-promos-375.png`, `mobile-settings-375.png`, `tab-interests.png`, `tab-notes.png`, `tab-outreach.png`, `tab-profile.png`, `tab-tags.png`, `tab-timeline.png` (18 files, ~1.8MB)
**Description:** The `.gitignore` includes `*.png`, so these files are excluded from *new* commits. However, they were committed before the gitignore rule was added, so they remain in git history. They still clutter `git status` output if modified and occupy repo size.
- [ ] Move to `docs/screenshots/` if still needed as reference. Run `git rm --cached` on each to remove from tracking without deleting the local files.

---

## Code Quality — Large Files

### Q-LARGE-1. `lib/actions.ts` — 1208 lines, 40+ functions across 8 domains
**Description:** Monolithic server actions file. Contains outreach, tags, promos, templates, clients, employees, approvals, prospects, RVX import — all in one file.
- [ ] Split into `lib/actions/{_shared.ts, clients.ts, employees.ts, promos.ts, approvals.ts, prospects.ts, rvx-import.ts, outreach.ts}`. Shared helpers (`requireAuth`, `requireManager`, `getSessionUser`) go in `_shared.ts`.

### Q-LARGE-2. `app/(app)/promos/promos-content.tsx` — 653 lines
**Description:** Contains a 200+ line `ImportPromoDialog` with CSV parsing logic plus the main `PromosContent` component.
- [ ] Extract `ImportPromoDialog` to `components/promo/import-promo-dialog.tsx` and CSV parsing to `lib/promo-csv-parser.ts`.

### Q-LARGE-3. `app/(app)/smart-lists/smart-lists-content.tsx` — 606 lines
**Description:** Contains `SmartListItem`, `CreateListDialog`, `ClientRow`, filter helpers, and main content.
- [ ] Extract `SmartListItem` and `CreateListDialog` to `components/smart-lists/`.

### Q-LARGE-4. `components/merge-client-dialog.tsx` — 562 lines
**Description:** Two complete dialogs (`MergeClientDialog` + `MergeFromFormDialog`) plus shared helpers.
- [ ] Split into `components/merge/merge-client-dialog.tsx`, `components/merge/merge-from-form-dialog.tsx`, `components/merge/resolution-panel.tsx`.

### Q-LARGE-5. `components/client-status-actions.tsx` — 421 lines, 3 near-identical dialogs
**Description:** `BanCustomerDialog`, `UnsubscribeCustomerDialog`, `DeleteCustomerDialog` share 95% identical structure (session check → manager/associate branch → approval form or direct action).
- [ ] Create generic `ApprovalActionDialog` parameterized by action type, labels, and handler functions. Each variant becomes a thin wrapper.

---

## Code Quality — Duplication

### Q-DUP-1. Three near-identical status action dialogs
**File:** `components/client-status-actions.tsx`
**Description:** Ban, Unsubscribe, Delete dialogs have identical structure with only labels and action functions differing. See Q-LARGE-5.
- [ ] Fix: Covered by Q-LARGE-5.

### Q-DUP-2. Stat cards row pattern duplicated in 5 files
**Files:** `app/(app)/page.tsx`, `banned-content.tsx`, `unsubscribed-content.tsx`, `promos-content.tsx`, `analytics-overview-tab.tsx`
**Description:** Same Card + CardContent + icon + label + value structure repeated.
- [ ] Extract reusable `StatsGrid` component with a `StatItem[]` prop.

### Q-DUP-3. `PAGE_SIZE` constant defined independently in 9 files
**Files:** `clients-content.tsx` (20), `follow-ups-content.tsx` (20), `smart-lists-content.tsx` (20), `unsubscribed-content.tsx` (20), `banned-content.tsx` (20), `analytics-content.tsx` (20), `collections-content.tsx` (20), `deleted-tab.tsx` (20), `outreach-history-tab.tsx` (10), `promos-content.tsx` (15)
**Description:** Magic page size with inconsistent values across 10 files (7 use 20, 1 uses 15, 1 uses 10, and 1 uses 20 but for a different purpose).
- [ ] Add `DEFAULT_PAGE_SIZE = 20` to `lib/constants.ts`. Import and use consistently. Components that need different sizes can override with a local constant.

### Q-DUP-4. CSV parsing logic duplicated
**Files:** `app/(app)/promos/promos-content.tsx` (parsePasteData, findColumnMapping, KNOWN_HEADERS) and `lib/rvx-parser.ts` (parseRvxCsv)
**Description:** Both implement CSV/TSV parsing with separator detection, header matching, and row parsing.
- [ ] Extract shared `lib/csv-parser.ts` utility with configurable column mappings.

### Q-DUP-5. Auth check boilerplate in all 13 API routes
**File:** `app/api/*/route.ts`
**Description:** Every route starts with the same 2-line pattern: `const session = await getServerSession(authOptions); if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });`
- [ ] Create `withAuth(handler)` wrapper in `lib/api-helpers.ts`.

### Q-DUP-6. `fullName` helper pattern redefined in 5+ locations
**JS files:** `employees-tab.tsx` (local `fullName` function), `follow-ups-content.tsx` (inline 2x), `analytics-outreach-tab.tsx` (inline), `actions.ts` L1079 (`[match.firstName, match.lastName].filter(Boolean).join(" ")`), `auth.ts` L26 (same pattern)
**SQL templates:** `actions.ts` L597-598, `queries.ts` L48/L246-247/L312, `clients/[id]/page.tsx` L15/L37 — all use `COALESCE(${firstName}, '') || ' ' || COALESCE(${lastName}, '')`
**Description:** The JS pattern `[firstName, lastName].filter(Boolean).join(" ")` and its SQL equivalent `COALESCE(firstName, '') || ' ' || COALESCE(lastName, '')` appear in 5+ JS locations and 5+ SQL locations. Each re-implements the same name formatting logic.
- [ ] Add `fullName(person: {firstName: string; lastName?: string | null})` to `lib/utils.ts` for JS usage. For SQL, consider a shared SQL snippet helper.

---

## Code Quality — Inconsistent Patterns

### Q-INCON-1. Mixed error handling in server actions
**File:** `lib/actions.ts`
**Description:** Some functions throw errors (`throw new Error("Not authenticated")`), others return `{ error: string }`. Client components need both try/catch and result checks. Employee functions return `{ error }`, client functions throw.
- [ ] Standardize: all server actions should return typed results (`{ success: true, data? }` or `{ error: string }`). Never throw for expected failures.

### Q-INCON-2. Mixed loading state patterns
**Files:** Multiple `*-content.tsx` files
**Description:** Some use `useState + setIsLoading(true/false)`, others use `useTransition + start`. Both work but mixing creates cognitive overhead.
- [ ] Standardize on `useTransition` for server action calls.

### Q-INCON-3. Mixed data fetching patterns
**Files:** `app/(app)/*/page.tsx`, various components
**Description:** Some pages fetch in server components (correct pattern), others use `fetch()` in `useEffect` (merge-client-dialog search, promo matches).
- [ ] Prefer server component data fetching. For client-side needs, use a consistent pattern.

### Q-INCON-4. Inconsistent dialog trigger patterns
**Files:** `client-status-actions.tsx`, `merge-client-dialog.tsx`, `edit-client-dialog.tsx`
**Description:** Some dialogs use `<DialogTrigger asChild>` with `<Button>`, others use invisible `<div onClick>` wrappers. The invisible div pattern is fragile and inaccessible.
- [ ] Standardize on `DialogTrigger` with proper button elements. See A-1/A-2 for accessibility fix.

---

## Code Quality — Missing Error Handling

### E-1. `recalcHeat()` — no error handling
**File:** `lib/actions.ts` (~L29)
**Description:** If the DB query fails, silently returns. Heat scores become stale with no feedback.
- [ ] Wrap in try/catch and log errors.

### E-2. `addTag()`, `removeTag()` — no error handling or user feedback
**File:** `lib/actions.ts`
**Description:** Functions silently return on failure. No error state propagated to the UI.
- [ ] Add try/catch and return result objects.

### E-3. `createPromo()`, `importPromos()`, `clearAllPromos()` — no try/catch
**File:** `lib/actions.ts`
**Description:** Transactional operations with no error handling. Errors propagate as unhandled server action errors.
- [ ] Wrap in try/catch with user-friendly error returns.

### E-4. Backup restore file operations — no error handling
**File:** `app/api/backup/restore/route.ts`
**Description:** `writeFileSync` and `renameSync` can throw. `process.exit(0)` is a fragile restart mechanism.
- [ ] Add error handling for file ops. Consider async alternatives.

### E-5. `merge-client-dialog.tsx` search `useEffect` — errors silently swallowed
**File:** `components/merge-client-dialog.tsx` (~L265)
**Description:** `.catch(() => {})` — search failures give no user feedback.
- [ ] Show a toast or set error state on search failure.

### E-6. `MergeFromFormDialog` fetch `useEffect` — errors silently swallowed
**File:** `components/merge-client-dialog.tsx` (~L430)
**Description:** Same `.catch(() => {})` pattern.
- [ ] Show a toast or set error state.

### E-7. `logOutreach` multi-step operation not in a transaction
**File:** `lib/actions.ts` (~L39)
**Description:** Insert log → update client → insert event → recalc heat → create promo match. If any step fails mid-way, data is left inconsistent.
- [ ] Wrap entire operation in `db.transaction()`.

### E-8. `GET /api/clients` — no pagination, potential OOM
**File:** `app/api/clients/route.ts`
**Description:** Returns all clients with no limit. Could exhaust memory on large datasets.
- [ ] Add pagination parameters.

---

## Code Quality — Hardcoded Values

### H-1. Heat score lookback — magic number
**File:** `lib/actions.ts` (L32)
**Value:** `90 * MS_PER_DAY`
- [ ] Extract `HEAT_LOOKBACK_DAYS = 90` to `lib/constants.ts`.

### H-2. Follow-up lookahead — magic number
**File:** `lib/actions.ts`, `lib/queries.ts`
**Value:** `7 * MS_PER_DAY`
- [ ] Extract `FOLLOW_UP_LOOKAHEAD_DAYS = 7` to `lib/constants.ts`.

### H-3. Minimum password length — hardcoded
**File:** `lib/actions.ts` (`createEmployee`)
**Value:** `password.length < 6`
- [ ] Extract `MIN_PASSWORD_LENGTH = 6` to `lib/constants.ts`.

### H-4. JWT session max age — hardcoded
**File:** `lib/auth.ts`
**Value:** `maxAge: 60 * 60 * 24 * 30` (30 days)
- [ ] Extract `SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30` to `lib/constants.ts`.

### H-5. Bcrypt salt rounds — hardcoded in multiple files
**Files:** `lib/auth.ts`, `lib/actions.ts`
**Value:** `10`
- [ ] Extract `BCRYPT_SALT_ROUNDS = 10` to `lib/constants.ts`.

### H-6. Database path — hardcoded
**File:** `lib/db/index.ts`
**Value:** `"data/iris.db"`
- [ ] Use `process.env.DATABASE_PATH` with `"data/iris.db"` fallback.

### H-7. Backup paths — hardcoded
**File:** `app/api/backup/download/route.ts`
**Value:** `"iris.db"`, `"data"`
- [ ] Share constant with `db/index.ts`.

### H-8. Client-side filter thresholds — hardcoded
**File:** `app/(app)/clients/clients-content.tsx`
**Value:** `86400` (seconds per day), `90` (stale threshold)
- [ ] Import `MS_PER_DAY` from constants.

### H-9. Smart list filter thresholds — re-implemented
**File:** `app/(app)/smart-lists/smart-lists-content.tsx`
**Description:** Similar filtering logic to `lib/utils.ts` constants (`STALE_THRESHOLD_DAYS`, `RECENT_PURCHASE_DAYS`, `NO_OUTREACH_DAYS`) but re-implemented inline.
- [ ] Export thresholds from `lib/constants.ts` and import consistently.

### H-10. Promo CSV header mapping — large inline object
**File:** `app/(app)/promos/promos-content.tsx`
**Value:** `KNOWN_HEADERS` mapping object
- [ ] Move to `lib/promo-csv-parser.ts` or config file.

---

## Performance

### P-1. `LIST_QUERY_LIMIT = 10000` — loads up to 10K records at once
**File:** `lib/queries.ts`
**Description:** Multiple queries (`getAllClients`, `getClientsWithEmployee`, `getBannedCustomers`) load up to 10,000 records. Will degrade as data grows.
- [ ] Implement server-side pagination with `LIMIT/OFFSET`.

### P-2. Dashboard makes 5 sequential DB queries
**File:** `app/(app)/page.tsx`
**Description:** `getStats`, `getOverdueFollowUps`, `getUpcomingFollowUps`, `getRecentActivity`, `getAllClients` run in series.
- [ ] Use `Promise.all()` for independent queries.

### P-3. Smart lists filter entire client dataset client-side
**File:** `app/(app)/smart-lists/smart-lists-content.tsx`
**Description:** Receives `allClients` as a prop and filters in JavaScript. Transfers entire dataset to the browser.
- [ ] Move filtering to server side for large datasets.

### P-4. `importPromos` O(promos × clients) matching loop
**File:** `lib/actions.ts`
**Description:** Loads ALL clients with products of interest, then loops over promos matching each. Quadratic with client count.
- [ ] Optimize with indexed lookups or batch processing.

### P-5. `analyzeRvxImport` O(n²) dedup + full table scans
**File:** `lib/actions.ts`
**Description:** Loads all banned/unsubscribed/clients into memory. Dedup loop is quadratic for large imports.
- [ ] Use indexed lookups instead of full table scans.

### P-6. `GET /api/clients` — no pagination
**File:** `app/api/clients/route.ts`
**Description:** Returns all clients ordered by heat score with no limit.
- [ ] Add pagination parameters.

---

## Accessibility

### A-1. Invisible `<div onClick>` dialog trigger — no role, tabindex, or keyboard handler
**Files:** `components/client-status-actions.tsx` (7 instances), `components/merge-client-dialog.tsx` (1 instance), `components/transfer-client-dialog.tsx` (1 instance), `components/confirm-dialog.tsx` (1 instance)
**Description:** `<div onClick={() => setOpen(true)} className="contents">` is invisible to screen readers and unreachable via keyboard. This pattern is used in 10+ dialog triggers across 4 component files. The `className="contents"` makes the div invisible in CSS but it's still semantically a non-interactive element.
- [ ] Replace all instances with `<DialogTrigger asChild><button>` or a properly accessible trigger element. This is a pervasive pattern that should be fixed systematically across all dialog components.

### A-2. Same invisible div trigger pattern in merge dialogs
**File:** `components/merge-client-dialog.tsx`
**Description:** Same inaccessible pattern.
- [ ] Same fix as A-1.

### A-3. Native checkbox instead of accessible component
**File:** `app/(app)/smart-lists/smart-lists-content.tsx`
**Description:** Uses `<input type="checkbox">` with custom styling instead of `<Checkbox>` from `@/components/ui/checkbox`. May not meet contrast requirements.
- [ ] Use the Checkbox component for consistency and a11y.

### A-4. Merge resolution buttons lack `aria-pressed` state
**File:** `components/merge-client-dialog.tsx` (ResolutionPanel)
**Description:** Field choice buttons have no indication of which value is selected for screen readers.
- [ ] Add `aria-pressed={choices[key] === "a"}` etc.

### A-5. Icon-only buttons missing `aria-label` (partial coverage)
**Files:** Multiple component files
**Description:** Some icon-only buttons (Trash2, MoreHorizontal) have aria-labels, others don't. Only 14 of 30+ component files have any aria-label usage.
- [ ] Audit all icon-only buttons for complete aria-label coverage.

### A-6. Heat distribution bar relies solely on color
**File:** `app/(app)/page.tsx`
**Description:** Hot/Warm/Cold bar segments use only color to convey information. No text labels visible on narrow segments.
- [ ] Ensure text labels are always visible or add aria-labels to bar segments.

---

## Security

### SC-1. No rate limiting on password recovery endpoint
**File:** `app/api/recover/route.ts`
**Description:** Attackers can brute-force secret answers without throttling.
- [x] Fix: Added in-memory rate limiter — 5 attempts per username per 15-minute window, returns 429 when exceeded.

### SC-2. Username enumeration via recovery endpoint
**File:** `app/api/recover/route.ts`
**Description:** Different error messages for "no account" vs "no recovery options" reveal whether a username exists and its recovery configuration.
- [x] Fix: Changed lookup step error to generic "If this account exists and has recovery options configured, you will see the security question."

### SC-3. Missing Content-Security-Policy header
**File:** `next.config.mjs`
**Description:** No CSP header set. Other security headers (X-Frame-Options, X-Content-Type-Options) are present.
- [x] Fix: Added CSP header — `default-src 'self'`; script/style allow unsafe-inline/eval for Next.js; img/font allow data: and blob:; connect limited to 'self'.

### SC-4. Backup restore only checks SQLite magic bytes
**File:** `app/api/backup/restore/route.ts`
**Description:** A crafted file could pass the magic check but contain malicious data.
- [x] Fix: After writing tmp file, open it with better-sqlite3 (readonly) and run `PRAGMA integrity_check`. If result !== "ok" or open throws, delete tmp and return 422.

### SC-5. Any authenticated user can delete any note
**File:** `app/api/notes/route.ts` DELETE
**Description:** No ownership check. Only verifies event type and note ID match.
- [x] Fix: Fetch note first; return 403 if caller is not the note's author (`employeeId`) and not a manager.

### SC-6. `.env.local` contains dev secret — verify gitignore exclusion
**File:** `.env.local`
**Description:** Contains `NEXTAUTH_SECRET=iris-dev-secret-change-me`. The `.gitignore` does include `.env.local` and `*.db` patterns, so this file is excluded from tracking. However, the secret value is a weak placeholder — ensure production uses a strong, unique secret. The `lib/auth.ts` module-level check (`if (!process.env.NEXTAUTH_SECRET) throw new Error(...)`) provides a runtime guard, but the error crashes the entire process at import time.
- [ ] No gitignore fix needed. Consider: document the production secret requirement. Consider: change the module-level throw to a lazy check that fails on first auth attempt rather than at import time.
