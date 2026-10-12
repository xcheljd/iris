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
 *
 * ## Run lock (anti-flake)
 * Two concurrent `pnpm vitest run` invocations (a killed-but-orphaned
 * agent shell plus a fresh background run, two terminals, CI + local)
 * share `.vitest/iris.db`, and the first run's teardown `rmSync`s the
 * file out from under the second run's workers — every DB-backed test
 * then fails with "SqliteError: no such table" in bulk. The fix: hold an
 * exclusive `flock` on `.vitest/run.lock` for the WHOLE run (acquired in
 * setup, released in teardown), so a second run blocks until the first
 * finishes instead of racing it.
 *
 * ## Post-push schema validation
 * `drizzle-kit push` can exit 0 while producing a half-built schema (its
 * own crashes have left an empty DB with rc=0 in the wild). The setup
 * asserts the `clients` table exists after push and fails loudly,
 * turning a downstream wall of 389 "no such table" failures into one
 * clear error at setup time.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const TEST_DB_REL = ".vitest/iris.db";

export default async function setup(): Promise<() => void> {
  process.env.DATABASE_PATH = TEST_DB_REL;

  const testDir = path.join(process.cwd(), ".vitest");
  // Exclusive lock held for the whole run (see header: anti-flake). The
  // lock file lives in .vitest, so recreate the dir first, then open a
  // dedicated fd we keep open until teardown releases it.
  fs.mkdirSync(testDir, { recursive: true });
  const lockFd = fs.openSync(path.join(testDir, "run.lock"), "w");
  // The fd must be passed INTO the child as one of its stdio slots (fd 3):
  // a child process cannot see the parent's fd numbers, so a bare
  // `flock -x ${lockFd}` fails with "Bad file descriptor". The flock is held
  // on the shared open file description, so it outlives the child and stays
  // held until we close lockFd in teardown.
  execSync("flock -x 3", {
    stdio: ["ignore", "ignore", "pipe", lockFd],
    timeout: 600_000,
  });

  // Clean start every run: a previous run's DB must not leak rows into
  // this one. (Safe under the lock: concurrent runs queued behind us.)
  fs.rmSync(path.join(testDir, "iris.db"), { force: true });
  fs.rmSync(path.join(testDir, "iris.db-wal"), { force: true });
  fs.rmSync(path.join(testDir, "iris.db-shm"), { force: true });

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

  // Validate push actually produced a usable schema before seeding.
  const dbPath = path.join(testDir, "iris.db");
  if (!fs.existsSync(dbPath)) {
    throw new Error(
      "[global-setup] drizzle-kit push exited 0 but did not create the test database — aborting before a wall of 'no such table' failures.",
    );
  }
  const probe = new Database(dbPath, { readonly: true });
  let hasClients: boolean;
  try {
    hasClients = Boolean(
      probe
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name='clients'",
        )
        .get(),
    );
  } finally {
    probe.close();
  }
  if (!hasClients) {
    throw new Error(
      "[global-setup] test database has no 'clients' table after push — aborting.",
    );
  }

  // Seed by importing the seed script (side-effect module) in this process,
  // with DATABASE_PATH already set so lib/db/index.ts resolves the test file.
  await import("../lib/db/seed");

  // Teardown: remove the test DB and release the lock (closing the fd).
  // The globalSetup process still holds the module-scoped SQLite
  // connection, but the process exits after the run.
  return () => {
    fs.rmSync(path.join(testDir, "iris.db"), { force: true });
    fs.rmSync(path.join(testDir, "iris.db-wal"), { force: true });
    fs.rmSync(path.join(testDir, "iris.db-shm"), { force: true });
    fs.closeSync(lockFd);
  };
}
