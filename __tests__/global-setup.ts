/**
 * Vitest globalSetup — creates and seeds a dedicated test database at
 * `.vitest/iris.db` so the demo database (`data/iris.db`, served by
 * `pnpm dev`) is never touched by a test run.
 *
 * Runs once per test run, in its own process, before any test file.
 * The path is RELATIVE on purpose: `lib/db/index.ts` does
 * `path.join(process.cwd(), DATABASE_PATH)`, so an absolute path would
 * silently be appended to the cwd and create a phantom DB elsewhere.
 *
 * `test.env.DATABASE_PATH` in vitest.config.ts mirrors the same value so
 * workers (separate processes from this one) resolve the same file even
 * though process.env mutations made here do not propagate to them.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const TEST_DB_REL = ".vitest/iris.db";

export default async function setup(): Promise<() => void> {
  process.env.DATABASE_PATH = TEST_DB_REL;

  const testDir = path.join(process.cwd(), ".vitest");
  // Clean start every run: a previous run's DB must not leak rows into this one.
  fs.rmSync(testDir, { recursive: true, force: true });
  fs.mkdirSync(testDir, { recursive: true });

  // Schema comes from schema.ts (source of truth) via drizzle-kit push,
  // exactly like `pnpm db:push`. The generated SQL files under `drizzle/`
  // are a stale snapshot (e.g. they still name the table kwi_import_batches)
  // and cannot be executed directly. drizzle-kit push is non-interactive
  // against a fresh database.
  execSync("pnpm exec drizzle-kit push", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_PATH: TEST_DB_REL },
    stdio: "pipe",
    timeout: 120_000,
  });

  // Seed by importing the seed script (side-effect module) in this process,
  // with DATABASE_PATH already set so lib/db/index.ts resolves the test file.
  await import("../lib/db/seed");

  // Teardown: remove the test DB. The globalSetup process still holds the
  // module-scoped SQLite connection, but the process exits after the run.
  return () => {
    fs.rmSync(testDir, { recursive: true, force: true });
  };
}
