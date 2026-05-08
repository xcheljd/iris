import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { writeFileSync, copyFileSync, renameSync, existsSync } from "fs";
import { join } from "path";

const SQLITE_MAGIC = Buffer.from("SQLite format 3\0");

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (session.user.role !== "manager") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  if (buffer.length < 16 || !buffer.subarray(0, 16).equals(SQLITE_MAGIC)) {
    return NextResponse.json({ error: "Not a valid SQLite database file" }, { status: 422 });
  }

  const dbPath = join(process.cwd(), "data", "iris.db");
  const bakPath = join(process.cwd(), "data", "iris.db.bak");
  const tmpPath = join(process.cwd(), "data", "iris.db.new");

  writeFileSync(tmpPath, buffer);
  if (existsSync(dbPath)) copyFileSync(dbPath, bakPath);
  renameSync(tmpPath, dbPath);

  // Give the response time to flush before the process restarts
  setTimeout(() => process.exit(0), 500);

  return NextResponse.json({ ok: true });
}
