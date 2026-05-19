# Plan 009 — Manager-Authoritative Catalog: RVX Import + Derive-at-Read

**Supersedes the earlier brand/MSRP-only idea.** Brand and MSRP become
columns on a now-authoritative catalog, populated by a RVX import. The
per-client collection stops floating: collection is *resolved from the
catalog at read time*. This retires the inline conflict widget, the
manual-conflict flag, and the #7 toast.

## Background / Decisions (locked in interview)

- A watch model belongs to exactly one collection; the **catalog is the
  single source of truth** for model→collection (extends the existing
  `[[project-model-one-collection]]` domain rule).
- **RVX is fully authoritative.** Every import overwrites collection,
  brand, and MSRP for each model. Finer-grained RVX collections
  (`SENTINEL DEEPR`) overwrite existing coarse ones (`SENTINEL`).
- **Derive-at-read**, not enforce-at-write. POI keeps its stored
  `collection`, but readers resolve collection via the catalog when the
  POI has a cataloged model. Stored value only matters for
  collection-only interests and as the seed for uncatalogued models.
- **Uncatalogued model at entry:** collection still required; entry
  accepted; a **provisional catalog row** (`needsReview = 1`) is created;
  it surfaces in a manager "needs cataloging" queue on `/catalog`.
- **`Kinetic` added as a 5th brand.**
- **No department filtering** — accessories/clocks/jewelry get catalog
  entries too. Non-watch class codes (`JWL-JEWELRY`, `CLO-CLOCKS`,
  `100-ACCESSORIES`) → **brand = null** (option B). Licensed Meridian
  lines (`DIS-DISNEY`, `SWR-STAR WARS`, `MAR-MARVEL`) → Meridian.

### RVX "Selling Analysis By Style" mapping (SpreadsheetML .xls)

Format is Office 2003 SpreadsheetML XML (`<Worksheet><Table><Row><Cell>`,
sparse cells use `ss:Index`). One row per Vendor Style — **no dedupe
needed** (verified: 1476 rows, 1476 distinct styles).

| Source col | Field | Transform |
|---|---|---|
| 6 Vendor Style | `model` | `normalizeModel` (uppercase) |
| 4 Sub-Class Code | `collection` | strip leading `^[^-]+-` prefix → e.g. `PR4-SENTINEL DEEPR` → `SENTINEL DEEPR` |
| 3 Class Code | `brand` | brand map (below) |
| 33 Retail Price | `msrp` | parse float; blank → null |

Brand map (by Class Code):
`BUL-*`→Ashford · `FC -*`→Chamberlain · `AL -*`→Voss ·
`KIN-KINETIC`→Kinetic · `JWL-JEWELRY`/`CLO-CLOCKS`/`100-ACCESSORIES`→null ·
**all else** (`1EC-SOLARIS`, `AUT-AUTOMATIC`, `6GL-RETAIL EXCLUSIVE`,
`6SH-SHARED EXCL`, `7QZ-QUARTZ`, `DIS-DISNEY`, `SWR-STAR WARS`,
`MAR-MARVEL`, …) → Meridian.

## Success Criteria

1. Manager can import the RVX .xls on `/catalog`; ~1476 rows upsert with
   model/collection/brand/MSRP; re-import overwrites all three.
2. `/catalog` shows **Brand** and **MSRP** columns; brand respects
   `brandLabel` ("FC"); MSRP formatted currency, blank when null.
3. Catalog has a **"Needs cataloging"** section listing provisional rows;
   manager confirms (→ authoritative) or corrects.
4. Collection everywhere user-facing/matching is **catalog-resolved** for
   cataloged models; collection-only interests still use stored value.
5. Entering a POI for an already-cataloged model **no longer prompts**
   (no widget, no toast); the typed collection is simply not read back.
6. Entering a POI for an uncatalogued model is accepted and creates a
   provisional row that appears in the queue.
7. `Kinetic` selectable everywhere brand is chosen.
8. Empty-state copy fix (#8): "No catalog entries" vs "No matches for X".
9. Promo-import-vs-catalog flag path (`flaggedSource:"promo"`) still
   works; manual-conflict flag + #7 toast + inline widget are removed.
10. Gate: `tsc --noEmit` clean (excl. gitignored `remotion-demo`) + full
    `vitest run` green + a live `agent-browser` pass.

## Architecture

### Schema (`model_catalog`, via ensure-schema self-heal)

Add columns guarded by `pragma_table_info('model_catalog')` (same pattern
as `ensureModelCatalog`/`ensurePromoColumns`):

- `brand TEXT` (nullable; values constrained at app layer to widened
  `BRAND_VALUES`)
- `msrp REAL` (nullable)
- `msrp_seen_at INTEGER` (timestamp; provenance for display)
- `needs_review INTEGER NOT NULL DEFAULT 0`

`flagged_collection/_source/_at` stay (promo-vs-catalog only). Drizzle
`modelCatalog` table def updated to match. **No data migration** for
existing POIs (derive-at-read makes their stored collection moot for
cataloged models); first RVX import seeds authority.

### Brand enum

`lib/db/schema.ts` `BRAND_VALUES` → add `"Kinetic"`. Remove the
duplicated hardcoded array in `lib/db/seed.ts:171` (reference
`BRAND_VALUES`). `brandLabel` unchanged. All brand pickers iterate
`BRAND_VALUES` so they pick up Kinetic automatically (verified call
sites: interests-tab, import-promo-dialog, promos-content, validation).

### RVX catalog parser + import

- `lib/rvx-catalog-parser.ts` — new. Parse SpreadsheetML via a tolerant
  XML walk (Node has no DOM; use `fast-xml-parser` if already a dep, else
  a minimal hand parser mirroring the validated Python: iterate Rows,
  track `ss:Index` for sparse cells, header row detection by the literal
  `Vendor Style` cell). Returns `{ rows: CatalogImportRow[], parseErrors,
  reportDate }`. `CatalogImportRow = {model, collection, brand|null,
  msrp|null}`. Drop rows with empty Vendor Style.
- `lib/actions/catalog-import.ts` — `analyzeCatalogRvx(xmlText)` (counts:
  new / updated / unchanged / skipped, sample diffs) and
  `importCatalogRvx(xmlText)` (manager-only; transactional upsert). Upsert
  rule: RVX authoritative → set collection/brand/msrp/msrpSeenAt,
  `source:"curated"`, `needsReview:0`, clear `flagged_*`. Mirrors the
  analyze→preview→confirm UX of `lib/actions/rvx-import.ts`.
- UI: `components/catalog/import-catalog-dialog.tsx` cloned from
  `import-promo-dialog.tsx` (file upload + paste, analyze summary,
  confirm). "Import Catalog" button on `/catalog` (manager-only page).

### Derive-at-read resolver

Both **collection and brand** derive from the catalog. `getCatalogMap()`
is widened to a model→entry index:

```ts
// lib/actions/model-catalog.ts
export type CatalogEntry = { collection: string; brand: string | null };
export function getCatalogIndex(): Map<string, CatalogEntry>; // key: normalizeModel(model)
```

`lib/resolve-interest.ts`:

```ts
export function resolveInterest(
  poi: { model: string | null; collection: string | null; brand: string | null },
  catalog: Map<string, CatalogEntry>,
): { collection: string | null; brand: string | null } {
  if (poi.model) {
    const e = catalog.get(normalizeModel(poi.model));
    if (e) return { collection: e.collection, brand: e.brand };  // catalog wins
  }
  return { collection: poi.collection ?? null, brand: poi.brand ?? null };
}
```

For a cataloged model the catalog's collection **and brand** win; the
POI's stored collection/brand are only used for collection/brand-only
interests and uncatalogued seeds. Applied at every POI collection **or
brand** read site (enumerated below).

### Uncatalogued → provisional row + queue

`recordModelCollection` (manual source) changes: if model unknown →
insert provisional row (`source:"manual"`, `needsReview:1`, collection =
entered). If known → **no-op** (no conflict, no flag — catalog wins by
read-time resolution). This deletes the manual-conflict branch (the #7
flag) entirely. `/catalog` adds a "Needs cataloging (N)" card listing
`needsReview=1` rows with Confirm / Correct actions; Confirm sets
`source:"curated"`, `needsReview:0`.

### Retirements

- `components/products-of-interest-input.tsx`: remove the "Catalog
  conflict" popover ("Use cataloged"/"Fix catalog"); keep catalog-driven
  autofill *suggestion* only (typing a known model may prefill collection
  for UX, but it is not enforced and not read back).
- Remove `lib/catalog-conflicts.ts`, the `catalogConflictMessage` toast
  in `new/page.tsx`, `edit-client-form.tsx`, `edit-client-dialog.tsx`,
  and the `conflicts` plumbing in `applyClientPatch` + both client API
  routes (revert to `void` / `{success:true}`; `recordProductsOfInterest`
  still runs for provisional-row creation but returns nothing surfaced).
- Delete the manual-conflict test assertions; keep promo-flag tests.
- `/catalog` "Pending catalog conflicts" card now only ever shows
  `flaggedSource:"promo"`; simplify the source-aware copy accordingly.

## Affected Files/Areas

**Schema/infra:** `lib/db/schema.ts` (BRAND_VALUES, modelCatalog cols),
`lib/db/ensure-schema.ts` (4 ALTERs), `lib/db/seed.ts` (brand array;
optional seed catalog rows).

**Import:** new `lib/rvx-catalog-parser.ts`,
`lib/actions/catalog-import.ts`, `components/catalog/import-catalog-dialog.tsx`;
wire button in `app/(app)/catalog/catalog-content.tsx`.

**Derive-at-read (read sites — exhaustive; collection AND brand):**
`lib/promo-match.ts` (`buildPromoClientIndex` resolves both
collection+brand sets via catalog), `lib/queries.ts`,
`components/interests-tab.tsx` (collection + brand columns),
`lib/actions/collections-csv-export.ts`,
`app/(app)/analytics/collections/collections-content.tsx`,
`lib/client-filter-conds.ts` (collection + brand filter facets),
`lib/heat-score.ts`, `lib/actions/catalog.ts` (`applyCorrection`
re-match), `components/merge/resolution-panel.tsx` &
`components/merge/merge-from-form-dialog.tsx` (display),
`app/(app)/prospects/[id]/prospect-detail-content.tsx`. Each gets a
`getCatalogIndex()` + `resolveInterest` pass; matching/index code takes
the map as a param to avoid N queries. **Note:** sites reading
`promo.brand`/`promoBrand` (matched-clients, promos table) are *not*
affected — those are promo fields, not POI-derived.

**Retirements:** `components/products-of-interest-input.tsx`,
`components/use-catalog.ts` (keep fetch, drop conflict logic),
`lib/catalog-conflicts.ts` (delete), `app/(app)/clients/new/page.tsx`,
`app/(app)/clients/[id]/edit/edit-client-form.tsx`,
`components/edit-client-dialog.tsx`, `lib/actions/clients.ts`,
`app/api/clients/route.ts`, `app/api/clients/[id]/route.ts`,
`lib/actions/model-catalog.ts` (drop manual-flag branch; add provisional).

**Catalog UI:** `app/(app)/catalog/catalog-content.tsx` (Brand/MSRP
columns, Needs-cataloging card, import button, empty-state copy),
`lib/actions/catalog.ts` (`listCatalog` returns new cols; confirm action).

## Risk Assessment

- **Missed derive-at-read site → silently wrong collection.** Highest
  risk. Mitigation: single `resolveCollection` helper; checklist
  enumerates every site; a test per site; a `rg` sweep for `.collection`
  on POI in review; live agent-browser spot-check of promo matching +
  collections analytics + CSV.
- **Promo matching semantics drift.** `buildPromoClientIndex` currently
  reads `p.collection`; switching to resolved collection changes which
  clients match. This is *intended* (catalog truth) but is a behavior
  change — tests must assert the new deterministic behavior, not the old.
- **SpreadsheetML parser fragility.** Mitigation: parser modeled on the
  already-validated Python extraction; golden-file test against the real
  RVX sample (kept as a fixture, sanitized if needed); tolerant of
  sparse cells / blank Vendor Style / malformed price.
- **Brand enum widening** could miss a hardcoded list. Mitigation: grep
  confirmed only schema + seed hardcode; all UI maps `BRAND_VALUES`.
- **RVX overwrites manager corrections.** By design (RVX authoritative),
  but flag in import preview the count of rows whose collection changes,
  so the manager sees the blast radius before confirming.
- **Existing data:** stored POI collections become display-irrelevant for
  cataloged models — acceptable, no migration; collection-only interests
  unaffected.

## Test Strategy

- **Parser unit** (`__tests__/lib/rvx-catalog-parser.test.ts`): golden
  RVX fixture → assert row count, prefix-strip, brand map (incl.
  Kinetic, JWL/CLO/100→null, Disney→Meridian), price parse, sparse-cell
  handling, blank-style skip.
- **Import action** (`__tests__/actions/catalog-import.test.ts`):
  analyze counts; import upsert overwrites collection/brand/msrp;
  re-import idempotent; clears `flagged_*`; manager-only (associate
  rejected).
- **resolveCollection unit:** cataloged model wins; collection-only
  passthrough; uncatalogued passthrough; null model.
- **Promo match** (extend `model-catalog.test.ts` /
  `promo-match` tests): client POI `{model:X, collection:"STALE"}` with
  catalog X=`REAL` → matches promos for `REAL`, not `STALE`. Assert
  deterministic delta (per `[[feedback-...]]` predicted-behavior-change
  rule — update over-strict counts rather than fight them).
- **Provisional flow:** entering uncatalogued model creates
  `needsReview=1` row; confirm → `curated, needsReview=0`; known model
  entry is a no-op (no flag).
- **Retirement regression:** `recordProductsOfInterest` no longer returns
  surfaced conflicts; client create/edit have no conflict toast; promo
  flag path still flags + `resolveFlag` still works.
- **Brand enum:** `Kinetic` valid in `clientCreateSchema`/promo
  validation; `brandLabel("Kinetic")==="Kinetic"`.
- Full `vitest run` green; existing 632 tests updated where the
  behavior-change (derive-at-read in matching) invalidates old fixtures.

## Validation and Diagnostics

- Import preview surfaces: parsed rows, parse errors (with row numbers),
  new/updated/unchanged counts, and **collection-change list** (model:
  old→new) so the manager sees what RVX will overwrite.
- `importCatalogRvx` logs a one-line summary (counts) to the activity log
  for auditability.
- Live `agent-browser` pass: import the real RVX file → spot-check
  `/catalog` (Brand/MSRP populated, FC label, Kinetic present) → verify
  a known model's collection now drives promo matching → verify the
  needs-cataloging queue with a fresh uncatalogued POI → confirm no
  conflict popover/toast appears on a now-known model.

## Open Questions

- [x] Brand also derive-at-read from catalog? **DECIDED: yes** — catalog
      brand wins for cataloged models, same as collection. `resolveInterest`
      returns both.
- [ ] RVX import `source` value: reuse `"curated"` vs add a `"rvx"`
      enum value for provenance. Recommend reuse `"curated"` +
      `msrpSeenAt`/activity log for provenance (avoids enum churn). — Can
      proceed.
- [ ] Keep storing `collection` on POI for cataloged models (audit/seed)
      vs null it on write. Recommend **keep** (cheap, aids the
      provisional seed + audit; just not read). — Can proceed.
- [ ] SpreadsheetML parsing dependency: confirm whether a fast XML parser
      is already a dependency before adding one. — Resolve during impl;
      hand parser is an acceptable fallback. Can proceed.

## Implementation — Staged Commits

Four stages. Each ends with the gate (`tsc --noEmit` clean excl.
`remotion-demo` + full `vitest run` green) and its own commit to `main`
(no push). Each stage must leave the app working.

### Stage 1 — Schema + brand enum (foundation)
- [ ] Widen `BRAND_VALUES` (+`Kinetic`); de-dup `seed.ts:171` array.
- [ ] `ensure-schema`: add `brand`, `msrp`, `msrp_seen_at`,
      `needs_review` to `model_catalog`; update Drizzle `modelCatalog`.
- [ ] `getCatalogIndex()` (model→`{collection,brand}`) alongside existing
      `getCatalogMap`.
- [ ] Tests: brand enum accepts `Kinetic`; schema columns present.
- [ ] Gate + commit: `feat(catalog): brand enum +Kinetic, catalog
      brand/msrp/needs_review columns`.

### Stage 2 — RVX catalog import
- [ ] `lib/rvx-catalog-parser.ts` + golden-fixture tests (real RVX file).
- [ ] `lib/actions/catalog-import.ts` (analyze/import, manager-only,
      authoritative upsert, activity-log summary) + tests.
- [ ] `import-catalog-dialog.tsx`; wire "Import Catalog" on `/catalog`.
- [ ] `/catalog`: Brand + MSRP columns, empty-state copy fix (#8).
- [ ] Gate + commit: `feat(catalog): RVX Selling-Analysis import +
      brand/MSRP columns`.

### Stage 3 — Derive-at-read (the behavior change)
- [ ] `lib/resolve-interest.ts` + unit tests.
- [ ] Apply `resolveInterest` at every enumerated read site; pass
      `catalogIndex` into `buildPromoClientIndex`/match + `applyCorrection`.
- [ ] Update behavior-changed matching tests to the new deterministic
      catalog-resolved behavior (don't fight old fixtures).
- [ ] Gate + commit: `refactor(catalog): derive POI collection+brand from
      catalog at read time`.

### Stage 4 — Provisional queue + retirements
- [ ] `recordModelCollection`: drop manual-flag branch; unknown model →
      provisional `needsReview` row; known model → no-op.
- [ ] `/catalog`: "Needs cataloging" card (Confirm/Correct); simplify
      conflict card to promo-only.
- [ ] Retire inline widget popover; delete `lib/catalog-conflicts.ts` +
      toast + `conflicts` plumbing; revert `applyClientPatch`/routes;
      remove obsolete manual-conflict tests.
- [ ] Live `agent-browser` validation pass (import real file → catalog
      columns → matching uses catalog → provisional queue → no popover).
- [ ] Gate + commit: `feat(catalog): provisional needs-cataloging queue;
      retire manual-conflict widget/flag/toast`.
