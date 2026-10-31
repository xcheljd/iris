// Auth helpers for the action modules, deliberately NOT a "use server" module:
// with the directive every export here was a callable server endpoint, and
// isSessionEmployeeStale performs no auth. Import only from server code.
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";

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

/**
 * Clients may only be handed to an employee who can still work them: an
 * existing row that is active and not soft-deleted. `label` names the target
 * in the error ("Employee not found", "Reassign target is inactive").
 */
export function assertAssignableEmployee(id: string, label = "Employee"):
  | { employee: { id: string; firstName: string; lastName: string | null }; error?: undefined }
  | { error: string } {
  const row = db
    .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName, active: employees.active })
    .from(employees)
    .where(and(eq(employees.id, id), isNull(employees.deletedAt)))
    .get();
  if (!row) return { error: `${label} not found` };
  if (!row.active) return { error: `${label} is inactive` };
  return { employee: { id: row.id, firstName: row.firstName, lastName: row.lastName } };
}
