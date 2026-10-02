/**
 * One-off cleanup: delete the legacy `__tour_demo__` client and its related
 * rows from DBs that ran the onboarding tour before f3388ae. See
 * lib/db/tour-demo-cleanup.ts for what is swept.
 *
 * Usage: `pnpm exec tsx scripts/purge-tour-demo.ts` — no-op when the database
 * or the demo row is absent, so it is safe to re-run.
 */
import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { purgeLegacyTourDemoClient } from "../lib/db/tour-demo-cleanup";

const dbPath = process.env.DATABASE_PATH ?? "./data/iris.db";
if (!existsSync(dbPath)) {
  console.log(`[purge-tour-demo] no database at ${dbPath} — nothing to do`);
  process.exit(0);
}

const sqlite = new Database(dbPath);
try {
  sqlite.pragma("foreign_keys = ON");
  const result = purgeLegacyTourDemoClient(sqlite);
  console.log(
    result.clients
      ? `[purge-tour-demo] removed: ${JSON.stringify(result)}`
      : "[purge-tour-demo] no __tour_demo__ client — nothing to do",
  );
} finally {
  sqlite.close();
}
