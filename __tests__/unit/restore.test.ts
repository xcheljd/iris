import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, unlinkSync, renameSync, copyFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import Database from "better-sqlite3";
import { performRestore, type RestoreDeps } from "@/lib/db/restore";

// Every test runs against throwaway files in its own tmpdir and injects
// snapshot/checkpointAndClose, so the shared test DB connection is never
// snapshotted or closed. The process.exit after a successful restore lives in
// the route handler and is deliberately not tested here.

let dir: string;
let dbPath: string;
let calls: string[];

/** A real SQLite file holding one table, returned as an upload buffer. */
function makeDb(path: string, table: string): Buffer {
  const db = new Database(path);
  db.exec(`CREATE TABLE ${table}(a, b); CREATE INDEX ${table}_a ON ${table}(a);`);
  db.exec(
    `WITH RECURSIVE s(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM s WHERE n < 49) ` +
    `INSERT INTO ${table} SELECT n, n * 2 FROM s;`,
  );
  db.close();
  return readFileSync(path);
}

function tables(path: string): string[] {
  const db = new Database(path, { readonly: true });
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all() as string[];
  db.close();
  return names;
}

/** Real fs under the test dir, with every side effect recorded in order. */
function deps(overrides: Partial<RestoreDeps> = {}): Partial<RestoreDeps> {
  return {
    dbPath,
    tmpPath: `${dbPath}.new`,
    bakPath: `${dbPath}.bak`,
    writeFile: (p, data) => { calls.push(`writeFile ${p}`); writeFileSync(p, data); },
    snapshot: async (dest) => { calls.push(`snapshot ${dest}`); copyFileSync(dbPath, dest); },
    checkpointAndClose: () => { calls.push("checkpointAndClose"); },
    unlink: (p) => { calls.push(`unlink ${p}`); unlinkSync(p); },
    rename: (from, to) => { calls.push(`rename ${from} ${to}`); renameSync(from, to); },
    exists: existsSync,
    ...overrides,
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "iris-restore-"));
  dbPath = join(dir, "live.db");
  makeDb(dbPath, "live_marker");
  calls = [];
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("performRestore", () => {
  it("replaces the live file, drops stale sidecars, and snapshots first", async () => {
    const upload = makeDb(join(dir, "upload.db"), "uploaded_marker");
    writeFileSync(`${dbPath}-wal`, "stale wal");
    writeFileSync(`${dbPath}-shm`, "stale shm");

    const result = await performRestore(upload, deps());

    expect(result).toEqual({ ok: true });
    expect(tables(dbPath)).toEqual(["uploaded_marker"]);
    expect(tables(`${dbPath}.bak`)).toEqual(["live_marker"]);
    expect(existsSync(`${dbPath}-wal`)).toBe(false);
    expect(existsSync(`${dbPath}-shm`)).toBe(false);
    expect(existsSync(`${dbPath}.new`)).toBe(false);
  });

  it("checkpoints and closes before removing sidecars, and removes them before the rename", async () => {
    const upload = makeDb(join(dir, "upload.db"), "uploaded_marker");
    writeFileSync(`${dbPath}-wal`, "stale wal");
    writeFileSync(`${dbPath}-shm`, "stale shm");

    await performRestore(upload, deps());

    expect(calls).toEqual([
      `writeFile ${dbPath}.new`,
      `snapshot ${dbPath}.bak`,
      "checkpointAndClose",
      `unlink ${dbPath}-wal`,
      `unlink ${dbPath}-shm`,
      `rename ${dbPath}.new ${dbPath}`,
    ]);
  });

  it("rejects a buffer without the SQLite header before writing anything", async () => {
    const result = await performRestore(Buffer.from("definitely not a database"), deps());

    expect(result).toEqual({ error: "Not a valid SQLite database file", status: 422 });
    expect(calls).toEqual([]);
    expect(existsSync(`${dbPath}.new`)).toBe(false);
    expect(tables(dbPath)).toEqual(["live_marker"]);
  });

  it("rejects junk behind a valid header and removes the temp file", async () => {
    const junk = Buffer.concat([Buffer.from("SQLite format 3\0"), Buffer.alloc(4080, 0xab)]);

    const result = await performRestore(junk, deps());

    expect(result).toEqual({ error: "Not a valid SQLite database file", status: 422 });
    expect(existsSync(`${dbPath}.new`)).toBe(false);
    expect(calls).not.toContain("checkpointAndClose");
    expect(tables(dbPath)).toEqual(["live_marker"]);
  });

  it("rejects a database that fails integrity_check and removes the temp file", async () => {
    const uploadPath = join(dir, "upload.db");
    makeDb(uploadPath, "uploaded_marker");
    // Point one index entry at the wrong rowid: the file still opens, but
    // integrity_check reports "row 6 missing from index uploaded_marker_a".
    const probe = new Database(uploadPath, { readonly: true });
    const root = probe.prepare("SELECT rootpage FROM sqlite_master WHERE name = ?").pluck().get("uploaded_marker_a") as number;
    const pageSize = probe.pragma("page_size", { simple: true }) as number;
    probe.close();
    const upload = readFileSync(uploadPath);
    const page = upload.subarray((root - 1) * pageSize, root * pageSize);
    // Index record for (a = 5, rowid 6): header size 3, two 1-byte ints, 5, 6.
    const entry = page.indexOf(Buffer.from([3, 1, 1, 5, 6]));
    expect(entry).toBeGreaterThan(0);
    page[entry + 4] = 7;

    const result = await performRestore(upload, deps());

    expect(result).toEqual({ error: "Database integrity check failed", status: 422 });
    expect(existsSync(`${dbPath}.new`)).toBe(false);
    expect(calls).not.toContain("checkpointAndClose");
    expect(tables(dbPath)).toEqual(["live_marker"]);
  });

  it("closes the temp database even when the integrity_check query throws", async () => {
    const upload = makeDb(join(dir, "upload.db"), "uploaded_marker");
    let closed = false;
    const result = await performRestore(upload, deps({
      openDb: (path, options) => {
        const real = new Database(path, options);
        return {
          prepare: () => { throw new Error("corrupt b-tree"); },
          pragma: real.pragma.bind(real),
          close: () => { closed = true; real.close(); },
        } as unknown as Database.Database;
      },
    }));

    expect(result).toEqual({ error: "Not a valid SQLite database file", status: 422 });
    expect(closed).toBe(true);
    expect(existsSync(`${dbPath}.new`)).toBe(false);
    expect(tables(dbPath)).toEqual(["live_marker"]);
  });

  it("returns 500 when the snapshot fails and leaves the live database alone", async () => {
    const upload = makeDb(join(dir, "upload.db"), "uploaded_marker");
    const before = readFileSync(dbPath);

    const result = await performRestore(upload, deps({
      snapshot: async () => { calls.push("snapshot"); throw new Error("disk full"); },
    }));

    expect(result).toEqual({ error: "Failed to back up current database", status: 500 });
    expect(existsSync(`${dbPath}.new`)).toBe(false);
    expect(calls).toEqual([`writeFile ${dbPath}.new`, "snapshot", `unlink ${dbPath}.new`]);
    expect(readFileSync(dbPath).equals(before)).toBe(true);
  });

  it("returns 500 when the rename fails, cleans up the temp file, and never touches the live file", async () => {
    const upload = makeDb(join(dir, "upload.db"), "uploaded_marker");
    writeFileSync(`${dbPath}-wal`, "stale wal");
    const before = readFileSync(dbPath);

    const result = await performRestore(upload, deps({
      rename: (from, to) => { calls.push(`rename ${from} ${to}`); throw new Error("EXDEV"); },
    }));

    expect(result).toEqual({ error: "Failed to replace database file", status: 500 });
    expect(existsSync(`${dbPath}.new`)).toBe(false);
    // checkpointAndClose plus the sidecar drop it makes safe are the only
    // destructive steps before the failure; the live file is never unlinked.
    expect(calls).toEqual([
      `writeFile ${dbPath}.new`,
      `snapshot ${dbPath}.bak`,
      "checkpointAndClose",
      `unlink ${dbPath}-wal`,
      `rename ${dbPath}.new ${dbPath}`,
      `unlink ${dbPath}.new`,
    ]);
    expect(readFileSync(dbPath).equals(before)).toBe(true);
  });
});
