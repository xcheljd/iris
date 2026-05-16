# Plan 003: Interest Intent + Unified Interests Table + Catalog Correction (A/B/C)

One combined plan (interview decision). Builds on shipped plan-002
(structured `productsOfInterest`, `model_catalog`, promo-authoritative /
manual-fill-if-absent policy, boot-time `ensure-schema`).

## Decisions locked in interview

| Topic | Decision |
|---|---|
| Interest intent | Per-entry `intent: "interested" \| "promo" \| "arrival"`. **Must be picked on add** (no default). |
| Intent vs matching | **Filter/label only** — promo matching logic unchanged; intent is a sort/filter dimension. |
| Arrival | No triggers now (manual model search on shipment). Data + filter/search only; future inventory/arrival hooks explicitly out of scope. |
| Unified table | One row per interest entry. Columns: Intent · Model · Collection · Promo (derived). Sort + per-column funnel filters. Replaces the Models/Collections/Promo-Matches sub-tabs. |
| Collection-only row | Promo cell looks up active promos by that collection; if any, status = **"Select models"** affordance to pin a specific promo model as a new/edited entry. |
| Promo-only matches | NOT rows in this table (remain in Promo Manager). |
| Entry RBAC | **Managers only diverge.** Known model → collection autofilled & locked to catalog for associates; managers may edit (triggers the inline fix). No per-client override path. |
| Inline conflict (A) | Manager entering a known model with a different collection gets: **Use cataloged X** / **Fix catalog → Y**. Fix updates catalog (curated) + cascades. |
| Catalog correction authority | Manager correction sets `source="curated"`. Precedence **curated > promo > manual**. A promo import disagreeing with a curated row does **not** overwrite — it is **flagged** for review in /catalog. |
| Cascade on correction | **Steamroll + re-match.** Correcting model M's collection rewrites the collection on every client entry with model M, then recomputes promo matches for those clients. No per-entry marker. |
| Catalog data to forms | **Hybrid** — server-prop map into forms + refetch via API after a /catalog edit. |
| Screen B location | **Standalone manager-gated `/catalog` route.** |
| Sequencing | Single Plan 003. |

## Success Criteria

1. `ProductOfInterest` = `{ model, collection, intent }`; `intent` required
   (`interested|promo|arrival`); still ≥1 of model/collection.
2. Every add-entry UI forces an explicit intent choice; entry cannot be
   added without one.
3. Client-detail Interests tab is a single table (Intent · Model ·
   Collection · Promo), sortable per column, with funnel filters per
   column. Promo cell is derived; collection-only rows with matching
   active promos show a "Select models" affordance. Promo-match actions
   that exist today (Log Outreach, Copy Model, Copy Template) remain
   reachable for promo-hitting rows. Old sub-tabs removed.
4. Known model at entry: collection autofills from catalog; associates
   locked to it; managers can change it via the inline fix dialog
   (Use cataloged / Fix catalog → cascade).
5. `/catalog` (manager-only) lists every model→collection with `source`
   (promo/manual/curated), search, and inline correction. Correcting a
   row sets `curated`, cascades the new collection to all client entries
   with that model, and recomputes those clients' promo matches.
6. Promo create/import that disagrees with a `curated` row does not
   overwrite it; it records a flag visible in `/catalog`; manager can
   accept (→ promo value) or keep curated, clearing the flag.
7. Forms refetch the catalog map after a `/catalog` correction so an
   open form reflects the new value without a full reload.
8. Promo matching semantics for clients are unchanged by intent.
9. Seed produces intents across all three values incl. collection-only
   and empty-interest clients; `tsc` clean; full vitest green incl. new
   tests below.

## Architecture / Design

### Data model (`lib/db/schema.ts`)
- `ProductOfInterest` → `{ model: string|null; collection: string|null; intent: "interested"|"promo"|"arrival" }`. Export `INTEREST_INTENT_VALUES`.
- `modelCatalog.source` enum gains `"curated"` (app-level only; column is
  TEXT, no DB change).
- `modelCatalog` gains nullable flag columns for the **latest** pending
  promo-vs-curated conflict (one per model; a newer conflicting promo
  import overwrites the pending flag): `flaggedCollection TEXT`,
  `flaggedSource TEXT`, `flaggedAt INTEGER`.
- Resilience: readers treat a missing/absent `intent` on an entry as
  `"interested"` (defensive — guards any row read before a reseed).
- `ensure-schema.ts`: keep `CREATE TABLE IF NOT EXISTS`; add idempotent
  `ALTER TABLE model_catalog ADD COLUMN ...` guarded by
  `pragma_table_info` (the repo's existing self-heal pattern in
  fts-setup.ts) so existing dev DBs gain the flag columns on boot.

### Validation (`lib/validation/client.ts`, `rvx.ts`)
- `productOfInterestSchema`: add `intent` (zod enum, required, no
  default). Keep model normalize + ≥1-of-model/collection refine.

### Catalog actions (`lib/actions/model-catalog.ts`)
- `recordModelCollection`: add `curated` to precedence. New rules:
  - unknown model → insert with given source.
  - `promo` write vs existing `curated` → **do not overwrite**; set
    `flagged*` columns; return `{ flagged }`.
  - `promo` vs `promo|manual` → overwrite (as today).
  - `manual` → fill-if-absent only (as today).
  - new `curated` (manager) → always write `source="curated"`, clear any
    `flagged*`.
- New `correctCatalog(model, collection)` server action
  (`requireManager`): upsert `curated`; in one transaction cascade
  `clients.productsOfInterest` (every entry with that model →
  collection = new value) and recompute promo matches for the affected
  client set: delete those clients' `promo_matches`, build a
  `buildPromoClientIndex` over **only the affected clients**, then loop
  active `promoWatches` calling the existing `matchPromoToClients` —
  exact reuse of `promos.ts`, no matcher duplication;
  log an `activity_events` row per affected client; clear flag.
- `listCatalog()` / `resolveFlag(model, accept: boolean)` for screen B
  (`resolveFlag(accept)` → accept sets promo value + clears flag; reject
  keeps curated + clears flag).
- `getCatalogMap()` unchanged; reused by the forms API.

### Forms / entry (C + A)
- `ProductsOfInterestInput`: add a required **intent segmented control**
  (Interested/Promo/Arrival); "Add" disabled until intent chosen and
  ≥1 of model/collection. On model blur, look up the passed catalog
  map: if known, set + lock the collection field; managers get an
  "Edit / Fix catalog" affordance opening the inline dialog
  (Use cataloged / Fix catalog → `correctCatalog`). Associates: locked,
  shown "cataloged as X".
- Catalog map delivery: server pages already render the forms; pass
  `getCatalogMap()` as a prop (new `catalogMap` prop threaded like
  plan-002 did, minus the removed `collectionMap`). Add
  `GET /api/catalog` (map JSON) and refetch after `/catalog` mutations
  (hybrid). Forms: new-client page, edit page, edit dialog, graduate
  dialog.

### Unified Interests table (`components/interests-tab.tsx` rewrite)
- One row per `productsOfInterest` entry. Columns: Intent (badge),
  Model, Collection, Promo (derived: does this entry hit an active
  promo — reuse promo data already on `client.matches`/promos).
- Collection-only entry: Promo cell checks active promos for that
  collection; if matches exist → "Select models" control listing those
  promo models, picking one adds/updates a model on the entry.
- Sort: clickable column headers. Filter: per-column funnel
  (Intent = enum facet; Model/Collection = text contains; Promo =
  has/none facet). Client-side (dataset is one client's entries).
- Preserve existing promo-match affordances (Log Outreach via
  `OutreachLogger`, Copy Model, Copy Template) on promo-hitting rows
  (row action menu or expand).
- Remove the three `Tabs`/sub-tabs; keep the card shell.

### Screen B (`/catalog`)
- `app/(app)/catalog/page.tsx` (RSC, manager gate mirroring existing
  manager-only pages) + `catalog-content.tsx` (client). Table of
  model→collection with `source` badge, search, inline edit (→
  `correctCatalog`), and a Flags section listing pending promo-vs-
  curated conflicts with Accept/Keep (`resolveFlag`). Add nav entry
  (manager-only, like Promo Manager).

### Seed (`lib/db/seed.ts`)
- Every generated interest entry gets an `intent` (spread across
  interested/promo/arrival; keep collection-only + empty clients).
- `model_catalog` seed rows stay `source="promo"`; add a couple of
  `curated` examples and one pre-seeded flag to exercise screen B.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Cascade mass-mutates many client rows | One transaction; bounded by client count (hundreds); per-client activity log; integration test asserts entries + matches + log |
| Re-match correctness after cascade | Reuse the exact `promos.ts` index/matcher; test that affected clients' matches equal a from-scratch recompute |
| `curated` flag columns on existing dev DB | Idempotent `ALTER … ADD COLUMN` via `pragma_table_info` guard in ensure-schema (proven repo pattern); verify by drop/boot |
| Unified table loses existing promo actions | Explicit success criterion + test that Log Outreach/Copy buttons render for promo rows |
| RBAC bypass (associate edits catalog via API) | All catalog mutations are `requireManager` server actions; associate UI locks the field; test associate is blocked |
| Stale catalog map in a long-open form | Hybrid refetch after `/catalog` edits; acceptable residual: a form opened before an edit and never refetched (documented) |
| Intent required breaks existing callers | tsc surfaces every construction site; seed/tests/forms updated in same pass |
| Scope size (A+B+C+intent+table) | Sequenced checklist; gate on tsc + full vitest before commit; single commit to `main` per repo convention |

## Affected Files/Areas

- `lib/db/schema.ts` — `ProductOfInterest.intent`, `INTEREST_INTENT_VALUES`, `modelCatalog` source `curated` + flag columns.
- `lib/db/ensure-schema.ts` — idempotent ALTERs for flag columns.
- `lib/validation/client.ts`, `lib/validation/rvx.ts` — `intent` in schema.
- `lib/actions/model-catalog.ts` — curated precedence, flagging, `correctCatalog`, `listCatalog`, `resolveFlag`.
- `lib/actions/promos.ts` — reuse matcher in re-match; promo write path flags curated instead of overwriting.
- `lib/actions/clients.ts`, `prospects.ts`, `onboarding.ts` — carry `intent` through; recordProductsOfInterest unaffected by intent.
- `app/api/catalog/route.ts` *(new)* — GET map; (mutations via server actions).
- `components/products-of-interest-input.tsx` — intent control, catalog autofill/lock, manager inline-fix dialog.
- `components/client-form.tsx`, `edit-client-dialog.tsx`, `app/(app)/clients/new/page.tsx`, `app/(app)/clients/[id]/edit/edit-client-form.tsx`, `components/graduate-prospect-dialog.tsx` — pass `catalogMap`, intent in state, refetch wiring.
- `app/(app)/clients/[id]/page.tsx` — provide `catalogMap`.
- `components/interests-tab.tsx` — full rewrite to the unified table.
- `app/(app)/catalog/page.tsx` + `catalog-content.tsx` *(new)*, nav entry — screen B.
- `lib/db/seed.ts` — intents, curated/flag seed rows.
- Tests (below).

## Test Strategy

- **Unit**: `productOfInterestSchema` requires valid intent / rejects
  missing; `recordModelCollection` curated precedence + flagging matrix
  (unknown/manual/promo/curated combinations).
- **Integration (DB)**: `correctCatalog` cascades collection to all
  client entries with that model and rebuilds their promo matches to
  equal a from-scratch recompute; curated survives a promo import that
  disagrees and produces a flag; `resolveFlag(accept)` applies promo
  value; `resolveFlag(reject)` keeps curated; both clear the flag.
- **RBAC**: associate-session `correctCatalog`/catalog mutations
  rejected; manager allowed.
- **Component**: unified table renders one row per entry with intent
  badge; sort + a funnel filter narrow rows; collection-only row shows
  "Select models" when a matching promo exists; promo row still exposes
  Log Outreach / Copy Model / Copy Template.
- **Fixtures**: extend plan-002 structured fixtures with `intent`.
- Migrate existing fixtures/seed; run `db:seed`; full `vitest run`.

## Validation and Diagnostics

- After impl: `tsc --noEmit` clean (app + tests, excl. remotion-demo);
  full vitest green; `npm run db:seed` succeeds; manual smoke —
  add entries of each intent, known-model autofill+lock as associate,
  manager inline Fix catalog cascades (verify a second client's entry
  + matches changed), `/catalog` correction + flag accept/keep,
  unified table sort/filter and the collection-only "Select models".
- `correctCatalog` logs affected client count + ids (activity events)
  for debuggability.

## Open Questions

- [ ] Flag UI affordance wording/placement in `/catalog` (Accept/Keep) — Can proceed (decide during impl).
- [ ] "Select models" presentation (inline popover list vs expand row) — Can proceed.
- [ ] Whether `correctCatalog` also re-points collection-only entries that textually equal the old collection name — default: **no** (catalog is model-keyed; collection-only entries aren't catalog-bound). Can proceed.
- [ ] Funnel-filter component: reuse an existing table primitive vs lightweight custom — Can proceed (inspect during impl).

## Implementation Checklist

- [ ] Schema: `intent`, `INTEREST_INTENT_VALUES`, catalog `curated` + flag cols; ensure-schema ALTERs; verify drop/boot self-heal.
- [ ] Validation schemas: required `intent`.
- [ ] `model-catalog.ts`: curated precedence + flagging; `correctCatalog` (cascade + re-match + activity log); `listCatalog`; `resolveFlag`.
- [ ] `promos.ts`: promo write flags curated instead of overwriting; re-match reuse verified.
- [ ] Action/seed/onboarding/graduation: thread `intent`.
- [ ] `GET /api/catalog`; thread `catalogMap` prop into the 4 forms + client-detail page; refetch-after-edit.
- [ ] `ProductsOfInterestInput`: intent control + autofill/lock + manager inline-fix dialog.
- [ ] Unified Interests table rewrite (sort, funnel filters, derived promo, collection-only "Select models", preserved promo actions).
- [ ] `/catalog` page + content + nav (manager-gated).
- [ ] Seed rewrite (intents + curated/flag rows).
- [ ] Tests (unit + DB + RBAC + component); migrate fixtures.
- [ ] `tsc` + full vitest + `db:seed`; manual smoke; commit to `main`.
