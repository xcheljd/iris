# Iris — REST API Expansion Proposal

**Date:** May 11, 2026
**Status:** Proposed
**Scope:** Expose existing server actions as RESTful API endpoints for external integrations, mobile apps, and scripting.

---

## Background

Iris currently has a split architecture for data operations:

- **Server actions** (`lib/actions/*.ts`) — 47 exported functions, used by the Next.js frontend via `"use server"` imports
- **REST API routes** (`app/api/**/route.ts`) — 12 route files covering ~16 HTTP method+path combinations

The API routes were built primarily for features that need non-React consumers (backup download, NextAuth, password recovery, search). Most write operations and several major resource types have no REST endpoint at all — they can only be triggered from the browser UI.

This limits:
- **Mobile apps** — no way to log outreach, manage clients, or process approvals
- **External integrations** — no webhooks, Zapier triggers, or Slack bots
- **Scripting/automation** — bulk operations must go through the browser
- **QA/testing** — the backend QA skill can only test ~16 endpoints, not the full 47 actions

---

## Current API Coverage

### Existing Endpoints

| Method | Path | Operation |
|--------|------|-----------|
| GET | `/api/clients` | List/search clients |
| POST | `/api/clients` | Create client |
| GET | `/api/clients/[id]` | Get single client |
| PUT | `/api/clients/[id]` | Update client |
| GET | `/api/clients/check-duplicates` | Duplicate detection |
| GET | `/api/employees` | List employees |
| POST | `/api/notes` | Add note |
| DELETE | `/api/notes` | Delete note |
| GET | `/api/search?q=` | Search clients |
| GET | `/api/backup/download` | Download backup |
| POST | `/api/backup/restore` | Restore backup |
| GET | `/api/approvals/count` | Pending approval count |
| GET | `/api/promos/matches` | Promo match list |
| POST | `/api/recover` | Password recovery |
| GET/POST | `/api/auth/[...nextauth]` | Authentication |

### Resources With Zero API Coverage

| Resource | Server Actions | Gap |
|----------|---------------|-----|
| Outreach | `logOutreach`, `markFollowUpComplete`, `rescheduleFollowUp` | No endpoints at all |
| Approvals | `getPendingApprovalRequests`, `createApprovalRequest`, `reviewApprovalRequest` | Only `/count` exists |
| Promos | `createPromo`, `deletePromo`, `importPromos`, `clearAllPromos` | Only match-reading |
| Tags | `createTag`, `deleteTag`, `addTag`, `removeTag` | No endpoints at all |
| Templates | `createTemplate`, `deleteTemplate` | No endpoints at all |
| Smart Lists | `createSmartList`, `deleteSmartList`, `renameSmartList`, `duplicateSmartList` | No endpoints at all |
| Prospects | `graduateProspect`, `rejectProspect`, `unsubscribeProspect`, `graduateProspectIntoExistingClient` | No endpoints at all |
| Client Status | `banClient`, `unbanClient`, `unsubscribeClient`, `resubscribeClient`, `transferClient`, `restoreClient`, `purgeClient` | No status mutation endpoints |
| Employees (write) | `createEmployee`, `updateEmployee`, `resetEmployeePassword`, `updateEmployeeRole`, `toggleEmployeeActive` | Only GET exists |

---

## Proposed Endpoints by Priority

### Priority 1 — Core Business Operations

These are the verbs a mobile app or external integration would need on day one.

#### 1A. Outreach — `app/api/outreach/route.ts`

| Method | Path | Action Function | Description |
|--------|------|-----------------|-------------|
| POST | `/api/outreach` | `logOutreach` | Log an outreach event (call, text, email, in-person) with outcome, notes, follow-up date |
| GET | `/api/outreach?clientId=[id]` | *(new query)* | List outreach logs for a client |
| PATCH | `/api/outreach/[id]/complete` | `markFollowUpComplete` | Mark a follow-up as done |
| PATCH | `/api/outreach/[id]/reschedule` | `rescheduleFollowUp` | Reschedule a follow-up date |

**Rationale:** Logging outreach is the #1 CRM action. A mobile sales associate app needs this immediately.

#### 1B. Client Status Mutations — `app/api/clients/[id]/route.ts` (extend existing)

| Method | Path | Action Function | Description |
|--------|------|-----------------|-------------|
| DELETE | `/api/clients/[id]` | `deleteClient` | Soft-delete a client (add DELETE method to existing route) |
| POST | `/api/clients/[id]/ban` | `banClient` | Ban a customer (manager direct or associate request) |
| POST | `/api/clients/[id]/unban` | `unbanClient` | Remove ban (manager only) |
| POST | `/api/clients/[id]/unsubscribe` | `unsubscribeClient` | Unsubscribe a customer |
| POST | `/api/clients/[id]/resubscribe` | `resubscribeClient` | Resubscribe a customer |
| POST | `/api/clients/[id]/transfer` | `transferClient` | Transfer client to another employee |
| POST | `/api/clients/[id]/restore` | `restoreClient` | Restore soft-deleted client |
| DELETE | `/api/clients/[id]/purge` | `purgeClient` | Permanently delete a client |

**Rationale:** The client API currently supports read, create, and update — but not lifecycle operations. These are the main business actions on a client record.

#### 1C. Approvals — `app/api/approvals/route.ts`

| Method | Path | Action Function | Description |
|--------|------|-----------------|-------------|
| GET | `/api/approvals` | `getPendingApprovalRequests` | List pending approval requests (currently only `/count`) |
| POST | `/api/approvals` | `createApprovalRequest` | Submit a ban/unsubscribe/delete request |
| PATCH | `/api/approvals/[id]` | `reviewApprovalRequest` | Approve or reject a request |

**Rationale:** The approval workflow is currently browser-only. A manager should be able to approve requests from Slack, mobile, etc.

---

### Priority 2 — Resource CRUD

Full CRUD for resource types that currently have partial or no API coverage.

#### 2A. Employees — `app/api/employees/route.ts` (extend existing)

| Method | Path | Action Function | Description |
|--------|------|-----------------|-------------|
| POST | `/api/employees` | `createEmployee` | Create a new employee |
| PUT | `/api/employees/[id]` | `updateEmployee` | Update name, username |
| PATCH | `/api/employees/[id]/role` | `updateEmployeeRole` | Toggle manager/associate role |
| PATCH | `/api/employees/[id]/active` | `toggleEmployeeActive` | Activate/deactivate employee |
| POST | `/api/employees/[id]/reset-password` | `resetEmployeePassword` | Reset employee password |

**Rationale:** Employee management is manager-only and admin-focused. API access enables scripted onboarding/offboarding.

#### 2B. Prospects — `app/api/prospects/route.ts`

| Method | Path | Action Function | Description |
|--------|------|-----------------|-------------|
| GET | `/api/prospects` | *(new query)* | List prospects with tab filters (active, graduated, rejected, unsubscribed) |
| GET | `/api/prospects/[id]` | *(new query)* | Get prospect detail |
| POST | `/api/prospects/[id]/graduate` | `graduateProspect` | Graduate prospect to client |
| POST | `/api/prospects/[id]/reject` | `rejectProspect` | Reject a prospect |
| POST | `/api/prospects/[id]/unsubscribe` | `unsubscribeProspect` | Unsubscribe a prospect |

**Rationale:** The RVX import pipeline is browser-only. API access enables automated prospect ingestion and pipeline management.

#### 2C. Promos — `app/api/promos/route.ts`

| Method | Path | Action Function | Description |
|--------|------|-----------------|-------------|
| GET | `/api/promos` | *(new query)* | List promo watches |
| POST | `/api/promos` | `createPromo` | Add a promo watch |
| DELETE | `/api/promos/[id]` | `deletePromo` | Remove a promo watch |
| DELETE | `/api/promos` | `clearAllPromos` | Remove all promo watches |
| POST | `/api/promos/import` | `importPromos` | Batch import promos from CSV |

**Rationale:** Promo management is a key feature for retail CRM. External inventory systems could sync promos automatically.

#### 2D. Tags — `app/api/tags/route.ts`

| Method | Path | Action Function | Description |
|--------|------|-----------------|-------------|
| GET | `/api/tags` | *(new query)* | List all tags with usage counts |
| POST | `/api/tags` | `createTag` | Create a new tag |
| DELETE | `/api/tags/[id]` | `deleteTag` | Delete a tag |
| POST | `/api/clients/[id]/tags` | `addTag` | Add tag to client |
| DELETE | `/api/clients/[id]/tags/[tagId]` | `removeTag` | Remove tag from client |

**Rationale:** Tag taxonomy management is needed for external categorization tools.

#### 2E. Templates — `app/api/templates/route.ts`

| Method | Path | Action Function | Description |
|--------|------|-----------------|-------------|
| GET | `/api/templates` | *(new query)* | List outreach templates |
| POST | `/api/templates` | `createTemplate` | Create a template |
| DELETE | `/api/templates/[id]` | `deleteTemplate` | Delete a template |

**Rationale:** Template management for external content tools.

#### 2F. Smart Lists — `app/api/smart-lists/route.ts`

| Method | Path | Action Function | Description |
|--------|------|-----------------|-------------|
| GET | `/api/smart-lists` | *(new query)* | List smart lists |
| POST | `/api/smart-lists` | `createSmartList` | Create a custom smart list |
| PATCH | `/api/smart-lists/[id]` | `renameSmartList` | Rename a smart list |
| POST | `/api/smart-lists/[id]/duplicate` | `duplicateSmartList` | Duplicate a smart list |
| DELETE | `/api/smart-lists/[id]` | `deleteSmartList` | Delete a smart list |

**Rationale:** List management for external segmentation tools.

---

### Priority 3 — Advanced Operations

Complex or bulk operations useful for scripting but less critical for real-time integrations.

| Method | Path | Action Function | Description |
|--------|------|-----------------|-------------|
| POST | `/api/clients/merge` | `mergeClients` | Merge two client records |
| PATCH | `/api/clients/[id]/email-list` | `toggleEmailList` | Toggle email list membership |
| POST | `/api/unsubscribe` | `addUnsubscribeEmail` | Add email to unsubscribe list directly |
| POST | `/api/rvx/import` | `importProspectsFromRvx` | Batch import prospects from RVX CSV |
| GET | `/api/rvx/analyze` | `analyzeRvxImport` | Preview RVX CSV import results |

---

### Skip — Not Suitable for API

These actions are UI-only or internal helpers:

| Action | Why Skip |
|--------|----------|
| `recalcHeat` | Internal side-effect of other operations, not a standalone action |
| `patchClientFromFormMerge` | UI-specific merge path used only in new-client duplicate flow |
| `changeOwnPassword` | Already covered by `/api/recover` and NextAuth session flow |
| `setSecretQuestion` | UI-only account setup, no external use case |

---

## Implementation Notes

### Pattern

Each new endpoint should follow the existing pattern used in `app/api/clients/route.ts` and `app/api/notes/route.ts`:

1. Import the existing action function from `lib/actions/*`
2. Wrap with `withAuth` or `withManagerAuth` from `lib/api-helpers`
3. Validate input with the same rules the action already uses
4. Return the action's result as JSON

This means minimal new logic — the action functions already contain all validation, auth checks, and DB operations. The API routes are thin wrappers.

### Auth Model

- `withAuth` — any authenticated user (manager or associate)
- `withManagerAuth` — manager role required
- Associate scoping is handled inside the action functions (e.g., associates can only see/modify their own clients)

### Summary Stats

| Metric | Count |
|--------|-------|
| Total server actions | 47 |
| Already covered by API | ~1 |
| Proposed new endpoints | ~40 |
| Skip (UI-only) | ~5 |
| New route files needed | ~9 |
| Existing routes to extend | ~3 |

### Estimated Effort

| Priority | New Routes | Extended Routes | Effort |
|----------|-----------|-----------------|--------|
| Priority 1 | 3 (outreach, approvals, client status) | 1 (clients) | ~1 day |
| Priority 2 | 6 (prospects, promos, tags, templates, smart-lists) | 1 (employees) | ~1 day |
| Priority 3 | 2 (merge, rvx-import) | 0 | ~0.5 day |
| **Total** | **11** | **2** | **~2.5 days** |

Each endpoint is a thin wrapper around an existing action function. The heavy lifting (validation, auth, DB ops) is already done.
