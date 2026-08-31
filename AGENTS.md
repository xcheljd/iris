# Iris

A self-hosted clienteling/CRM web app for Meridian Watch retail — replaces a spreadsheet workbook with a fast, mobile-friendly Next.js app. **Portfolio demo with synthetic data only.**

## Quick commands

| Action | Command |
|--------|---------|
| Install deps | `pnpm install` |
| Dev server | `pnpm dev` → http://localhost:3000 |
| Build | `pnpm build` |
| Start (prod) | `pnpm start` |
| Lint | `pnpm lint` |
| Run all tests | `pnpm test` |
| One test (watch) | `pnpm test:watch` |
| Push schema → DB | `pnpm db:push` |
| Seed DB | `pnpm db:seed` |

> `pnpm` is the only supported package manager — `pnpm-lock.yaml` is the sole lockfile. Do not run `npm install`; it creates a divergent `package-lock.json`.

## Tech stack

- **Language:** TypeScript 5 (`strict: true`, `target: ES2022`)
- **Framework:** Next.js 15 (App Router, React Server Components), React 19
- **UI:** shadcn/ui (New York style) + Tailwind CSS 3, Radix primitives, lucide icons, sonner toasts
- **DB:** SQLite via `better-sqlite3`; ORM: Drizzle ORM (`drizzle-kit`)
- **Auth:** NextAuth.js (Credentials provider, JWT sessions) — needs `NEXTAUTH_SECRET` + `NEXTAUTH_URL`
- **Forms/validation:** hand-rolled forms validated with zod
- **Charts:** Recharts
- **PDF parsing:** `pdfjs-dist` (client-side, worker copied via `postinstall`)
- **Tests:** Vitest 4 + Testing Library + jsdom
- **Runtime:** Node 20+, path alias `@/*` → project root

## Architecture

- **`app/`** — Next.js App Router. `app/(app)/` is the authenticated layout (sidebar + command palette) with one route per domain (clients, promos, catalog, prospects, analytics, approvals, settings…). `app/api/` = REST routes. `app/login/` = auth.
- **`lib/`** — shared logic. `lib/actions.ts` is the **server-actions barrel** (re-exports `lib/actions/*`); `lib/db/` = schema, connection, seed, FTS; domain parsers in `lib/` (`promo-pdf-parser.ts`, `rvx-parser.ts`, `rvx-catalog-parser.ts`); read queries in `lib/queries.ts`; zod schemas in `lib/validation/`.
- **`components/`** — React components; `components/ui/` = shadcn primitives; domain groups (`catalog/`, `promo/`, `merge/`, `onboarding/`). `components/data-table/cells.tsx` is the shared cell vocabulary every `<Table>` surface renders through — reach for a renderer there (or add one) instead of hand-writing a `<TableCell>` for money, dates, badges or dash-fallback text.
- **`__tests__/`** — mirrors source: `unit/` (pure logic), `components/` (incl. `onboarding/`), `api/` (route handlers).
- **`data/iris.db`** — SQLite file (gitignored); Drizzle migrations in `drizzle/` (gitignored, generated).
- **`docs/`** — ARCHITECTURE.md, FEATURE-PROPOSALS.md, REST-API-EXPANSION.md.

**Data flow:** client form → zod → server action (`lib/actions/*`) → Drizzle → SQLite. PDF/CSV imports parse client-side (pdfjs-dist) or in `lib/` parsers, then bulk-insert.

## Conventions

- **Commits:** Conventional Commits — `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`, `perf:`. Optional scope in parens: `feat(ux)`, `feat(a11y)`, `fix(onboarding)`, `chore(demo)`, `refactor(ui)`.
- **Branching:** trunk-based, single `main` branch. Remote is `origin` → https://github.com/xcheljd/iris (private). No PR template — direct commits.
- **Naming:** components PascalCase, lib/util modules kebab-case. Tests mirror source path under `__tests__/`.
- **Lint:** `next/core-web-vitals` + `next/typescript`, run as `eslint .` over the **whole**
  repo. (`next lint` only covered `app/`, `components/`, `lib/`, `pages/` and `src/`, which
  left `__tests__/`, `hooks/` and every root config unlinted; it is also removed in Next.js
  16.) Exclusions live in `.eslintignore` — build output, generated files, `public/`, and
  `remotion-demo/`. Unused vars **must** be prefixed `_` (enforced). `.eslintrc.json` sets
  `"root": true` — without it ESLint 8 walks up past the repo, which breaks linting from a
  git worktree under `.claude/worktrees/` (it finds the parent checkout's identical config and
  aborts on a duplicate `@next/next` plugin).
- **Heat scoring:** computed in exactly one place — `lib/heat-score.ts` (`calcHeatScore`).
  Seeds, migrations and tests call it; nothing reimplements the rules inline. The seed is
  deterministic (mulberry32 PRNG, override with `SEED=<n>`) — do not reintroduce
  `Math.random()` jitter.

## Testing

- **Runner:** Vitest (jsdom, `globals: true`), setup at `__tests__/setup.ts`.
- **Layout:** `__tests__/unit/`, `__tests__/components/`, `__tests__/api/`. Files: `*.test.ts(x)`.
- **`fileParallelism: false`** — tests share one SQLite DB; do not enable parallelism.
- **Coverage target:** 70-80% floor. Many unit + component tests; few integration.
- **Ownership-sensitive tests must create their own client.** `__tests__/setup.ts` inserts the
  shared fixture client (`e18e3ba8-…`) owned by the **associate** (`590628cf-…`), so it cannot
  stand in for "a client this associate does not own". Insert a client with the owner the test
  needs and clean it up. Ambient ownership is not a contract — asserting against it makes the
  test pass or fail on file ordering.
- **Hardcoded employee IDs must come from `__tests__/setup.ts`**, never invented. `seed.ts`
  generates random employee UUIDs, and `clients.employee_id` is a FK with `foreign_keys = ON`,
  so an unknown id makes writes throw — which bulk helpers swallow into `ok: 0`.

## Do

- Run `pnpm test` (and lint) before declaring a change done.
- Add a regression test for every bug fix.
- Keep **all** data synthetic — brands are Meridian, Ashford, Voss, Chamberlain, Kinetic (never real names).
- Add new server actions under `lib/actions/<domain>.ts` and re-export through `lib/actions.ts`.
- Validate inputs with zod schemas in `lib/validation/`.

## Don't

- Don't commit `.env.local` or any `*.db` / `*.db-*` file.
- Don't use real customer PII or real watch brand/catalog data — this is a synthetic demo.
- Don't hand-edit `drizzle/` migrations — regenerate from `lib/db/schema.ts` via `pnpm db:push`.
- Don't delete `public/pdf.worker.min.mjs` — it's copied by `postinstall` and required for PDF import.

## Gotchas

- **Fresh clone has no DB.** Run `pnpm db:push && pnpm db:seed` first. Default login: `Marcus` / `meridian` (shown on login page). This applies to a fresh **git worktree** too — `lib/db/index.ts` resolves `data/iris.db` from `process.cwd()` and `data/` is gitignored, so every DB-touching suite dies with `no such table: clients` until you seed.
- **`postinstall` copies the PDF worker** (`node_modules/pdfjs-dist/.../pdf.worker.min.mjs` → `public/`). If you prune node_modules manually, re-run `pnpm install` or promo PDF import breaks silently.
- **Tests use a dedicated database** at `.vitest/iris.db` — created and seeded by `__tests__/global-setup.ts` (`drizzle-kit push` + `seed.ts`) each run. `data/iris.db` (the demo DB, served by `pnpm dev`) is never touched by a test run. `fileParallelism: false` still applies — tests share that one *test* DB.
- **WAL grows.** `data/iris.db-wal` can balloon during heavy test/dev runs; checkpoint or delete WAL/SHM while the server is stopped.
- **NextAuth requires env vars** in `.env.local` (`NEXTAUTH_SECRET`, `NEXTAUTH_URL`) or auth fails at runtime.
