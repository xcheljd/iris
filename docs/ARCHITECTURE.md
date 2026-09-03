# Iris Architecture

**Last updated:** 2026-08-14

## Overview

Iris is a single-tenant, self-hosted CRM for retail clienteling — inventory organized by model number and collection (watches, jewelry, luxury goods). Next.js App Router on top of SQLite (better-sqlite3, WAL), with credential-based auth.

```
Browser
  |
  v
Next.js (App Router, RSC)
  |-- Server Components       (data fetching, SSR)
  |-- Client Components       (forms, dialogs, interactivity)
  |-- Server Actions          (mutations — lib/actions/*.ts, ~85 exports)
  |-- API Routes              (REST — see "API Surface")
  |
  v
Drizzle ORM
  |
  v
SQLite (better-sqlite3, WAL, foreign keys ON)
  File: data/iris.db
```

## Data Model

### Entity Relationship

```
employees ─────────────────────────────────────────────────────┐
  id, username, passwordHash, role, active, onboardingState     │
    │                                                            │
    │ 1:N                                                        │ 1:N
    v                                                            v
clients                                                      outreach_logs
  id, firstName, lastName, phone, email,                       id, clientId, employeeId
  customerId, employeeId ─────────────> employees              method, date, outcome
  preferredContact ("call"|"text"|"email"),                    purchasedModel, notes
  productsOfInterest (JSON ProductOfInterest[]),               followUpDate, completed
  tags (JSON string[]),                                        templateId
  status, source, birthday, anniversary,                          │
  onEmailList, heatScore, heatLevel,                              │
  lastOutreachAt, lastPurchaseAt, lastViewedAt,                   v
  deletedAt, deletedBy, previousStatus                       outreach_templates
    │                                                            id, name, subject, body
    │ 1:N                                                        channel, isDefault
    v
activity_events
  id, clientId, employeeId, eventType
  metadata (JSON), createdAt

ProductOfInterest = { model, collection, brand, intent }
  intent: "interested" | "promo" | "arrival"
  model & collection use derive-at-read from model_catalog —
  the stored values are only a fallback for uncatalogued models.

client_tags                      smart_lists
  id, name (unique), color         id, name, ownerId, filters (JSON)
  usageCount                       sort, isShared, isBuiltIn

promo_watches                    promo_matches
  id, modelNumber, collection,     id, clientId, promoId
  brand,                           matchType ("model" | "collection")
  msrp, discountPercent,           uniq (clientId, promoId)
  discountPrice,                   (brand-match retired in ffee6fc;
  sizeOneQty, sizeTwoQty,           tags express brand interest)
  promoStart, promoEnd
                                 model_catalog
                                   model (PK, uppercase),
                                   collection, source ("curated"|"promo"|"manual"),
                                   brand, msrp, msrpSeenAt,
                                   needsReview,
                                   flaggedCollection, flaggedSource, flaggedAt

banned_customers                 unsubscribe_list
  id, customerId, firstName,       id, email (unique), unsubscribedAt
  lastName, email, phone,
  banReasonCategory, banDate,
  address, city, state, zip,
  businessName, notes

rvx_import_batches               prospects
  id, importedBy, importedAt,      id, rvxCustomerId, rvxStoreId, rvxSpend,
  totalRows, distinctClients,      importBatchId ──> rvx_import_batches,
  status, error                    firstName, lastName, phone, email,
                                   status ("active"|"graduated"|"unsubscribed"|"rejected"),
                                   productsOfInterest (legacy JSON string[]),
                                   graduatedToClientId ──> clients,
                                   notes, birthday, anniversary

approval_requests
  id, requesterId, action,
  payload (JSON), status, approvedBy, decidedAt
```

### Key Design Decisions

- **Model catalog is authoritative.** `model_catalog` (uppercase model PK) is the source of truth for brand and collection. Client POI rows store `model`/`collection` literally, but readers resolve `(collection, brand)` from the catalog when present — this is what insulates the UI from HQ's week-to-week label drift (e.g. "Sentinel Dive" → "Sentinel Aqualand" for the same SKU).
- **Catalog precedence is `curated > promo > manual`.** `curated` (manager-set or RVX Selling Analysis import) wins. A disagreeing **promo** import flags via `flaggedCollection` instead of overwriting — both curated *and* previously-promo-set rows are sticky. Manual is provisional; gets cleared on the next promo or curated touch.
- **Tags and products of interest** are JSON columns on the client row, not junction tables. Fine for the current scale (~3K clients) but limits structured querying — POI is indexed only by client.
- **Heat score** is denormalized (`heatScore`, `heatLevel`) and recalculated on mutations rather than at query time.
- **Follow-ups** aren't a separate table — they're `outreach_logs` rows where `followUpDate` is set and `completed = false`.
- **Activity events** are append-only.
- **Soft deletes** apply to clients (`status = "deleted"` + `deletedAt`/`deletedBy`); managers can restore from Settings. Banning sets `status = "banned"` and creates a `banned_customers` row.

### Schema Source

All table definitions in `lib/db/schema.ts`. Types inferred via Drizzle (`typeof table.$inferSelect`). Schema deltas applied at boot via `lib/db/ensure-schema.ts` (`ensureModelCatalog`, `ensureClientColumns`, `ensurePromoColumns`) — the repo has no migration framework; dev-stage policy is schema + boot-time `ALTER` + reseed.

## Authentication & Authorization

### Flow

```
Login (/login)
  │
  v
NextAuth CredentialsProvider
  ├── Lookup employee by username
  ├── Verify active = 1
  └── bcrypt.compare(password, passwordHash)
  │
  v
JWT session (30-day expiry; token.id, token.role)
  │
  v
Middleware (middleware.ts)
  └── Protects all routes except /login, /api/auth/*, /api/recover
```

### Server Action Gating

Role checks live at the action layer in `lib/actions/_shared.ts`:
- `requireAuth()` — any logged-in employee
- `requireManager()` — manager only
- `isSessionEmployeeStale(userId)` — guards against orphan JWTs after a DB re-seed (see commit `b273e32`)

All mutating actions go through one of the gates. API routes mirror the same checks via `getServerSession` + role inspection.

## Application Layer

### Server Actions

Lives under `lib/actions/` as 20 modules; `lib/actions.ts` is the public barrel. ~88 exported functions. Key groups:

| Module | Purpose |
|--------|---------|
| `clients.ts` | createClient, updateClient, deleteClient, transferClient, mergeClients, ban/unsubscribe/restore |
| `promos.ts` | createPromo, **importPromos** (per-row brand, catalog-resolved), **resolvePromoRows** (preview without write), deletePromo, clearAllPromos |
| `model-catalog.ts` | recordModelCollection (sticky promo policy), recordProductsOfInterest, getCatalogIndex(WithMsrp) |
| `catalog.ts` | correctCatalog, resolveFlag, confirmCatalogRow(s), deleteCatalogRow(s), clearCatalog |
| `catalog-import.ts` | analyzeCatalogRvx, **importCatalogRvx** (RVX Selling Analysis "By Style" XML) |
| `rvx-import.ts` | analyzeRvxImport, importProspectsFromRvx (customer CSV → prospects) |
| `prospects.ts` | graduateProspect, rejectProspect, unsubscribeProspect |
| `outreach.ts` | logOutreach, markFollowUpComplete, rescheduleFollowUp |
| `tags.ts` | addTag, removeTag, createTag, deleteTag |
| `templates.ts` | template CRUD |
| `smart-lists.ts` | smart list CRUD + duplicate |
| `employees.ts` | employee CRUD, role/active toggle, password reset, change own password |
| `approvals.ts` | requestApproval, approveRequest, denyRequest |
| `onboarding.ts` | updateOnboardingState (tour progress + hint dismissals) |
| `bulk-clients.ts` | bulkAddTags, bulkRemoveTags, bulkReassignOwner, bulkSetEmailList, bulkBanClients, bulkUnsubscribeClients, bulkDeleteClients |
| `*-csv-export.ts` | clients, collections, matched-clients, email-recipients CSV exports |

### Promo Matching

When a promo is added (`createPromo`, `importPromos`), the matcher:

1. Loads all non-deleted clients + the catalog index.
2. For each client's POI, **resolves model/collection through `model_catalog`** when known — stored POI values are ignored if the catalog has a different value.
3. Emits `promo_matches` rows with `matchType` of `"model"` or `"collection"`.

Brand-only interest no longer matches (commit `ffee6fc` retired brand-level matches — they fired indiscriminately and confused associates). Brand interest now lives in **tags + Smart Lists**.

Matches are cached, not recomputed at read time. They regenerate on promo writes and on catalog corrections (`correctCatalog` cascades to `promo_matches`).

### Promo PDF Import

`lib/promo-pdf-parser.ts` extracts positioned text via `pdfjs-dist`'s text layer (the PDFs HQ ships are exported from Excel; they carry an embedded text layer, so this is bit-exact, not OCR). Per page:
- Page header gives the date range and the `X% OFF` column label → discount %.
- Each row's `MODEL`, `COLLECTION`, `MSRP`, sale price.
- Brand is taken from the filename as a hint; final brand is resolved per-row from the catalog (see below).

The dialog (`components/promo/import-promo-dialog.tsx`):
1. Parses the PDF client-side.
2. Calls `resolvePromoRows()` which returns per-row resolution against `model_catalog` (ready / uncatalogued / collection mismatch / msrp low).
3. Manager bulk-assigns brand for uncatalogued rows.
4. `importPromos` writes catalog-resolved brand/collection to `promo_watches`; the PDF's collection still goes through `recordModelCollection("promo")` so the sticky-flag pipeline fires for HQ relabels.

### POS Report Catalog Import

The catalog import accepts "Selling Analysis By Style" SpreadsheetML exports — the report format used by retail POS platforms (built against KWI's export; any platform emitting the same SpreadsheetML shape works). The report feeds `model_catalog` at `source = "curated"`, overwriting brand/MSRP/collection on every match. The catalog-import dialog includes a static reminder of the source filter set (Client = All, Suppress Zeros = No, Stores = All, widest date range) and a post-analyze narrowness warning when >30% of previously-curated models are missing from the new file.

Parser (`lib/rvx-catalog-parser.ts`) dedupes by Vendor Style and prefers rows with the most info (brand + msrp) — the wider "Client = All" filter emits one row per (style, color) tuple but the catalog is keyed by style alone.

### Heat Scoring

Defined in `lib/heat-score.ts`. Score range 0–100. Levels: Hot (70+), Warm (40–69), Cold (<40). Recalculated via `recalcHeat()` on outreach logged, purchase recorded, tag change, and email-list toggle.

## Database

- **Engine:** SQLite via better-sqlite3
- **Connection:** `lib/db/index.ts` (single connection)
- **PRAGMAs:** `journal_mode = WAL`, `foreign_keys = ON`
- **Migrations:** Schema-first via `drizzle-kit push` + boot-time `ensure-schema` ALTERs
- **Seeding:** `lib/db/seed.ts` — employees, sample clients, outreach logs, tags, templates, promos, prospects, RVX import batch. Deterministic since 2026-08-14: a seeded PRNG (override with `SEED=<n>`) replaces `Math.random()` and heat is computed by `calcHeatScore`, not reimplemented inline.
- **FTS:** `lib/db/fts-setup.ts` builds `clients_fts` virtual table + sync triggers

## UI Architecture

### Layout

```
app/(app)/layout.tsx
  SidebarProvider
    AppSidebar             — Navigation sidebar (collapsible, role-aware)
    SidebarInset
      main                 — Page content
    CommandPalette         — Ctrl+K global search/actions
    MobileNav              — Bottom nav bar on mobile
    TourTooltip            — Onboarding spotlight tour
    HintManager            — Contextual one-time hints
```

### Component Conventions

- shadcn/ui (New York style) for primitives in `components/ui/`. Dark mode default via `next-themes`.
- "use client" components that take callbacks suffix prop names with `Action` (Next 15 RSC plugin convention) — applied repo-wide.
- No global state library. State flows via server-rendered props, local `useState`, URL params, and `revalidatePath`.

## API Surface

### REST Endpoints (`app/api/**`)

| Method | Path | Purpose |
|--------|------|---------|
| GET / POST | `/api/clients` | List / create client |
| GET / PUT | `/api/clients/[id]` | Read / update single client |
| GET | `/api/clients/check-duplicates` | Real-time duplicate detection on create/edit |
| GET | `/api/catalog` | Catalog rows (for the model-catalog page) |
| GET | `/api/employees` | List employees |
| GET / POST / DELETE | `/api/notes` | Activity-event notes |
| GET | `/api/search?q=` | FTS-backed client search |
| GET | `/api/approvals/count` | Manager approval queue size (badge) |
| GET | `/api/backup/download` | Download `iris.db` (manager) |
| POST | `/api/backup/restore` | Restore `iris.db`, swap, restart |
| POST | `/api/recover` | Password recovery (unauthenticated) |
| POST | `/api/auth/[...nextauth]` | NextAuth handler |

The bulk of mutations live in Server Actions (see "Application Layer"). `REST-API-EXPANSION.md` proposes lifting more actions to REST endpoints for mobile/scripting consumers; not started.

## Backup & Restore

Settings → Backup tab (managers only):
- **Download** — exports `iris.db` via the browser's native save dialog (Chrome/Edge File System Access API; `<a download>` fallback)
- **Restore** — uploads a `.db`, validates the SQLite magic bytes, atomically swaps, saves the previous DB as `iris.db.bak`, then `process.exit(0)`s so PM2/systemd restarts the process
- **Weekly reminder** — dialog appears every Monday when the last backup is >7 days ago (stored in `localStorage`)

## Onboarding

Built in-app (no external tour libs):
- **Guided tour** — auto-triggers on first login. 8 base steps for associates, 12 for managers (extra: Approvals, Employee Management, Backup, Analytics). Progress persisted to `employees.onboarding_state` JSON. Replayable from Settings → Onboarding.
- **Contextual hints** — one-time hints on `/clients`, `/clients/[id]` (Edit, Log Outreach), and Command Palette. Dismissed permanently on first interaction.

## Security Posture

All findings from both code reviews (CODE-AUDIT-FINDINGS — 84 items, CODE-REVIEW-2026-05 — 74 + 7 residuals, CODE-QUALITY-REVIEW-2026-05 — 20 items) are resolved. See `docs/Archive/`.

Standing guarantees:
- SQL injection prevented by Drizzle parameterized queries
- Passwords bcrypt-hashed (cost 10); never returned by any API
- Server actions gated by `requireAuth`/`requireManager`; routes mirror the checks
- WAL + foreign keys on; no orphan FKs in the wild
- CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy set in `next.config.mjs`
- Server Actions body limit raised to 25 MB to accommodate RVX's Client=All export (~13 MB)

Standing gaps (intentional, documented):
- No CSRF tokens on REST routes (CredentialsProvider + same-site cookie + manager-only writes)
- No rate limiting on `/login` or `/api/recover` (single-tenant, internal network)
- No database indexes on `productsOfInterest` JSON (~3K clients; full-scan is fine)
