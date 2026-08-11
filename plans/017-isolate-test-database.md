---
plan: "017"
title: "Isolate the test database from the demo database"
category: Test Infrastructure
priority: P1
effort: M
risk: Medium
confidence: High
written_against: 79f3c29
depends_on: —
---

## Why this matters

`pnpm test` writes to `data/iris.db` — the same file `pnpm dev` serves. `vitest.config.ts`
sets no `DATABASE_PATH`, and `__tests__/setup.ts` imports `@/lib/db`, which resolves
`DATABASE_PATH ?? "data/iris.db"` (`lib/constants.ts:28`). Every test run mutates the demo.

Measured damage in `data/iris.db` before it was restored on 2026-08-11:

| Symptom | Measured |
|---|---|
| Client rows | 365, against a seed that creates 22 |
| Leaked rows | ~339 across 12 fixture first names, ~28–30 copies each |
| `promo_watches` | 0 — seed creates 10; tests had deleted them all |
| `employees` | 7 — `setup.ts` permanently injects 2 via `INSERT OR IGNORE` |
| `activity_events` | 276 |

Worst offenders by fixture name: `prospect-actions.test.ts` (`GradTest`, `GradStatus`,
`GradEvent`, `AssocGrad`, `EventClient`, `Existing`, `ExistingFilled`, `Rejected`),
`model-catalog.test.ts` (`Cascade`, 30 copies), `api/clients.test.ts` (`Minimal`, `Updated`).

Per-test cleanup is the wrong fix — it has been tried (see plan 014, and the leaked-row
bug fixed in `769036e`) and one missed `afterEach` silently reintroduces the problem.
Isolate the database instead.

`fileParallelism: false` in `vitest.config.ts` exists solely because tests share this one
DB. It can stay for now — do not change it in this plan.

## Step 0 — Drift check

```bash
git diff --stat 79f3c29..HEAD -- vitest.config.ts __tests__/setup.ts lib/db/index.ts lib/db/ensure-schema.ts drizzle.config.ts lib/constants.ts
```

If any of these changed, re-read them before proceeding.

## Step 1 — Reproduce the leak

```bash
cp data/iris.db /tmp/iris-before.db
pnpm test
sqlite3 data/iris.db "select first_name, count(*) c from clients group by 1 having c>1 order by c desc;"
```

Expect fixture names with counts incrementing by one per run. Record the numbers — Step 6
compares against them.

## Step 2 — Make `drizzle.config.ts` honor `DATABASE_PATH`

It currently hardcodes `dbCredentials: { url: "./data/iris.db" }`, so `drizzle-kit push`
cannot target a test database. Change it to read the same env var `lib/constants.ts` uses,
with the identical default:

```ts
dbCredentials: { url: process.env.DATABASE_PATH ?? "./data/iris.db" },
```

Verify the default path is unchanged for a normal `pnpm db:push`.

## Step 3 — Fix the fresh-database crash in `ensure-schema.ts`

VERIFIED FAILURE: on a database with no tables, `lib/db/index.ts:27` calls
`ensureClientColumns`, which at `lib/db/ensure-schema.ts:61-68` runs

```sql
SELECT 1 FROM pragma_table_info('clients') WHERE name = 'preferred_contact'
```

`pragma_table_info` on a missing table returns no rows rather than erroring, so the guard
concludes the column is absent and executes `ALTER TABLE clients ADD COLUMN ...`, which
throws `SqliteError: no such table: clients` and aborts module load. `ensureModelCatalog`
survives because it uses `CREATE TABLE IF NOT EXISTS`.

Fix `ensureClientColumns` and `ensurePromoColumns` to return early when the table itself is
absent:

```sql
SELECT 1 FROM sqlite_master WHERE type='table' AND name='clients'
```

This is a real bug independent of testing — it means a fresh clone crashes on any import of
`@/lib/db` before `pnpm db:push` has run.

## Step 4 — Create and seed the test database in a vitest `globalSetup`

Add `test.globalSetup` to `vitest.config.ts` pointing at a new
`__tests__/global-setup.ts` that:

1. Picks a path outside `data/` — e.g. `.vitest/iris.db` (already covered by the `*.db`
   rule in `.gitignore`; confirm before relying on it).
2. Sets `process.env.DATABASE_PATH` to that **relative** path. It must be relative:
   `lib/db/index.ts:10` does `path.join(process.cwd(), DATABASE_PATH)`, so an absolute path
   is silently appended to the cwd.
3. Runs `drizzle-kit push` and then `lib/db/seed.ts` against it, both with `DATABASE_PATH`
   set. Order matters — `seed.ts:1` documents that push must run first, and Step 3's fix
   does not create tables, it only stops the crash.
4. Deletes the file on teardown, or truncates at setup so each run starts clean.

`globalSetup` runs in a separate process from the test files, so exporting the env var from
it is not enough on its own — confirm the value reaches the test process (vitest forwards
`process.env` mutations made in `globalSetup` to workers; verify empirically, and fall back
to `test.env` in `vitest.config.ts` if it does not).

## Step 5 — Decide what `setup.ts` should still do

`__tests__/setup.ts` inserts two employees and a client with hardcoded UUIDs because
`seed.ts` generates random ones. With a dedicated seeded test DB those inserts are still
needed — keep them — but they are no longer polluting the demo, so the `INSERT OR IGNORE`
idempotency comment can stay as-is. Do not delete these rows; many tests depend on the IDs.

## Step 6 — Verification gate

```bash
pnpm lint
md5sum data/iris.db
pnpm test
md5sum data/iris.db
```

Required results:
- Both checksums identical — the demo DB is untouched by a test run.
- `pnpm test` passes 705+ tests (the count at `79f3c29`; the plan 018/019 work and the
  in-flight associate-session tests may raise it).
- `sqlite3 data/iris.db "select count(*) from clients;"` still returns 22.
- Repeat `pnpm test` twice more; the isolated DB's client count must not grow between runs.

## STOP conditions

- **If tests fail against a freshly seeded isolated DB, do not paper over it.** Some tests
  may depend on rows that accumulated in the polluted DB rather than on seed data. Each
  such failure is a real test bug — fix the test to create its own fixture. Report any test
  that cannot be made to pass against a clean seed instead of reverting the isolation.
- If `drizzle-kit push` cannot be driven from `globalSetup` (it is a CLI, not a library),
  do not shell out blindly — check whether the schema can be created by executing the
  generated SQL in `drizzle/` instead, and note which approach you took.
- If `globalSetup` cannot propagate `DATABASE_PATH` to workers by any supported mechanism,
  stop and report rather than reintroducing a shared DB.

## Maintenance note

Once this lands, `AGENTS.md`'s "Vitest must stay serial — tests mutate the shared SQLite DB"
gotcha is out of date. Update it in the same commit: the DB is no longer shared with the
demo, and a follow-up plan can evaluate re-enabling `fileParallelism` with a per-worker
database.
