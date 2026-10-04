// Replace the live database with an uploaded file. Every side effect is a
// dependency so the mechanics can be tested against throwaway files; the
// defaults wire the real fs and the shared connection. Exiting the process
// afterwards is the caller's job (see app/api/backup/restore/route.ts).
import { writeFileSync, renameSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import Database from "better-sqlite3";
import { DATABASE_PATH } from "@/lib/constants";
import { sqlite, snapshotDatabase } from "./index";

const SQLITE_MAGIC = Buffer.from("SQLite format 3\0");

export interface RestoreDeps {
  /** Live database file. */
  dbPath: string;
  /** Where the upload is written and checked before it is swapped in. */
  tmpPath: string;
  /** Snapshot of the current database, taken before the swap. */
  bakPath: string;
  writeFile: (path: string, data: Buffer) => void;
  openDb: (path: string, options: Database.Options) => Database.Database;
  snapshot: (dest: string) => Promise<void>;
  /** Fold the WAL into the live file and close the shared connection. */
  checkpointAndClose: () => void;
  unlink: (path: string) => void;
  rename: (from: string, to: string) => void;
  exists: (path: string) => boolean;
}

export type RestoreResult = { ok: true } | { error: string; status: number };

function defaultDeps(): RestoreDeps {
  return {
    dbPath: join(process.cwd(), DATABASE_PATH),
    tmpPath: join(process.cwd(), `${DATABASE_PATH}.new`),
    bakPath: join(process.cwd(), `${DATABASE_PATH}.bak`),
    writeFile: writeFileSync,
    openDb: (path, options) => new Database(path, options),
    snapshot: snapshotDatabase,
    checkpointAndClose: () => {
      sqlite.pragma("wal_checkpoint(TRUNCATE)");
      sqlite.close();
    },
    unlink: unlinkSync,
    rename: renameSync,
    exists: existsSync,
  };
}

export async function performRestore(
  buffer: Buffer,
  overrides: Partial<RestoreDeps> = {},
): Promise<RestoreResult> {
  const deps = { ...defaultDeps(), ...overrides };
  const { dbPath, tmpPath, bakPath } = deps;

  if (buffer.length < 16 || !buffer.subarray(0, 16).equals(SQLITE_MAGIC)) {
    return { error: "Not a valid SQLite database file", status: 422 };
  }

  try {
    deps.writeFile(tmpPath, buffer);
  } catch {
    return { error: "Failed to write temporary file", status: 500 };
  }

  try {
    const tmpDb = deps.openDb(tmpPath, { readonly: true });
    const result = tmpDb.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
    tmpDb.close();
    if (result.integrity_check !== "ok") {
      deps.unlink(tmpPath);
      return { error: "Database integrity check failed", status: 422 };
    }
  } catch {
    try { deps.unlink(tmpPath); } catch { /* best effort */ }
    return { error: "Not a valid SQLite database file", status: 422 };
  }

  // The .bak comes from the backup API, not a file copy: in WAL mode the main
  // file alone is missing every commit since the last checkpoint.
  try {
    await deps.snapshot(bakPath);
  } catch {
    try { deps.unlink(tmpPath); } catch { /* best effort */ }
    return { error: "Failed to back up current database", status: 500 };
  }

  try {
    // Fold the WAL into the main file and close, then drop the sidecars: a
    // stale -wal left beside the swapped-in file would be replayed onto it
    // on the next open.
    deps.checkpointAndClose();
    for (const sidecar of [`${dbPath}-wal`, `${dbPath}-shm`]) {
      if (deps.exists(sidecar)) deps.unlink(sidecar);
    }
    deps.rename(tmpPath, dbPath);
  } catch {
    try { deps.unlink(tmpPath); } catch { /* best effort */ }
    return { error: "Failed to replace database file", status: 500 };
  }

  return { ok: true };
}
