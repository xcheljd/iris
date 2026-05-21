# Plan 007: "Matched Clients" tab in Promo Manager

Step 3 of the sequence. No schema change (consumes existing
promo_matches/brand/preferredContact). No reseed.

## Decisions locked (interview)

| Topic | Decision |
|---|---|
| Matched client | A client with **any** promo match (model/collection/brand). |
| Row grain | **One row per (client, promo)** — mirrors the future CSV export 1:1. |
| Columns | Client (always), Assigned associate, Preferred contact, Phone, Email, Promo Model, Promo Collection, Promo Brand, **MSRP**, **Sale Price**, Match type. *(Match type retained — it's intrinsic to a match row and was shown in the retired View Matches; Heat excluded — not selected.)* |
| Structure | **Tab in Promo Manager** (`Promos` \| `Matched Clients`). **Retire the per-promo expandable "View Matches"** entirely; transfer its features to the tab: owner-aware client→detail navigation + a breadcrumb back. Keep the per-promo "Clients" count badge column (separate from View Matches). |
| Filters | Facet funnels: **Assigned associate, Match type, Brand**. **Plus clickable column sort on every column** (added on user request). Client search still out of MVP. |
| Fetch | **Eager** with the page (bounded single-store data; mirrors collections-content). |
| RBAC | Deleted/orphaned excluded via the **same predicate** as `getPromoMatchCounts` / the matches API (`clients.deletedAt IS NULL`, `status != "deleted"`). Employee scoping (manager → all; associate → only own `clients.employeeId`) mirrors the **clients/collections CSV exports** (the counts query was not employee-scoped). |

## Success Criteria

1. New `getMatchedClients(employeeId?)` query: `promo_matches ⨝ clients ⨝ promoWatches ⨝ employees(owner)`, one row per (client, promo); excludes `clients.deletedAt != null` / `status = "deleted"`; associate-scoped when `employeeId` set. Returns client id+name+employeeId, owner name, preferredContact, phone, email, promo model/collection/brand/msrp/discountPrice, matchType.
2. Promo Manager is a `Tabs` view: **Promos** (the existing table, unchanged incl. the Clients count badge) and **Matched Clients** (new table). Active tab is URL-synced (`?tab=matched`) so a breadcrumb can link back.
3. The per-promo **View Matches** dropdown item, the expandable matches `TableRow`, `handleViewMatches`, `matches`/`showMatches` state, the `PromoClientMatch` interface, and the `/api/promos/matches` route are **removed** (no remaining consumers).
4. Matched Clients table columns exactly as decided; client name is a link to `/clients/[id]?from=promo-matches`, **owner-aware** (manager: always; associate: only clients they own — else plain text), brand shown via `brandLabel` (FC).
5. Facet filters (associate / match type / brand) via a Filters popover (the promos-table pattern) **plus a clickable `SortHead` on every column** (asc/desc toggle, the promos/interests-tab idiom); combine AND, sort applied before pagination; client-side over the eager dataset; paginated.
6. Client-detail breadcrumb honors `?from=promo-matches` → **Promo Manager › Matched Clients › [client]**, the first two segments linking to `/promos?tab=matched` (round-trips to the tab).
7. `tsc` clean; full vitest green incl. new tests.

## Architecture / touch points

- **lib/queries.ts**: `getMatchedClients(employeeId?)` — drizzle select with the joins + filters above; order by client first/last name then promo model. Export a `MatchedClientRow` type.
- **app/(app)/promos/page.tsx**: also `getMatchedClients(isManager ? undefined : session.user.id)`; pass `matchedClients` to `PromosContent`.
- **app/(app)/promos/promos-content.tsx**:
  - Wrap body in `Tabs` (value from `useSearchParams().get("tab")` default `"promos"`; `onValueChange` pushes `?tab=`). Keep `Topbar`/header/stats/banner above the tabs (or within Promos tab — keep promo-only chrome in the Promos tab).
  - Remove View Matches: dropdown item, `showMatches`/`matches` state, `handleViewMatches`, the `{showMatches === promo.id && …}` row, `PromoClientMatch`, and the `/api/promos/matches` import/fetch. Keep the `Clients` count badge cell/column.
  - Render `<MatchedClientsTab clients={matchedClients} isManager currentUserId />` in the second tab.
- **components/matched-clients-tab.tsx** *(new, client)*: table reusing the promos-table `SortHead` + Filters-popover idiom — clickable sort on every column + the 3 facet filters + pagination (no client search per the decision). Owner-aware `Link` to `/clients/[id]?from=promo-matches`. `brandLabel` for brand. Empty state.
- **app/(app)/clients/[id]/client-detail-content.tsx**: extend the existing `from`-param breadcrumb (currently handles `from=collections`) with `from === "promo-matches"` → segments **Promo Manager** (`/promos`) › **Matched Clients** (`/promos?tab=matched`) › `BreadcrumbPage` client. Keep the default Clients › client otherwise.
- **app/api/promos/matches/route.ts**: delete (unused after retiring View Matches; grep-confirm no other import).

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Removing View Matches loses the #1 owner-aware-link / count work | Count badge (#2) kept; owner-aware link + breadcrumb (#1/#8 ideas) transferred into the tab — net feature-preserving, as the user directed |
| `useSearchParams` needs a Suspense boundary | Page already wraps content in `<Suspense>`; tab state read client-side there (same pattern as collections-content `?collection=`) |
| Row grain explosion (client × many promos) | Bounded single-store data; eager load + client-side paginate (collections-content pattern); RBAC + deleted exclusion shrink it |
| Deleting the route breaks an unseen consumer | grep all imports of `api/promos/matches` first; only promos-content used it |
| Associate sees others' matched clients | `getMatchedClients` employee-scoped (mirrors counts/exports); test with associate session |
| Tab restructure regresses promo table (sort/filter/count from plan-006) | Promos tab renders the existing table unchanged; component tests cover it; manual smoke |

## Test Strategy

- `getMatchedClients`: one row per (client,promo); includes brand-typed matches; excludes soft-deleted/orphaned clients; associate scoping returns only own; manager sees all.
- Component: Matched Clients tab renders the decided columns; associate sees plain-text name for a non-owned client, manager gets a link; a facet filter (associate/matchType/brand) narrows rows; a column-header sort reorders rows (asc/desc toggle); empty state.
- Breadcrumb: `from=promo-matches` renders the Promo Manager › Matched Clients › client trail; default unchanged.
- Promos tab: existing promo-table tests still pass (no behavior change).
- Confirm `/api/promos/matches` removal: no import remains; no test referenced it.

## Validation & Diagnostics

`tsc --noEmit` clean; full `vitest run`; manual smoke — open Promo
Manager, switch to Matched Clients, filter by associate/brand/matchType,
click a client (owner-aware) → breadcrumb returns to `?tab=matched`;
associate session sees only own; Promos tab unchanged.

## Open Questions

- [ ] Promo-only chrome (stats cards, period banner, Add/Import/Clear) — keep above the tabs or only on the Promos tab? — Can proceed (only on Promos tab; Matched Clients gets its own clean header).
- [ ] Pagination size for Matched Clients (reuse PAGE_SIZE 15 vs larger) — Can proceed (reuse 15).
- [ ] Sidebar: any nav change? No — it stays under Promo Manager. (resolved)

## Implementation Checklist

- [ ] `getMatchedClients` query + `MatchedClientRow` type; page fetch + prop.
- [ ] Tabs restructure in promos-content; URL-synced active tab.
- [ ] Remove View Matches (UI/state/handler/interface) + delete `/api/promos/matches`; keep count badge.
- [ ] `matched-clients-tab.tsx` (columns, owner-aware link, brandLabel, per-column SortHead, 3 facet filters, pagination, empty state).
- [ ] client-detail breadcrumb `from=promo-matches`.
- [ ] Tests (query RBAC/grain/brand/deleted, component, breadcrumb) + ensure promo-table tests still green.
- [ ] `tsc` + full vitest; manual smoke; commit to `main` (no push).

## Out of scope

The matched-clients CSV export (step 4 — mirrors collections-csv-export,
serializes exactly this table's rows). Client search box on the Matched
Clients table (not requested; column sort is now in scope).
