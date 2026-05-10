import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { writeFileSync, copyFileSync, renameSync, existsSync } from "fs";
import { join } from "path";

const SQLITE_MAGIC = Buffer.from("SQLite format 3\0");

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (session.user.role !== "manager") return Response.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  if (buffer.length < 16 || !buffer.subarray(0, 16).equals(SQLITE_MAGIC)) {
    return Response.json({ error: "Not a valid SQLite database file" }, { status: 422 });
  }

  const dbPath = join(process.cwd(), "data", "iris.db");
  const bakPath = join(process.cwd(), "data", "iris.db.bak");
  const tmpPath = join(process.cwd(), "data", "iris.db.new");

  writeFileSync(tmpPath, buffer);
  if (existsSync(dbPath)) copyFileSync(dbPath, bakPath);
  renameSync(tmpPath, dbPath);

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
}
