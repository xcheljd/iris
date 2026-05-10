"use server";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { MIN_PASSWORD_LENGTH, BCRYPT_SALT_ROUNDS } from "@/lib/constants";
import bcrypt from "bcryptjs";
import { getSessionUser } from "./_shared";

export async function createEmployee(data: {
  firstName: string;
  lastName: string;
  username: string;
  password: string;
  role: "manager" | "associate";
}) {
  const user = await getSessionUser();
  if (user?.role !== "manager") return { error: "Unauthorized" };
  if (!data.firstName || !data.username || !data.password || data.password.length < MIN_PASSWORD_LENGTH) {
    return { error: "First name, username, and password (min 6 chars) are required" };
  }
  const existing = db.select().from(employees).where(eq(employees.username, data.username)).get();
  if (existing) return { error: "Username already taken" };
  const passwordHash = await bcrypt.hash(data.password, BCRYPT_SALT_ROUNDS);
  const firstName = data.firstName.trim();
  const lastName = data.lastName?.trim() || null;
  db.insert(employees).values({
    id: randomUUID(),
    name: lastName ? `${firstName} ${lastName}` : firstName,
    firstName,
    lastName,
    username: data.username,
    passwordHash,
    role: data.role,
    active: true,
  }).run();
  revalidatePath("/settings");
  return { success: true as const };
}

export async function updateEmployee(employeeId: string, data: { firstName: string; lastName: string; username: string; role?: "manager" | "associate"; active?: boolean }) {
  const user = await getSessionUser();
  if (!user) return { error: "Not authenticated" };
  const isSelf = user.id === employeeId;
  const isManager = user.role === "manager";
  if (!isSelf && !isManager) return { error: "Unauthorized" };

  if (!data.firstName?.trim() || !data.username?.trim()) {
    return { error: "First name and username are required" };
  }

  const target = db.select().from(employees).where(eq(employees.id, employeeId)).get();
  if (!target) return { error: "Employee not found" };

  if (data.username !== target.username) {
    const existing = db.select().from(employees).where(eq(employees.username, data.username)).get();
    if (existing) return { error: "Username already taken" };
  }

  const firstName = data.firstName.trim();
  const lastName = data.lastName.trim() || null;
  const updates: Record<string, unknown> = {
    firstName,
    lastName,
    username: data.username.trim(),
    name: lastName ? `${firstName} ${lastName}` : firstName,
  };
  if (isManager && !isSelf) {
    if (data.role) updates.role = data.role;
    if (data.active !== undefined) updates.active = data.active;
  }

  db.update(employees).set(updates).where(eq(employees.id, employeeId)).run();
  revalidatePath("/settings");
  return { success: true as const };
}

export async function resetEmployeePassword(employeeId: string, newPassword: string) {
  const user = await getSessionUser();
  if (user?.role !== "manager") return { error: "Unauthorized" };
  if (!newPassword || newPassword.length < 6) return { error: "Password must be at least 6 characters" };
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
  db.update(employees).set({ passwordHash }).where(eq(employees.id, employeeId)).run();
  return { success: true as const };
}

export async function updateEmployeeRole(employeeId: string, newRole: "manager" | "associate") {
  const user = await getSessionUser();
  if (user?.role !== "manager") return { error: "Unauthorized" };
  db.update(employees).set({ role: newRole }).where(eq(employees.id, employeeId)).run();
  revalidatePath("/settings");
  return { success: true as const };
}

export async function toggleEmployeeActive(employeeId: string, active: boolean) {
  const user = await getSessionUser();
  if (user?.role !== "manager") return { error: "Unauthorized" };
  if (user.id === employeeId && !active) return { error: "Cannot deactivate your own account" };
  db.update(employees).set({ active }).where(eq(employees.id, employeeId)).run();
  revalidatePath("/settings");
  return { success: true as const };
}

export async function changeOwnPassword(currentPassword: string, newPassword: string) {
  const user = await getSessionUser();
  if (!user) return { error: "Not authenticated" };
  const userRecord = db.select().from(employees).where(eq(employees.id, user.id)).get();
  if (!userRecord) return { error: "User not found" };
  const valid = await bcrypt.compare(currentPassword, userRecord.passwordHash);
  if (!valid) return { error: "Current password is incorrect" };
  if (!newPassword || newPassword.length < 6) return { error: "New password must be at least 6 characters" };
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
  db.update(employees).set({ passwordHash }).where(eq(employees.id, user.id)).run();
  return { success: true as const };
}

export async function setSecretQuestion(question: string, answer: string) {
  const user = await getSessionUser();
  if (!user) return { error: "Not authenticated" };
  if (!question || !question.trim()) return { error: "Question is required" };
  if (!answer || answer.trim().length < 2) return { error: "Answer must be at least 2 characters" };
  const normalizedAnswer = answer.trim().toLowerCase();
  const hash = await bcrypt.hash(normalizedAnswer, BCRYPT_SALT_ROUNDS);
  db.update(employees)
    .set({ secretQuestion: question.trim(), secretAnswerHash: hash })
    .where(eq(employees.id, user.id))
    .run();
  return { success: true as const };
}
