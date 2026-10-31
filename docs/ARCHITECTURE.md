# Iris Architecture

**Last updated:** 2026-08-14

## Overview

Iris is a single-tenant, self-hosted CRM for retail clienteling — inventory organized by model number and collection (eyewear, jewelry, apparel, bikes — any store that sells by model). Next.js App Router on top of SQLite (better-sqlite3, WAL), with credential-based auth.

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
  tags (JSON string[]),
  status, source, birthday, anniversary,
  onEmailList, heatScore, heatLevel,
  lastOutreachAt, lastPurchaseAt, lastViewedAt,
  deletedAt, deletedBy, previousStatus
    │
    │ 1:N
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

promo_items                      promo_matches
  id, modelNumber, collection,     id, clientId, promoId
  brand,                           matchType ("model" | "collection")
  msrp, discountPercent,           uniq (clientId, promoId)
  discountPrice,                   (brand-match retired in ffee6fc;
  promoStart, promoEnd              tags express brand interest)
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

import_batches               prospects
  id, importedBy, importedAt,      id, importCustomerId (optional),
  totalRows, distinctClients,      importBatchId ──> import_batches,
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

- **Model catalog is authoritative.** `model_catalog` (uppercase model PK) is the source of truth for brand and collection. Client POI rows store `model`/`collection` literally, but readers resolve `(collection, brand)` from the catalog when present — this is what insulates the UI from HQ's week-to-week label drift (e.g. "Shoreline Dive" → "Shoreline Aqualand" for the same SKU).
- **Catalog precedence is `curated > promo > manual`.** `curated` (manager-set or catalog import) wins. A disagreeing **promo** import flags via `flaggedCollection` instead of overwriting — both curated *and* previously-promo-set rows are sticky. Manual is provisional; gets cleared on the next promo or curated touch.
- **Tags and products of interest** are JSON columns on the client row, not junction tables. Fine for the current scale (~3K clients) but limits structured querying — POI is indexed only by client.
- **Heat score** is denormalized (`heatScore`, `heatLevel`) and recalculated on mutations rather than at query time.
- **Follow-ups** aren't a separate table — they're `outreach_logs` rows where `followUpDate` is set and `completed = false`.
- **Activity events** are append-only.
- **Client status** is `active`, `banned`, `unsubscribed` or `deleted` (`CLIENT_STATUS_VALUES` in `lib/db/schema.ts`). Status changes only through the ban / unsubscribe / delete flows, never through a profile edit. Databases from before `inactive` was removed have those clients set to active at boot (`ensureClientColumns`).
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
| `catalog-import.ts` | analyzeCatalogImport, **importCatalog** (positional Brand/Collection/Model/MSRP rows) |
| `prospect-import.ts` | analyzeProspectImport, importProspects (customer CSV → prospects) |
| `prospects.ts` | graduateProspect, rejectProspect, unsubscribeProspect |
| `outreach.ts` | logOutreach, markFollowUpComplete, rescheduleFollowUp |
| `tags.ts` | addTag, removeTag, createTag, deleteTag |
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

### Spreadsheet Imports (shared engine)

All three imports (catalog, promos, prospects) share `lib/import-grid.ts` and the `components/import/import-source.tsx` input panel:

- **Input:** paste from a spreadsheet (tab-separated), upload a CSV/TSV (comma or semicolon, decimal commas understood), or upload an Excel `.xlsx` (read in the browser with `read-excel-file`). Old `.xls` is refused with a "save as .xlsx or CSV" message. Quoted cells may hold line breaks.
- **Columns:** when the first rows contain a title row, columns are matched by title in any order (each field lists synonyms — e.g. Model = "Style #", "SKU"; MSRP = "Retail"); rows above it (a sheet heading) are skipped. Without titles, fields are read in their documented A, B, C… order.
- **Column check:** before Analyze, the panel shows which column feeds each field (with a picker to change it), warns when a required field has no column or two fields read the same column, and previews the first five rows with their row numbers in the file.
- **Workbooks:** every non-empty sheet is listed with its row count; sheets with a recognised title row start ticked (if none have titles, the first sheet). Each ticked sheet keeps its own column mapping, and all ticked sheets import together. Messages name the sheet ("Vellamy sheet, row 7"); a model on two sheets is flagged and the later row wins. A workbook with only one sheet of data reads like a plain file.
- **Hand-off:** the panel re-writes the confirmed mapping as canonical CSV (titles + `Source row`, plus `Source sheet` for workbooks) — the server actions parse that text, so error messages quote the row number from the manager's original file.
- **Templates:** each dialog offers a "Download template" CSV with the right titles and example rows.

### Promo Import

Fields: **A Brand, B Collection, C Model, D MSRP, E Sale price, F Discount %** (`lib/promo-import-parser.ts`). A–D match the catalog layout, so one spreadsheet can feed both. Discount % accepts `50`, `50%` and `.5`. When only one of sale price / % is given, `fillDiscount` computes the other from the MSRP — the file's, or the catalog's when the sheet leaves MSRP blank (`resolvePromoRows` and `importPromos` both apply it). Promo start/end dates are picked in the dialog.

Per-row warnings shown in the preview (none block the import): unknown brand, negative amounts, % outside 0–100, model numbers Excel shortened to scientific notation, a model repeated in the file (the last row wins), and `priceIssues` against the effective MSRP — sale price at or above MSRP, sale price and % disagreeing by more than a point, a % under 1 (probably meant as a fraction). Rows with no model are reported and skipped ("looks like a totals row" when they say Total).

The dialog (`components/promo/import-promo-dialog.tsx`):
1. Parses the mapped rows client-side.
2. Calls `resolvePromoRows()` which returns per-row resolution against `model_catalog` (ready / needs brand / collection mismatch / msrp low / price issues), a brand suggestion for each row without a catalog brand, and `sheetBrandMismatch` when the sheet's brand disagrees with the catalog's (the catalog's is used and the row is flagged).
3. Rows the catalog has no brand for get a brand picker each (see **Brand assignment** below); the manager can tick rows and set one brand for all of them.
4. `importPromos` writes catalog-resolved brand/collection to `promo_items` and, with **Save brands to the catalog** (on by default), files each picked brand on its catalog model (never over an existing catalog brand); the file's collection still goes through `recordModelCollection("promo")` so the sticky-flag pipeline fires for relabels.

### Catalog Import

Fields: **A Brand, B Collection, C Model, D MSRP**. Rows feed `model_catalog` at `source = "curated"`, overwriting collection on every match; a blank brand or MSRP cell keeps the existing value. After analyze, the dialog shows a narrowness warning when >30% of previously-curated models are missing from the new file.

Parser (`lib/catalog-import-parser.ts`) dedupes repeated models and keeps the row with the most info (brand + msrp). Unknown brands are reported per row and left unchanged.

### Prospect Import

Fields: **A First name (required), B Last name, C Phone, D Email, E Customer #** (`lib/prospect-import-parser.ts`). Phones are stored as digits; emails that don't look like an address are imported as given with a warning.

### Brands

Each store keeps its own brand list (`brands` table, **Settings → Brands**, managers only). The five fictional brands are sample data written by the seed. Rows that use a brand (`model_catalog.brand`, `promo_items.brand`, clients' `products_of_interest[].brand`) store its name: **renaming** a brand rewrites all of them in one transaction (`renameBrand`); **removing** one is refused while anything still uses it. On first boot of an existing database, `ensureBrandsTable` fills the list from the brands already in use. The list reaches client components through `BrandsProvider` / `useBrands()` in the app layout; server code reads it with `getBrandNames()` (`lib/brands.ts`). `lib/brand-match.ts` matches names ignoring capitals and punctuation and offers the closest listed brand for a typo.

**Promo matching.** `lib/promo-match.ts` matches a promo to clients by exact model (normalized), then by collection; every interest intent matches; banned, unsubscribed and deleted clients never match. A promo runs until the day after its end date (no end date = until cleared; not-yet-started promos match and show "starts <day>"), per `lib/promo-active.ts`. Matches are made on import / hand-add (a promo that has already ended imports unmatched) and re-checked by `rematchClientPromos` after anything that changes a client's interests or matchability: create (API), edit, prospect graduation, form merge, client merge, unban, resubscribe, restore, catalog changes. The re-check reconciles (adds missing, drops stale, keeps the rest with their id and date) and never touches matches to ended promos. Ban and unsubscribe delete the client's matches. A logged purchase drops the buyer's matches on that model (`clearPurchasedMatches`). Reads use `workableMatch` (lib/queries.ts): contactable client (status and suppressed email), promo not ended, and one row per client per item — the promo with the bigger discount wins. Matched Clients, its CSV and the per-promo counts all share it. The Matched Clients tab groups those rows into one row per client on the shared `DataTable` (`expandable`: chevron column, Expand all, child rows per item under the same columns, closed by default, pages count clients); the CSV stays one row per item. Hand-added promos join `currentPromoPeriod()`; with no promo running the dialog asks for dates. `cleanupPromoMatches` removes leftovers from older versions once at boot.

**Duplicates in imports.** Parsers keep every row; a model on more than one row (same sheet or across sheets) is a duplicate. Promo rows also clash with a promo already in Iris for the same model and the same promo dates. `components/import/duplicate-picker.tsx` shows every copy side by side (sheet, row, brand, collection, MSRP, sale, discount — values all copies share are dimmed), with per-model picks, row selection and apply-to-all shortcuts (bigger/smaller discount, keep what's in Iris, use new, most complete row, first/last, skip). Import is disabled until every duplicate is picked, and the server refuses too: `importPromos` rejects a repeated model or an unreplaced same-dates clash (`replacePromoIds` deletes the replaced promos in the import transaction); `importCatalog` takes `duplicatePicks` (row key or skip) via `applyCatalogPicks`. Skip is offered for in-file duplicates; against Iris the choice is keep existing or replace.

**New brands from imports.** Both imports list the brands a file names that aren't in the list yet (`findNewBrands` in `lib/new-brands.ts`), so a first import into a blank database builds the brand list instead of dropping every brand. Each shows its row count; spellings close to a listed brand or to a more common new one ("Aldremoor" next to "Aldermoor") start unticked with "did you mean…". Ticked brands are treated as listed in the preview (`extraBrands`) and added in the import's own transaction (`addBrands` → `addBrandsTx`); nothing is saved by previewing.

### Store name

Each store names itself (**Settings → Store**, managers only). The name lives in the `meta` table (`store_name`), read by
`getStoreName()` (`lib/store-name.ts`) and saved by `setStoreName` (`lib/actions/store.ts`, trimmed, 1–60 characters). It
shows under "Iris" in the sidebar and in the browser tab ("Store · Iris"). Until it is set, the sidebar says "Your store",
the tab says "Iris", and a manager's dashboard shows a **Name your store** card. The sample data is a fictional sunglasses
shop, Sol & Shade Eyewear.

### Brand assignment (imports)

Shared by the promo and catalog imports (`lib/brand-suggest.ts`, `components/import/brand-assign.tsx`). A row the catalog has no brand for gets a brand picker, pre-filled with a suggestion when one fits, with its reason shown underneath. Hints, strongest first: the sheet's Brand column (exact, or the closest listed brand for a typo), a collection the catalog files under exactly one brand, and the workbook sheet's name. When hints disagree, nothing is suggested and the row is flagged as a conflict. Model numbers are never used to guess — every store's numbering differs. Filter chips (Needs brand / Suggested / Conflicts) narrow the list; ticked rows can be set to one brand at once. A suggestion kept without changing it is saved with `needs_review` so it shows in the Model Catalog's review queue; a brand the manager picked is trusted.

### Model Catalog editing

Each row's **Edit** turns its collection, brand and MSRP into inputs (the text boxes are uncontrolled because the table engine re-mounts cells on every render). Ticking rows opens a bar that sets brand, collection or MSRP for the whole selection. Both go through `updateCatalogRows`: a collection change cascades like a correction (clients' interests rewritten, promo matches rebuilt), a brand change rebuilds affected clients' matches, and editing marks the models reviewed.

### Heat Scoring

Defined in `lib/heat-score.ts`. Score range 0–100. Levels: Hot (70+), Warm (40–69), Cold (<40). Recalculated via `recalcHeat()` on outreach logged, purchase recorded, tag change, and email-list toggle.

## Database

- **Engine:** SQLite via better-sqlite3
- **Connection:** `lib/db/index.ts` (single connection)
- **PRAGMAs:** `journal_mode = WAL`, `foreign_keys = ON`
- **Migrations:** Schema-first via `drizzle-kit push` + boot-time `ensure-schema` ALTERs
- **Seeding:** `lib/db/seed.ts` — employees, sample clients, outreach logs, tags, promos, prospects, prospect import batch. Deterministic since 2026-08-14: a seeded PRNG (override with `SEED=<n>`) replaces `Math.random()` and heat is computed by `calcHeatScore`, not reimplemented inline.
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
- Server Actions body limit raised to 25 MB to accommodate large catalog files

Standing gaps (intentional, documented):
- No CSRF tokens on REST routes (CredentialsProvider + same-site cookie + manager-only writes)
- No rate limiting on `/login` or `/api/recover` (single-tenant, internal network)
- No database indexes on `productsOfInterest` JSON (~3K clients; full-scan is fine)
