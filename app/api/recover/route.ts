import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.step === "lookup") {
    const { username } = body;
    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }

    const employee = db
      .select({ secretQuestion: employees.secretQuestion, secretAnswerHash: employees.secretAnswerHash })
      .from(employees)
      .where(and(eq(employees.username, username), eq(employees.active, true)))
      .get();

    if (!employee || !employee.secretQuestion || !employee.secretAnswerHash) {
      return NextResponse.json({ error: "No recovery options available for this account" }, { status: 404 });
    }

    return NextResponse.json({ question: employee.secretQuestion });
  }

  if (body.step === "verify") {
    const { username, answer, newPassword } = body;
    if (!username || !answer || !newPassword) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 });
    }

    const employee = db
      .select({ id: employees.id, secretAnswerHash: employees.secretAnswerHash })
      .from(employees)
      .where(and(eq(employees.username, username), eq(employees.active, true)))
      .get();

    if (!employee || !employee.secretAnswerHash) {
      return NextResponse.json({ error: "No recovery options available for this account" }, { status: 404 });
    }

    const normalizedAnswer = answer.trim().toLowerCase();
    const valid = await bcrypt.compare(normalizedAnswer, employee.secretAnswerHash);
    if (!valid) {
      return NextResponse.json({ error: "Incorrect answer" }, { status: 401 });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    db.update(employees).set({ passwordHash }).where(eq(employees.id, employee.id)).run();

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid step" }, { status: 400 });
}
