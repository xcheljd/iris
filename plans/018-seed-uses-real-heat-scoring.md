---
plan: "018"
title: "Make seed.ts use calcHeatScore and stop randomising demo heat"
category: Data Integrity
priority: P2
effort: S
risk: Low
confidence: High
depends_on: —
written_against: 79f3c29
---

## Why this matters

There are two heat-scoring implementations and they disagree.

`lib/heat-score.ts` (`calcHeatScore`) is what production uses. `lib/db/seed.ts:198-207`
reimplements scoring inline with different rules:

| Signal | `lib/heat-score.ts` | `lib/db/seed.ts` |
|---|---|---|
| Has purchase | +15 | +15 |
| Purchase < 90d | +10 | +10 |
| On email list | +5 | +5 |
| Has interests | +5 | +5 |
| Has birthday | +3 | +3 |
| Responded to outreach in 90d | **+10** | — (no equivalent) |
| Outreach < 30d | — | **+15** |
| Outreach stale (>90d or never) | −15 | −15 |
| Outreach very stale (>180d or never) | **−10 additional** | — |
| Random jitter | — | **`+ Math.floor(Math.random() * 30)`** |

Consequences, all measured on a clean seed at `79f3c29`:

- **Displayed heat is noise.** Stored scores come from the seed formula plus up to +29 of
  RNG. They are shown in at least five places — the clients table, the dashboard, the
  client detail `HeatScoreBar`, and the follow-ups list.
- **4 of 22 clients change level** the moment `recalcHeat` first runs on them. Example:
  Daniel Martinez, stored 69/warm, computes to 38/cold. `recalcHeat` fires from
  `lib/actions/outreach.ts:88` (`logOutreach`), `lib/actions/clients.ts:349`
  (`mergeClients`), and `lib/actions/clients.ts:408`
  (`graduateProspectIntoExistingClient`) — so the demo degrades as soon as it is used.
- **The demo is not reproducible.** `Math.random()` is never seeded. Two consecutive
  `pnpm db:seed` runs produced `{cold:17, warm:5}` and `{cold:19, warm:3}`.

This plan makes the seed consistent with production. It deliberately does NOT change the
scoring rules or thresholds — that is plan 019, which needs this landed first so its
measurements mean something.

## Step 0 — Drift check

```bash
git diff --stat 79f3c29..HEAD -- lib/db/seed.ts lib/heat-score.ts
```

## Step 1 — Record the current distribution

```bash
pnpm db:seed
sqlite3 data/iris.db "select heat_level, count(*) from clients group by 1;"
sqlite3 data/iris.db "select min(heat_score), max(heat_score), avg(heat_score) from clients;"
```

Run it twice. The two runs will differ — that is the bug, and it is the baseline.

## Step 2 — Replace the inline scoring with `calcHeatScore`

In `lib/db/seed.ts`, delete lines 198-207 (the `let heat = 0; ...` block through the
`const level = ...` line) and call the real function instead.

Two mismatches to handle deliberately:

- `calcHeatScore` takes `Pick<Client, "onEmailList" | "productsOfInterest" | "birthday" |
  "status" | "lastOutreachAt" | "lastPurchaseAt">` with `Date` fields, but the seed works in
  raw unix **seconds** (`const now = Math.floor(Date.now() / 1000)`). Convert with
  `new Date(seconds * 1000)`; do not pass raw integers.
- Its second argument is the client's outreach logs from the last `HEAT_LOOKBACK_DAYS`.
  The seed generates `lastOutreach` as a bare timestamp before any `outreach_logs` rows
  exist. Restructure so outreach logs are generated first, then heat is computed from them
  — mirroring `recalcHeat` in `lib/actions/outreach.ts:13-24`, which is the behaviour the
  seed should reproduce.

## Step 3 — Make the seed deterministic

`Math.random()` is called at `lib/db/seed.ts:135, 137, 141, 173, 181, 184, 187, 190, 191,
192` for names, phones, interests, tags, email-list membership, and dates.

Introduce a small seeded PRNG (a mulberry32/xorshift helper local to `seed.ts` is enough —
do not add a dependency) with a fixed constant seed, and replace every `Math.random()` call
with it. Allow an override via `process.env.SEED` so a different demo can be generated on
purpose.

Do NOT reintroduce jitter into the heat score. The score must be a pure function of the
generated client data.

## Step 4 — Verification gate

```bash
pnpm lint
pnpm test
pnpm db:seed && sqlite3 data/iris.db "select heat_level, count(*) from clients group by 1;"
pnpm db:seed && sqlite3 data/iris.db "select heat_level, count(*) from clients group by 1;"
```

Required results:
- The two seed runs produce **identical** distributions.
- Every client's stored `heat_score` equals what `calcHeatScore` computes for it. Verify by
  script rather than by eye: read each client, recompute, assert equality across all 22.
- `pnpm test` still passes.

Expect the distribution to get *worse-looking* — with the jitter gone, most clients will be
cold and `warm` may drop to 1. That is the true output of the current scoring function and
is the input plan 019 needs. Do not compensate by tuning the seed.

## STOP conditions

- If removing the jitter empties a seeded smart list (the `Hot Clients` list at
  `lib/db/seed.ts:300` filters `{"heatLevel":"hot"}` and is already always empty), do not
  fix it here by re-adding randomness. Record it and let plan 019 address the thresholds.
- If tests depend on specific seeded heat values, they were depending on RNG output and
  were already flaky. Fix the test to create its own fixture; report which ones.

## Maintenance note

`AGENTS.md` should gain a line under Conventions: heat is computed in exactly one place,
`lib/heat-score.ts`. Anything that needs a heat value calls `calcHeatScore` — seeds,
migrations and tests included.
