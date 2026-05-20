"use server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function getSessionUser() {
  const session = await getSession();
  return session?.user;
}

export async function requireAuth() {
  const user = await getSessionUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

export async function requireManager() {
  const user = await requireAuth();
  if (user.role !== "manager") throw new Error("Manager access required");
  return user;
}

/**
 * Returns true when the session's user.id still resolves to an active
 * employee row. Catches the case where a JWT cookie outlived a re-seed:
 * the role check passes, but writes touching `activity_events.employee_id`
 * would explode with an opaque FOREIGN KEY constraint failure.
 */
export async function isSessionEmployeeStale(userId: string): Promise<boolean> {
  const row = db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.id, userId))
    .get();
  return !row;
}
