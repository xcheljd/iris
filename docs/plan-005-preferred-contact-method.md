# Plan 005: Preferred Contact Method (+ require last name)

Foundational client data-model addition, prerequisite for the promo
list sort/filter and the Matched Clients tab/export. Dev-stage: no
migration — schema + ensure-schema self-heal + reseed (same approach as
plan-002/003).

## Decisions locked (interview)

| Topic | Decision |
|---|---|
| Values | `call`, `text`, `email` only — **no in-person** (store doesn't do in-person visits). New `PREFERRED_CONTACT_VALUES`. |
| Requiredness | **Required on create** (and on prospect graduation). DB column stays nullable (so direct/test inserts and pre-reseed rows don't break); requiredness enforced at the create/graduate **validation + form** layer. Reads treat null as "—". |
| Also | **Make `lastName` required** on create + graduation + `validateClientForm` (currently optional). DB column unchanged (nullable). |
| Editability | All client write paths: new-client page, edit dialog, edit page, graduate-prospect dialog. |
| Seed | Derive from each client's **most-frequent logged outreach method**; if none or it's `in-person`, fall back to a **random** pick of call/text/email. Seed always sets a value. |
| Distinctness | Separate from `onEmailList` (promo-email opt-in) and `status` (unsubscribed/banned). No "do not contact" value — status handles that. |

## Success Criteria

1. `PREFERRED_CONTACT_VALUES = ["call","text","email"]`; `clients.preferredContact` text enum, **nullable** at the DB layer; `ensure-schema` idempotently adds the column to existing dev DBs.
2. `clientCreateSchema` and `graduateProspectSchema` **require** `preferredContact` (valid enum) **and** a non-empty `lastName`. `clientPatchSchema` includes `preferredContact` (optional, partial). `validateClientForm` also rejects empty last name.
3. The four client forms expose a required Preferred Contact control and mark Last Name required; submit is blocked until both are set.
4. Graduation, merge (`patchClientFromFormMerge`, `mergeClients`), `applyClientPatch`, onboarding demo client all carry `preferredContact`.
5. `FullClient` gains `preferredContact`; Profile tab (and client sidebar) display it ("—" when null).
6. Seed assigns every client a value via derive→fallback-random; reseed succeeds.
7. `tsc` clean; full vitest green (fixtures updated + new validation tests).

## Design / Architecture

- **schema.ts**: `export const PREFERRED_CONTACT_VALUES = ["call","text","email"] as const;` + `export type PreferredContact = …`. `clients.preferredContact: text("preferred_contact", { enum: PREFERRED_CONTACT_VALUES })` — **no `.notNull()`** (validation enforces requiredness; keeps direct inserts/tests working).
- **ensure-schema.ts**: idempotent `ALTER TABLE clients ADD COLUMN preferred_contact TEXT` guarded by `pragma_table_info` (the existing self-heal pattern used for model_catalog flag cols).
- **validation/client.ts**:
  - `clientCreateSchema`: `lastName: z.string().min(1, "Last name is required").max(100)` (was `nullableStr().optional()`); add `preferredContact: z.enum(PREFERRED_CONTACT_VALUES)`.
  - `clientPatchSchema`: add `preferredContact: z.enum(...)` (stays `.partial()`).
  - `validateClientForm`: also `if (!data.lastName?.trim()) return "Last name is required"`.
- **validation/rvx.ts** (`graduateProspectSchema`): `lastName` required; add `preferredContact` required enum.
- **client-form.tsx**: add `preferredContact` to `ClientFormData`; a required segmented/select control (Call/Text/Email); mark Last Name required; the form-level validate path blocks submit.
- **Parents**: `clients/new/page.tsx`, `clients/[id]/edit/edit-client-form.tsx`, `edit-client-dialog.tsx`, `graduate-prospect-dialog.tsx` — add `preferredContact` to form state + payload.
- **actions**: `clients.ts` (`applyClientPatch` passthrough; `patchClientFromFormMerge` + `mergeClients` carry/choose it), `prospects.ts` graduation insert, `onboarding.ts` demo client.
- **client-provider.tsx**: `FullClient.preferredContact: PreferredContact | null`.
- **Display**: `profile-tab.tsx` (a "Preferred contact" row) and optionally `client-sidebar.tsx`; render "—" when null. Label-case the value.
- **seed.ts**: the per-client outreach logs are generated *after* the
  client insert, so derivation can't precede the insert. Collect each
  client's generated outreach `method`s during that loop, then **UPDATE
  `preferred_contact` after the loop**: mode of the methods, excluding
  `in-person`; if empty/only-in-person → random of call/text/email.
  (Insert may set a provisional random value; the post-loop update
  finalizes it.)
- **api/clients/route.ts**: no change beyond schema (passes validated data through).

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Requiring `lastName` breaks existing client-creation flows/tests | DB column stays nullable; only create/graduate **validation** tightened. Audit form/API creation tests for missing lastName; direct `db.insert` test fixtures bypass validation and are unaffected |
| Pre-reseed / direct-insert rows have null preferredContact | Column nullable; all reads render null as "—"; required only at create/graduate validation |
| Wide spread (≈ plan-002 footprint) | tsc surfaces every construction site; mechanical; gate on tsc + full vitest before commit |
| Seed mode-derivation when history is in-person/empty | Explicit fallback to random call/text/email; unit-tested helper |
| Enum drift vs OUTREACH_METHOD_VALUES (which has in-person) | Separate constant `PREFERRED_CONTACT_VALUES`; do not reuse the outreach enum |

## Affected Files

`lib/db/schema.ts`, `lib/db/ensure-schema.ts`, `lib/validation/client.ts`,
`lib/validation/rvx.ts`, `components/client-form.tsx`,
`app/(app)/clients/new/page.tsx`,
`app/(app)/clients/[id]/edit/edit-client-form.tsx`,
`components/edit-client-dialog.tsx`,
`components/graduate-prospect-dialog.tsx`, `lib/actions/clients.ts`,
`lib/actions/prospects.ts`, `lib/actions/onboarding.ts`,
`components/client-provider.tsx`, `components/profile-tab.tsx`
(+ optionally `client-sidebar.tsx`), `lib/db/seed.ts`, tests.

## Test Strategy

- Unit (validation): `clientCreateSchema`/`graduateProspectSchema` reject
  missing/invalid `preferredContact` and missing `lastName`; accept valid;
  `clientPatchSchema` allows partial; `validateClientForm` rejects empty
  last name.
- Seed helper: most-frequent-method derivation; in-person/empty → random
  in {call,text,email} (deterministic via injected picker or assert ∈ set).
- Action/DB: graduation + merge + applyClientPatch persist
  `preferredContact`.
- Component: a form renders the required control; Profile tab shows the
  value / "—".
- Update existing fixtures (FullClient, client-form props, any
  create-client validation tests) to include `preferredContact` /
  `lastName`.

## Validation and Diagnostics

`tsc --noEmit` clean (app + tests, excl. remotion-demo); full `vitest
run` green; `npm run db:seed` succeeds; manual smoke — create a client
(blocked until last name + contact set), edit, graduate a prospect,
Profile tab shows it, drop+boot recreates the column.

## Open Questions

- [ ] Show in client sidebar too, or Profile tab only? — Can proceed (Profile tab; sidebar optional, decide during impl).
- [ ] Control style: segmented toggle vs Select — Can proceed (match existing form conventions, likely Select like `source`).

## Implementation Checklist

- [ ] schema: `PREFERRED_CONTACT_VALUES`, `clients.preferredContact` (nullable enum); ensure-schema ALTER + drop/boot verify.
- [ ] validation/client.ts + rvx.ts: require preferredContact + lastName; patch optional; validateClientForm.
- [ ] client-form.tsx: control + required lastName; ClientFormData.
- [ ] 4 parents: state + payload.
- [ ] actions: clients (patch/merge), prospects graduation, onboarding.
- [ ] client-provider FullClient; profile-tab display.
- [ ] seed: derive+fallback-random; reseed.
- [ ] tests (validation, seed helper, action persistence, fixtures).
- [ ] tsc + full vitest + db:seed; manual smoke; commit to `main` (no push).

## Out of scope

The promo list sort/filter, the Matched Clients tab, and the matched-
clients CSV export (subsequent steps that consume this field).
