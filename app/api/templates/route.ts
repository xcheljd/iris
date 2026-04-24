import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { outreachTemplates } from "@/lib/db/schema";

export async function GET() {
  const all = db.select().from(outreachTemplates).orderBy(outreachTemplates.name).all();
  return NextResponse.json(all);
}