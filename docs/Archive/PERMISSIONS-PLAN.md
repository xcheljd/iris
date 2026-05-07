# Permissions Overhaul Plan

**Date**: April 2026
**Status**: Complete — 6/6 phases done ✅

## Background

A full audit of 39 server actions, 15 API routes, 14 pages, and 3 navigation components revealed that only 8 actions have proper role gating. Associates can currently perform manager-only operations (ban, unsubscribe, manage promos/tags/templates) by calling server actions directly, and all clients are visible to all users regardless of assignment.

## Roles

| Role | Access |
|------|--------|
| **Manager** | Full CRUD on all clients, employee management, promo/tag/template management, ban/unsubscribe, approval queue, activity feed |
| **Associate** | CRUD on own clients only, outreach logging, personal smart lists, read-only access to promos/banned/unsubscribed/analytics, can request ban/unsub/delete via approval queue |

---

## Phase 1: Server Action Gating

**Goal**: Every action has appropriate auth. No more zero-auth endpoints.
**Effort**: Medium | **Risk**: Low (additive, doesn't break anything)

### New auth helpers (lib/actions.ts)

- [x] `requireAuth()` — throws if no session. Returns user.
- [x] Replace scattered `getSessionUser()` + manual null checks with `requireAuth()`

### Manager-only actions (add `requireManager()`)

- [x] `banClient`
- [x] `unbanCustomer`
- [x] `unsubscribeClient`
- [x] `resubscribeClient`
- [x] `addUnsubscribeEmail`
- [x] `removeUnsubscribe`
- [x] `createPromo`
- [x] `importPromos`
- [x] `clearAllPromos`
- [x] `deletePromo`
- [x] `createTag`
- [x] `deleteTag`
- [x] `createTemplate`
- [x] `deleteTemplate`
- [x] `transferClient`

### Owner+Manager actions (auth + ownership check)

- [x] `updateClient` — verify `client.employeeId === user.id || manager`
- [x] `deleteSmartList` — verify `list.ownerId === user.id || manager`
- [x] `renameSmartList` — verify `list.ownerId === user.id || manager`

### Auth-only actions (add `requireAuth()`, currently zero-auth)

- [x] `recalcHeat`
- [x] `markFollowUpComplete`
- [x] `rescheduleFollowUp`
- [x] `duplicateSmartList`

### Already correct (no change)

- `deleteClient`, `restoreClient`, `purgeClient` — `requireManager()`
- `createEmployee`, `updateEmployee`, `resetEmployeePassword`, `updateEmployeeRole`, `toggleEmployeeActive` — manager or self+manager
- `changeOwnPassword`, `setSecretQuestion` — self only

### API route protection

- [x] Add `getServerSession()` + role checks to all API routes in `app/api/`
- [x] Consider removing redundant routes if server actions cover all mutations

---

## Phase 2: Approval Queue

**Goal**: Associates can request ban/unsubscribe/delete; managers approve/reject via a queue.
**Effort**: High | **Risk**: Medium (new table + new UI)
**Depends on**: Phase 1

### Schema (new `approval_requests` table)

```
id               TEXT PK
type             TEXT NOT NULL           -- "ban" | "unsubscribe" | "delete"
clientId         TEXT FK → clients
requestorId      TEXT FK → employees
reason           TEXT NOT NULL
status           TEXT NOT NULL           -- "pending" | "approved" | "rejected"
reviewedById     TEXT FK → employees (nullable)
reviewedAt       INTEGER (nullable)
metadata         TEXT (JSON, nullable)   -- e.g. { category, specificReason }
createdAt        INTEGER NOT NULL
```

### Server actions

- [x] `createApprovalRequest(type, clientId, reason, metadata?)` — auth-only
- [x] `reviewApprovalRequest(id, approved: boolean)` — manager-only
- [x] `getPendingApprovalCount()` — for sidebar badge

### Wire up existing UI

- [x] `client-status-actions.tsx` associate path: replace stub `toast.success()` with real `createApprovalRequest()` call
- [x] The reason textareas already exist — just need to persist the data

### Manager UI

- [x] New "Approvals" page at `/approvals` with pending requests list
- [x] Shows pending requests: client name, requestor, reason, approve/reject buttons
- [x] When approved: executes the actual action (ban/unsub/delete) + logs activity
- [x] When rejected: updates status only, requestor sees nothing (or could add a notification)

### Sidebar badge

- [x] Query pending count in sidebar layout
- [x] Show badge on "Approvals" nav item when count > 0

---

## Phase 3: Client Scoping

**Goal**: Associates see only their assigned clients. Managers see everything.
**Effort**: Medium | **Risk**: High (changes data every page returns)
**Depends on**: Phase 1

### Query layer (lib/queries.ts)

Add optional `employeeId?: string` parameter to:

- [x] `getAllClients(employeeId?)` — filter by `eq(clients.employeeId, employeeId)` when provided
- [x] `getClientsWithEmployee(employeeId?)` — same
- [x] `getStats(employeeId?)` — aggregate scoped to employee's clients
- [x] `getUpcomingFollowUps(employeeId?)` — only follow-ups for employee's clients
- [x] `getOverdueFollowUps(employeeId?)` — same
- [x] `getRecentOutreach(limit, employeeId?)` — outreach by employee's clients
- [x] `searchClients(query, employeeId?)` — search scoped
- [x] `getDeletedClients(employeeId?)` — for managers only, but add param for consistency
- [x] `getSmartLists(employeeId?)` — filter by `ownerId` for associates

### Page server components

Pass `session.user.id` + `session.user.role` into query functions:

- [x] Dashboard (`page.tsx`) — scope stats, follow-ups, hot leads, outreach
- [x] Client list (`clients/page.tsx`) — scope client list
- [x] Client detail (`clients/[id]/page.tsx`) — ownership check (associate can't view others' clients)
- [x] Client edit (`clients/[id]/edit/page.tsx`) — ownership check
- [x] Follow-ups (`follow-ups/page.tsx`) — scope to own clients
- [x] Analytics (`analytics/page.tsx`) — scope stats and outreach
- [x] Smart lists (`smart-lists/page.tsx`) — show own lists + shared, scope client pool

### Ownership rules

- Associates: only clients where `employeeId === user.id`
- Managers: all clients including unassigned
- Unassigned clients (`employeeId: null`): associates cannot see them
- Client creation: owner is always the creator (already works)
- Client transfer: manager-only (enforced in Phase 1)

---

## Phase 4: Read-Only Pages for Associates

**Goal**: Associates can navigate to promos/banned/unsubscribed/analytics but cannot modify.
**Effort**: Low | **Risk**: Low (just hiding buttons)
**Depends on**: Phase 1

| Page | Associate sees | Action buttons hidden |
|------|---------------|----------------------|
| Promos | Read-only promo list, date ranges, matches | Add, Import, Delete, Clear All buttons hidden |
| Banned | Read-only banned list | Ban Customer, Unban buttons hidden |
| Unsubscribed | Read-only unsubscribe list | Add Email, Remove, Resubscribe hidden |
| Analytics | Full read access (no modifications possible) | No changes needed |
| Tags tab (Settings) | Read-only tag list | Add Tag, Delete Tag hidden |
| Templates tab (Settings) | Read-only template list | Add Template, Delete Template hidden |

### UI changes

- [x] `promos-content.tsx` — wrap action buttons in `isManager` conditional
- [x] `banned-content.tsx` — wrap Ban/Unban in `isManager` conditional, add "Request Ban" for associates
- [x] `unsubscribed-content.tsx` — wrap actions in `isManager`, add "Request Unsubscribe" for associates
- [x] `settings-content.tsx` — wrap tag/template CRUD buttons in `isManager`
- [x] Pass `currentUserRole` to all pages that need it

---

## Phase 5: Manager Activity Feed

**Goal**: Managers see a global feed of client additions, removals, bans, unsubs, edits with details.
**Effort**: Medium | **Risk**: Low (extending existing system)
**Depends on**: Phase 2

### Extend activity_events

Add event types to the enum:

- [x] `"ban_requested"`, `"ban_approved"`, `"ban_rejected"`
- [x] `"unsub_requested"`, `"unsub_approved"`, `"unsub_rejected"`
- [x] `"delete_requested"`, `"delete_approved"`, `"delete_rejected"`

### New query

- [x] `getRecentActivity(limit)` — global (not per-client) query returning latest N events across all clients, with employee names

### Dashboard "Activity" tab enhancement

- [x] Show mixed feed of: recent outreach, status changes, approval requests/resolutions, client creations/edits
- [x] For edits: include what changed in metadata (field name, old value, new value)

---

## Phase 6: Navigation Updates

**Goal**: Sidebar and command palette reflect role-based access.
**Effort**: Low | **Risk**: Low (client-side only)
**Depends on**: Phase 2 (for Approvals nav item + badge)

### Sidebar (app-sidebar.tsx)

- [x] Pass session role to nav structure
- [x] Associates see: Dashboard, Client List, Follow-Ups, Smart Lists, Promos (read-only), Analytics, Settings
- [x] Managers see: Everything above + Approvals (with pending count badge)
- [x] Both roles see Settings (but tabs differ based on role — already handled)

### Command palette (command-palette.tsx)

- [x] Filter navigation items by role, matching sidebar

### Mobile nav (mobile-nav.tsx)

- [x] Same filtering as sidebar

---

## Execution Order

```
Phase 1 → Phase 4 → Phase 6 → Phase 3 → Phase 2 → Phase 5
  │           │         │         │         │         │
  │           │         │         │         │         └── Polish
  │           │         │         │         └── New feature
  │           │         │         └── Biggest change
  │           │         └── Wayfinding
  │           └── UX polish
  └── Security foundation
```

| Phase | Effort | Dependencies | Risk |
|-------|--------|-------------|------|
| Phase 1 (action gating) | Medium | None | Low |
| Phase 4 (read-only UI) | Low | Phase 1 | Low |
| Phase 6 (navigation) | Low | Phase 2 | Low |
| Phase 3 (client scoping) | Medium | Phase 1 | High |
| Phase 2 (approval queue) | High | Phase 1 | Medium |
| Phase 5 (activity feed) | Medium | Phase 2 | Low |

---

## Audit Reference

### Current permission gaps (from explore audit)

**Critical (17 actions with zero auth)**:
- `recalcHeat`, `markFollowUpComplete`, `rescheduleFollowUp`
- `createTag`, `deleteTag`, `deleteTemplate`
- `createPromo`, `importPromos`, `clearAllPromos`, `deletePromo`
- `deleteSmartList`, `duplicateSmartList`, `renameSmartList`
- `unbanCustomer`, `addUnsubscribeEmail`, `removeUnsubscribe`, `resubscribeClient`

**Weak auth (5 actions with session but no role check)**:
- `updateClient` (no ownership check)
- `transferClient` (no manager check)
- `banClient`, `unsubscribeClient` (no manager check)
- `createTemplate` (no manager check)

**Correctly gated (8 actions)**:
- `deleteClient`, `restoreClient`, `purgeClient` — requireManager()
- `createEmployee`, `updateEmployee`, `resetEmployeePassword`, `updateEmployeeRole`, `toggleEmployeeActive` — manager or self

### Data scoping gaps

- Zero queries in `lib/queries.ts` filter by `employeeId`
- All pages fetch ALL data regardless of role
- Smart lists return ALL lists regardless of `ownerId`
- `client-status-actions.tsx` associate path is a stub — `toast.success()` with no backend persistence
- No approval queue table exists
- Activity events are per-client only — no global feed query
