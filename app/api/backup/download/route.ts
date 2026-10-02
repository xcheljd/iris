import { withManagerAuth } from "@/lib/api-helpers";
import { readFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { snapshotDatabase } from "@/lib/db";
import { format } from "date-fns";

export const GET = withManagerAuth(async () => {
  // Snapshot through the backup API rather than reading the main file: in WAL
  // mode that file is missing every commit since the last checkpoint.
  const tmpPath = join(tmpdir(), `iris-backup-${randomUUID()}.db`);
  let file: Buffer<ArrayBuffer>;
  try {
    await snapshotDatabase(tmpPath);
    file = readFileSync(tmpPath);
  } finally {
    try { unlinkSync(tmpPath); } catch { /* best effort */ }
  }

  const date = format(new Date(), "yyyy-MM-dd");
  return new Response(file, {
    headers: {
      "Content-Type": "application/x-sqlite3",
      "Content-Disposition": `attachment; filename="iris-backup-${date}.db"`,
      "Content-Length": String(file.byteLength),
    },
  });
});
