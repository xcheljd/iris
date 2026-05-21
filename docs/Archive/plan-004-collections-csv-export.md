# Plan 004: Collections Interest CSV Export (report #10)

Mirrors the existing `lib/actions/clients-csv-export.ts` +
`components/clients-csv-export-dialog.tsx` pattern for consistency.

## Decisions locked (interview)

| Topic | Decision |
|---|---|
| Grain | **Detail**, one row per **(client, collection, model)**. A collection-only entry → its own row with blank Model; a model-bearing entry → its own row. |
| Intents | **Aggregated distinct intents per (client, collection)**, repeated across that group's model-variant rows. Joined `"; "` in fixed order interested→promo→arrival. |
| Columns | Collection, Model, First Name, Last Name, Phone, Email, Owner, Intents. (No heat.) |
| Scope modes | User chooses in the dialog: **All** / **Selected collection** (only if one is selected) / **Current filter** (collection-name search; only if query non-empty). RBAC scoping always applied on top. |
| Mechanism | Server action `exportCollectionsCsv()` → `{ csv, rowCount, truncated }`; `CollectionsCsvExportDialog` mirroring the clients one (preview, Copy, Download); triggered from an "Export CSV" button in the Collections card header. |
| RBAC | Same as clients export: managers → all clients; associates → only their own. Excludes banned/deleted clients. |
| CSV injection | **Harden this export** (neutralize cells starting `= + @ - \t \r`) via a shared `lib/csv.ts`; **file a follow-up** to retrofit `clients-csv-export.ts` onto it. Clients export untouched in this plan. |

## Success Criteria

1. `exportCollectionsCsv(scope)` (`"use server"`, `requireAuth`) returns
   `{ csv, rowCount, truncated }`, RBAC-scoped (manager all / associate
   own), excluding banned/deleted clients.
2. One row per (client, collection, model); collection-only entries
   emit a blank-Model row; model-only entries (no collection) are
   excluded (it's *collection* interest data).
3. `Intents` is the distinct set of intents across all of that client's
   entries for that collection, ordered interested→promo→arrival,
   joined `"; "`, identical across the group's model rows.
4. Columns exactly: `Collection, Model, First Name, Last Name, Phone,
   Email, Owner, Intents`.
5. Three scope modes work: all; a single selected collection;
   collection-name substring filter (case-insensitive) matching the
   page's search behavior.
6. RFC-4180 quoting **plus** formula-injection guard via shared
   `lib/csv.ts` (`csvCell`); a cell whose first char is
   `= + @ - \t \r` is prefixed with `'`.
7. Dialog from the Collections card header: scope radio (only valid
   options shown), live preview, row count, truncation warning, Copy,
   Download `collections-YYYY-MM-DD.csv`.
8. `tsc` clean; full vitest green incl. new unit tests.

## Architecture

- **`lib/csv.ts`** *(new)* — `csvCell(value): string`: RFC-4180 quoting
  (wrap on `,"\n\r`, double `"`) **and** prefix `'` when the trimmed
  value starts with `= + @ -` or contains a leading tab/CR. Pure,
  unit-tested. (Follow-up: switch `clients-csv-export.ts` to it.)
- **`lib/actions/collections-csv-export.ts`** *(new, "use server")* —
  `type CollectionsCsvScope = { mode: "all" } | { mode: "selected"; collection: string } | { mode: "filter"; query: string }`.
  `exportCollectionsCsv(scope)`:
  - `requireAuth`; `employeeId = role === "manager" ? undefined : user.id`.
  - Query clients (`id, firstName, lastName, phone, email,
    productsOfInterest`) + `leftJoin(employees)` for owner display
    name, `where status notIn (banned,deleted)` + employee scope,
    `limit LIST_QUERY_LIMIT + 1`; `truncated = rows > LIMIT`.
  - Expand: for each client, group entries by `collection` (skip
    entries with no collection). Per (collection): `intents` = distinct
    intents in canonical order. Emit one row per distinct `model`
    within the collection (collection-only entry contributes a row with
    `model = ""`); de-dupe identical (collection, model) within a
    client.
  - Apply `scope`: `selected` → only that collection, **exact match on
    the stored collection value** (the page selects a verbatim name);
    `filter` → collections whose name **includes** query
    case-insensitively (mirrors `collections-content`'s list search);
    `all` → no collection filter.
  - Build CSV with `csvCell`; header + rows; `rowCount` = emitted rows.
- **`components/collections-csv-export-dialog.tsx`** *(new, client)* —
  mirrors `ClientsCsvExportDialog`: props `{ open, onOpenChange, scope }`;
  fetches on open/scope change; preview `Textarea`, row count, truncation
  `Alert`, Copy, Download (`collections-YYYY-MM-DD.csv` via Blob).
- **`collections-content.tsx`** — add an "Export CSV" button in the
  left Collections `CardHeader`; manage dialog open state; build the
  `scope` from current UI: default `all`, plus `selected` when
  `selectedCollection` set and `filter` when `searchQuery` non-empty
  (radio in the dialog chooses among the available ones).

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Row explosion (client in many collections/models) | Truncation flag on the client-query cap (`LIST_QUERY_LIMIT+1`), surfaced in the dialog; rowCount reflects emitted rows |
| CSV/formula injection | Shared `csvCell` guards `= + @ - \t \r`; unit-tested |
| Divergence from clients export (now hardened, clients export not) | Explicit follow-up logged to migrate `clients-csv-export.ts` to `lib/csv.ts`; intentional, documented |
| Scope semantics drift vs the page's search | `filter` mode reuses the exact case-insensitive substring rule from `collections-content`; unit test asserts parity |
| Intent order nondeterminism breaks tests | Canonical order via `INTEREST_INTENT_VALUES`; deterministic join |
| Associate sees others' data | Role-scoped query (mirrors clients export); test with associate session |
| Owner name null (unassigned) | Emit empty Owner cell (same NULLIF/trim pattern as clients export) |

## Affected Files

| File | Change |
|---|---|
| `lib/csv.ts` *(new)* | `csvCell` — RFC-4180 + formula-injection guard |
| `lib/actions/collections-csv-export.ts` *(new)* | `exportCollectionsCsv(scope)` server action + types |
| `lib/actions.ts` | re-export the new action |
| `components/collections-csv-export-dialog.tsx` *(new)* | export dialog (mirrors clients one) |
| `app/(app)/analytics/collections/collections-content.tsx` | "Export CSV" button + dialog wiring + scope assembly |
| `__tests__/...` *(new)* | unit tests (below) |
| `docs/FEATURE-PROPOSALS.md` or a TODO note | log the clients-export hardening follow-up |

## Test Strategy

Unit (vitest, DB-backed like other action tests):
- Columns/header exact; one row per (client, collection, model).
- **CRIMSON ACE case**: client with `{null,"CRIMSON ACE"}` + `{"HX1005-01X","CRIMSON ACE"}` → two rows (blank-model + HX1005-01X), both `Intents` = aggregated distinct.
- Model-only entry (no collection) excluded; collection-only included.
- Intent aggregation: distinct, canonical order, joined `"; "`.
- Scope modes: `all` vs `selected` vs `filter` (substring, case-insensitive) row sets.
- RBAC: associate session → only own clients; banned/deleted excluded.
- `csvCell`: quoting for `,"\n\r`; `'` prefix for `= + @ -` / leading tab/CR; plain passthrough otherwise.
- Truncation flag when client query exceeds `LIST_QUERY_LIMIT`.

## Validation and Diagnostics

After impl: `tsc --noEmit` clean; full `vitest run` green; manual
smoke — open Collections, Export CSV with each scope mode, verify
preview/row count/truncation, Copy + Download filename, associate vs
manager scoping, a name like `=cmd()` renders `'=cmd()`.

## Open Questions

- [ ] Exact follow-up location for the clients-export hardening note (FEATURE-PROPOSALS.md vs inline TODO) — Can proceed (pick during impl).
- [ ] Sort order of emitted rows (collection then client, vs client then collection) — Can proceed; default collection→last/first name for stable diffs.

## Implementation Checklist

- [ ] `lib/csv.ts` `csvCell` + unit test.
- [ ] `lib/actions/collections-csv-export.ts` (scope types, query, expansion, intent aggregation, scope filters, CSV build) + barrel export.
- [ ] `CollectionsCsvExportDialog` mirroring the clients dialog.
- [ ] Collections page: Export button + scope assembly + dialog.
- [ ] Unit tests (all Test Strategy cases).
- [ ] Log clients-export hardening follow-up.
- [ ] `tsc` + full vitest; manual smoke; commit to `main` (no push).

## Out of scope

XLSX, scheduled/automated export, exporting the Summary grain,
retrofitting `clients-csv-export.ts` (separate follow-up).
