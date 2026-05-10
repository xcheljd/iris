import { withManagerAuth } from "@/lib/api-helpers";
import { writeFileSync, copyFileSync, renameSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import Database from "better-sqlite3";
import { DATABASE_PATH } from "@/lib/constants";

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

  try {
    if (existsSync(dbPath)) copyFileSync(dbPath, bakPath);
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
