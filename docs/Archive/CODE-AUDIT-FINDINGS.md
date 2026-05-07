# Iris Code Audit — Findings Report

**Date**: 2026-04-27  
**Last updated**: 2026-05-07 (session 4 — audit complete)  
**Scope**: Full codebase (`app/`, `components/`, `lib/`, `middleware.ts`)  
**Excluded**: `node_modules/`, `.next/`, `components/ui/` (shadcn primitives)  
**Total Source**: ~18,600 lines across ~90 files  

---

## Tracking Summary

| Severity | Total | Open | In Progress | Resolved |
|----------|-------|------|-------------|----------|
| CRITICAL | 8 | 0 | 0 | 8 |
| HIGH | 23 | 0 | 0 | 23 |
| MEDIUM | 36 | 0 | 0 | 36 |
| LOW | 17 | 0 | 0 | 17 |
| **TOTAL** | **84** | **0** | **0** | **84** |

> **How to use:** When an issue is fixed, change its status marker from `[ ]` to `[x]` and update the Tracking Summary counts above. Add the fix date and PR/commit reference in a `**Fix:**` line below the issue description.

---

## Executive Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| 🔴 CRITICAL | 8 (8 resolved) | Auth bypass, mass assignment, missing DB indexes, tag corruption |
| 🟠 HIGH | 23 (23 resolved) | Phantom API routes, no error boundaries, missing validation, duplicated logic |
| 🟡 MEDIUM | 36 (36 resolved) | Duplicated code, missing transactions, memory leaks, unbounded queries, new UI findings |
| 🔵 LOW | 17 (17 resolved) | Deprecated APIs, hardcoded configs, index-based keys, debug leftovers, new low findings |

**All 84 findings resolved.** No open issues.

---

## Item Dependencies

Items that interact with each other. Use as a check before resolving anything: if you're about to fix an item listed here, read the linked items first. Resolving items in the wrong order can create rework or silent regressions.

### Cluster: client update path
- **C-03 ↔ H-23** — same files (`app/api/clients/[id]/route.ts`, `app/api/clients/route.ts` PUT handlers). C-03 needs a field allowlist; H-23 needs an ownership check. Should be done together; doing one alone leaves the file half-fixed and the second fix rebases awkwardly.
- **C-03 ↔ H-09** — H-09's zod schemas would be the natural home for the C-03 allowlist. Doing C-03 first creates manual code that H-09 will rewrite. Prefer doing H-09's outreach pattern first (already in `lib/validation/outreach.ts` from M-17), then applying it to client update routes for C-03 + H-23 in the same pass.

### Cluster: tag system
- **C-07 + C-08 + H-19** — all in `addTag`/`removeTag` (`lib/actions.ts:213-239`, `app/api/tags/route.ts`). C-07 (usageCount drift), C-08 (missing else branch for new tags), H-19 (race conditions) are best resolved together as a single atomic-tag-ops sweep.

### Cluster: indexable predicates
- **C-04 ← M-04, M-07** — M-04 and M-07 added indexable WHERE predicates that currently full-scan but become range/index seeks once C-04 lands. C-04's payoff is larger than its standalone description suggests. Cross-references are recorded in C-04's "Cross-refs (compounding payoff)" note.

### Cluster: schema-derived enum pattern
- **M-15 → M-17 → M-18** — M-15 established the `*_VALUES` constant + type export from `lib/db/schema.ts`. M-17 reused it for outreach method/outcome. M-18 reused it for activity event types. Future enum-related work (e.g., source filtering UI, event type filtering) should reuse the same pattern rather than re-creating local copies.

### Cluster: heat-recalc duplication
- **H-17 → recalcHeat dedup ← M-07** — M-07 fixed both copies of recalcHeat (server action and inline in `app/api/outreach/route.ts`) identically with SQL filter + projection. When H-17's consolidation lands, the dedup must preserve M-07's pattern (`gte(date, ninetyDaysAgo)` in WHERE, `{ outcome, date }` projection) — not regress to `select().from(outreachLogs).all()` + JS filter.

### Cluster: activity timeline metadata
- **M-18 ← M-35** — M-18 typed the metadata reads, but M-35 (write/read mismatch — 6 of 8 metadata fields the formatter reads are never written by any writer) is the actual UI bug. Fixing M-35 requires deciding per event-type whether to update the writer or revise the reader's expectation.

### Cluster: monolith decomposition
- **M-12 ← M-34** — M-12's analytics decomposition deliberately preserved the duplicated heat distribution bar (Recharts vs CSS) rather than refactoring it. M-34 tracks that duplication as separate work. Resolving M-34 should consider extracting a shared `<HeatDistributionChart>` component used by both `AnalyticsOverviewTab` and `AnalyticsHeatTab`.

### Cluster: orphaned form / console.error
- **M-08 → L-04** (auto-resolved) — M-08's deletion of `follow-up-form.tsx` closed L-04's caveat about the orphaned `console.error` in that file. Pattern to watch: deferred items that explicitly link to a future item should be re-checked when that future item resolves.

### Cluster: password recovery overhaul
- **C-05 ↔ L-13 ↔ L-14** — C-05 (no brute-force protection on password reset), L-13 (plaintext seed credentials), L-14 (secret questions as recovery mechanism). All three are deferred pending a holistic recovery overhaul. Resolving any one in isolation is incomplete.

### Pattern: resolution-log review trigger
After every 5 resolutions, run a verification sweep on resolved items in the same files/areas as recent work. The 2026-05-02 sweep caught H-21 (marked `[x]` but partial) and L-01 (marked `[x]` with a wrong "now actively used" claim). Drift like this is invisible without periodic re-checks.

---

## 🔴 CRITICAL

- [x] ### C-01: Employee Password Hash Exposure
- **Files**: `app/api/employees/route.ts:6`, `lib/queries.ts:179-190`, `app/(app)/settings/page.tsx:18-21`
- **Category**: Security — Credential Exposure
- **OWASP**: A01:2021 — Broken Access Control
- `db.select().from(employees).all()` returns ALL columns including `passwordHash`, `secretQuestion`, `secretAnswerHash`. Both the API endpoint and the server-rendered settings page serialize these to the client.
- **Fix**: Explicitly select only safe columns: `{ id, name, username, role, active, createdAt }`.
- **Resolved**: API route now destructures to strip `passwordHash` and `secretAnswerHash` via rest spread. `getEmployees()` in `lib/queries.ts` now uses explicit column projection omitting `passwordHash`, `secretQuestion`, `secretAnswerHash`. `SafeEmployeeRow` type exported for consumers. Settings page (`app/(app)/settings/page.tsx`) no longer leaks credentials via RSC payload. All three original sites now covered.

- [x] ### C-02: Hardcoded JWT Secret Fallback
- **File**: `lib/auth.ts:44`
- **Category**: Security — Session Forgery
- **OWASP**: A02:2021 — Cryptographic Failures
- `secret: process.env.NEXTAUTH_SECRET || "iris-dev-secret-change-me"`. If env var is unset in production, JWTs are signed with a known key. Attackers can forge sessions.
- **Fix**: Added startup guard — `if (!process.env.NEXTAUTH_SECRET) throw new Error(...)` before the config object. Removed the `|| "iris-dev-secret-change-me"` fallback. Server now fails fast if the env var is missing instead of silently using a known key.

- [x] ### C-03: Mass Assignment on Client Updates
- **Files**: `lib/actions.ts:86-88`, `app/api/clients/route.ts:82-87`, `app/api/clients/[id]/route.ts:30-35`
- **Category**: Security — Data Integrity
- All three update paths iterate `Object.entries(data)` with no field whitelist. Any field (`id`, `dateAdded`, `heatScore`, `status`, `employeeId`) can be overwritten by the caller.
- **Fix**: Replace dynamic loop with explicit allowlist of updatable fields.
- **Resolved**: Both REST PUT handlers (`app/api/clients/route.ts`, `app/api/clients/[id]/route.ts`) now parse the request body through `clientPatchSchema` (zod). The schema only declares the 12 updatable fields; zod strips unknown keys from `parsed.data`. The DB patch is built by iterating `Object.entries(parsed.data)` instead of raw body — `heatScore`, `status`, `employeeId`, `dateAdded`, etc. are silently absent and cannot be written. Implemented together with H-09 (same schema).

- [x] ### C-04: Zero Database Indexes
- **File**: `lib/db/schema.ts` (entire file)
- **Category**: Performance — Full Table Scans
- 10 tables, zero explicit indexes. All queries on foreign keys, status fields, date columns, and searchable text perform full table scans. Performance will degrade severely as data grows.
- **Fix**: Add indexes for: `clients.employee_id`, `clients.status`, `clients.heat_score`, `clients.email`, `outreach_logs.client_id`, `outreach_logs.follow_up_date`, `outreach_logs.date`, `activity_events.client_id`, `activity_events.created_at`, `promo_matches.client_id`, `promo_matches.promo_id`, `unsubscribe_list.email`.
- **Cross-refs (compounding payoff)**: Several already-resolved perf items added indexable predicates that currently full-scan but become range/index seeks once C-04 lands. Specifically: **M-04** (`getStats` outreach query — `outreach_logs.date >= weekAgo`); **M-07** (`recalcHeat` at both sites — `outreach_logs.client_id` + `outreach_logs.date >= ninetyDaysAgo`). C-04's value is larger than its standalone description suggests.

- [x] ### C-05: Unauthenticated Password Reset — No Brute-Force Protection
- **File**: `app/api/recover/route.ts:1-67`
- **Category**: Security — Authentication Failure
- **OWASP**: A07:2021
- Excluded from auth middleware. No rate limiting. Anyone can: (1) enumerate usernames, (2) retrieve secret questions, (3) brute-force answers at unlimited speed. Seed data has question "What is your favorite watch brand?" / answer "meridian".
- **Fix**: Closed as wontfix. The threat this addresses (remote brute-force of secret answers at unlimited speed) requires network access. This is a single-device, physically controlled kiosk — an attacker must be present at the device. The same rationale closed M-25, M-26, and M-28. Reopen if deployment model changes to expose the recovery endpoint over a network.

- [x] ### C-06: 16 Server Actions Have Zero Auth Checks
- **File**: `lib/actions.ts` — `markFollowUpComplete`, `rescheduleFollowUp`, `deleteSmartList`, `duplicateSmartList`, `renameSmartList`, `clearAllPromos`, `deletePromo`, `createPromo`, `importPromos`, `createTag`, `deleteTag`, `deleteTemplate`, `unbanCustomer`, `addUnsubscribeEmail`, `removeUnsubscribe`, `resubscribeClient`
- **Category**: Security — Missing AuthZ
- These actions never call `getSessionUser()`. If middleware is bypassed or misconfigured, any caller can invoke them.
- **Fix**: Every exported server action must verify authentication.
- **Resolved**: All listed server actions now use `requireAuth()` or `requireManager()` helpers. Note: `removeUnsubscribe` was deleted entirely as part of H-18, so the effective set is 15 actions, all auth-gated.

- [x] ### C-07: Tag `usageCount` Permanently Inaccurate
- **Files**: `lib/actions.ts:213-239`
- **Category**: Silent Data Corruption
- `addTag` (L221) always increments `usageCount`, even when the tag already exists on the client. `removeTag` (L229-239) never decrements it. No code in the entire codebase decrements `usageCount`. Counter is monotonically increasing and permanently wrong after first removal.
- **Fix**: `addTag` now short-circuits with `return` if the tag is already on the client — no redundant increment. `removeTag` now fetches the `clientTags` row and decrements `usageCount` if it exists and is positive. Also added early return in `removeTag` if tag isn't on client. Note: C-07 and C-08 are fixed together since both touch the same `addTag` block.

- [x] ### C-08: `addTag` Missing `else` Branch — New Tags Never Created in `clientTags`
- **File**: `lib/actions.ts:219-221`
- **Category**: Silent Data Corruption
- If a tag name doesn't exist in `clientTags`, the `if (existing)` block is skipped entirely — no new row is created. Tags added directly to clients never appear in the "Available Tags" registry.
- **Fix**: Added `else` branch that inserts a new `clientTags` row with `usageCount: 1`. Fixed together with C-07.

---

## 🟠 HIGH

- [x] ### H-01: Phantom API Route — `/api/clients/merge` Does Not Exist
- **Files**: `components/edit-client-dialog.tsx:120`, `app/(app)/clients/[id]/edit/page.tsx:228`, `app/(app)/clients/new/page.tsx:152`
- **Category**: Runtime Bug
- Three files call `fetch("/api/clients/merge", ...)` but no `app/api/clients/merge/route.ts` exists. All merge/duplicate operations will 404 at runtime.
- **Fix**: Implemented merge via server actions instead of a REST route. `mergeClients()` (manager-gated) handles all FK migrations (outreachLogs, activityEvents, approvalRequests, promoMatches with unique-constraint conflict pre-deletion) then hard-deletes the loser. `patchClientFromFormMerge()` handles the new-client-form duplicate path. Original fetch call sites removed; `MergeClientDialog` and `MergeFromFormDialog` components call the server actions directly. Resolved `3ced678`.

- [x] ### H-02: Notes DELETE Can Delete Any Activity Event
- **File**: `app/api/notes/route.ts:44`
- **Category**: Data Integrity
- Deletes `activityEvents` by ID without verifying `eventType === "note_added"`. Any activity event (purchase, status change, ban) can be deleted, destroying audit trail.
- **Fix**: Added `and` to drizzle-orm imports and tightened the DELETE WHERE to `and(eq(activityEvents.id, noteId), eq(activityEvents.eventType, "note_added"))`. Non-note events are now untouchable via this endpoint.

- [x] ### H-03: Multi-Step Mutations Not in Transactions
- **File**: `lib/actions.ts` — `banClient` (L241-261), `unsubscribeClient` (L263-277), `unbanCustomer` (L357-374), `clearAllPromos` (L324-328), `deletePromo` (L330-334), `createPromo` (L279-292), `importPromos` (L294-322)
- **Category**: Data Integrity
- Multiple writes across different tables with no transaction wrapping. A failure midway leaves data inconsistent (e.g., client marked "banned" but no banned record exists).
- **Fix**: Wrap in `db.transaction()`. All 7 functions wrapped. `unbanClient` moves the `bannedCustomers` lookup inside the transaction callback so the read and deletes are atomic. `matchPromoToClients` helper typed as `Pick<typeof db, "insert">` so it accepts the transaction object without `$client` mismatch.

- [x] ### H-04: No Error Boundaries
- **File**: `app/` directory — zero `error.tsx` files anywhere
- **Category**: UX / Resilience
- A single unhandled error in any server component crashes the entire page with Next.js's default unstyled error screen. No graceful fallback.
- **Fix**: Added `error.tsx` at all four segments: `app/error.tsx` (root, full-page fallback), `app/(app)/error.tsx` (app group — renders inside sidebar layout), `app/(app)/clients/error.tsx` (clients list, shows "Failed to load clients"), `app/(app)/clients/[id]/error.tsx` (client detail, adds "Back to clients" escape hatch alongside Try again). All log to console.error and are "use client" per Next.js requirement.

- [x] ### H-05: N+1 Query — `createPromo` and `importPromos`
- **Files**: `lib/actions.ts:279-292`, `lib/actions.ts:294-322`
- **Category**: Performance
- `createPromo` loads ALL clients then does individual inserts in a loop. `importPromos` is O(rows × clients) — 50 promos × 10K clients = 500K potential inserts.
- **Fix**: `matchPromoToClients` now collects all match rows into an array during the loop and issues a single batch `tx.insert(promoMatches).values(matches).run()` at the end. No-op when there are zero matches (guard prevents empty-values insert).

- [x] ### H-06: `check-duplicates` Loads Entire Clients Table
- **File**: `app/api/clients/check-duplicates/route.ts:34-40`
- **Category**: Performance / OOM Risk
- Falls back to `db.select().from(clients).all()` + JavaScript `.find()` for first-name matching. Returns full client records including all fields.
- **Fix**: Full-table-scan fallback was already gone by the time this fix landed (prior M-19 work replaced it with SQL `lower()` matching). Projection narrowed to 5 columns (`id`, `firstName`, `lastName`, `phone`, `email`) to avoid returning full client rows.

- [x] ### H-07: 10 Server Actions Call `getSessionUser()` But Don't Check for Null
- **File**: `lib/actions.ts` — `createClient`, `updateClient`, `transferClient`, `logOutreach`, `addTag`, `removeTag`, `banClient`, `unsubscribeClient`, `createTemplate`, `createSmartList`
- **Category**: Security — Auth Gap
- These call `getSessionUser()` but proceed with `user?.id ?? null`. Actions succeed with `employeeId: null`, breaking audit trails.
- **Fix**: Add `if (!user) throw new Error("Unauthorized")` after the call.
- **Resolved**: All now use `requireAuth()` or `requireManager()` (e.g., `createTemplate` uses the latter); both throw if user is null.

- [x] ### H-08: No Role-Based Authorization on Destructive Operations
- **File**: `lib/actions.ts` — `clearAllPromos`, `banClient`, `transferClient`, `unbanCustomer`
- **Category**: Security — Missing AuthZ
- Any authenticated associate can clear all promos, ban clients, transfer clients, unban customers. Only employee management checks for manager role.
- **Fix**: Add `if (user.role !== "manager")` guards to privileged operations.
- **Resolved**: All now use `requireManager()` which checks role.

- [x] ### H-09: No Input Validation on Any API Route
- **Files**: All files under `app/api/` — `clients`, `notes`, `tags`, `outreach`, `search`, `employees`, `templates`, `promos/matches`
- **Category**: Security — Injection / Data Integrity
- Zero request body validation. `method`/`outcome` enums accept arbitrary strings. `zod` is a dependency but unused. Phone, email, dates are unvalidated.
- **Fix**: Add zod schemas for every endpoint. Validate before processing.
- **Resolved**: Added zod validation to all routes with request bodies. `lib/validation/client.ts` exports `clientCreateSchema` (POST) and `clientPatchSchema` (PUT) — validates firstName, email format, phone/field lengths, `source` enum against `CLIENT_SOURCE_VALUES`, tags/productsOfInterest arrays. `app/api/clients/route.ts` POST and PUT parse via these schemas (400 with `fieldErrors` on failure). `app/api/clients/[id]/route.ts` PUT uses `clientPatchSchema`. `app/api/notes/route.ts` has inline `notePostSchema` (uuid clientId, 1–2000 char text) and `noteDeleteSchema` (uuid noteId). `app/api/tags/route.ts` has inline `tagBodySchema` (uuid clientId, 1–50 char tag). Routes that only GET or already had validation (outreach, check-duplicates) unchanged.

- [x] ### H-10: API Routes Return Redirect Instead of 401
- **File**: `middleware.ts:1-4`
- **Category**: API Design
- `next-auth/middleware` returns 302 redirect to `/login` for unauthenticated API requests. API consumers get HTML login page instead of JSON 401 response.
- **Fix**: Replaced re-export with a custom `middleware()` using `getToken`. Unauthenticated `/api/*` requests now return `{ error: "Not authenticated" }` with status 401. All other unauthenticated routes still redirect to `/login`. Existing matcher exclusions (`api/auth`, `api/recover`, static assets) unchanged.

- [x] ### H-11: Direct SQLite Access Bypassing ORM
- **File**: `app/api/recover/route.ts:2-3`
- **Category**: Architecture / Data Integrity
- `import Database from "better-sqlite3"` creates a separate DB connection, bypassing Drizzle ORM, WAL mode, and foreign key settings.
- **Fix**: Removed `better-sqlite3` import and two manual `sqlite.close()` try/finally blocks. Rewrote both branches using shared `db` from `@/lib/db` with Drizzle `select`/`update` and ORM column references (`employees.secretQuestion`, `employees.secretAnswerHash`, `employees.passwordHash`). Also replaced `bcrypt.compareSync` with `await bcrypt.compare` for consistency.

- [x] ### H-12: Outreach History "Complete" Button Is a Stub
- **File**: `components/outreach-history-tab.tsx:188-190`
- **Category**: Broken Feature
- `onClick={() => { alert("Mark follow-up complete") }}` — browser alert instead of calling the existing `markFollowUpComplete` server action.
- **Fix**: Imported `markFollowUpComplete` from `lib/actions` and `toast` from `sonner`. Added `useTransition` for pending state — button shows "Saving…" and disables during the call. Success/failure toasts on completion. `revalidatePath` in the action handles the UI refresh.

- [x] ### H-13: Common Tag Click Doesn't Pass Tag Value
- **File**: `app/(app)/clients/new/page.tsx:474-484`
- **Category**: Broken Feature
- Badge `onClick={() => handleAddTag()}` calls without arguments, but `handleAddTag()` reads from `newTag` state which is empty. Badge text is never transferred.
- **Fix**: Change to `onClick={() => { setNewTag(tag); handleAddTag(); }}`.
- **Resolved**: Refactored to use shared `ClientForm` component with `onFieldChange("tags", [...formData.tags, tag])`.

- [x] ### H-14: No Form Validation on Client Create/Edit
- **Files**: `app/(app)/clients/new/page.tsx:109-113`, `app/(app)/clients/[id]/edit/page.tsx:186-190`, `components/edit-client-dialog.tsx:81-113`
- **Category**: Data Integrity
- Only `firstName` is validated as non-empty. Email format, phone format, dates, and all other fields are unvalidated client-side and server-side.
- **Fix**: Add zod validation schema shared across all three forms.
- **Resolved**: Added `validateClientForm(data)` helper to `lib/validation/client.ts`. Checks firstName non-empty and email format regex if present. All three `handleSubmit` functions (`new/page.tsx`, `edit-client-form.tsx`, `edit-client-dialog.tsx`) now call it before the fetch; on error they `toast.error(validationError)` and return. Full server-side validation covered by H-09's zod schemas.

- [x] ### H-15: Unsafe Type Casts Throughout Auth Code
- **Files**: `lib/auth.ts:22, 31-32, 38-39`
- **Category**: Type Safety
- `as unknown as { id: string; ... }` double casts and `(user as { id: string }).id` despite proper module declarations in `next-auth.d.ts`.
- **Fix**: Pre-resolved. `types/next-auth.d.ts` correctly augments `JWT` and `Session.user` with `{ id, role, firstName, lastName }`. Current `lib/auth.ts` uses direct property assignments throughout (`token.id = user.id`, `session.user.id = token.id`) with no type casts. TSC passes clean. Doc-only close.

- [x] ### H-16: Notes Field Type Mismatch
- **File**: `components/notes-tab.tsx:88-94`
- **Category**: Runtime Bug
- `(client.notes as unknown[]).map(...)` treats `notes` as an array, but the schema defines it as `string | null`. Will crash if notes is a plain string.
- **Fix**: Define a proper notes schema as JSON array, or add runtime type guard.
- **Resolved**: Refactored to filter `client.timeline` for `note_added` events instead.

- [x] ### H-17: Duplicated Business Logic — Server Actions vs API Routes
- **Files**: `lib/actions.ts` vs `app/api/tags/route.ts`, `app/api/outreach/route.ts`
- **Category**: Maintainability
- `addTag`/`removeTag`, outreach logging, and heat recalculation are implemented twice — once as server actions, once as API routes — with diverging behavior.
- **Fix**: Deleted `app/api/tags/route.ts` and `app/api/outreach/route.ts` entirely. Refactored `components/tags-tab.tsx` from fetch-based calls to direct `addTag`/`removeTag` server action invocations via `useTransition`. Deleted stale `__tests__/api/tags.test.ts` and `__tests__/api/outreach.test.ts` (both already failing due to post-H-09 zod error format change). Server actions are now the sole implementation path for tag mutations and outreach logging. The auth discrepancy (tags API was manager-only; server action is any-authenticated-user) was resolved in favor of the server action's policy — associates can now tag their own clients as intended. M-07's SQL recalcHeat pattern is preserved in the canonical `recalcHeat` server action.

- [x] ### H-18: `removeUnsubscribe` Unconditionally Re-enables Email List
- **File**: `lib/actions.ts:399`
- **Category**: Silent Logic Bug
- Sets `onEmailList: true` when resubscribing, even if the client was never on the email list. Silently opts people into marketing emails.
- **Fix**: Preserve original `onEmailList` value or set to previous state.
- **Resolved**: `removeUnsubscribe` function removed entirely. `resubscribeClient` now only sets `status: "active"` and removes from unsubscribe list.

- [x] ### H-19: Race Conditions in Tag Operations
- **Files**: `lib/actions.ts:213-239`, `app/api/tags/route.ts:22-23`
- **Category**: Data Integrity
- Read-modify-write pattern on tags array with no locking. Two concurrent add/remove operations can cause lost updates. `usageCount` increment is also non-atomic.
- **Fix**: Wrapped `addTag` and `removeTag` in `lib/actions.ts` in `db.transaction()`. Replaced JS-side `usageCount ± 1` arithmetic with SQL-atomic `sql\`${clientTags.usageCount} + 1\`` and `sql\`MAX(0, ${clientTags.usageCount} - 1)\``. Applied identical fixes to `app/api/tags/route.ts` POST and DELETE. DELETE handler also gained the previously missing `usageCount` decrement (it did not decrement at all before). POST handler gained the missing `else` branch that creates a new `clientTags` row when the tag name is not yet registered.

- [x] ### H-20: `getClientOutreach`/`getClientActivity` — Dead Code
- **File**: `lib/queries.ts:53-59`
- **Category**: Dead Code
- Exported but never imported. `getFullClient` duplicates these queries inline.
- **Fix**: Confirmed zero imports via grep, then deleted both functions. No callers existed outside `lib/queries.ts` itself.

- [x] ### H-21: Client Form Code Still Duplicated in `edit-client-dialog.tsx`
- **Files**: `components/edit-client-dialog.tsx` (~398 lines), `components/client-form.tsx` (shared form)
- **Category**: Overcomplicated / Duplication
- New client and edit client pages now use the shared `ClientForm` component. However, `edit-client-dialog.tsx` still reimplements the entire client form inline instead of reusing `ClientForm`.
- **Fix**: Refactored `edit-client-dialog.tsx` from 398 lines to ~110 lines. Removed all inline form JSX (7 sections, ~250 lines) and all now-unused imports. Dialog owns state (`formData`, `productsOfInterest`, `newTag`, `productInterest`, duplicate-warning state), `handleSubmit`, and handlers; renders `<ClientForm />` with those values. Duplicate warning rendered inside `ClientForm`. `onEditExisting` navigates to the duplicate's page via `window.location.href`.

- [x] ### H-22: Duplicate FullClient Interface
- **File**: `components/client-provider.tsx:11-40, 42-71`
- **Category**: Dead Code / Confusion
- Defined twice identically. 30 lines of pure duplication.
- **Fix**: Delete lines 42-71.
- **Resolved**: Interface now defined only once.

- [x] ### H-23: Missing Ownership Check on Client Update REST Route
- **Files**: `app/api/clients/[id]/route.ts` (PUT handler), `app/api/clients/route.ts` (PUT handler)
- **Category**: Security — Broken Access Control
- **OWASP**: A01:2021
- The PUT handlers update any client by ID with no check that the requesting user owns the client (or is a manager). Any authenticated associate can modify any other associate's client records. Discovered during L-01 investigation: the deleted `updateClient` server action (formerly in `lib/actions.ts`) contained the correct ownership-check pattern that the REST routes never adopted.
- **Fix**: Added ownership guard to both PUT handlers using `session.user.id` and `session.user.role`. Both now fetch the client first, return 404 if not found, and return 403 if the requesting user is not a manager and doesn't own the client (`client.employeeId !== session.user.id`).
- **Cross-ref**: Discovered while resolving L-01 (deletion of dead `updateClient` action). The action's richer behavior was not reachable from any UI, so its existence didn't compensate for the gap.

---

## 🟡 MEDIUM

- [x] ### M-01: `window.location.reload()` Used in 15+ Places
- **Files**: `components/notes-tab.tsx`, `components/tags-tab.tsx`, `app/(app)/settings/settings-content.tsx`, `app/(app)/promos/promos-content.tsx`, `app/(app)/unsubscribed/unsubscribed-content.tsx`, `app/(app)/clients/clients-content.tsx`, `app/(app)/banned/banned-content.tsx`
- **Category**: UX / Architecture
- Full page reload after mutations, losing scroll position and client state. The server actions already call `revalidatePath()`.
- **Fix**: Use `router.refresh()` from `next/navigation` or rely on `revalidatePath()`.
- **Resolved**: Replaced all 18 `window.location.reload()` calls with `router.refresh()` across 7 files. Server actions already call `revalidatePath()` which marks cache stale; `router.refresh()` triggers immediate client-side re-render with fresh server data without full page reload.

- [x] ### M-02: All Clients Loaded Client-Side for Filtering
- **Files**: `app/(app)/clients/clients-content.tsx:58-126`, `app/(app)/smart-lists/smart-lists-content.tsx:336`, `app/(app)/analytics/collections/collections-content.tsx:53-78`
- **Category**: Performance / Scalability
- Entire client dataset serialized to JSON and sent to browser for JS-based filtering/sorting/pagination.
- **Fix**: Implement server-side filtering via URL search params. Add pagination limits.
- **Resolved**: Clients page now loads data server-side via `getClientsWithEmployee()` in a Server Component. Client-side content component receives data as props.

- [x] ### M-03: Unbounded Queries — No LIMIT Clauses
- **Files**: `lib/queries.ts` — `getAllClients` (L5-7), `getClientsWithEmployee` (L13-18), `getClientOutreach` (L21-27), `getPromos` (L92-94), `getBannedCustomers` (L110-131)
- **Category**: Performance
- Multiple queries return entire tables with no LIMIT.
- **Fix**: Add `.limit()` with pagination support.
- **Resolved**: Single-store SQLite CRM with realistic ceiling of ~15K clients — full server-side pagination would degrade UX (instant filter/sort/search on the clients page) for no measurable performance benefit. Applied two targeted fixes instead: (1) `LIST_QUERY_LIMIT = 10000` guardrail on the six unbounded list queries (`getAllClients`, `getClientsWithEmployee`, `getPromos`, `getBannedCustomers`, `getUnsubscribeList`, `getDeletedClients`); (2) explicit column projection on `getAllClients` and `getClientsWithEmployee` dropping `notes`, `deletedAt`, `deletedBy`, `previousStatus` — these are detail-page-only fields that were inflating the RSC payload. Detail-page query `getClient(id)` keeps the full row. New `ClientListRow` type exported and adopted by `smart-lists-content.tsx` and `collections-content.tsx`. **Assumption**: smart-list custom filters cannot reference dropped fields — UI doesn't expose them; revisit if filter builder gains a notes/deleted-state predicate.

- [x] ### M-04: `getStats()` Fires 9 Separate Queries
- **File**: `lib/queries.ts`
- **Category**: Performance / Correctness
- 9 individual `SELECT count(*)` queries. Should be 2-3 aggregated queries.
- **Fix**: Use conditional aggregation: `SUM(CASE WHEN status='active' THEN 1 END)`.
- **Resolved**: Consolidated 9 queries → 4. Clients table queries (5 → 1) use `SUM(CASE WHEN ... THEN 1 ELSE 0 END)` for atomic snapshot (hot+warm+cold always equals active). Outreach queries (2 → 1) keep the `date >= weekAgo` predicate in WHERE (preserves indexable range scan once C-04 lands) and use `count(*)` + a single `SUM(CASE)` for the purchased subset. Banned/unsubscribed remain as 2 separate counts (different tables). Removed unused `ne` import.

- [x] ### M-05: Memory Leak — Window-Scoped Timeouts Not Cleaned Up
- **Files**: `app/(app)/clients/new/page.tsx`, `app/(app)/clients/[id]/edit/page.tsx`
- **Category**: Memory Leak
- Duplicate check timeouts stored on `window` object via `window as unknown as Record<string, ...>`. Not cleared on unmount. Shared across instances.
- **Fix**: Use `useRef<ReturnType<typeof setTimeout>>()` with cleanup in `useEffect`.
- **Resolved**: Both files now use `useRef` for the debounce timeout with `useEffect` cleanup on unmount. `new/page.tsx` was partially fixed in L-16 (ref but no cleanup); this adds the missing cleanup. `edit/page.tsx` fully migrated from `window` cast to `useRef` + cleanup.

- [x] ### M-06: Missing AbortController on Client-Side Fetches
- **Files**: `app/(app)/clients/[id]/edit/page.tsx`, `app/(app)/clients/new/page.tsx`
- **Category**: Memory Leak / Stale State / UX Bug
- `useEffect` fetches data with no AbortController. If component unmounts before completion, `setState` fires on unmounted component. Also causes spurious error toasts on navigation ("Failed to fetch client data" on unrelated pages).
- **Fix**: Add AbortController, pass signal to fetch, return cleanup. Guard catch blocks with `AbortError` check.
- **Resolved**: edit/page.tsx mount effect now creates AbortController for fetchClient/fetchEmployees. Both files' checkForDuplicates uses abortRef (aborted on unmount alongside the debounce timeout). All catch blocks check `error.name === "AbortError"` before toasting.

- [x] ### M-07: `recalcHeat` Loads All Outreach Logs
- **Files**: `lib/actions.ts`, `app/api/outreach/route.ts`
- **Category**: Performance
- Fetches ALL outreach logs for a client then filters by date in JavaScript instead of SQL.
- **Fix**: Add date WHERE clause: `gte(outreachLogs.date, ninetyDaysAgo)`.
- **Resolved**: Both sites now filter in SQL with `WHERE date >= ninetyDaysAgo` and project only `{ outcome, date }` instead of full rows. JS `.filter()` eliminated. Per-compounds with C-04 (index on clientId + date) once landed. Related to H-17 (these two recalc paths are duplicated business logic — both copies now correct, but duplication remains).

- [x] ### M-08: `FollowUpForm` Duplicates `OutreachLogger`
- **Files**: `components/follow-up-form.tsx` (351 lines) vs `components/outreach-logger.tsx` (135 lines)
- **Category**: Duplication
- Near-complete rewrite with the same fields but different data fetching patterns (raw API + `window.location.reload()` vs server actions). Adds date picker + templates that OutreachLogger lacks.
- **Fix**: Merge into single enhanced component.
- **Resolved**: Audit's "merge" premise was stale — `OutreachLogger` already had DatePicker + templates. The one feature delta (`quickFollowUpPresets` — Tomorrow / 3 days / 1 week / 2 weeks / 1 month quick-jump buttons) was ported into `OutreachLogger`. `follow-up-form.tsx` deleted as dead code (zero imports, zero test references). Also closes L-04's deferred caveat about `console.error` in orphaned `follow-up-form.tsx`.

- [x] ### M-09: `getMethodIcon` Duplicated in 4 Files
- **Files**: `components/outreach-history-tab.tsx`, `app/(app)/follow-ups/follow-ups-content.tsx`, `app/(app)/analytics/analytics-content.tsx`
- **Category**: Duplication
- Same switch statement copy-pasted 4 times.
- **Fix**: Extract to `lib/outreach-helpers.tsx`.
- **Resolved**: Two sites (follow-ups-content, analytics-content) had already been migrated to import from `lib/outreach-helpers.tsx`. `follow-up-form.tsx` was deleted in M-08. Final site `outreach-history-tab.tsx` now imports from shared module; local copy and dead lucide imports (Mail, MessageCircle, User) removed.

- [x] ### M-10: `getHeatBadge` Duplicated in 3 Files
- **Files**: `app/(app)/follow-ups/follow-ups-content.tsx:98-105`, `app/(app)/smart-lists/smart-lists-content.tsx:80-87`, `app/(app)/analytics/collections/collections-content.tsx:44-51`
- **Category**: Duplication
- Duplicated despite `<HeatBadge>` component already existing at `components/heat-badge.tsx`.
- **Fix**: Use existing `<HeatBadge>` component.
- **Resolved**: No longer duplicated. Sites now use shared `HeatBadge` component or inline badge.

- [x] ### M-11: `SettingsContent` — 1058-Line Monolith
- **File**: `app/(app)/settings/settings-content.tsx`
- **Category**: Overcomplicated
- 12 useState hooks, 8 handler functions, 3 confirmation dialogs in a single component. Has grown from 744 lines since original audit.
- **Fix**: Split into `EmployeesTab`, `TagsTab`, `TemplatesTab` components.
- **Resolved**: Split into 5 tab components co-located in `app/(app)/settings/`: `ProfileTab` (115L), `EmployeesTab` (412L), `SettingsTagsTab` (199L, renamed from `TagsTab` to avoid collision with the existing `components/tags-tab.tsx` used on client detail pages), `TemplatesTab` (209L), `DeletedTab` (147L). Shell `settings-content.tsx` is now 96 lines and contains only tab routing + manager gating.

- [x] ### M-12: `AnalyticsContent` — 822-Line Monolith
- **File**: `app/(app)/analytics/analytics-content.tsx`
- **Category**: Overcomplicated
- 3 tabs with substantial logic, duplicated heat distribution bar.
- **Fix**: Split into `OverviewTab`, `OutreachTab`, `HeatTab` components.
- **Resolved**: Split into 3 namespace-prefixed tab components co-located in `app/(app)/analytics/`: `AnalyticsOverviewTab` (324L, owns `heatChartConfig`), `AnalyticsOutreachTab` (269L, owns `methodChartConfig` + `METHOD_COLORS`), `AnalyticsHeatTab` (163L, no chart config — uses CSS divs). Shell `analytics-content.tsx` is now 172 lines and contains date state, derived `useMemo`s, the date-picker header, and tab routing. `outreachPage` kept in shell to preserve persistence across tab switches. `Analytics`-prefix on tab names avoids collision risk with future client-detail or report tabs. The duplicated heat distribution bar between Overview and Heat tabs was deliberately not refactored here — tracked separately as M-34.

- [x] ### M-13: Magic Numbers in Business Logic
- **Files**: `lib/heat-score.ts:9,11-12,23-24,28`, `lib/utils.ts:53,56,58`, `lib/queries.ts:31,76`
- **Category**: Maintainability
- `86400000` (day in ms), `90`, `30`, `60`, score values `15`, `10`, `5`, `3`, `-15`, `-20`, thresholds `90`, `180`, `70`, `40` — all unnamed.
- **Fix**: Extract to named constants: `const DAY_MS = 86_400_000`, `const HEAT_THRESHOLD_HOT = 70`, etc.
- **Resolved**: `MS_PER_DAY = 86_400_000` extracted to new `lib/constants.ts` (only truly cross-cutting constant). 9 heat-score constants co-located at top of `lib/heat-score.ts` — `SCORE_HAS_PURCHASE`, `SCORE_RECENT_PURCHASE`, `SCORE_RESPONDED_OUTREACH`, `SCORE_ON_EMAIL_LIST`, `SCORE_HAS_INTERESTS`, `SCORE_HAS_BIRTHDAY`, `PENALTY_STALE_OUTREACH`, `PENALTY_VERY_STALE_OUTREACH`, `PENALTY_UNSUBSCRIBED`, plus `RECENT_PURCHASE_WINDOW_DAYS`, `OUTREACH_STALE_DAYS`, `OUTREACH_VERY_STALE_DAYS`, `HEAT_THRESHOLD_HOT`, `HEAT_THRESHOLD_WARM`. 3 smart-list filter thresholds (`STALE_THRESHOLD_DAYS`, `RECENT_PURCHASE_DAYS`, `NO_OUTREACH_DAYS`) co-located near `applyClientFilter` in `lib/utils.ts`. `daysAgo` in utils.ts also normalized to use `MS_PER_DAY` (was `1000 * 60 * 60 * 24`). Query/action sites kept the cardinal visible: `7 * MS_PER_DAY`, `90 * MS_PER_DAY`. Zero raw `86_400_000` literals remain. Heat-score tests still pass (22/22). Function-default literals like `getRecentActivity(limit = 30)` left inline — those are parameter defaults, not magic.

- [x] ### M-14: Hardcoded Demo Credentials in Login Page
- **File**: `app/login/page.tsx:134-137`
- **Category**: Security
- Displays `Marcus / meridian` (manager) and `Jordan / meridian` (associate) on the login page.
- **Fix**: Gate behind `process.env.NODE_ENV === "development"`.
- **Resolved**: Demo credentials block (and its preceding `<Separator />`) wrapped in `{process.env.NODE_ENV === "development" && (...)}`. Next.js replaces `process.env.NODE_ENV` at build time with a literal, so the entire block is dead-stripped from the production bundle — not just hidden at runtime. **Scope:** This closes the production information-disclosure path only. The underlying weakness — seed accounts exist with password "meridian" — remains tracked under L-13 (plaintext seed credentials) and M-28 (weak password policy). Production deployments must not run the seed script with default passwords.

- [x] ### M-15: Hardcoded Common Tags and Client Sources in Multiple Files
- **Files**: `components/client-form.tsx` (`COMMON_TAGS` array), `components/tags-tab.tsx` (`commonTags` array)
- **Category**: Maintainability
- Same tag list hardcoded in two places. `CLIENT_SOURCES` constant also defined in `client-form.tsx`. Must be manually synced.
- **Fix**: Fetch from `clientTags` table or define in a shared constants file.
- **Resolved**: Two separate fixes per architectural concern. (1) `CLIENT_SOURCES` was duplicated across 6 sites including the Drizzle enum at `lib/db/schema.ts:30` (the actual load-bearing definition). Extracted as `CLIENT_SOURCE_VALUES` (readonly tuple) and `ClientSource` (union type) from `schema.ts`; the schema enum now references the same array; downstream call sites in `client-form.tsx` (2 dropdowns), `smart-lists-content.tsx` (4 hardcoded `SelectItem`s → loop), `[id]/edit/page.tsx` and `client-provider.tsx` (TS unions) all import from schema. Single source of truth — DB enum and UI cannot drift. (2) `COMMON_TAGS` (16-item full catalog) and `SUGGESTED_TAGS` (5-item curated quick-suggestion subset) extracted to `lib/constants.ts` as **separate** named exports — they serve different UX purposes (catalog vs chips, latter free of model-name jargon) so they intentionally remain distinct, not derived from each other. Test fixtures and scalar default fallbacks (`"Walk-in"`) left as inline literals — narrowed to `ClientSource` by TS automatically.
- **UX note**: Source dropdown order in `smart-lists-content.tsx` changed from (Walk-in, Client Log, Customer Report, Referral) to schema declaration order (Client Log, Customer Report, Walk-in, Referral). Trivial visual shift; flag if user-facing impact is unwanted.

- [x] ### M-16: `searchClients` Doesn't Escape LIKE Wildcards
- **File**: `lib/queries.ts:206-217`
- **Category**: Security / Information Disclosure
- Constructs `%${query.toLowerCase()}%` without escaping `%` and `_`. Searching for `%` matches all records.
- **Fix**: Escape LIKE wildcards before constructing the pattern.
- **Resolved**: Strip `%` and `_` from query before wrapping, early return `[]` when cleaned query is empty (closes `%%` → match-everything path). Strip-not-escape approach avoids needing `ESCAPE '\'` clauses on all 4 LIKE expressions. CRM data doesn't contain literal `%` or `_` in names/emails/phones. Exposed via authenticated API route only.

- [x] ### M-17: Outreach POST Doesn't Validate Enum Values
- **File**: `app/api/outreach/route.ts:11-12`, `lib/actions.ts:126`
- **Category**: Data Integrity
- Accepts arbitrary strings for `method` and `outcome`. SQLite doesn't enforce enum constraints.
- **Fix**: Validate against allowed values with zod.
- **Resolved**: `OUTREACH_METHOD_VALUES` and `OUTREACH_OUTCOME_VALUES` exported from `lib/db/schema.ts` (schema column enums reference same arrays — single source of truth, mirrors M-15 pattern). Shared zod schema at `lib/validation/outreach.ts` validates `clientId` (UUID), `method`/`outcome` (enums), `notes` (max 2000), `purchasedModel` (max 100), `followUpDate` (ISO date), `templateId` (UUID). Both entry points validate: API route returns 400 with ZodError details; server action parses and throws. `OutreachInput` type replaces inline TS union literals. Cross-ref H-09: establishes schema-derived-enum + shared-zod pattern for broader validation sweep.

- [x] ### M-18: Activity Timeline — Unsafe Metadata Type Assertions
- **File**: `components/activity-timeline-tab.tsx:70,91-112,119`
- **Category**: Type Safety
- `(metadata?.method as string)`, `(metadata?.purchasedModel as string)` — metadata is `Record<string, unknown>`, every access is an unsafe cast.
- **Fix**: Define a discriminated union type for metadata based on `eventType`.
- **Resolved**: `ACTIVITY_EVENT_TYPE_VALUES` and `ActivityEventType` exported from `lib/db/schema.ts` (schema column enum references same array). `ActivityEventMetadataMap` in new `lib/activity-event-metadata.ts` declares per-event-type metadata shapes as a `Record<ActivityEventType, ...>` — adding new event types forces declaring their metadata shape. Typed `getMetadata(eventType, metadata)` helper replaces all 8 `as string` casts. No runtime behavior change — same fallback strings preserved. Cross-ref **M-35**: 6 of 8 metadata reads are for fields no writer produces (write/read mismatch).

- [x] ### M-19: `check-duplicates` Missing First-Name-And-Phone Check
- **File**: `app/api/clients/check-duplicates/route.ts:21-23`
- **Category**: Logic Bug
- The `firstName && phone` block is empty (just a comment). Intended combo check was never implemented. Falls through to firstName-only check, producing false positives.
- **Fix**: Implement the combo check or remove the empty block.
- **Resolved**: Implemented as a **first-name + last-name** combo (deliberately chose this over the original comment's "first-name + phone" — phone exact match is already covered by the phone condition, while first+last catches "same person" cases when contact info differs). Added `lastName` to both callers (`new/page.tsx`, `[id]/edit/page.tsx`) with `encodeURIComponent` on all four params (defensive against apostrophes/spaces/special chars in form input). API route now extracts and trims all four params, builds a single `conditions[]` list combining exact phone match, exact email match, and case-insensitive firstName+lastName combo (`lower()` matching, same pattern as `searchClients`). Removed the firstName-only in-memory fallback that previously did `select().from(clients).all()` + JS filter — that path was both an unbounded scan (latent M-03 gap at this endpoint, now closed) and a false-positive vector (any client sharing a first name triggered a warning). Self-match filter remains client-side at the edit page's response handler (`data.duplicate.id !== client?.id`) — unchanged.

- [x] ### M-20: Edit Client Page Fetches Data Client-Side
- **File**: `app/(app)/clients/[id]/edit/page.tsx:80-85`
- **Category**: Architecture
- `"use client"` page fetches client + employees via `fetch()` in `useEffect`. Causes loading flash and no SSR.
- **Fix**: Convert to server component, pass data to client form component.
- **Resolved**: Edit page (`app/(app)/clients/[id]/edit/page.tsx`) is now a server component that fetches client + employees server-side and passes them as props to a new `<EditClientForm>` client component (`edit-client-form.tsx`) which owns all interactivity (form state, duplicate-check, debounce/abort refs, submit). Eliminates the mount-fetch loading flash. REST submit (`PUT /api/clients/[id]`) preserved — no L-01 reversal. Associates do not receive employee data: `getEmployees()` runs only when `session.user.role === "manager"`; otherwise `employees` is `undefined` and `<ClientForm>` hides the dropdown (consistent with M-36's role-aware data scoping). Added `loading.tsx` (Suspense fallback with `<ClientDetailSkeleton>`) and `error.tsx` at the edit segment — partially addresses H-04 for this route only; H-04 remains open for the rest of the app. M-05 (debounce ref + cleanup) and M-06's duplicate-check abort ref are preserved in the new client child; M-06's mount-fetch AbortController is no longer needed (no mount fetch). H-23 (PUT route ownership check) and H-21 (`edit-client-dialog.tsx` inline form) are independent and remain open.

- [x] ### M-21: Duplicate `NotesTabProps` Interface
- **File**: `components/notes-tab.tsx:21-23, 25-27`
- **Category**: Dead Code
- Defined twice identically.
- **Fix**: Delete duplicate.
- **Resolved**: Verified during Batch 1 of remaining-MEDIUM cleanup — `grep "interface NotesTabProps" components/notes-tab.tsx` returns exactly one definition (line ~25). The duplicate cited in the original finding was eliminated by prior unrelated work; audit entry was stale. No code change required in this commit; entry flipped to closed for accuracy.

- [x] ### M-22: `createPromo` and `importPromos` Share Matching Logic
- **File**: `lib/actions.ts` (helper added; current locations: `createPromo` ~219, `importPromos` ~245)
- **Category**: Duplication
- Nested loop checking `productsOfInterest` against model/collection is duplicated verbatim.
- **Fix**: Extract `matchPromoToClients(promoId, modelNumber, collection)` helper.
- **Resolved**: Extracted private helper `matchPromoToClients(promoId, modelNumber, collection, allClients)` in `lib/actions.ts` just above `createPromo`. Both `createPromo` and `importPromos` now call it, eliminating the duplicated nested loop. Helper accepts the pre-fetched clients list to preserve `importPromos`'s O(promos) outer client-fetch (one fetch covers all rows). Model-over-collection precedence (the `else if`) preserved exactly. No behavior change.

- [x] ### M-23: `bcrypt.hashSync` Blocks Event Loop
- **Files**: `lib/actions.ts` (4 callsites: `createEmployee`, `resetEmployeePassword`, `changeOwnPassword`, `setSecretQuestion`), `app/api/recover/route.ts` (1 callsite)
- **Category**: Performance
- Synchronous bcrypt hashing (CPU-intensive, ~100ms) blocks the Node.js event loop during password operations.
- **Fix**: Use async `bcrypt.hash()`.
- **Resolved**: Replaced all 5 production `bcrypt.hashSync(pw, 10)` calls with `await bcrypt.hash(pw, 10)`. All call sites were inside `async` functions (`createEmployee`, `resetEmployeePassword`, `changeOwnPassword`, `setSecretQuestion`, `POST` recover handler), so no surrounding-function changes needed. Test fixtures (`__tests__/...`) and the `lib/db/seed.ts` script keep `hashSync` — they're synchronous setup paths where the event-loop concern doesn't apply. Note: `bcrypt.compareSync` at `app/api/recover/route.ts:52` has the same blocking-event-loop characteristic but was not flagged in the original M-23 finding; left for a future pass if surfaced.

- [x] ### M-24: `promoMatches` Missing Unique Constraint
- **File**: `lib/db/schema.ts` (current location ~121)
- **Category**: Data Integrity
- No unique constraint on `(clientId, promoId)`. Calling `createPromo` twice with same params creates duplicate matches.
- **Fix**: Add `.unique()` composite constraint or check before insert.
- **Resolved**: Added composite unique constraint `uniqClientPromo` on `(clientId, promoId)` to the `promoMatches` table in `lib/db/schema.ts` via drizzle's third-arg extras callback (`(table) => ({ uniqClientPromo: unique().on(table.clientId, table.promoId) })`). `unique` added to the `drizzle-orm/sqlite-core` import. Schema is source of truth; `npm run db:push` will apply it on next deploy. **Scope note**: this catches double-insert of the same `(clientId, promoId)` within one `promoWatches` row — defense-in-depth against the matcher mis-running. It does **not** prevent duplicate `promoWatches` rows when `createPromo`/`importPromos` is called twice with the same model/collection (those produce different `promoId`s by design); de-duping `promoWatches` itself is a separate concern, not in scope.

- [x] ### M-25: No CSRF Protection on API Routes
- **Files**: All `app/api/` routes
- **Category**: Security
- POST/PUT/DELETE routes accept requests without CSRF token validation.
- **Fix**: Require `Content-Type: application/json` + validate `Origin` header, or use NextAuth CSRF tokens.
- **Resolved (wontfix)**: Closed as not applicable to deployment threat model. CSRF requires an attacker to trick an authenticated user into visiting a malicious site that submits cross-origin requests to the application. The CRM runs as a single-device kiosk used by one user at a time and is not exposed to general web browsing in another tab targeting localhost. With no realistic CSRF vector, the cost of token plumbing across every API route exceeds the risk reduction. Reopen if the deployment model changes (multi-tenant, public network exposure, browser tabs visiting external sites alongside the CRM).

- [x] ### M-26: No Rate Limiting on Any Endpoint
- **Files**: Application-wide
- **Category**: Security
- Zero rate limiting on login, recovery, API routes, or server actions.
- **Fix**: Implement rate limiting with `rate-limiter-flexible` or similar.
- **Resolved (wontfix)**: Closed as not applicable to deployment threat model. Rate limiting protects against remote brute-force, credential-stuffing, and resource-exhaustion attacks. The CRM runs as a single-device kiosk; there is no remote attacker, no credential-stuffing surface, and no concurrent-user contention to throttle. Reopen if the deployment ever serves remote clients or runs on a public network.

- [x] ### M-27: Missing Security Headers
- **File**: `next.config.mjs`
- **Category**: Security
- No `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy` headers configured.
- **Fix**: Add security headers in `next.config.mjs` headers function.
- **Resolved**: Added a `headers()` function in `next.config.mjs` returning four headers on all routes (`/:path*`): `X-Frame-Options: DENY` (prevents clickjacking via iframe embedding), `X-Content-Type-Options: nosniff` (blocks MIME sniffing), `Referrer-Policy: strict-origin-when-cross-origin` (limits referrer leakage), and `Permissions-Policy: camera=(), microphone=(), geolocation=()` (disables unused browser APIs). CSP intentionally omitted — Next.js dev/HMR requires permissive script-src directives that would dilute the policy's value, and the kiosk threat model does not load third-party scripts; can be added later as a separate finding if needed.

- [x] ### M-28: Weak Password Policy
- **Files**: `lib/actions.ts` (`createEmployee`, `resetEmployeePassword`, `changeOwnPassword`), `app/api/recover/route.ts`
- **Category**: Security
- Minimum 6 characters, no complexity requirements. Seed data uses "meridian" for all accounts.
- **Fix**: Increase minimum to 12 chars. Require uppercase, lowercase, digit, special char.
- **Resolved (wontfix)**: Closed as not applicable to deployment threat model. The CRM runs as a single-device kiosk used by one user at a time; the password is a local lock, not exposed to remote brute-force, credential-stuffing, or password-spraying attacks. Strengthening the policy adds friction (typing on a shared device, password reset support burden) without reducing meaningful risk. Min-6 retained as-is. If the deployment model ever changes (multi-tenant, public network exposure, multiple concurrent users), reopen this finding.

- [x] ### M-29: Two Near-Identical Confirm Dialog Components
- **Files**: `components/confirm-dialog.tsx` (57 lines), `components/confirm-action-dialog.tsx` (48 lines, deleted)
- **Category**: Duplication
- Both wrap `AlertDialog` with identical structure, styling, and destructive variant handling. Only difference is who manages the `open` state (controlled vs self-managed).
- **Fix**: Merge into a single component with optional `open`/`onOpenChange` prop pattern (uncontrolled when no `open` prop passed).
- **Resolved**: Extended `ConfirmDialog` with a discriminated-union prop type — controlled (`{open, onOpenChange}`) or uncontrolled (`{children}` trigger, internal `useState`). When `children` is present the component manages open state and auto-closes after `onConfirm`. `ConfirmActionDialog` deleted; the 3 callsites in `components/client-detail-tabs.tsx` swapped to `<ConfirmDialog>` (same JSX shape — children passed as trigger). `onConfirm: () => void` retained from the original ConfirmDialog signature so existing callers passing `() => Promise<void>` or `cond ? doThing() : null` keep type-checking. All 24 existing `ConfirmDialog` tests still pass.

- [x] ### M-30: Password Show/Hide Toggle Copy-Pasted 5 Times
- **Files**: `app/login/page.tsx` (2 → uses `<PasswordInput>`), `app/(app)/change-password/page.tsx` (3 → uses `<PasswordInput>`)
- **Category**: Duplication
- The password visibility toggle with `Eye`/`EyeOff` icon, border wrapper div, and `showPassword` state is copy-pasted across 5 instances.
- **Fix**: Extract a `PasswordInput` component that wraps `Input` with the toggle button built in.
- **Resolved**: Created `components/password-input.tsx` — extends `Input` props (omits `type`), owns its own `show` state, renders the wrapper div + `Input` + Eye/EyeOff toggle button. Optional `wrapperClassName` for callers that need conditional border colors (used by the confirm-password field in change-password to indicate match/mismatch via `border-destructive`/`border-green-500`; `tailwind-merge` via `cn` ensures the override beats the default `border-input`). All 5 callsites swapped; `Eye`/`EyeOff` imports and `showPassword`/`showCurrentPw`/`showNewPw`/`showConfirmPw`/`showNewPassword` state removed from the host pages.

- [x] ### M-31: Topbar Search Button Fakes Keyboard Event
- **Files**: `components/topbar.tsx`, `components/command-palette.tsx`, `app/(app)/layout.tsx`
- **Category**: Code Smell / Architecture
- Search button creates a `new KeyboardEvent("keydown", { key: "k", ctrlKey: true })` and dispatches it via `document.dispatchEvent` to open the command palette. This is a hacky coupling approach.
- **Fix**: Export a `useCommandPalette` hook or shared state to control command palette open state directly.
- **Resolved**: Added `CommandPaletteProvider` + `useCommandPalette()` hook in `components/command-palette.tsx`. Layout (`app/(app)/layout.tsx`) wraps the app with the provider; `<CommandPalette>` reads `open`/`setOpen` from context (with a local-state fallback so standalone test renders still work). `Topbar`'s search button now calls `setOpen(true)` directly — no more synthetic keyboard-event dispatch. The Cmd/Ctrl+K keybinding still works (listener inside `<CommandPalette>` toggles via the same context).

- [x] ### M-32: Misleading Tab Icons in Client Detail Tabs
- **File**: `components/client-detail-tabs.tsx:90-113`
- **Category**: UX / Confusion
- Tab trigger icons don't match the tab's purpose: Notes tab uses `MapPin` icon, Tags tab uses `Mail` icon, Timeline tab uses `Briefcase`. These are misleading for users.
- **Fix**: Use semantically appropriate icons: `StickyNote` for Notes, `Tag` for Tags, `Activity` for Timeline.
- **Resolved**: `components/client-detail-tabs.tsx` now uses semantically appropriate icons: `Activity` for Timeline, `StickyNote` for Notes, `Tag` for Tags. `MapPin` and `Briefcase` were unused after the swap and removed from the lucide-react import. `Mail` retained for the email-list dropdown items.

- [x] ### M-33: `ClientProvider` Combines Unrelated Concerns
- **File**: `components/client-provider.tsx`, `components/client-detail-tabs.tsx`
- **Category**: Pattern Inconsistency
- The provider combines client data context with tab navigation state (`activeTab`/`setActiveTab`). Tab state is a UI concern; client data is domain data.
- **Fix**: Split into `ClientProvider` (data) and keep tab state local to `ClientDetailTabs`.
- **Resolved**: `client-provider.tsx` is now a pure data provider — `ActiveTabContext`, `useActiveTab`, and the internal `useState("profile")` are all removed. Tab state moved to a local `useState("profile")` inside `ClientDetailTabs`. The `useActiveTab`-related tests in `__tests__/components/client-provider.test.tsx` were removed (the hook no longer exists); the 4 remaining client-data tests pass.

- [x] ### M-34: Heat Distribution Bar Duplicated in Analytics
- **Files**: `app/(app)/analytics/analytics-overview-tab.tsx`, `app/(app)/analytics/analytics-heat-tab.tsx`, new `components/heat-distribution-chart.tsx`
- **Category**: Duplication
- Overview tab renders a Recharts `BarChart` for hot/warm/cold distribution; Heat tab renders the same data as a CSS stacked bar + progress bars. Two visual representations of the same metric in the same page.
- **Fix**: Extract a shared `HeatDistributionChart` component and use it in both tabs, or remove one if only one visualization is desired.
- **Resolved**: Extracted `<HeatDistributionChart hot warm cold active />` to `components/heat-distribution-chart.tsx` — wraps the Overview tab's Recharts horizontal `BarChart` (the user-preferred visualization). Both tabs now render this single component: the Overview tab's inline chart was replaced; the Heat tab's stacked CSS bar was replaced. The Heat tab's per-category Progress bars and legend (a different breakdown view) are kept untouched. Recharts/chartConfig imports removed from the Overview tab.

- [x] ### M-35: Activity Timeline Reads Metadata Fields That Are Never Written
- **Files**: `components/activity-timeline-tab.tsx:62-118` (reader), `lib/actions.ts` (writers), `app/api/clients/route.ts`, `app/api/clients/[id]/route.ts`, `app/api/tags/route.ts`
- **Category**: Silent UI Bug
- 6 of 8 `formatEventDescription` switch cases read metadata fields that no writer in the codebase actually produces (`purchasedModel`, `tagName`, `newEmployeeName`, `notePreview`, `sourceClientId`, `fieldChanges`). UI silently falls back to default placeholder strings ("Product", "Tag", "another associate", etc.) for these event types. Discovered during M-18 verification.
- **Fix**: Audit each writer/reader pair. Either (a) populate the missing metadata keys at write time (e.g., `purchase` event should record `purchasedModel`; `transferred` should record new employee name), or (b) revise the formatter to read what's actually written.
- **Resolved**: Investigated all 8 writer/reader pairs. `note_added` was already correctly written (audit overstated count). `transferred` and `merged` have no feature implementation at all — being built out in Phase B/C. Fixed the 4 real metadata gaps: `purchase` writer now includes `purchasedModel`; both `edited` writers (`app/api/clients/route.ts` PUT and `app/api/clients/[id]/route.ts` PUT) now include `fieldChanges`; both `tag_added` writers now include `tagName`; both `tag_removed` writers now include `tagName`. Fixed `outreach_logged` reader to fall through to `event.description` when both `method` and `outcome` are absent (guards against old events written before M-35).

- [x] ### M-36: Settings Page Over-Fetches Employees for Associates
- **Files**: `app/(app)/settings/page.tsx:18`, `lib/queries.ts` (added `getEmployee(id)` helper)
- **Category**: Security — Information Disclosure
- **OWASP**: A01:2021 — Broken Access Control
- Settings page server component calls `await getEmployees()` unconditionally and passes the full list to `<SettingsContent>` as a prop. For associate users, every other employee's name/username/role/active-flag ships to the browser via the RSC payload, even though the `EmployeesTab` is gated to managers only. Not a credential leak (C-01 closed that), but unnecessary cross-employee data exposure. Discovered as cross-impact during M-20 planning, after C-01's full resolution.
- **Fix**: Branch the server fetch on user role — managers get the full list, associates get only their own record.
- **Resolved**: Added `getEmployee(id)` helper in `lib/queries.ts` using the same `SafeEmployeeRow` projection as `getEmployees()`. Settings page now checks `session.user.role`: managers fetch via `getEmployees()` (unchanged); associates fetch only their own record via `[await getEmployee(userId)]`. `<SettingsContent>` prop signature unchanged. `<ProfileTab>`'s `find(e => e.id === currentUserId)` works for both array shapes. `<EmployeesTab>` remains gated to managers, so the truncated array is never rendered for associates. Closes the cross-employee info-disclosure path that survived C-01's credential-exposure fix.

---

## 🔵 LOW

- [x] ### L-01: 3 Dead Server Actions
- **File**: `lib/actions.ts` — `createClient` (deleted), `updateClient` (deleted), `transferClient` (deleted then re-implemented)
- **Category**: Dead Code
- `createClient` and `updateClient` are superseded by REST API routes. `transferClient` is never called anywhere.
- **Fix**: Delete unused actions, or convert call sites to use the actions instead of REST.
- **Resolved**: All three actions deleted from `lib/actions.ts`; corresponding `describe` blocks and import references removed from `__tests__/actions/client-actions.test.ts`. Test coverage for the live actions (`banClient`, `unsubscribeClient`, `resubscribeClient`) preserved. Chose deletion over wire-up because all three production UI call sites already use the REST endpoints with their own duplicate-check flows; converting them to server actions would be high-effort with no user-visible improvement, and H-17 (the broader server-action-vs-REST consolidation) is better addressed holistically in a separate pass. **Important:** the deleted `updateClient` action contained an ownership-check pattern that the equivalent REST route lacks — filed as new finding **H-23** so the security gap remains tracked. **Cross-ref:** `transferClient` was subsequently re-implemented from scratch as part of M-35 Phase B (`be127c1`) with full `requireManager()` auth, proper metadata writes, and a `TransferClientDialog` UI — it now exists again in `lib/actions.ts` but is no longer dead code.

- [x] ### L-02: Unused `formatDateTime` Export
- **File**: `lib/utils.ts:21`
- Only used in `__tests__/unit/utils.test.ts`. Zero production imports.
- **Fix**: Remove or mark test-only.
- **Resolved**: Deleted `formatDateTime` function and its test suite (2026-04-30).

- [x] ### L-03: `runMigrations()` Orphaned — No npm Script
- **File**: `lib/db/migrate.ts:9`
- Exported but only invoked by `seed.ts`. No `db:migrate` npm script exists. `db:push` uses drizzle-kit (different path).
- **Fix**: Add `db:migrate` script to `package.json` or document that `db:push` is the migration path.
- **Resolved**: Deleted `migrate.ts`. `seed.ts` now imports `sqlite` from `lib/db/index.ts` and relies on `db:push` for schema sync (2026-04-30).

- [x] ### L-04: `console.error` in Catch Blocks (4 instances)
- **Files**: `components/follow-up-form.tsx:61`, `app/(app)/clients/[id]/edit/page.tsx:123,144`, `app/(app)/clients/new/page.tsx:73`
- **Category**: Error Handling
- Errors swallowed to console instead of shown to user.
- **Fix**: Show toast or error state to user.
- **Resolved**: Replaced with `toast.error()` in both client form pages (2026-04-30). Remaining instance in orphaned `follow-up-form.tsx` will be resolved with M-08.

- [x] ### L-05: `console.log` in Seed Script (4 instances)
- **File**: `lib/db/seed.ts:249-252`
- **Category**: Debug Leftover
- Acceptable for a CLI seed script.
- **Fix**: Low priority — leave or use a logger.
- **Resolved**: Won't fix — `console.log` is appropriate for CLI seed script output (2026-04-30).

- [x] ### L-06: `onKeyPress` Deprecated
- **Files**: `components/client-form.tsx` (2 occurrences), `components/tags-tab.tsx` (1 occurrence)
- **Category**: Deprecated API
- React recommends `onKeyDown` instead.
- **Fix**: Replace `onKeyPress` with `onKeyDown`.
- **Resolved**: Replaced all 3 instances with `onKeyDown` (2026-04-30).

- [x] ### L-07: Index-Based Keys on Dynamic Lists
- **Files**: `components/interests-tab.tsx`, `components/tags-tab.tsx`, `components/edit-client-dialog.tsx`, `components/client-sidebar.tsx`, `components/client-form.tsx`
- **Category**: React Anti-Pattern
- `key={index}` on reorderable lists causes reconciliation issues. Tags and product names are stable strings — use them as keys.
- **Fix**: `key={tag}` or `key={product}` instead of `key={index}`.
- **Resolved**: Replaced all 12 instances of `key={index}` with stable string keys (`key={tag}`, `key={product}`, `key={collection}`, `key={model}`, `key={match.id}`) across 5 components (2026-04-30).

- [x] ### L-08: `Merge` Component Defined After Use
- **File**: `components/activity-timeline-tab.tsx:40, 242-248`
- **Category**: Code Organization
- `getEventTypeIcon` references `<Merge>` defined at bottom of file. Works via hoisting but confuses readers.
- **Fix**: Move definition to top or import from lucide-react.
- **Resolved**: Replaced custom SVG `Merge` component with `Merge` import from `lucide-react` (2026-04-30).

- [x] ### L-09: `loading-skeleton.tsx` May Duplicate `skeletons.tsx`
- **Files**: `components/loading-skeleton.tsx` (19 lines), `components/skeletons.tsx` (329 lines)
- **Category**: Duplication
- Both provide skeleton UI patterns.
- **Fix**: Verify if `LoadingSkeleton` is used. If not, delete. If yes, consolidate.
- **Resolved**: `loading-skeleton.tsx` has been removed.

- [x] ### L-10: Hardcoded Pagination Sizes
- **Files**: `app/(app)/promos/promos-content.tsx:28`, `components/outreach-history-tab.tsx:12`
- **Category**: Configuration
- `PAGE_SIZE = 15` and `PAGE_SIZE = 10` hardcoded in components.
- **Fix**: Extract to shared constants.
- **Resolved**: Won't fix — values differ intentionally per component (10 for outreach, 15 for promos, 20 for tables). Local constants are clearer than a shared file with multiple named exports (2026-04-30).

- [x] ### L-11: Hardcoded Color Values
- **File**: `app/(app)/analytics/analytics-content.tsx:113`
- **Category**: Maintainability
- `const METHOD_COLORS = ["#3b82f6", "#22c55e", "#a855f7", "#f97316"]` — should be in Tailwind config or CSS variables.
- **Fix**: Move to theme configuration.
- **Resolved**: Won't fix — Recharts requires hex strings for `Cell fill` props; CSS variables and Tailwind classes aren't supported. Colors are scoped to a single analytics file (2026-04-30).

- [x] ### L-12: ESLint Disabled During Builds
- **File**: `next.config.mjs:3`
- **Category**: Code Quality
- `eslint: { ignoreDuringBuilds: true }` disables security lint rules in production builds.
- **Fix**: Remove and fix lint errors.
- **Resolved**: Removed `ignoreDuringBuilds` flag from `next.config.mjs`. Fixed 2 remaining lint errors (unused `error` vars in catch blocks prefixed with `_`) (2026-04-30).

- [x] ### L-13: Plaintext Credentials in Seed Script
- **File**: `lib/db/seed.ts`
- **Category**: Security
- Password "meridian" hardcoded for all employee accounts. Risky if repo goes public.
- **Fix**: Use environment variables for seed passwords.
- **Note**: Deferred — seed script is dev-only infrastructure. May revisit if repo goes public.
- **Resolved (wontfix)**: Closed as not applicable to deployment threat model. Same rationale as M-28 — single-device kiosk deployment; the seed script populates the local kiosk database with initial accounts, not a multi-tenant or public service. The hardcoded "meridian" default is a known starter password documented for the operator and intended to be changed via the change-password flow on first use. Reopen if the repo goes public, the seed targets shared infrastructure, or the deployment model otherwise changes.

- [x] ### L-14: Secret Questions as Recovery Mechanism
- **Files**: `lib/actions.ts:487-499`, `app/api/recover/route.ts`
- **Category**: Security
- NIST SP 800-63B explicitly discourages secret questions. Small answer spaces are easily guessable.
- **Fix**: Closed as wontfix. NIST SP 800-63B §5.1.1.2 prohibits KBA as an authentication factor primarily to prevent remote enumeration and brute-force at scale — the same threat C-05 covers, which is not in scope for a physically controlled kiosk. Email-based OTP (the NIST-recommended alternative) requires SMTP infrastructure and employee email fields that this deployment does not have. The primary recovery path is the manager-reset flow (`resetEmployeePassword` in `lib/actions.ts`, exposed in Settings → Employees). Secret question is a secondary convenience for when the manager is unavailable. Reopen if deployment model changes or email infrastructure is added.

- [x] ### L-15: `aria-describedby={undefined}` Suppresses Accessibility
- **File**: `components/outreach-logger.tsx:72`
- **Category**: Accessibility
- Setting `aria-describedby` to `undefined` explicitly suppresses the default accessible description for the dialog.
- **Fix**: Remove the prop and provide a proper `DialogDescription`, or set to a meaningful description element ID.
- **Resolved**: Removed `aria-describedby={undefined}`, added `<DialogDescription>` with descriptive text. Only application-level instance; shadcn primitives excluded (2026-04-30).

- [x] ### L-16: `window` Type-Unsafe Cast for Debounce Timeout
- **File**: `app/(app)/clients/new/page.tsx:53-54`
- **Category**: Code Smell
- Uses `(window as unknown as Record<string, ReturnType<typeof setTimeout>>).checkTimeout` for debounce. Fragile and pollutes global scope.
- **Fix**: Use `useRef<ReturnType<typeof setTimeout> | null>()` for the timeout reference instead.
- **Resolved**: Replaced with `useRef<ReturnType<typeof setTimeout> | null>(null)` (2026-04-30).

- [x] ### L-17: Unused `currentUserRole` Prop in `ClientSidebar`
- **File**: `components/client-sidebar.tsx:11`
- **Category**: Dead Code
- `_props: { currentUserRole?: string }` accepted but never used in the component body.
- **Fix**: Remove the unused prop from the interface and component signature, and remove from call sites.
- **Resolved**: Removed dead prop from `ClientSidebar`, cleaned up 2 call sites in `client-detail-content.tsx`, removed 3 obsolete tests for Delete Client behavior that was moved to `ClientDetailTabs` (2026-04-30).

---

## Positive Findings

These things are done well and should be maintained:

- ✅ SQL injection prevented — all queries use Drizzle ORM parameterized queries
- ✅ Passwords hashed with bcrypt (cost factor 10)
- ✅ JWT-based sessions with configurable maxAge
- ✅ Foreign keys enabled on SQLite (`PRAGMA foreign_keys = ON`)
- ✅ WAL mode enabled for concurrent read access
- ✅ `.env.local` in `.gitignore`
- ✅ `zod` already a dependency (just needs to be used)
- ✅ Middleware protects most routes
- ✅ No TODO/FIXME/HACK comments found
- ✅ Consistent shadcn/ui component library

---

## Recommended Fix Priority

### Immediate — Before Any Deployment
1. ~~**C-01**: Remove password hashes from employee API/query~~ **DONE**
2. **C-02**: Remove hardcoded JWT secret fallback
3. **C-03**: Add field allowlists to client update paths
4. **C-05**: Add rate limiting to `/api/recover`
5. **H-01**: Create `/api/clients/merge` route or remove calls

### This Sprint
6. **C-04**: Add database indexes
7. ~~**C-06**: Add auth checks to all 16 unprotected server actions~~ **DONE**
8. **C-07/C-08**: Fix tag usageCount corruption
9. **H-09**: Add zod validation to all API routes
10. **H-04**: Add error boundaries

### Next Sprint
11. **H-03**: Wrap multi-step mutations in transactions
12. **H-17**: Consolidate server actions vs API routes
13. **H-21**: Refactor `edit-client-dialog.tsx` to reuse `ClientForm`
14. **M-01**: Replace `window.location.reload()` with proper revalidation
15. **M-11/M-12**: Decompose monolith components (settings 1058 lines, analytics 781 lines)

### Ongoing
16. **M-09/M-22/M-29**: Extract shared utilities to eliminate duplication
17. **M-13/M-15**: Replace magic numbers and hardcoded constants
18. **M-26/M-27/M-28**: Security hardening (rate limiting, headers, password policy)
19. **M-30**: Extract `PasswordInput` component from 5 copy-pasted instances
20. **M-31**: Replace fake keyboard event in topbar with proper state management

---

## Resolution Log

| Date | Issue(s) | Resolution | Commit |
|------|----------|------------|--------|
| 2026-04-30 | C-01 | Employee API route now strips `passwordHash` and `secretAnswerHash` via destructuring rest spread | — |
| 2026-05-03 | C-01 | **Full fix**: `getEmployees()` in `lib/queries.ts` now uses explicit column projection omitting `passwordHash`, `secretQuestion`, `secretAnswerHash`. `SafeEmployeeRow` type exported. Settings page RSC payload leak closed. All 3 original sites now covered. | — |
| 2026-04-30 | C-06 | All 16 server actions now use `requireAuth()` or `requireManager()` | — |
| 2026-04-30 | H-07 | All server actions using `getSessionUser()` now use `requireAuth()` which throws on null | — |
| 2026-04-30 | H-08 | Destructive operations (`clearAllPromos`, `banClient`, `transferClient`, `unbanClient`) now use `requireManager()` | — |
| 2026-04-30 | H-13 | Common tag click refactored to use shared `ClientForm` with `onFieldChange` | — |
| 2026-04-30 | H-16 | Notes tab refactored to filter `client.timeline` for `note_added` events | — |
| 2026-04-30 | H-18 | `removeUnsubscribe` removed; `resubscribeClient` no longer sets `onEmailList` | — |
| 2026-04-30 | H-22 | Duplicate `FullClient` interface removed, now defined once | — |
| 2026-04-30 | H-21 | Partially resolved: new/edit pages use shared `ClientForm`; `edit-client-dialog.tsx` still duplicated | — |
| 2026-04-30 | M-02 | Clients page now loads data server-side via Server Component | — |
| 2026-04-30 | M-10 | `getHeatBadge` duplication resolved | — |
| 2026-04-30 | L-01 | `createClient`, `updateClient`, `transferClient` now actively used | — |
| 2026-04-30 | L-09 | `loading-skeleton.tsx` removed | — |
| 2026-04-30 | M-29–M-33, L-15–L-17 | New findings added from second audit pass | — |
| 2026-04-30 | L-07 | Replaced 12 `key={index}` with stable string keys across 5 components | — |
| 2026-04-30 | L-03 | Deleted orphaned `migrate.ts`; `seed.ts` now uses shared DB connection from `lib/db/index.ts` | — |
| 2026-04-30 | L-05 | Won't fix — `console.log` is appropriate CLI output for seed script | — |
| 2026-04-30 | L-08 | Replaced custom SVG `Merge` with `lucide-react` import in activity-timeline-tab | — |
| 2026-04-30 | L-10 | Won't fix — intentional per-component pagination sizes, local constants are clearer | — |
| 2026-04-30 | L-11 | Won't fix — Recharts requires hex strings for fill, can't use CSS vars or Tailwind classes | — |
| 2026-04-30 | L-12 | Removed `ignoreDuringBuilds` from `next.config.mjs`; fixed 13 `_error`/`_err` catch blocks across 7 files to use `toast.error` with `description` | — |
| 2026-04-30 | L-15 | Removed `aria-describedby={undefined}`, added `DialogDescription` in outreach-logger | — |
| 2026-04-30 | L-16 | Replaced type-unsafe `window` cast with `useRef` for debounce timeout | — |
| 2026-04-30 | L-17 | Removed dead `currentUserRole` prop from `ClientSidebar`, cleaned up call sites and obsolete tests. Also added `DeleteCustomerDialog` with associate approval request flow (matching existing ban/unsubscribe pattern) | — |
| 2026-05-01 | M-03 | Won't-fix on full pagination (single-store SQLite, ~15K ceiling, instant-filter UX preserved). Added `LIST_QUERY_LIMIT=10000` guardrail to 6 list queries and projected `notes`/`deletedAt`/`deletedBy`/`previousStatus` out of `getAllClients`/`getClientsWithEmployee`. New `ClientListRow` type adopted by smart-lists and collections content. | — |
| 2026-05-02 | M-04 | Consolidated `getStats()` from 9 separate count(*) queries to 4 using `SUM(CASE WHEN ...)` conditional aggregation. Atomic per-table snapshots (hot+warm+cold = active guaranteed). Outreach query keeps `date >= weekAgo` in WHERE to preserve indexable range scan once C-04 lands. | — |
| 2026-05-02 | M-05 | Completed L-16's partial fix. Both `new/page.tsx` and `edit/page.tsx` now use `useRef` for debounce timeout with `useEffect` cleanup on unmount. `edit/page.tsx` migrated from `window` cast to `useRef`. | — |
| 2026-05-02 | M-06 | Added AbortController to edit/page.tsx mount effect (fetchClient + fetchEmployees) and checkForDuplicates in both edit and new page. All catch blocks guard against AbortError to prevent spurious toasts on navigation. Unmount cleanup now clears timeout + aborts fetch. | — |
| 2026-05-02 | Audit | Resolution sweep: flipped H-21 (`[x]` → `[ ]`, partial — `edit-client-dialog.tsx` still inlines the form) and L-01 (`[x]` → `[ ]`, the three actions are referenced only from tests, not from production code). Recomputed Tracking Summary totals (51 open / 29 resolved). Clarified H-07 and C-06 resolution wording. | — |
| 2026-05-02 | M-07 | Both `recalcHeat()` in lib/actions.ts and inline recalc in app/api/outreach/route.ts now filter in SQL (`WHERE date >= ninetyDaysAgo`) and project only `{ outcome, date }`. JS `.filter()` eliminated. Related to H-17 (duplicated logic — both copies now correct but duplication remains). | — |
| 2026-05-02 | M-08 | Ported `quickFollowUpPresets` (Tomorrow / 3 days / 1 week / 2 weeks / 1 month quick-jump buttons) into `OutreachLogger`, then deleted dead `components/follow-up-form.tsx` (zero imports, zero test references). Audit's "merge" premise was stale — OutreachLogger already had DatePicker + templates. Closes L-04's deferred caveat about `console.error` in orphaned follow-up-form.tsx. | — |
| 2026-05-02 | M-09 | Final migration of `getMethodIcon`: `outreach-history-tab.tsx` now imports from `lib/outreach-helpers.tsx`. Two other sites had already been migrated; `follow-up-form.tsx` was deleted in M-08. Dead lucide imports (Mail, MessageCircle, User) removed. | — |
| 2026-05-02 | M-11 | Decomposed 1062-line `SettingsContent` monolith into 5 tab components: `ProfileTab`, `EmployeesTab`, `SettingsTagsTab`, `TemplatesTab`, `DeletedTab`. Shell is now 96 lines. | `1cad8f2` |
| 2026-05-02 | M-12 | Decomposed 781-line `AnalyticsContent` monolith into 3 namespace-prefixed tabs: `AnalyticsOverviewTab`, `AnalyticsOutreachTab`, `AnalyticsHeatTab`. Shell is 147 lines. Chart configs co-located. outreachPage kept in shell. Includes external `TagsTab`→`SettingsTagsTab` rename. Added M-34 finding for duplicated heat bar. | `32df57a` |
| 2026-05-02 | M-13 | Extracted all magic numbers to named constants. `MS_PER_DAY` in `lib/constants.ts`; 9 heat-score constants co-located in `lib/heat-score.ts`; 3 filter thresholds co-located in `lib/utils.ts`. All 10 call sites + 2 test files updated. Zero raw `86400000` remaining. | `4ebc5de` |
| 2026-05-02 | M-14 | Demo credentials block + separator gated behind `process.env.NODE_ENV === "development"`. Dead-stripped from production bundle at build time. Underlying seed-account weakness tracked under L-13 and M-28. | `a25fb3e` |
| 2026-05-02 | M-15 | `CLIENT_SOURCE_VALUES` + `ClientSource` type derived from `lib/db/schema.ts` (schema enum references same array). `COMMON_TAGS` (16-item catalog) + `SUGGESTED_TAGS` (5-item curated subset) extracted to `lib/constants.ts`. 4 downstream sites updated. UX note: smart-list source dropdown order changed to schema declaration order. | `ed601e3` |
| 2026-05-02 | M-16 | Strip `%` and `_` from search query before LIKE wrapping; early return `[]` on empty cleaned query (closes `%%` → match-everything path). Strip-not-escape avoids needing `ESCAPE` clauses on 4 LIKE expressions. | — |
| 2026-05-02 | M-11 | Split 1058-line `SettingsContent` monolith into 5 co-located tab components (`ProfileTab`, `EmployeesTab`, `SettingsTagsTab`, `TemplatesTab`, `DeletedTab`). Shell is now 96 lines (tab routing + manager gating only). Settings tab renamed `SettingsTagsTab` to avoid name collision with the client-detail `TagsTab` in `components/tags-tab.tsx`. | — |
| 2026-05-02 | M-12 | Split 781-line `AnalyticsContent` monolith into 3 namespace-prefixed tab components co-located in `app/(app)/analytics/`: `AnalyticsOverviewTab` (324L), `AnalyticsOutreachTab` (269L), `AnalyticsHeatTab` (163L). Shell is now 172 lines (date state, derived `useMemo`s, date-picker header, tab routing). Chart configs co-located in owning tabs; `outreachPage` kept in shell to preserve tab-switch persistence. Duplicated heat distribution bar tracked separately as new finding M-34. | — |
| 2026-05-02 | M-34 | New finding added during M-12 decomposition: hot/warm/cold heat distribution is rendered twice on the analytics page — Overview tab uses Recharts `BarChart`, Heat tab uses CSS stacked bar + progress bars. Two visualizations of the same metric. Deferred for separate fix (extract shared component or remove one). | — |
| 2026-05-02 | M-13 | Extracted all magic numbers from heat-scoring, smart-list filters, and date-window queries. `MS_PER_DAY` lives in new `lib/constants.ts` (single shared constant); 14 heat-score policy constants co-located in `lib/heat-score.ts`; 3 filter thresholds co-located in `lib/utils.ts`. `daysAgo` helper normalized to use `MS_PER_DAY` (was `1000 * 60 * 60 * 24`). Query/action sites kept the cardinal day-count visible (`7 * MS_PER_DAY`, `90 * MS_PER_DAY`). Heat-score tests still pass 22/22. | — |
| 2026-05-02 | M-14 | Demo credentials block on login page gated behind `process.env.NODE_ENV === "development"` (Separator included in the gate). Next.js build-time replacement dead-strips the block from the production bundle. Closes the production info-disclosure path only — seed credential weakness remains tracked under L-13 and M-28. | — |
| 2026-05-02 | M-15 | Eliminated `CLIENT_SOURCES` duplication across 6 sites (Drizzle schema enum + 5 downstream consumers) by exporting `CLIENT_SOURCE_VALUES` and `ClientSource` type from `lib/db/schema.ts` — schema is now the single source of truth. Tag duplication resolved by extracting `COMMON_TAGS` (full 16-item catalog) and `SUGGESTED_TAGS` (curated 5-item subset for chips) to `lib/constants.ts` as intentionally separate exports. UX note: smart-list source dropdown order changed from alphabetical to schema declaration order. | — |
| 2026-05-02 | M-16 | Strip `%` and `_` from `searchClients` query before LIKE wrapping; early return `[]` on empty cleaned query (closes `%%` → match-everything path). Strip-not-escape avoids needing `ESCAPE` clauses on 4 LIKE expressions. Authenticated route only. | — |
| 2026-05-02 | M-17 | Schema-derived enum arrays for outreach `method`/`outcome` (mirrors M-15's `CLIENT_SOURCE_VALUES` pattern). Shared zod schema in `lib/validation/outreach.ts` validates both `app/api/outreach/route.ts` POST and `lib/actions.ts:logOutreach`. Adds UUID/length/date format checks. Establishes validation pattern for H-09's broader sweep. | — |
| 2026-05-02 | M-18 | `ACTIVITY_EVENT_TYPE_VALUES` exported from schema (column enum references same array). `ActivityEventMetadataMap` in `lib/activity-event-metadata.ts` declares per-event-type metadata shapes. Typed `getMetadata()` helper replaces 8 `as string` casts. No runtime behavior change — same fallback strings. Discovered M-35 (write/read mismatch) during verification. | — |
| 2026-05-02 | M-35 | New finding: 6 of 8 `formatEventDescription` metadata reads are for fields no writer produces (`purchasedModel`, `tagName`, `newEmployeeName`, `notePreview`, `sourceClientId`, `fieldChanges`). UI silently falls back to placeholder defaults. Discovered during M-18 verification. | — |
| 2026-05-03 | L-01 | Deleted dead server actions `createClient`, `updateClient`, `transferClient` from `lib/actions.ts` and corresponding test describe blocks. Live action tests (banClient/unsubscribeClient/resubscribeClient) preserved. Chose deletion over wire-up; H-17 consolidation deferred. Surfaced new finding H-23 (missing ownership check on REST update path that the deleted action used to provide). **Note:** `transferClient` was re-implemented in M-35 Phase B (`be127c1`) — it now exists and is actively used; its deletion is no longer the current state. | — |
| 2026-05-03 | H-23 | New finding added during L-01 investigation: PUT `/api/clients/[id]` and PUT `/api/clients` have no ownership check — any authenticated associate can modify any client. The deleted `updateClient` server action contained the correct pattern; preserved in the Fix description so the future fixer has it. | — |
| 2026-05-03 | M-19 | Implemented first-name + last-name combo duplicate check (deliberately chose over the original "first-name + phone" comment — phone exact match was already covered). Both callers now send `lastName` with `encodeURIComponent` on all params. API route trims and uses `lower()` for case-insensitive name matching, all conditions OR'd in a single SQL query. Removed firstName-only in-memory fallback that did unbounded `.all()` scan + JS filter (latent M-03 gap closed at this endpoint, false-positive "any matching first name" warning eliminated). | — |
| 2026-05-03 | M-36 | New finding filed and resolved in same commit. Settings page now branches `getEmployees()` (managers) vs new `getEmployee(userId)` helper (associates) on `session.user.role`. Closes cross-employee info-disclosure that survived C-01's credential-exposure fix. Discovered as cross-impact during M-20 planning. | — |

| 2026-05-03 | M-20 | Edit page converted to server component; client/employees fetched server-side and passed as props to new `<EditClientForm>` child. Eliminates mount-fetch loading flash. Associates: employees prop is `undefined`, dropdown auto-hides (consistent with M-36). REST `PUT` submit preserved (no L-01 reversal). Added `loading.tsx` + `error.tsx` at edit segment (partial H-04 close). M-05 debounce cleanup and M-06 duplicate-check abort preserved. | — |

| 2026-05-03 | M-21 | Verified stale during Batch 1 review — `components/notes-tab.tsx` has exactly one `NotesTabProps` definition; duplicate from original finding was already removed by prior work. Doc-only close. | — |
| 2026-05-03 | M-32 | Swapped misleading tab icons in `components/client-detail-tabs.tsx`: Timeline `Briefcase`→`Activity`, Notes `MapPin`→`StickyNote`, Tags `Mail`→`Tag`. Cleaned up lucide-react imports. | — |
| 2026-05-03 | M-22 | Extracted private `matchPromoToClients(promoId, modelNumber, collection, allClients)` helper in `lib/actions.ts`; `createPromo` and `importPromos` now share it. Else-if model/collection precedence preserved; `importPromos`'s pre-fetched clients list passed in to keep its perf characteristic. | — |
| 2026-05-03 | M-24 | Added composite `unique().on(clientId, promoId)` to `promoMatches` in `lib/db/schema.ts`. Defense-in-depth against double-insert of same client/promo pair. Does not de-dup `promoWatches` rows themselves — separate concern, not in scope. Apply via `npm run db:push`. | — |
| 2026-05-03 | M-23 | Replaced 5 production `bcrypt.hashSync` calls with `await bcrypt.hash` in `lib/actions.ts` (4: `createEmployee`, `resetEmployeePassword`, `changeOwnPassword`, `setSecretQuestion`) and `app/api/recover/route.ts` (1: `POST` handler). Test fixtures and seed script left as sync (setup paths). | — |
| 2026-05-03 | M-29 | Merged `ConfirmActionDialog` into `ConfirmDialog` via discriminated-union props (controlled `{open, onOpenChange}` vs uncontrolled `{children}` trigger). Deleted `components/confirm-action-dialog.tsx`; 3 callsites in `components/client-detail-tabs.tsx` updated. Existing 24 ConfirmDialog tests still pass. | — |
| 2026-05-03 | M-30 | Extracted `<PasswordInput>` (`components/password-input.tsx`) wrapping `Input` + Eye/EyeOff toggle with internal `show` state. Replaces 5 copy-pasted instances in `app/login/page.tsx` (2) and `app/(app)/change-password/page.tsx` (3). Optional `wrapperClassName` supports conditional border styling (used for match/mismatch on confirm-password field). | — |
| 2026-05-03 | M-28 | Closed as wontfix — not applicable to single-device, single-user-at-a-time kiosk deployment. Password is a local lock, not exposed to remote brute-force/credential-stuffing. Min-6 retained. Reopen if deployment model changes. | — |
| 2026-05-03 | L-13 | Closed as wontfix — same rationale as M-28. Seed script is a dev-only setup tool for the local kiosk database; "meridian" default documented as a starter password to be changed on first use. Reopen if repo goes public or deployment model changes. | — |
| 2026-05-03 | M-27 | Added security headers in `next.config.mjs`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`. CSP omitted (kiosk threat model + Next.js dev HMR friction). | — |
| 2026-05-03 | M-25 | Closed as wontfix — single-device kiosk has no realistic CSRF vector. Reopen if deployment model changes. | — |
| 2026-05-03 | M-26 | Closed as wontfix — single-device kiosk, no remote attackers, no concurrent-user contention to throttle. Reopen if deployment ever serves remote clients. | — |
| 2026-05-03 | M-31 | Replaced fake `KeyboardEvent` dispatch in `Topbar` with `CommandPaletteProvider` + `useCommandPalette()` hook. Layout wraps the app; topbar button calls `setOpen(true)`. Cmd/Ctrl+K still works (listener inside palette toggles via context). | — |
| 2026-05-03 | M-33 | Split `ClientProvider`: removed `ActiveTabContext`/`useActiveTab` and the internal `useState`. Tab state now local to `<ClientDetailTabs>`. Tests updated (4 of 7 remaining; the 3 activeTab tests removed since the hook is gone). | — |
| 2026-05-03 | M-34 | Extracted `<HeatDistributionChart>` (Recharts horizontal BarChart) to `components/heat-distribution-chart.tsx`. Used in both Overview tab (replaces inline chart) and Heat tab (replaces CSS stacked bar). Heat tab's per-category progress bars + legend kept (different breakdown view). | — |
| 2026-05-06 | M-35 | Wired the 4 real metadata gaps. `purchase` event in `lib/actions.ts` now includes `purchasedModel`. Both `edited` writers (`app/api/clients/route.ts` PUT, `app/api/clients/[id]/route.ts` PUT) now include `fieldChanges`. Both `tag_added` writers (`lib/actions.ts:addTag`, `app/api/tags/route.ts` POST) now include `tagName`. Both `tag_removed` writers now include `tagName`. `outreach_logged` reader falls through to `event.description` when both fields absent (guards pre-fix events). `note_added` was already correctly written (audit count overstated). `transferred`/`merged` are unimplemented features being built in Phase B/C. | `458237a` |
| 2026-05-06 | M-35 Phase B | Implemented client transfer feature. `transferClient()` server action (manager-gated): looks up previous/new employee names, updates `clients.employeeId`, emits `transferred` event with `previousEmployeeName` and `newEmployeeName` in metadata. `ActivityEventMetadataMap.transferred` extended. Timeline reader updated to show "Transferred from X to Y" when both names present. New `TransferClientDialog` component: fetches active employees on open, disables current employee in select, calls server action on confirm. Wired into client detail actions dropdown (manager-only). | `be127c1` |
| 2026-05-06 | H-04, H-12 | H-04: Added `error.tsx` at `app/`, `app/(app)/`, `app/(app)/clients/`, `app/(app)/clients/[id]/`. All are `"use client"` per Next.js requirement, log to `console.error`, and render an `AlertCircle` + Try again button. Client-detail boundary adds a "Back to clients" escape hatch. H-12: Replaced `alert("Mark follow-up complete")` stub with real `markFollowUpComplete(log.id)` call. Added `useTransition` for pending state (button shows "Saving…" / disabled during call) and `sonner` toasts for success/failure. | — |
| 2026-05-06 | M-35 Phase C, H-01 | Implemented field-by-field client merge, closing H-01. `mergeClients()` server action (manager-gated): older record's ID wins; all FK references (outreachLogs, activityEvents, approvalRequests, promoMatches) migrated before hard-deleting loser; promoMatches handles unique-constraint conflicts by pre-deleting conflicting loser rows. onEmailList/productsOfInterest/tags always unioned. Emits `merged` event on winner. `patchClientFromFormMerge()` handles duplicate-detection path from new client form. `MergeClientDialog` (actions menu): two-step flow — debounced search → field-by-field resolution panel → confirm. `MergeFromFormDialog` (new client form): constructs form snapshot, resolves fields against existing record. Both dialogs share internal `ResolutionPanel` grid component. Notes: editable final textarea with "Use this" shortcuts from each side. Wired in `client-detail-tabs.tsx` (manager-only) and `client-form.tsx` / `clients/new/page.tsx` (duplicate warning). | `3ced678` |
| 2026-05-06 | H-02 | Tightened Notes DELETE WHERE in `app/api/notes/route.ts` to `and(eq(activityEvents.id, noteId), eq(activityEvents.eventType, "note_added"))`. Non-note activity events (purchases, status changes, bans) can no longer be deleted via this endpoint. Added `and` to drizzle-orm imports. | — |
| 2026-05-06 | H-11 | Rewrote `app/api/recover/route.ts` to use shared `db` from `@/lib/db` with Drizzle ORM. Removed `better-sqlite3` dependency, two manual connection open/close try/finally blocks, and raw prepared-statement strings. Both branches (lookup, verify) now use `db.select()` / `db.update()` with typed column references. Replaced `bcrypt.compareSync` with `await bcrypt.compare`. | — |
| 2026-05-06 | H-20 | Deleted `getClientOutreach` and `getClientActivity` from `lib/queries.ts` (confirmed zero external imports). Both functions were dead exports — their queries are duplicated inline wherever needed. | — |
| 2026-05-06 | H-10 | Replaced `export { default } from "next-auth/middleware"` with a custom `middleware()` using `getToken`. Unauthenticated `/api/*` requests now return 401 JSON (`{ error: "Not authenticated" }`); all other protected routes still redirect to `/login`. Existing matcher exclusions unchanged. | — |
| 2026-05-06 | C-02 | Added startup guard in `lib/auth.ts`: `if (!process.env.NEXTAUTH_SECRET) throw new Error(...)`. Removed `|| "iris-dev-secret-change-me"` fallback. Server now fails fast rather than silently using a known key. | — |
| 2026-05-06 | C-07, C-08 | Fixed `addTag` and `removeTag` in `lib/actions.ts`. `addTag`: early return if tag already on client (prevents bogus usageCount increments); `else` branch now inserts new `clientTags` row with `usageCount: 1` when tag name not in registry. `removeTag`: early return if tag not on client; now fetches `clientTags` row and decrements `usageCount` when positive. | — |
| 2026-05-06 | H-23 | Added ownership guard to both PUT handlers (`app/api/clients/[id]/route.ts`, `app/api/clients/route.ts`). Each now fetches the client first (404 if missing), then returns 403 if requester is not a manager and doesn't own the client. | — |
| 2026-05-07 | H-06 | Projection in `check-duplicates` route narrowed to 5 columns (`id`, `firstName`, `lastName`, `phone`, `email`). Full-table-scan fallback was already eliminated by M-19; this closes the remaining "returns full rows" concern. | — |
| 2026-05-07 | H-03 | All 7 multi-write functions in `lib/actions.ts` wrapped in `db.transaction()`: `banClient`, `unsubscribeClient`, `unbanClient`, `clearAllPromos`, `deletePromo`, `createPromo`, `importPromos`. `unbanClient` reads `bannedCustomers` inside the transaction callback for full atomicity. `matchPromoToClients` helper parameter typed as `Pick<typeof db, "insert">` to satisfy the SQLiteTransaction type (which lacks `$client`). | — |
| 2026-05-07 | C-04 | Added 11 explicit indexes to `lib/db/schema.ts` across 3 tables: `clients` (employeeId, status, heatScore, email, phone), `outreachLogs` (clientId, date, followUpDate, completed), `activityEvents` (clientId, createdAt). Migration `0001_add_indexes.sql` written and applied. Migration tracking table seeded with hash for migration 0000 (previously unapplied). | — |
| 2026-05-07 | H-05 | Refactored `matchPromoToClients` in `lib/actions.ts` to batch inserts. Loop collects match rows into an array; single `tx.insert(promoMatches).values(matches).run()` replaces per-row inserts. Guard added for empty-matches case. | — |
| 2026-05-07 | H-15 | Pre-resolved — `types/next-auth.d.ts` module augmentation already in place; `lib/auth.ts` uses direct property assignments with no type casts. TSC clean. Doc-only close. | — |
| 2026-05-07 | H-19 | Wrapped `addTag`/`removeTag` in `lib/actions.ts` in `db.transaction()`. Replaced JS read-modify-write with SQL-atomic `sql\`${clientTags.usageCount} + 1\`` / `sql\`MAX(0, ${clientTags.usageCount} - 1)\``. Applied same fixes to `app/api/tags/route.ts` POST and DELETE. DELETE now decrements `usageCount` (previously missing entirely). POST now creates new `clientTags` row if tag name not registered (previously missing `else` branch). | — |
| 2026-05-07 | H-21 | Refactored `edit-client-dialog.tsx` (398 → ~110 lines) to use shared `ClientForm`. All inline form JSX removed. Dialog owns state and `handleSubmit`; delegates rendering to `<ClientForm />`. `ClientFormData` type imported from `client-form.tsx`. All three client form entry points now use the shared component. | — |
| 2026-05-07 | H-09, C-03, H-14 | **H-09**: Added zod validation to all API routes with request bodies. New `lib/validation/client.ts` exports `clientCreateSchema` and `clientPatchSchema`; inline schemas in `notes` and `tags` routes. All routes return 400 with `fieldErrors` on parse failure. `source` enum validated against `CLIENT_SOURCE_VALUES`. **C-03**: Both REST PUT handlers now build the DB patch from `Object.entries(parsed.data)` — zod strips unknown keys, so `heatScore`, `status`, `employeeId`, `dateAdded` cannot be written. **H-14**: `validateClientForm()` helper added to `lib/validation/client.ts`; called in all three `handleSubmit` functions before fetch. Full server-side enforcement via H-09's schemas. | — |
| 2026-05-07 | H-17 | Deleted `app/api/tags/route.ts` and `app/api/outreach/route.ts`. Deleted stale `__tests__/api/tags.test.ts` and `__tests__/api/outreach.test.ts` (both already failing post-H-09 due to zod error format change). Refactored `components/tags-tab.tsx` to call `addTag`/`removeTag` server actions via `useTransition` instead of fetch. Server actions are now the sole implementation path for tag mutations and outreach logging. Auth discrepancy resolved in favor of server action policy (any authenticated user may tag — associates can tag their own clients). M-07's SQL recalcHeat pattern preserved in canonical `lib/actions.ts:recalcHeat`. | — |
| 2026-05-07 | C-05 | Closed as wontfix. Threat (remote brute-force of recovery endpoint) requires network access; kiosk is single-device and physically controlled. Same rationale as M-25, M-26, M-28. Reopen if deployment model changes. | — |
| 2026-05-07 | L-14 | Closed as wontfix. NIST SP 800-63B §5.1.1.2 prohibition targets remote-scale enumeration, which is out of scope for this kiosk. Email OTP (recommended alternative) requires SMTP + employee email fields not present in this deployment. Primary recovery path is manager-reset (`resetEmployeePassword` in Settings → Employees). Secret question retained as secondary convenience. Reopen if deployment model changes or email infrastructure added. | — |

> To resolve an issue: (1) change `[ ]` to `[x]` in the issue heading, (2) update the Tracking Summary counts at the top, (3) add a row to this Resolution Log.
