# IRIS Pattern-Hunt Backlog (created 2026-08-30)

X requested: hunt for these bug PATTERN CLASSES across the whole IRIS project.
They were all found incidentally during the data-tables work — each one is a
class, not a one-off.

## The three seed patterns

1. **Silent library default-downgrade.** TanStack Table v9 silently resolves an
   omitted `sortFn` to `basic` AND only warns in dev — meaning columns sort
   wrong with no error. Class: any library API where omitting an option falls
   back to a *behaviorally different but non-erroring* default.
   Hunt: audit every third-party API surface IRIS uses (TanStack, Drizzle,
   next-auth callbacks, zod, recharts, pdfjs) for options we omit where the
   default differs from what we'd choose. Greppable via library docs + the
   call-site inventory.
   *Note (Phase 3):* the original instance is gone — promos went server-side,
   so no Iris table registers a `sortFn` any more and every list surface runs
   with `manualSorting`. The *class* stands; the seed example is now historical.

2. **Implicit coercion bugs.** `null` sorted as the literal string
   `"-Infinity"` (mid-alphabet) because a comparator coerced every null with
   the same expression used for numbers. Class: `?? -Infinity` /
   `|| ''` / `Number(x)` / string+number concat in comparators, formatters,
   and sort keys. Hunt: grep comparators, `.sort(` callbacks, `localeCompare`
   call sites, and formatter functions for mixed-type coercion.

3. **Duplicated/inconsistent state identity.** `localStorage` existed on
   `window` but not `globalThis` (jsdom origin quirk) — 13 test failures that
   looked like 13 bugs but were one. Class: same logical resource reachable
   through two names/APIs that can disagree — `window.X` vs bare `X`, two
   caches of one query, URL state vs useState copies. Hunt: grep for
   `window.localStorage`/bare `localStorage`, `sessionStorage`, dual caches
   (`saved`+`optimistic`-style merging), URL-param vs state drift.
   *Note (Phase 3):* promos held a textbook instance — a `useState(promos)`
   copy of a server prop, resynced by an effect and spliced directly by delete
   and clear-all. It's gone; the three list surfaces now have one writer each.
   Remaining candidates live in `hooks/use-optimistic.ts` and the dialogs that
   merge saved + optimistic rows.

## Where to run it
Whole repo: `lib/`, `components/`, `app/`, `hooks/`, plus the test suite.
Best executed as a Claude Code read-only audit pass (opus high) with these
three pattern definitions + file:line evidence required, playbook-style.

## Status
**HOLD until Phase 4 lands** (X decision, 8/30) — read-only pass, so it can also run anytime nothing else is writing to the tree.
- [ ] Pattern-hunt audit dispatched
- [ ] Findings triaged (fix now / fold into Phase 3-4 / dismiss)
