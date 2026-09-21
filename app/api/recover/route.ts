import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { BCRYPT_SALT_ROUNDS } from "@/lib/constants";
import { recoverRequestSchema } from "@/lib/validation/recover";

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 5;
const attempts = new Map<string, { count: number; resetAt: number }>();

/** One answer for "no such account" and "account has no recovery configured",
 *  on both steps. Two distinct replies would let an unauthenticated caller
 *  enumerate usernames. */
const NO_RECOVERY_OPTIONS =
  "If this account exists and has recovery options configured, you will see the security question.";

function checkRateLimit(username: string): boolean {
  const now = Date.now();
  const entry = attempts.get(username);
  if (!entry || now >= entry.resetAt) {
    // The map is process-lifetime and keyed by caller-supplied usernames, so
    // sweep the expired keys whenever we add one instead of growing forever.
    for (const [key, e] of attempts) {
      if (now >= e.resetAt) attempts.delete(key);
    }
    attempts.set(username, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  // A malformed body is a client error, not a crash: req.json() throws on
  // anything that isn't JSON, and an unguarded throw here is a 500.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = recoverRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const data = parsed.data;

  // Not lowercased: employees.username is a TEXT column and SQLite collates
  // TEXT as BINARY, so the lookups below are case-sensitive. Folding the rate
  // limit key alone would throttle spellings that can never match a row.
  if (!checkRateLimit(data.username)) {
    return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  }

  if (data.step === "lookup") {
    const employee = db
      .select({ secretQuestion: employees.secretQuestion, secretAnswerHash: employees.secretAnswerHash })
      .from(employees)
      .where(and(eq(employees.username, data.username), eq(employees.active, true)))
      .get();

    if (!employee || !employee.secretQuestion || !employee.secretAnswerHash) {
      return NextResponse.json({ error: NO_RECOVERY_OPTIONS }, { status: 404 });
    }

    return NextResponse.json({ question: employee.secretQuestion });
  }

  const employee = db
    .select({ id: employees.id, secretAnswerHash: employees.secretAnswerHash })
    .from(employees)
    .where(and(eq(employees.username, data.username), eq(employees.active, true)))
    .get();

  if (!employee || !employee.secretAnswerHash) {
    return NextResponse.json({ error: NO_RECOVERY_OPTIONS }, { status: 404 });
  }

  const normalizedAnswer = data.answer.trim().toLowerCase();
  const valid = await bcrypt.compare(normalizedAnswer, employee.secretAnswerHash);
  if (!valid) {
    return NextResponse.json({ error: "Incorrect answer" }, { status: 401 });
  }

  const passwordHash = await bcrypt.hash(data.newPassword, BCRYPT_SALT_ROUNDS);
  db.update(employees).set({ passwordHash }).where(eq(employees.id, employee.id)).run();

  return NextResponse.json({ success: true });
}
