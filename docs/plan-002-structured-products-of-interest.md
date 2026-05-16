# Plan 002: Structured Products of Interest + Model Catalog

## Summary

Replace the free-text `clients.productsOfInterest: string[]` with structured
`ProductOfInterest[]` (`{ model, collection }`), and introduce a durable,
self-accumulating `model_catalog` table fed by both promo writes and client
interest entries. Enforce uppercase model numbers via a shared
`normalizeModel()`. Rewrite promo matching to use exact field comparisons
instead of whole-string equality / substring scans.

**Prospects are out of scope** — `prospects.productsOfInterest` stays
`string[]`. A prospect has no structured model/collection interest until an
associate graduates them and enters it on the client.

Development stage: **no data migration.** Schema + code + seed change, drop/
recreate the dev DB, reseed. No backfill script, no dual-read normalizer.

## Current State

- `clients.productsOfInterest` (`schema.ts:53`) and
  `prospects.productsOfInterest` (`schema.ts:225`) are
  `text(..., { mode: "json" }).$type<string[]>()` — free text like
  `"IX1002-01X"` or `"Solaris IX1002-01X"`.
- Collection is **inferred at read time** by `lib/collections.ts`
  (`resolveCollection`: `MERIDIAN_COLLECTIONS` substring → `promoWatches`
  model lookup), threaded as `FullClient.collectionMap` and into the
  analytics Collections page (commit `a36a72a`).
- Promo matching (`lib/actions/promos.ts`): model match requires the **whole
  poi string** to equal the model number (so `"Solaris IX1002-01X"` fails
  to match `IX1002-01X`); collection match is a `.includes()` substring scan
  (false positives: `"Octa"` ⊂ `"Octa 770"`).
- `promoWatches` is a **weekly scratch table** ("Clear All & Reset"), so
  read-time inference from it is volatile.
- `graduate-prospect-dialog.tsx` seeds a product list from the prospect's
  free-text `productsOfInterest` and writes it to the new client.
- Validation: `lib/validation/client.ts:23,45` uses `z.array(z.string())`.

## Success Criteria

1. `clients.productsOfInterest` is `ProductOfInterest[]` where
   `ProductOfInterest = { model: string | null; collection: string | null }`.
2. Each entry satisfies **at least one of `model` / `collection`** non-empty.
   An empty array is valid (email-only client).
3. Three valid forms work end-to-end: model+collection, collection-only
   (whole-collection interest), bare model.
4. Model numbers normalized to uppercase on every client write path.
5. `model_catalog` accumulates `{model → collection}` from promo
   create/import **and** client entries that carry both fields; it survives
   "Clear All & Reset".
6. Catalog conflict policy: promo source authoritative (overwrites); manual
   entry fills only when the model is absent, never overwrites; mismatch
   surfaced, not silently applied.
7. Promo matching uses exact `product.model === promo.modelNumber` and
   `product.collection === promo.collection`. Collection-only interests match
   by collection.
8. Interests tab + analytics read `product.collection` directly — no
   read-time inference; `FullClient.collectionMap` removed.
9. **Graduation is an editable client step**: the graduate dialog presents
   editable client fields including the structured products-of-interest
   editor (same component as the client forms). The prospect's existing
   free-text strings are shown as **read-only reference hints** beside the
   editor; the associate enters structured entries. The new client is
   created with structured data; catalog upsert applies.
10. `prospects.productsOfInterest` unchanged (`string[]`); prospect display
    and RVX import untouched.
11. `tsc` clean; full vitest suite green (fixtures + assertions updated).

## Design Decisions (locked with user)

- **Shape**: `{ model, collection }`, both nullable. No `label` — every
  interest must resolve to a model and/or a collection (fuzzy free-text
  interests are not a supported workflow).
- **Per-entry, not per-client** validity. Empty `productsOfInterest: []`
  remains valid; promo-email membership is the orthogonal
  `clients.onEmailList`.
- **Prospects out of scope.** Structured interest is a client concept,
  captured at graduation.
- **Graduation = editable client info step** (incl. structured POI editor);
  prospect free-text shown as read-only hints, not auto-converted.
- **Catalog sources**: promo writes AND client interest entries.
- **Conflict policy**: promo authoritative; manual fill-if-absent only;
  conflicts flagged.
- **Catalog is the lookup source**; `promoWatches` only contributes writes.
  `MERIDIAN_COLLECTIONS` substring match drops to last-resort fallback.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| A read site still assumes `string[]` → runtime crash | TS type change makes most fail at compile; gate on `tsc --noEmit` + full vitest before commit |
| Existing promo-match results change post-rewrite | Intended correctness fix; called out; seed match-seeding rewritten to mirror runtime |
| User typo poisons shared catalog | Conflict policy: manual never overwrites; mismatch flagged |
| Seed / merge / onboarding re-emit old `string[]` shape | All client write paths routed through validation + normalize; covered by tests |
| Collection-only entry mishandled in matching/display | Explicit tests for collection-only match + display |
| `model_catalog` lost on promo "Clear All" | Catalog is a separate table; assert `clearAllPromos` does not touch it |
| Graduation must emit structured data from a `string[]` prospect | Graduation uses the structured editor; prospect strings are reference-only, never written as structured |

## Affected Files

| File | Change |
|---|---|
| `lib/db/schema.ts` | `clients.productsOfInterest` `$type<ProductOfInterest[]>()` (:53); add `modelCatalog` table; export `ProductOfInterest` + `ModelCatalog` types. **`prospects` unchanged.** |
| `lib/normalize.ts` *(new)* | `normalizeModel(s): string` = `s.trim().toUpperCase()` |
| `lib/validation/client.ts` | Replace `z.array(z.string())` (×2, :23/:45) with `productOfInterestSchema` array; model `.transform(normalizeModel)`; `superRefine` "≥1 of model/collection" |
| `lib/actions/model-catalog.ts` *(new)* | `recordModelCollection(tx, model, collection, source)` upsert + conflict policy; `getCatalogMap()` |
| `lib/actions/promos.ts` | `buildPromoClientIndex`/`matchPromoToClients` → structured exact match; `createPromo`/`importPromos` also `recordModelCollection(..., 'promo')`; assert `clearAllPromos` leaves catalog intact |
| `lib/actions/clients.ts` | `applyClientPatch` (:340-360) + merge dedupe (:284) handle structured (dedupe by `model|collection` key); record catalog on entries with both fields |
| `lib/actions/prospects.ts` | Graduation (:59) accepts structured `productsOfInterest` from the dialog; enrichment path (:107-110) unchanged (prospect side) |
| `lib/actions/onboarding.ts` | Demo data (:126) → structured |
| `lib/collections.ts` | Keep `MERIDIAN_COLLECTIONS`; `getModelCollectionMap()` → reads `model_catalog`; `resolveCollection` demoted to input-suggestion helper |
| `lib/queries.ts` | `ClientListRow` type flows from schema; repoint `getModelCollectionMap` body to catalog |
| `components/client-provider.tsx` | `FullClient.productsOfInterest` retyped; **remove `collectionMap`** |
| `components/interests-tab.tsx` | Models = entries with `model`; Collections = distinct `collection`; drop `resolveCollections`/`collectionMap` |
| `app/(app)/analytics/collections/page.tsx` + `collections-content.tsx` | Read `product.collection`; drop `collectionMap` prop + plumbing |
| `app/(app)/clients/[id]/page.tsx` | Drop `collectionMap` build/return |
| `components/products-of-interest-input.tsx` *(new, shared)* | Collection picker (catalog + `MERIDIAN_COLLECTIONS`) + optional model + add/remove of structured entries; used by all client forms and the graduate dialog |
| `components/client-form.tsx` | Use shared structured input; badge render `model — collection` |
| `components/edit-client-dialog.tsx` | `useState<ProductOfInterest[]>`; shared input |
| `app/(app)/clients/[id]/edit/edit-client-form.tsx` | Same |
| `app/(app)/clients/new/page.tsx` | Same |
| `components/graduate-prospect-dialog.tsx` | Editable client fields + shared structured POI editor; show `prospect.productsOfInterest` strings as read-only hint text; write structured to client |
| `app/api/clients/route.ts` | Passes validated structured data through (schema does the work) |
| `lib/db/seed.ts` | Build structured interest pool from `promos` (`:61`) + extra models w/ collections; some collection-only + some empty clients; seed `model_catalog`; rewrite fake prefix promo-match (:201-207) to real model/collection equality |
| `__tests__/components/*`, matching/validation tests | Update client fixtures to structured; add tests (below) |

*Untouched by this plan:* `app/(app)/prospects/[id]/prospect-detail-content.tsx`,
`lib/validation/rvx.ts`, `lib/actions/rvx-import.ts` (prospect side stays
`string[]`).

## New Tests

- `normalizeModel`: lowercase → upper, trims, leaves digits/hyphens.
- Validation: rejects entry with both model & collection empty; accepts each
  of the 3 valid forms; accepts empty array.
- Catalog upsert: promo overwrites; manual fills-if-absent; manual conflict
  does not overwrite and reports mismatch; survives `clearAllPromos`.
- Matching: exact model match (incl. when collection also present);
  collection-only matches by collection; no substring false positives
  (`Octa` vs `Octa 770`).
- Interests tab: collection-only shows under Collections not Models.
- Analytics: counts by stored `collection`; ignores entries without one.
- Graduation: structured entry from the dialog lands on the new client;
  prospect free-text is not written as structured.

## Implementation Order

1. Schema: `ProductOfInterest` type, retype `clients` column, `modelCatalog`.
2. `normalizeModel` + validation schema.
3. `model-catalog.ts` (upsert + conflict policy + `getCatalogMap`).
4. Matching rewrite in `promos.ts` + catalog recording on promo write.
5. Action layer: clients (patch/merge), prospects graduation, onboarding.
6. `lib/collections.ts` repoint; remove `collectionMap` from provider/page/
   analytics; interests-tab + analytics read structured.
7. Shared `products-of-interest-input` component; wire into 4 client forms +
   graduate dialog (with prospect hint display).
8. Seed rewrite (data + catalog + match seeding).
9. `tsc --noEmit`; update test fixtures; add new tests; full vitest.
10. `db:push` (new table; JSON columns need no DDL) → `db:seed` → smoke test.
11. Commit to `main` (local-only repo, no push) per project convention.

## Out of Scope (deferred feature suggestions)

#1 clickable matched clients, #2 match-count badges, #7 Copy Model toast,
#8 collections breadcrumb, #9 post-import match notification, #10 CSV export.
Revisit after this lands.
