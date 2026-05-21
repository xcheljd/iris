# Plan 008: Matched Clients CSV export

Step 4 (final) of the sequence. Mirrors `collections-csv-export` 1:1
(shared `toCsv`/`csvCell`, server action + dialog, RBAC via
`requireAuth`). No schema change, no reseed.

## Decisions locked (interview)

| Topic | Decision |
|---|---|
| Scope | **All + Current filter** — dialog chooser. "Current filter" = the Matched Clients tab's active facet sets (associate / match type / brand). RBAC always applied on top. |
| Columns | **Exactly the tab columns + Client ID**: `Client ID, First Name, Last Name, Assigned associate, Preferred contact, Phone, Email, Promo Model, Promo Collection, Promo Brand, MSRP, Sale Price, Match type`. |
| Grain | One row per (client, promo) — exactly `getMatchedClients`' rows (mirrors the tab 1:1). |
| Trigger | "Export CSV" button beside **Filters** in the Matched Clients card header → dialog (preview · Copy · Download `matched-clients-YYYY-MM-DD.csv`), same shape as the collections export dialog. |
| RBAC | `requireAuth`; manager → all, associate → only own (`employeeId` into `getMatchedClients`, same as that query / the other CSV exports). |
| CSV safety | Reuse shared `lib/csv.ts` `toCsv`/`csvCell` (RFC-4180 + formula-injection guard). |

## Success Criteria

1. `exportMatchedClientsCsv(scope)` server action (`"use server"`,
   `requireAuth`) returns `{ csv, rowCount, truncated }`. Source is
   `getMatchedClients(manager ? undefined : user.id)` (reuses its joins,
   deleted/orphaned exclusion, employee scoping — no duplicated query).
2. `MatchedClientsCsvScope = { mode: "all" } | { mode: "filter"; owners: string[]; matchTypes: string[]; brands: string[] }`. `filter` applies the same facet predicates as the tab (ownerName ∈ owners, matchType ∈ matchTypes, promoBrand ∈ brands); empty arrays = unconstrained for that facet.
3. Header exactly the 13 decided columns (Client ID first); one CSV row per (client, promo); values via `csvCell`.
4. `LIST_QUERY_LIMIT` cap on the row set with a `truncated` flag (mirrors the collections export's truncation contract).
5. `MatchedClientsCsvExportDialog` mirrors `CollectionsCsvExportDialog`: scope radio (Current filter shown only when ≥1 facet active), live preview, row count, truncation alert, Copy, Download `matched-clients-YYYY-MM-DD.csv`.
6. Matched Clients card header gains an "Export CSV" button beside Filters; the tab passes its current facet sets (as arrays) into the dialog.
7. `tsc` clean; full vitest green incl. new tests.

## Architecture / touch points

- **lib/actions/matched-clients-csv-export.ts** *(new, "use server")*:
  `MatchedClientsCsvScope` + `MatchedClientsCsvExportResult`;
  `exportMatchedClientsCsv(scope = { mode: "all" })`:
  - `const user = await requireAuth(); const employeeId = user.role === "manager" ? undefined : user.id;`
  - `const all = await getMatchedClients(employeeId);`
  - if `scope.mode === "filter"`: filter `all` by owners/matchTypes/brands (only non-empty arrays constrain).
  - `truncated = filtered.length > LIST_QUERY_LIMIT`; `capped = filtered.slice(0, LIST_QUERY_LIMIT)`.
  - `toCsv(HEADER, capped.map(r => [...13 fields...]))`; numbers (`msrp`, `discountPrice`) → `r.x == null ? "" : r.x.toFixed(2)`; `rowCount = capped.length`.
- **lib/actions.ts**: re-export the new module.
- **components/matched-clients-csv-export-dialog.tsx** *(new, client)*: clone of `collections-csv-export-dialog`; props `{ open, onOpenChange, owners: string[], matchTypes: string[], brands: string[] }`. Scope options: always `All`; add `Current filter` when any of the three arrays is non-empty. Fetch on open/scope change; preview `Textarea`, row count + "13 columns", truncation `Alert`, Copy, Download (`matched-clients-${stamp}.csv` via Blob). **The scope arrays are props — derive a stable string key (`owners.join("|")` etc.) for the fetch `useEffect` deps so a new array identity per render doesn't loop.**
- **components/matched-clients-tab.tsx**: add `exportOpen` state; an "Export CSV" `Button` next to the Filters trigger in the `CardHeader`; render `<MatchedClientsCsvExportDialog open onOpenChange owners={[...ownerFilter]} matchTypes={[...typeFilter]} brands={[...brandFilter]} />`.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Scope filter drift vs the tab's on-screen facets | Server action applies the **same** ownerName/matchType/promoBrand ∈ set predicates as `matched-clients-tab`'s `rows` memo; unit test asserts parity for each facet |
| Row explosion (client × many promos) | `LIST_QUERY_LIMIT` cap + `truncated` flag surfaced in the dialog (collections-export contract); single-store data is bounded anyway |
| RBAC bypass | Export reuses `getMatchedClients(employeeId)`; associate test asserts only-own |
| Formula injection / quoting | Shared hardened `csvCell` (already tested in `csv.test.ts`) |
| Dialog/scope divergence from the collections one | Built as a direct clone; behaviour parity covered by component test |

## Test Strategy

- Unit/DB (`exportMatchedClientsCsv`): header = 13 decided columns, Client ID first; one row per (client, promo); `all` vs `filter` (each facet: owners / matchTypes / brands) row sets; associate scoping returns only own; deleted/orphaned excluded (inherited from `getMatchedClients`); a brand-match row appears with `Match type = brand`; `csvCell` quoting on a comma/quote value.
- Component (`MatchedClientsCsvExportDialog` via the tab): Export button opens the dialog; "Current filter" option appears only when a facet is active; Download filename `matched-clients-…csv`.
- Existing matched-clients-tab tests still green (only an Export button added).

## Validation & Diagnostics

`tsc --noEmit` clean; full `vitest run`; manual smoke — open Promo
Manager → Matched Clients, Export CSV with All and with Current filter
(facets applied), verify preview/row count/columns/Download filename;
associate session exports only own.

## Open Questions

- [ ] "Current filter" label detail in the radio (list active facet values vs generic "Current filter") — Can proceed (generic label + count; mirror collections wording).
- [ ] Preferred contact / match type casing in CSV (raw lowercase vs Title) — Can proceed (raw, matching the tab cells).

## Implementation Checklist

- [ ] `matched-clients-csv-export.ts` (scope type, reuse getMatchedClients, facet filter, cap/truncate, toCsv) + barrel re-export.
- [ ] `MatchedClientsCsvExportDialog` (clone of collections dialog; scope from passed facet arrays).
- [ ] Matched Clients tab: Export CSV button + dialog wiring (pass facet sets as arrays).
- [ ] Tests (export action: columns/scope/RBAC/brand/deleted; dialog via tab) + ensure tab tests stay green.
- [ ] `tsc` + full vitest; manual smoke; commit to `main` (no push).

## Out of scope

Scheduled/automated export, XLSX. (Column sort/search already on the tab
from plan-007.)
