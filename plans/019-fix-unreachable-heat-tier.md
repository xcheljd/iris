---
plan: "019"
title: "Fix the unreachable 'hot' tier and the never-contacted penalty"
category: Bug
priority: P2
effort: M
risk: Medium
confidence: High
depends_on: "018"
written_against: 79f3c29
---

## Why this matters

`calcHeatScore` in `lib/heat-score.ts` can never return `level: "hot"`.

Every positive term is a one-shot boolean guarded by its own `if`, so the ceiling is:

```
SCORE_HAS_PURCHASE        15
SCORE_RECENT_PURCHASE     10
SCORE_RESPONDED_OUTREACH  10
SCORE_ON_EMAIL_LIST        5
SCORE_HAS_INTERESTS        5
SCORE_HAS_BIRTHDAY         3
                        ----
                          48   <   HEAT_THRESHOLD_HOT = 70
```

Every other term is a penalty. Confirmed empirically: running `calcHeatScore` over a clean
22-client seed produced a maximum of exactly 48 (one client, still classified `warm`), and
`{cold: 21, warm: 1}` overall. Zero hot, at any input.

Two consequences in shipped surfaces:

- The seeded **"Hot Clients" smart list** (`lib/db/seed.ts:300`, filter
  `{"heatLevel":"hot"}`) is permanently empty. It is queried at `lib/queries.ts:48`,
  `lib/utils.ts:55` and `lib/client-filter-conds.ts:79`.
- The flame variant of `HeatBadge` (`components/heat-badge.tsx:5`) never renders. Heat is
  displayed at `app/(app)/clients/clients-content.tsx:468`, `app/(app)/page.tsx:157`,
  `components/client-detail-tabs.tsx:53`, and `app/(app)/follow-ups/follow-ups-content.tsx:284`.

There is a second, independent defect. `days()` returns `Infinity` when a date is null, and
both staleness branches are unguarded:

```ts
const lastOutDays = days(client.lastOutreachAt);          // Infinity when never contacted
if (lastOutDays > OUTREACH_STALE_DAYS)      score += -15; // fires
if (lastOutDays > OUTREACH_VERY_STALE_DAYS) score += -10; // also fires
```

So "never contacted" is penalised −25, harder than "contacted 179 days ago" (−15). A brand
new client with an email address, product interests and a birthday scores 13 − 25 = −12,
clamped to 0 by `Math.max(0, ...)`. **Every newly created client reads 0 / cold.**

## Step 0 — Prerequisite

Plan 018 must be DONE. Until the seed stops injecting up to +29 of random jitter, no
measurement in this plan is meaningful.

## Step 1 — Measure the true distribution

With 018 landed, compute `calcHeatScore` for all seeded clients and produce a histogram of
scores plus the level counts. Do not eyeball it — write a throwaway script, print the
numbers, and paste them into the PR description. This is the baseline any threshold change
has to beat.

## Step 2 — Product decision (do not skip, do not guess)

The scoring is not merely mis-thresholded; its dynamic range is 0–48 with most clients
crushed to 0 by the clamp. Pick one and record the reasoning in the commit message:

- **(A) Retune thresholds only.** Set `HEAT_THRESHOLD_HOT` / `HEAT_THRESHOLD_WARM` to fit
  the measured 0–48 range. Cheapest. Does not fix the clamp crushing the population, and on
  the measured data yields very few non-cold clients.
- **(B) Rescale to 0–100.** Reweight the six positive signals so a fully-engaged client
  approaches 100, keeping the existing 70/40 thresholds meaningful. Medium effort, keeps
  the tier labels as documented.
- **(C) Make signals graded rather than boolean.** Recency tiers for purchase and outreach,
  a count-based term for responses instead of the single `responded90` flag. Best model,
  most work, changes what "hot" means.

Whichever is chosen, resolve the never-contacted penalty explicitly: make the two staleness
branches mutually exclusive (`else if`), and decide separately what a null `lastOutreachAt`
should score — a new client and a lapsed one are different states and should not share a
penalty.

## Step 3 — Implement

Change only `lib/heat-score.ts`. The constants at the top of the file are already extracted
for this purpose — adjust values there rather than inlining numbers in the function body.

## Step 4 — Backfill stored values

`clients.heat_score` / `clients.heat_level` are stored columns. Existing rows keep their old
values until something calls `recalcHeat`. After changing the scoring, recompute for every
client so stored and computed agree. Reuse `recalcHeat` (`lib/actions/outreach.ts:13`)
rather than writing a second update path.

## Step 5 — Verification gate

```bash
pnpm lint
pnpm test
```

`__tests__/unit/heat-score.test.ts` contains a test named
`"caps at 48 with every positive signal set — 'hot' (>= 70) is unreachable"` which pins the
current ceiling **on purpose**. It MUST fail after this change. Replace it with real
threshold coverage: one test per tier boundary (cold/warm, warm/hot), each asserting both
`score` and `level`, plus a test that a newly created client with no outreach history does
not score 0.

Also required:
- Seed the DB and confirm the "Hot Clients" smart list returns a non-empty result, or
  delete that seeded list if the chosen option intentionally makes `hot` rare.
- Confirm the flame `HeatBadge` renders for at least one seeded client.

## STOP conditions

- If option (B) or (C) changes scores enough that seeded smart lists or the dashboard look
  wrong, stop and report before tuning further — the demo's data shape is a product
  concern, not a scoring one.
- Do NOT delete the `hot` tier as a shortcut. It is referenced in the DB schema enum
  (`lib/db/schema.ts:92`), the smart-list UI (`components/smart-lists/create-list-dialog.tsx:68`),
  the clients filter (`app/(app)/clients/clients-content.tsx:378`) and elsewhere. Removing
  it is a separate, larger plan.
- If the backfill in Step 4 would rewrite rows a user has manually curated, stop and ask.

## Maintenance note

Add a test that asserts the maximum achievable score is `>= HEAT_THRESHOLD_HOT`. That single
invariant would have caught this bug at the moment it was introduced, and will catch it
again if the constants drift apart.
