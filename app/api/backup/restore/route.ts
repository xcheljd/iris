import { withManagerAuth } from "@/lib/api-helpers";
import { writeFileSync, renameSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import Database from "better-sqlite3";
import { DATABASE_PATH } from "@/lib/constants";
import { sqlite, snapshotDatabase } from "@/lib/db";

const SQLITE_MAGIC = Buffer.from("SQLite format 3\0");

export const POST = withManagerAuth(async (_session, req: Request) => {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  if (buffer.length < 16 || !buffer.subarray(0, 16).equals(SQLITE_MAGIC)) {
    return Response.json({ error: "Not a valid SQLite database file" }, { status: 422 });
  }

  const dbPath = join(process.cwd(), DATABASE_PATH);
  const bakPath = join(process.cwd(), `${DATABASE_PATH}.bak`);
  const tmpPath = join(process.cwd(), `${DATABASE_PATH}.new`);

  try {
    writeFileSync(tmpPath, buffer);
  } catch {
    return Response.json({ error: "Failed to write temporary file" }, { status: 500 });
  }

  try {
    const tmpDb = new Database(tmpPath, { readonly: true });
    const result = tmpDb.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
    tmpDb.close();
    if (result.integrity_check !== "ok") {
      unlinkSync(tmpPath);
      return Response.json({ error: "Database integrity check failed" }, { status: 422 });
    }
  } catch {
    try { unlinkSync(tmpPath); } catch { /* best effort */ }
    return Response.json({ error: "Not a valid SQLite database file" }, { status: 422 });
  }

  // The .bak comes from the backup API, not a file copy: in WAL mode the main
  // file alone is missing every commit since the last checkpoint.
  try {
    await snapshotDatabase(bakPath);
  } catch {
    try { unlinkSync(tmpPath); } catch { /* best effort */ }
    return Response.json({ error: "Failed to back up current database" }, { status: 500 });
  }

  try {
    // Fold the WAL into the main file and close, then drop the sidecars: a
    // stale -wal left beside the swapped-in file would be replayed onto it
    // on the next open.
    sqlite.pragma("wal_checkpoint(TRUNCATE)");
    sqlite.close();
    for (const sidecar of [`${dbPath}-wal`, `${dbPath}-shm`]) {
      if (existsSync(sidecar)) unlinkSync(sidecar);
    }
    renameSync(tmpPath, dbPath);
  } catch {
    try { unlinkSync(tmpPath); } catch { /* best effort */ }
    return Response.json({ error: "Failed to replace database file" }, { status: 500 });
  }

  // Stream the response body, then exit once the stream is closed.
  // Scheduling exit inside start() ensures the body bytes are fully produced
  // before the 500ms countdown begins — eliminating the race with process.exit.
  const payload = new TextEncoder().encode(JSON.stringify({ ok: true }));
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(payload);
      controller.close();
      setTimeout(() => process.exit(0), 500);
    },
  });

  return new Response(body, { headers: { "Content-Type": "application/json" } });
});
