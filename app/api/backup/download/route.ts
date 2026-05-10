import { withManagerAuth } from "@/lib/api-helpers";
import { readFileSync } from "fs";
import { join } from "path";
import { DATABASE_PATH } from "@/lib/constants";

export const GET = withManagerAuth(async () => {
  const dbPath = join(process.cwd(), DATABASE_PATH);
  const file = readFileSync(dbPath);

  const date = new Date().toISOString().split("T")[0];
  return new Response(file, {
    headers: {
      "Content-Type": "application/x-sqlite3",
      "Content-Disposition": `attachment; filename="iris-backup-${date}.db"`,
      "Content-Length": String(file.byteLength),
    },
  });
});
