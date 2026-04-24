import { NextRequest, NextResponse } from "next/server";
import { searchClients } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  if (!q || q.length < 1) return NextResponse.json([]);
  const rows = await searchClients(q);
  return NextResponse.json(rows.map((c) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName, phone: c.phone })));
}
