import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 5;
const attempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(username: string): boolean {
  const now = Date.now();
  const entry = attempts.get(username);
  if (!entry || now >= entry.resetAt) {
    attempts.set(username, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.step === "lookup") {
    const { username } = body;
    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }
    if (!checkRateLimit(username)) {
      return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
    }

    const employee = db
      .select({ secretQuestion: employees.secretQuestion, secretAnswerHash: employees.secretAnswerHash })
      .from(employees)
      .where(and(eq(employees.username, username), eq(employees.active, true)))
      .get();

    if (!employee || !employee.secretQuestion || !employee.secretAnswerHash) {
      return NextResponse.json({ error: "If this account exists and has recovery options configured, you will see the security question." }, { status: 404 });
    }

    return NextResponse.json({ question: employee.secretQuestion });
  }

  if (body.step === "verify") {
    const { username, answer, newPassword } = body;
    if (!username || !answer || !newPassword) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }
    if (!checkRateLimit(username)) {
      return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
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
