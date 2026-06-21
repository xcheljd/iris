# CLAUDE.md

> Project facts and real commands live in [AGENTS.md](./AGENTS.md) — read it first.

## How to work here

- Before writing code: run the tests, reproduce the issue, read the relevant module in `lib/` or `app/`.
- Prefer small, reviewable commits. Use Conventional Commit prefixes (`feat:`, `fix:`, `refactor:` — see AGENTS.md).
- Run `pnpm lint` + `pnpm test` before declaring a change done.
- When you change a command, config, or convention, update AGENTS.md in the same commit.

## Coding principles

1. **Think before coding** — state assumptions explicitly. If uncertain, ASK rather than guess. Surface tradeoffs and multiple interpretations when ambiguity exists.
2. **Simplicity first** — minimum code that solves the problem. No speculative abstractions, no unrequested options, no error handling for impossible scenarios.
3. **Surgical changes** — touch only what the request requires. Match existing style. If you notice unrelated dead code, MENTION it — don't delete it. Every changed line traces to the request.
4. **Goal-driven execution** — define success criteria and loop until verified. Prefer "write a test that reproduces the bug, then make it pass" over "fix the bug."

## Agent discipline (multi-step workflows)

- **Read before you write** — before editing a file, read its exports, callers, and shared utilities. Never add a function next to an identical one you didn't read.
- **Checkpoint between steps** — on 3+ step tasks, stop after each significant step: summarize what's done, what's verified, what remains. Don't continue if a step is broken.
- **Budget your context** — ~4,000 tokens/task, ~30,000/session. Near the cap: summarize progress, commit, recommend a fresh session.
- **Fix a bug → add a regression test.** Highest-leverage quality rule.

## Iris-specific

- **Synthetic data only.** Brands are Meridian/Ashford/Voss/Chamberlain/Kinetic. Never introduce real customer or brand data.
- **Server actions** go in `lib/actions/<domain>.ts`, re-exported via `lib/actions.ts`. Validate with zod (`lib/validation/`).
- **Vitest is serial** (`fileParallelism: false`) — tests share the SQLite DB. Don't change this without isolating the DB per test.

## Verification gate (before "done")

- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes (including any new regression test)
- [ ] no secrets or `.env.local` committed
- [ ] AGENTS.md updated if commands/conventions changed
