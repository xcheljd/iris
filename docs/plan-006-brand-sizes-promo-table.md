# Plan 006: Brand + inventory sizes + promo table sort/filter + brand-intent matching

One combined plan (interview). Brand is a shared concept across
`promoWatches` and `clients.productsOfInterest`; promo matching gains a
third match type. Dev-stage: no migration — schema + ensure-schema
self-heal + reseed (as plan-002/003/005).

## Decisions locked (interview)

| Topic | Decision |
|---|---|
| Brand values | `BRAND_VALUES = ["Meridian","Ashford","Voss","Chamberlain"]` (no accents). Display: "Chamberlain" abbreviates to **FC**. Shared by promos and products of interest. |
| Promo brand source | **Per-batch**: chosen once in the Import dialog, applied to all pasted rows; Add-Single has a brand select. Required (no default); a `brand`-headed paste column is **not** used. |
| Size 1 / Size 2 | Two on-hand qty integers (`sizeOneQty`,`sizeTwoQty`), from the paste, default `0` when absent/blank. Sortable; `>0` ("in stock") filter. Add-Single has two number inputs. |
| Promo table default order | **Import/append order** — `getPromos` orders by SQLite `rowid` asc (stable across same-second batch timestamps). |
| Promo table UI | Keep global search; add sortable headers (Model, Collection, Brand, MSRP, Disc%, Sale, Size 1, Size 2) + funnel filters (Brand facet, Collection facet, Price range, Discount range, Size 1 >0, Size 2 >0). Client-side over loaded promos (interests-tab pattern). |
| POI brand | `ProductOfInterest` becomes `{ model, collection, brand, intent }`; `brand` optional. Validity: **≥1 of model/collection/brand**. Enables brand-only interest. |
| Brand matching | **Add `brand` match type now.** `promo_matches.matchType` enum gains `"brand"`; matcher matches a client's brand-interest to a promo's brand. Precedence model → collection → brand (unique row per client/promo preserved). |

## Success Criteria

1. `BRAND_VALUES` exported from schema; `brandLabel()` maps `Chamberlain`→`FC`.
2. `promoWatches` gains `brand` (enum, nullable in DB, required at import/create validation), `sizeOneQty`/`sizeTwoQty` (int, default 0). `ensure-schema` self-heals all three on existing dev DBs.
3. Import dialog: required Brand select; parser maps Size 1/Size 2 columns; `"brand"` removed as a collection synonym. `importPromos(rows, brand, …)` applies the batch brand + sizes. Add-Single: brand select + two size inputs; `createPromo` carries them. Both reject a missing brand.
4. `getPromos` returns rows in insertion order (rowid asc); promo period banner/stats unaffected.
5. Promo table shows Brand (FC-abbreviated) + Size 1 + Size 2 columns; the listed columns sort; the listed funnels filter; global search retained; all combine (AND) and run before pagination.
6. `ProductOfInterest` = `{model,collection,brand,intent}`; `productOfInterestSchema` requires ≥1 of model/collection/brand and a valid `intent`; brand is a valid `BRAND_VALUES` or null. All client write paths + the unified interests table gain a Brand control/column.
7. Matching: `matchType` ∈ {model,collection,brand}; a brand-only interest matches promos of that brand (case-insensitive), only when not already model/collection-matched for that promo. `getPromoMatchCounts`, View Matches, collections/clients exports unaffected in shape (brand rows just flow through).
8. Seed: promos get a brand + size qtys; some POI entries get a brand; promo-match seeding mirrors the runtime matcher (incl. brand).
9. `tsc` clean; full vitest green (fixtures + new tests).

## Architecture / key touch points

- **schema.ts**: `BRAND_VALUES`/`Brand` type; `promoWatches.brand` (`text enum`, nullable — required at validation), `sizeOneQty`/`sizeTwoQty` (`integer`, `.notNull().default(0)`); `promoMatches.matchType` enum add `"brand"`; `ProductOfInterest` add `brand: Brand | null`.
- **ensure-schema.ts**: idempotent `ALTER TABLE promo_watches ADD COLUMN brand TEXT | size_one_qty INTEGER DEFAULT 0 | size_two_qty INTEGER DEFAULT 0` (pragma-guarded). New `ensurePromoColumns()`, called from `db/index.ts`.
- **lib/brand.ts** *(new)*: `BRAND_VALUES` re-export + `brandLabel(b)` (→ FC).
- **lib/promo-csv-parser.ts**: remove `"brand"` from `collection` synonyms; add `sizeOneQty`/`sizeTwoQty` synonyms (`"size 1","size1","sz1","qty1","quantity 1"`, etc.); `ParsedPromoRow` gains the two ints (default 0; non-numeric → 0).
- **lib/promo-match.ts**: index collects each client's brand-interests (upper-cased); `matchPromoToClients(tx, promoId, model, collection, brand, index)` adds a brand pass after model/collection (skip if already matched). Returns matched client IDs (unchanged contract).
- **lib/actions/promos.ts**: `createPromo(..., brand, sizeOneQty, sizeTwoQty)`, `importPromos(rows, brand, promoStart, promoEnd)` (brand per batch; rows carry sizes); both pass brand to `matchPromoToClients` and persist new cols; reject missing/invalid brand. `clearAllPromos` unaffected. **`lib/actions/catalog.ts`** re-match call updated for the new `matchPromoToClients` arity.
- **lib/queries.ts**: `getPromos` → `orderBy(rawSql\`rowid\`)` asc. `getPromoMatchCounts` unchanged (counts any matchType).
- **lib/validation/client.ts**: `productOfInterestSchema` add `brand` (preprocess blank→null; `z.enum(BRAND_VALUES).nullable()`); refine → ≥1 of model/collection/brand.
- **components/promo/import-promo-dialog.tsx**: required Brand `Select`; pass brand to `importPromos`; show it in preview/summary.
- **app/(app)/promos/promos-content.tsx**: Add-Single brand select + 2 size inputs; new table columns; `SortHead` + `Popover` funnels (Brand/Collection facets, Price/Discount ranges, Size>0); keep `SearchInput`; default order via server rowid (no client default sort needed — preserve incoming order until a header is clicked).
- **components/products-of-interest-input.tsx**: optional Brand select; entry valid with brand alone; badge/describe includes brand.
- **components/interests-tab.tsx**: Brand column + brand in sort/filter. The promo-derived cell logic must gain a **brand branch** (entry `brand` === a matched promo's `brand`), alongside the existing model/collection hit detection — not automatic.
- **client-provider FullClient**: `ProductOfInterest` type flows (no change needed beyond the type).
- **lib/db/seed.ts**: promo seed array gains brand + size qtys; assign brand per promo; some POI entries get a brand; rewrite the fake/real promo-match seeding to mirror the brand-aware matcher.
- **lib/actions/clients.ts / prospects.ts / onboarding.ts**: POI passthrough already generic; ensure any literal POI fixtures include `brand` where constructed (onboarding demo).

## Risk Assessment

| Risk | Mitigation |
|---|---|
| `"brand"` was a collection synonym — silent mis-map | Remove it; parser test asserts a `Brand` header no longer fills collection |
| `matchType` enum widening ripples (counts, View Matches, exports, tab) | App-level enum only (no DB migration); audit all `matchType` consumers; counts/exports are matchType-agnostic; tests for each |
| `matchPromoToClients` arity change (3 call sites: createPromo, importPromos, catalog re-match) | tsc surfaces all; update together |
| Wide POI shape change again (plan-002/003 footprint) | Mechanical; tsc-driven; fixtures updated; brand optional so empties unaffected |
| rowid ordering vs existing `dateAdded` assumptions (promo period banner) | Banner derives from promoStart/End, not order; verify; keep dateAdded column |
| Size columns: non-numeric paste cells | Parser coerces blank/NaN → 0; unit-tested |
| `createPromo`/`importPromos` signature change → brand a required param | **Broad test churn**: every `createPromo(model,collection,…)` call in promo-actions/model-catalog/catalog tests must add a brand arg; tsc + failing tests surface all; update mechanically (predicted, like plan-005's API 400s) |
| Brand required breaks existing import/promo tests | Predicted; update fixtures (add brand); direct db.inserts unaffected (DB nullable) |
| Seed match-seeding drift vs runtime | Seed uses the same matcher logic (brand-aware); test parity |

## Test Strategy

- Parser: Size 1/Size 2 mapping + coercion; `Brand` header does NOT populate collection.
- Matcher: brand-only interest matches same-brand promo (`matchType:"brand"`); model/collection still take precedence; no double row (unique constraint).
- Validation: POI accepts brand-only; rejects all-empty; rejects bad brand; intent still required.
- Actions: `createPromo`/`importPromos` persist brand + sizes; missing brand rejected; re-match (catalog) still compiles/works with new arity.
- Query: `getPromos` returns insertion order.
- Components: promo table renders Brand(FC)/Size columns, a sort + a funnel narrow rows; ProductsOfInterestInput brand entry; interests-tab Brand column.
- Update fixtures: promo-actions/import tests (brand), POI fixtures across suites (`brand` optional → only those that must), seed.

## Validation & Diagnostics

`tsc --noEmit` clean; full `vitest run`; `npm run db:seed`; manual smoke
— import a brand batch with size columns; Add-Single; table sort/filter
incl. Size>0 and Brand facet; a brand-only product of interest matches a
that-brand promo (visible in interests tab / View Matches); drop+boot
recreates promo columns.

## Open Questions

- [ ] Promo table column order/visibility on small screens (Brand/Size hidden < md?) — Can proceed (mirror existing responsive `hidden sm/md` pattern).
- [ ] Brand facet label: show "FC" vs "Chamberlain" in the filter list — Can proceed (full name in filter, FC in the dense table cell).
- [ ] Size filter UX: simple ">0" toggle vs min input — Can proceed (">0 / any" toggle for MVP).

## Implementation Checklist

- [ ] schema: BRAND_VALUES/Brand, promoWatches.brand+sizes, matchType+"brand", ProductOfInterest.brand; lib/brand.ts.
- [ ] ensure-schema ensurePromoColumns + index.ts wiring; drop/boot verify.
- [ ] promo-csv-parser: drop brand→collection, add size synonyms + coercion.
- [ ] promo-match: brand index + brand pass; arity update.
- [ ] promos.ts createPromo/importPromos brand+sizes; catalog.ts re-match arity.
- [ ] queries.getPromos rowid order.
- [ ] validation: productOfInterestSchema brand + refine.
- [ ] import dialog brand select; Add-Single brand+sizes; promos table columns + sort + funnels (keep search).
- [ ] products-of-interest-input brand; interests-tab Brand column + sort/filter.
- [ ] onboarding/seed POI + promo brand/sizes; brand-aware match seeding.
- [ ] tests (parser, matcher, validation, actions, query, components) + fixture updates.
- [ ] tsc + full vitest + db:seed; manual smoke; commit to `main` (no push).

## Out of scope

The "Matched Clients" tab (next step #3) and the matched-clients CSV
export (#4) — they consume this brand/match data.
