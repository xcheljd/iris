import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const dbPath = path.join(process.cwd(), "data", "iris.db");

  if (body.step === "lookup") {
    const { username } = body;
    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }

    const sqlite = new Database(dbPath);
    try {
      const employee = sqlite
        .prepare("SELECT secret_question, secret_answer_hash FROM employees WHERE username = ? AND active = 1")
        .get(username) as { secret_question: string | null; secret_answer_hash: string | null } | undefined;

      if (!employee || !employee.secret_question || !employee.secret_answer_hash) {
        return NextResponse.json({ error: "No recovery options available for this account" }, { status: 404 });
      }

      return NextResponse.json({ question: employee.secret_question });
    } finally {
      sqlite.close();
    }
  }

  if (body.step === "verify") {
    const { username, answer, newPassword } = body;
    if (!username || !answer || !newPassword) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 });
    }

    const sqlite = new Database(dbPath);
    try {
      const employee = sqlite
        .prepare("SELECT id, secret_answer_hash FROM employees WHERE username = ? AND active = 1")
        .get(username) as { id: string; secret_answer_hash: string | null } | undefined;

      if (!employee || !employee.secret_answer_hash) {
        return NextResponse.json({ error: "No recovery options available for this account" }, { status: 404 });
      }

      const normalizedAnswer = answer.trim().toLowerCase();
      const valid = bcrypt.compareSync(normalizedAnswer, employee.secret_answer_hash);
      if (!valid) {
        return NextResponse.json({ error: "Incorrect answer" }, { status: 401 });
      }

      const passwordHash = bcrypt.hashSync(newPassword, 10);
      sqlite.prepare("UPDATE employees SET password_hash = ? WHERE id = ?").run(passwordHash, employee.id);

      return NextResponse.json({ success: true });
    } finally {
      sqlite.close();
    }
  }

  return NextResponse.json({ error: "Invalid step" }, { status: 400 });
}
