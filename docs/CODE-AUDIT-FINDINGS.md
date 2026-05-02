# Iris Code Audit — Findings Report

**Date**: 2026-04-27  
**Last updated**: 2026-04-30  
**Scope**: Full codebase (`app/`, `components/`, `lib/`, `middleware.ts`)  
**Excluded**: `node_modules/`, `.next/`, `components/ui/` (shadcn primitives)  
**Total Source**: ~18,600 lines across ~90 files  

---

## Tracking Summary

| Severity | Total | Open | In Progress | Resolved |
|----------|-------|------|-------------|----------|
| CRITICAL | 8 | 6 | 0 | 2 |
| HIGH | 22 | 16 | 0 | 6 |
| MEDIUM | 33 | 26 | 0 | 7 |
| LOW | 17 | 2 | 0 | 15 |
| **TOTAL** | **80** | **53** | **0** | **27** |

> **How to use:** When an issue is fixed, change its status marker from `[ ]` to `[x]` and update the Tracking Summary counts above. Add the fix date and PR/commit reference in a `**Fix:**` line below the issue description.

---

## Executive Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| 🔴 CRITICAL | 8 (2 resolved) | Auth bypass, mass assignment, missing DB indexes, tag corruption |
| 🟠 HIGH | 22 (6 resolved) | Phantom API routes, no error boundaries, missing validation, duplicated logic |
| 🟡 MEDIUM | 33 (7 resolved) | Duplicated code, missing transactions, memory leaks, unbounded queries, new UI findings |
| 🔵 LOW | 17 (2 resolved) | Deprecated APIs, hardcoded configs, index-based keys, debug leftovers, new low findings |

**Top 5 Most Impactful Open Issues:**

1. **Hardcoded JWT secret fallback** `"iris-dev-secret-change-me"` enables session forgery (C-02)
2. **Mass assignment** on all client update paths — any field can be overwritten (C-03)
3. **Zero database indexes** — every query does a full table scan (C-04)
4. **`/api/clients/merge` called from 3 places but does not exist** — runtime 404 (H-01)
5. **Tag `usageCount` permanently inaccurate** — monotonically increasing, never decremented (C-07)

---

## 🔴 CRITICAL

- [x] ### C-01: Employee Password Hash Exposure
- **Files**: `app/api/employees/route.ts:6`, `lib/queries.ts:133-134`, `app/(app)/settings/page.tsx:18-21`
- **Category**: Security — Credential Exposure
- **OWASP**: A01:2021 — Broken Access Control
- `db.select().from(employees).all()` returns ALL columns including `passwordHash`, `secretQuestion`, `secretAnswerHash`. Both the API endpoint and the server-rendered settings page serialize these to the client.
- **Fix**: Explicitly select only safe columns: `{ id, name, username, role, active, createdAt }`.
- **Resolved**: API route now destructures to strip `passwordHash` and `secretAnswerHash` via rest spread.

- [ ] ### C-02: Hardcoded JWT Secret Fallback
- **File**: `lib/auth.ts:44`
- **Category**: Security — Session Forgery
- **OWASP**: A02:2021 — Cryptographic Failures
- `secret: process.env.NEXTAUTH_SECRET || "iris-dev-secret-change-me"`. If env var is unset in production, JWTs are signed with a known key. Attackers can forge sessions.
- **Fix**: Remove fallback. Fail at startup if `NEXTAUTH_SECRET` is missing.

- [ ] ### C-03: Mass Assignment on Client Updates
- **Files**: `lib/actions.ts:86-88`, `app/api/clients/route.ts:82-87`, `app/api/clients/[id]/route.ts:30-35`
- **Category**: Security — Data Integrity
- All three update paths iterate `Object.entries(data)` with no field whitelist. Any field (`id`, `dateAdded`, `heatScore`, `status`, `employeeId`) can be overwritten by the caller.
- **Fix**: Replace dynamic loop with explicit allowlist of updatable fields.

- [ ] ### C-04: Zero Database Indexes
- **File**: `lib/db/schema.ts` (entire file)
- **Category**: Performance — Full Table Scans
- 10 tables, zero explicit indexes. All queries on foreign keys, status fields, date columns, and searchable text perform full table scans. Performance will degrade severely as data grows.
- **Fix**: Add indexes for: `clients.employee_id`, `clients.status`, `clients.heat_score`, `clients.email`, `outreach_logs.client_id`, `outreach_logs.follow_up_date`, `outreach_logs.date`, `activity_events.client_id`, `activity_events.created_at`, `promo_matches.client_id`, `promo_matches.promo_id`, `unsubscribe_list.email`.

- [ ] ### C-05: Unauthenticated Password Reset — No Brute-Force Protection
- **File**: `app/api/recover/route.ts:1-67`
- **Category**: Security — Authentication Failure
- **OWASP**: A07:2021
- Excluded from auth middleware. No rate limiting. Anyone can: (1) enumerate usernames, (2) retrieve secret questions, (3) brute-force answers at unlimited speed. Seed data has question "What is your favorite watch brand?" / answer "meridian".
- **Fix**: Add rate limiting (max 5 attempts/username/hour). Consider replacing with email-based OTP.

- [x] ### C-06: 16 Server Actions Have Zero Auth Checks
- **File**: `lib/actions.ts` — `markFollowUpComplete`, `rescheduleFollowUp`, `deleteSmartList`, `duplicateSmartList`, `renameSmartList`, `clearAllPromos`, `deletePromo`, `createPromo`, `importPromos`, `createTag`, `deleteTag`, `deleteTemplate`, `unbanCustomer`, `addUnsubscribeEmail`, `removeUnsubscribe`, `resubscribeClient`
- **Category**: Security — Missing AuthZ
- These actions never call `getSessionUser()`. If middleware is bypassed or misconfigured, any caller can invoke them.
- **Fix**: Every exported server action must verify authentication.
- **Resolved**: All listed server actions now use `requireAuth()` or `requireManager()` helpers.

- [ ] ### C-07: Tag `usageCount` Permanently Inaccurate
- **Files**: `lib/actions.ts:213-239`
- **Category**: Silent Data Corruption
- `addTag` (L221) always increments `usageCount`, even when the tag already exists on the client. `removeTag` (L229-239) never decrements it. No code in the entire codebase decrements `usageCount`. Counter is monotonically increasing and permanently wrong after first removal.
- **Fix**: In `addTag`, check if tag already exists before incrementing. In `removeTag`, add `SET usageCount = usageCount - 1`. Wrap in SQL atomic operation.

- [ ] ### C-08: `addTag` Missing `else` Branch — New Tags Never Created in `clientTags`
- **File**: `lib/actions.ts:219-221`
- **Category**: Silent Data Corruption
- If a tag name doesn't exist in `clientTags`, the `if (existing)` block is skipped entirely — no new row is created. Tags added directly to clients never appear in the "Available Tags" registry.
- **Fix**: Add `else` branch that inserts a new `clientTags` row with `usageCount: 1`.

---

## 🟠 HIGH

- [ ] ### H-01: Phantom API Route — `/api/clients/merge` Does Not Exist
- **Files**: `components/edit-client-dialog.tsx:120`, `app/(app)/clients/[id]/edit/page.tsx:228`, `app/(app)/clients/new/page.tsx:152`
- **Category**: Runtime Bug
- Three files call `fetch("/api/clients/merge", ...)` but no `app/api/clients/merge/route.ts` exists. All merge/duplicate operations will 404 at runtime.
- **Fix**: Create the merge route handler, or remove the fetch calls.

- [ ] ### H-02: Notes DELETE Can Delete Any Activity Event
- **File**: `app/api/notes/route.ts:44`
- **Category**: Data Integrity
- Deletes `activityEvents` by ID without verifying `eventType === "note_added"`. Any activity event (purchase, status change, ban) can be deleted, destroying audit trail.
- **Fix**: Add WHERE clause: `and(eq(activityEvents.eventType, "note_added"))`.

- [ ] ### H-03: Multi-Step Mutations Not in Transactions
- **File**: `lib/actions.ts` — `banClient` (L241-261), `unsubscribeClient` (L263-277), `unbanCustomer` (L357-374), `clearAllPromos` (L324-328), `deletePromo` (L330-334), `createPromo` (L279-292), `importPromos` (L294-322)
- **Category**: Data Integrity
- Multiple writes across different tables with no transaction wrapping. A failure midway leaves data inconsistent (e.g., client marked "banned" but no banned record exists).
- **Fix**: Wrap in `db.transaction()`.

- [ ] ### H-04: No Error Boundaries
- **File**: `app/` directory — zero `error.tsx` files anywhere
- **Category**: UX / Resilience
- A single unhandled error in any server component crashes the entire page with Next.js's default unstyled error screen. No graceful fallback.
- **Fix**: Add `error.tsx` at `app/error.tsx`, `app/(app)/error.tsx`, `app/(app)/clients/error.tsx`, `app/(app)/clients/[id]/error.tsx`.

- [ ] ### H-05: N+1 Query — `createPromo` and `importPromos`
- **Files**: `lib/actions.ts:279-292`, `lib/actions.ts:294-322`
- **Category**: Performance
- `createPromo` loads ALL clients then does individual inserts in a loop. `importPromos` is O(rows × clients) — 50 promos × 10K clients = 500K potential inserts.
- **Fix**: Batch match inserts. Use SQL-based matching instead of JavaScript loops.

- [ ] ### H-06: `check-duplicates` Loads Entire Clients Table
- **File**: `app/api/clients/check-duplicates/route.ts:34-40`
- **Category**: Performance / OOM Risk
- Falls back to `db.select().from(clients).all()` + JavaScript `.find()` for first-name matching. Returns full client records including all fields.
- **Fix**: Use `WHERE lower(first_name) = ?` SQL query. Return only necessary fields.

- [x] ### H-07: 10 Server Actions Call `getSessionUser()` But Don't Check for Null
- **File**: `lib/actions.ts` — `createClient`, `updateClient`, `transferClient`, `logOutreach`, `addTag`, `removeTag`, `banClient`, `unsubscribeClient`, `createTemplate`, `createSmartList`
- **Category**: Security — Auth Gap
- These call `getSessionUser()` but proceed with `user?.id ?? null`. Actions succeed with `employeeId: null`, breaking audit trails.
- **Fix**: Add `if (!user) throw new Error("Unauthorized")` after the call.
- **Resolved**: All now use `requireAuth()` which throws if null.

- [x] ### H-08: No Role-Based Authorization on Destructive Operations
- **File**: `lib/actions.ts` — `clearAllPromos`, `banClient`, `transferClient`, `unbanCustomer`
- **Category**: Security — Missing AuthZ
- Any authenticated associate can clear all promos, ban clients, transfer clients, unban customers. Only employee management checks for manager role.
- **Fix**: Add `if (user.role !== "manager")` guards to privileged operations.
- **Resolved**: All now use `requireManager()` which checks role.

- [ ] ### H-09: No Input Validation on Any API Route
- **Files**: All files under `app/api/` — `clients`, `notes`, `tags`, `outreach`, `search`, `employees`, `templates`, `promos/matches`
- **Category**: Security — Injection / Data Integrity
- Zero request body validation. `method`/`outcome` enums accept arbitrary strings. `zod` is a dependency but unused. Phone, email, dates are unvalidated.
- **Fix**: Add zod schemas for every endpoint. Validate before processing.

- [ ] ### H-10: API Routes Return Redirect Instead of 401
- **File**: `middleware.ts:1-4`
- **Category**: API Design
- `next-auth/middleware` returns 302 redirect to `/login` for unauthenticated API requests. API consumers get HTML login page instead of JSON 401 response.
- **Fix**: Add custom middleware logic that returns 401 JSON for `/api/*` routes.

- [ ] ### H-11: Direct SQLite Access Bypassing ORM
- **File**: `app/api/recover/route.ts:2-3`
- **Category**: Architecture / Data Integrity
- `import Database from "better-sqlite3"` creates a separate DB connection, bypassing Drizzle ORM, WAL mode, and foreign key settings.
- **Fix**: Use the shared `db` from `lib/db/index.ts`.

- [ ] ### H-12: Outreach History "Complete" Button Is a Stub
- **File**: `components/outreach-history-tab.tsx:188-190`
- **Category**: Broken Feature
- `onClick={() => { alert("Mark follow-up complete") }}` — browser alert instead of calling the existing `markFollowUpComplete` server action.
- **Fix**: Import and call `markFollowUpComplete(row.log.id)` with toast + refresh.

- [x] ### H-13: Common Tag Click Doesn't Pass Tag Value
- **File**: `app/(app)/clients/new/page.tsx:474-484`
- **Category**: Broken Feature
- Badge `onClick={() => handleAddTag()}` calls without arguments, but `handleAddTag()` reads from `newTag` state which is empty. Badge text is never transferred.
- **Fix**: Change to `onClick={() => { setNewTag(tag); handleAddTag(); }}`.
- **Resolved**: Refactored to use shared `ClientForm` component with `onFieldChange("tags", [...formData.tags, tag])`.

- [ ] ### H-14: No Form Validation on Client Create/Edit
- **Files**: `app/(app)/clients/new/page.tsx:109-113`, `app/(app)/clients/[id]/edit/page.tsx:186-190`, `components/edit-client-dialog.tsx:81-113`
- **Category**: Data Integrity
- Only `firstName` is validated as non-empty. Email format, phone format, dates, and all other fields are unvalidated client-side and server-side.
- **Fix**: Add zod validation schema shared across all three forms.

- [ ] ### H-15: Unsafe Type Casts Throughout Auth Code
- **Files**: `lib/auth.ts:22, 31-32, 38-39`
- **Category**: Type Safety
- `as unknown as { id: string; ... }` double casts and `(user as { id: string }).id` despite proper module declarations in `next-auth.d.ts`.
- **Fix**: Ensure module augmentation is recognized; remove casts.

- [x] ### H-16: Notes Field Type Mismatch
- **File**: `components/notes-tab.tsx:88-94`
- **Category**: Runtime Bug
- `(client.notes as unknown[]).map(...)` treats `notes` as an array, but the schema defines it as `string | null`. Will crash if notes is a plain string.
- **Fix**: Define a proper notes schema as JSON array, or add runtime type guard.
- **Resolved**: Refactored to filter `client.timeline` for `note_added` events instead.

- [ ] ### H-17: Duplicated Business Logic — Server Actions vs API Routes
- **Files**: `lib/actions.ts` vs `app/api/tags/route.ts`, `app/api/outreach/route.ts`
- **Category**: Maintainability
- `addTag`/`removeTag`, outreach logging, and heat recalculation are implemented twice — once as server actions, once as API routes — with diverging behavior.
- **Fix**: Pick one pattern (server actions preferred). Remove duplicates.

- [x] ### H-18: `removeUnsubscribe` Unconditionally Re-enables Email List
- **File**: `lib/actions.ts:399`
- **Category**: Silent Logic Bug
- Sets `onEmailList: true` when resubscribing, even if the client was never on the email list. Silently opts people into marketing emails.
- **Fix**: Preserve original `onEmailList` value or set to previous state.
- **Resolved**: `removeUnsubscribe` function removed entirely. `resubscribeClient` now only sets `status: "active"` and removes from unsubscribe list.

- [ ] ### H-19: Race Conditions in Tag Operations
- **Files**: `lib/actions.ts:213-239`, `app/api/tags/route.ts:22-23`
- **Category**: Data Integrity
- Read-modify-write pattern on tags array with no locking. Two concurrent add/remove operations can cause lost updates. `usageCount` increment is also non-atomic.
- **Fix**: Use SQL atomic operations (`json_array_append`, `usage_count + 1`).

- [ ] ### H-20: `getClientOutreach`/`getClientActivity` — Dead Code
- **File**: `lib/queries.ts:21-27`
- **Category**: Dead Code
- Exported but never imported. `getFullClient` duplicates these queries inline.
- **Fix**: Use them in `getFullClient` or remove them.

- [ ] ### H-21: Client Form Code Still Duplicated in `edit-client-dialog.tsx`
- **Files**: `components/edit-client-dialog.tsx` (370 lines), `components/client-form.tsx` (shared form)
- **Category**: Overcomplicated / Duplication
- New client and edit client pages now use the shared `ClientForm` component. However, `edit-client-dialog.tsx` still reimplements the entire client form inline instead of reusing `ClientForm`.
- **Fix**: Refactor `EditClientDialog` to use `ClientForm` internally with initial values.

- [x] ### H-22: Duplicate FullClient Interface
- **File**: `components/client-provider.tsx:11-40, 42-71`
- **Category**: Dead Code / Confusion
- Defined twice identically. 30 lines of pure duplication.
- **Fix**: Delete lines 42-71.
- **Resolved**: Interface now defined only once.

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

- [ ] ### M-07: `recalcHeat` Loads All Outreach Logs
- **File**: `lib/actions.ts:21`
- **Category**: Performance
- Fetches ALL outreach logs for a client then filters by date in JavaScript instead of SQL.
- **Fix**: Add date WHERE clause: `gte(outreachLogs.date, ninetyDaysAgo)`.

- [ ] ### M-08: `FollowUpForm` Duplicates `OutreachLogger`
- **Files**: `components/follow-up-form.tsx` (351 lines) vs `components/outreach-logger.tsx` (135 lines)
- **Category**: Duplication
- Near-complete rewrite with the same fields but different data fetching patterns (raw API + `window.location.reload()` vs server actions). Adds date picker + templates that OutreachLogger lacks.
- **Fix**: Merge into single enhanced component.

- [ ] ### M-09: `getMethodIcon` Duplicated in 4 Files
- **Files**: `components/outreach-history-tab.tsx:19-32`, `components/follow-up-form.tsx:157-165`, `app/(app)/follow-ups/follow-ups-content.tsx:65-73`, `app/(app)/analytics/analytics-content.tsx:90-98`
- **Category**: Duplication
- Same switch statement copy-pasted 4 times.
- **Fix**: Extract to `lib/outreach-utils.tsx`.

- [x] ### M-10: `getHeatBadge` Duplicated in 3 Files
- **Files**: `app/(app)/follow-ups/follow-ups-content.tsx:98-105`, `app/(app)/smart-lists/smart-lists-content.tsx:80-87`, `app/(app)/analytics/collections/collections-content.tsx:44-51`
- **Category**: Duplication
- Duplicated despite `<HeatBadge>` component already existing at `components/heat-badge.tsx`.
- **Fix**: Use existing `<HeatBadge>` component.
- **Resolved**: No longer duplicated. Sites now use shared `HeatBadge` component or inline badge.

- [ ] ### M-11: `SettingsContent` — 1058-Line Monolith
- **File**: `app/(app)/settings/settings-content.tsx`
- **Category**: Overcomplicated
- 12 useState hooks, 8 handler functions, 3 confirmation dialogs in a single component. Has grown from 744 lines since original audit.
- **Fix**: Split into `EmployeesTab`, `TagsTab`, `TemplatesTab` components.

- [ ] ### M-12: `AnalyticsContent` — 822-Line Monolith
- **File**: `app/(app)/analytics/analytics-content.tsx`
- **Category**: Overcomplicated
- 3 tabs with substantial logic, duplicated heat distribution bar.
- **Fix**: Split into `OverviewTab`, `OutreachTab`, `HeatTab` components.

- [ ] ### M-13: Magic Numbers in Business Logic
- **Files**: `lib/heat-score.ts:9,11-12,23-24,28`, `lib/utils.ts:53,56,58`, `lib/queries.ts:31,76`
- **Category**: Maintainability
- `86400000` (day in ms), `90`, `30`, `60`, score values `15`, `10`, `5`, `3`, `-15`, `-20`, thresholds `90`, `180`, `70`, `40` — all unnamed.
- **Fix**: Extract to named constants: `const DAY_MS = 86_400_000`, `const HEAT_THRESHOLD_HOT = 70`, etc.

- [ ] ### M-14: Hardcoded Demo Credentials in Login Page
- **File**: `app/login/page.tsx:134-137`
- **Category**: Security
- Displays `Marcus / meridian` (manager) and `Jordan / meridian` (associate) on the login page.
- **Fix**: Gate behind `process.env.NODE_ENV === "development"`.

- [ ] ### M-15: Hardcoded Common Tags and Client Sources in Multiple Files
- **Files**: `components/client-form.tsx` (`COMMON_TAGS` array), `components/tags-tab.tsx` (`commonTags` array)
- **Category**: Maintainability
- Same tag list hardcoded in two places. `CLIENT_SOURCES` constant also defined in `client-form.tsx`. Must be manually synced.
- **Fix**: Fetch from `clientTags` table or define in a shared constants file.

- [ ] ### M-16: `searchClients` Doesn't Escape LIKE Wildcards
- **File**: `lib/queries.ts:157-167`
- **Category**: Security / Information Disclosure
- Constructs `%${query.toLowerCase()}%` without escaping `%` and `_`. Searching for `%` matches all records.
- **Fix**: Escape LIKE wildcards before constructing the pattern.

- [ ] ### M-17: Outreach POST Doesn't Validate Enum Values
- **File**: `app/api/outreach/route.ts:11-12`
- **Category**: Data Integrity
- Accepts arbitrary strings for `method` and `outcome`. SQLite doesn't enforce enum constraints.
- **Fix**: Validate against allowed values with zod.

- [ ] ### M-18: Activity Timeline — Unsafe Metadata Type Assertions
- **File**: `components/activity-timeline-tab.tsx:70,91-112,119`
- **Category**: Type Safety
- `(metadata?.method as string)`, `(metadata?.purchasedModel as string)` — metadata is `Record<string, unknown>`, every access is an unsafe cast.
- **Fix**: Define a discriminated union type for metadata based on `eventType`.

- [ ] ### M-19: `check-duplicates` Missing First-Name-And-Phone Check
- **File**: `app/api/clients/check-duplicates/route.ts:21-23`
- **Category**: Logic Bug
- The `firstName && phone` block is empty (just a comment). Intended combo check was never implemented. Falls through to firstName-only check, producing false positives.
- **Fix**: Implement the combo check or remove the empty block.

- [ ] ### M-20: Edit Client Page Fetches Data Client-Side
- **File**: `app/(app)/clients/[id]/edit/page.tsx:80-85`
- **Category**: Architecture
- `"use client"` page fetches client + employees via `fetch()` in `useEffect`. Causes loading flash and no SSR.
- **Fix**: Convert to server component, pass data to client form component.

- [ ] ### M-21: Duplicate `NotesTabProps` Interface
- **File**: `components/notes-tab.tsx:21-23, 25-27`
- **Category**: Dead Code
- Defined twice identically.
- **Fix**: Delete duplicate.

- [ ] ### M-22: `createPromo` and `importPromos` Share Matching Logic
- **File**: `lib/actions.ts:279-292, 294-322`
- **Category**: Duplication
- Nested loop checking `productsOfInterest` against model/collection is duplicated verbatim.
- **Fix**: Extract `matchPromoToClients(promoId, modelNumber, collection)` helper.

- [ ] ### M-23: `bcrypt.hashSync` Blocks Event Loop
- **File**: `lib/actions.ts:435, 452, 482, 493`
- **Category**: Performance
- Synchronous bcrypt hashing (CPU-intensive, ~100ms) blocks the Node.js event loop during password operations.
- **Fix**: Use async `bcrypt.hash()`.

- [ ] ### M-24: `promoMatches` Missing Unique Constraint
- **File**: `lib/db/schema.ts:96-102`
- **Category**: Data Integrity
- No unique constraint on `(clientId, promoId)`. Calling `createPromo` twice with same params creates duplicate matches.
- **Fix**: Add `.unique()` composite constraint or check before insert.

- [ ] ### M-25: No CSRF Protection on API Routes
- **Files**: All `app/api/` routes
- **Category**: Security
- POST/PUT/DELETE routes accept requests without CSRF token validation.
- **Fix**: Require `Content-Type: application/json` + validate `Origin` header, or use NextAuth CSRF tokens.

- [ ] ### M-26: No Rate Limiting on Any Endpoint
- **Files**: Application-wide
- **Category**: Security
- Zero rate limiting on login, recovery, API routes, or server actions.
- **Fix**: Implement rate limiting with `rate-limiter-flexible` or similar.

- [ ] ### M-27: Missing Security Headers
- **File**: `next.config.mjs`
- **Category**: Security
- No `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy` headers configured.
- **Fix**: Add security headers in `next.config.mjs` headers function.

- [ ] ### M-28: Weak Password Policy
- **Files**: `lib/actions.ts:430,481`, `app/api/recover/route.ts:37`
- **Category**: Security
- Minimum 6 characters, no complexity requirements. Seed data uses "meridian" for all accounts.
- **Fix**: Increase minimum to 12 chars. Require uppercase, lowercase, digit, special char.

- [ ] ### M-29: Two Near-Identical Confirm Dialog Components
- **Files**: `components/confirm-dialog.tsx` (57 lines), `components/confirm-action-dialog.tsx` (48 lines)
- **Category**: Duplication
- Both wrap `AlertDialog` with identical structure, styling, and destructive variant handling. Only difference is who manages the `open` state (controlled vs self-managed).
- **Fix**: Merge into a single component with optional `open`/`onOpenChange` prop pattern (uncontrolled when no `open` prop passed).

- [ ] ### M-30: Password Show/Hide Toggle Copy-Pasted 5 Times
- **Files**: `app/login/page.tsx` (2x), `app/(app)/change-password/page.tsx` (3x)
- **Category**: Duplication
- The password visibility toggle with `Eye`/`EyeOff` icon, border wrapper div, and `showPassword` state is copy-pasted across 5 instances.
- **Fix**: Extract a `PasswordInput` component that wraps `Input` with the toggle button built in.

- [ ] ### M-31: Topbar Search Button Fakes Keyboard Event
- **File**: `components/topbar.tsx:36-39`
- **Category**: Code Smell / Architecture
- Search button creates a `new KeyboardEvent("keydown", { key: "k", ctrlKey: true })` and dispatches it via `document.dispatchEvent` to open the command palette. This is a hacky coupling approach.
- **Fix**: Export a `useCommandPalette` hook or shared state to control command palette open state directly.

- [ ] ### M-32: Misleading Tab Icons in Client Detail Tabs
- **File**: `components/client-detail-tabs.tsx:90-113`
- **Category**: UX / Confusion
- Tab trigger icons don't match the tab's purpose: Notes tab uses `MapPin` icon, Tags tab uses `Mail` icon, Timeline tab uses `Briefcase`. These are misleading for users.
- **Fix**: Use semantically appropriate icons: `StickyNote` for Notes, `Tag` for Tags, `Activity` for Timeline.

- [ ] ### M-33: `ClientProvider` Combines Unrelated Concerns
- **File**: `components/client-provider.tsx`
- **Category**: Pattern Inconsistency
- The provider combines client data context with tab navigation state (`activeTab`/`setActiveTab`). Tab state is a UI concern; client data is domain data.
- **Fix**: Split into `ClientProvider` (data) and keep tab state local to `ClientDetailTabs`.

---

## 🔵 LOW

- [x] ### L-01: 3 Dead Server Actions
- **File**: `lib/actions.ts` — `createClient` (L27), `updateClient` (L70), `transferClient` (L101)
- `createClient` and `updateClient` are superseded by REST API routes. `transferClient` is never called anywhere.
- **Fix**: Delete unused actions.
- **Resolved**: All three are now actively used by client pages and components.

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

- [ ] ### L-13: Plaintext Credentials in Seed Script
- **File**: `lib/db/seed.ts:26-30, 42-43`
- **Category**: Security
- Password "meridian" hardcoded for all employee accounts. Risky if repo goes public.
- **Fix**: Use environment variables for seed passwords.
- **Note**: Deferred — seed script is dev-only infrastructure. May revisit if repo goes public.

- [ ] ### L-14: Secret Questions as Recovery Mechanism
- **Files**: `lib/actions.ts:487-499`, `app/api/recover/route.ts`
- **Category**: Security
- NIST SP 800-63B explicitly discourages secret questions. Small answer spaces are easily guessable.
- **Fix**: Replace with email-based reset links with time-limited tokens.
- **Note**: Deferred — should be tackled together with C-05 (unauthenticated brute-force protection) as a single password recovery overhaul.

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

> To resolve an issue: (1) change `[ ]` to `[x]` in the issue heading, (2) update the Tracking Summary counts at the top, (3) add a row to this Resolution Log.
