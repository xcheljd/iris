import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { readFileSync } from "fs";
import { join } from "path";
import { DATABASE_PATH } from "@/lib/constants";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (session.user.role !== "manager") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const dbPath = join(process.cwd(), DATABASE_PATH);
  const file = readFileSync(dbPath);

  const date = new Date().toISOString().split("T")[0];
  return new NextResponse(file, {
    headers: {
      "Content-Type": "application/x-sqlite3",
      "Content-Disposition": `attachment; filename="iris-backup-${date}.db"`,
      "Content-Length": String(file.byteLength),
    },
  });
}
