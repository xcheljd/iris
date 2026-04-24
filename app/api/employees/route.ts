import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";

export async function GET() {
  const all = db.select().from(employees).orderBy(employees.name).all();
  return NextResponse.json(all);
}