"use server";
import { db } from "@/lib/db";
import { employees, clients, activityEvents } from "@/lib/db/schema";
import { eq, asc, and, notInArray } from "drizzle-orm";
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
  const updates: Partial<typeof employees.$inferInsert> = {
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

/* -------------------------------------------------------------------------- */
/* Reorder employees                                                           */
/*                                                                            */
/* Swaps an employee's sortOrder with their immediate neighbor in the given   */
/* direction. The Employees settings tab uses arrow buttons; the data layer    */
/* doesn't care whether the UI is buttons or drag-drop.                       */
/* -------------------------------------------------------------------------- */

export async function reorderEmployee(employeeId: string, direction: "up" | "down") {
  const user = await getSessionUser();
  if (user?.role !== "manager") return { error: "Unauthorized" };

  const all = db.select({ id: employees.id, sortOrder: employees.sortOrder, firstName: employees.firstName })
    .from(employees)
    .orderBy(asc(employees.sortOrder), asc(employees.firstName))
    .all();

  const idx = all.findIndex((e) => e.id === employeeId);
  if (idx === -1) return { error: "Employee not found" };
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= all.length) return { success: true as const }; // already at edge — no-op

  // Some installations start with sortOrder=0 for everyone. Normalize first
  // so swaps produce distinct values.
  const needsNormalize = all.some((e, i) => i > 0 && e.sortOrder === all[i - 1].sortOrder);
  if (needsNormalize) {
    db.transaction((tx) => {
      all.forEach((e, i) => {
        tx.update(employees).set({ sortOrder: i }).where(eq(employees.id, e.id)).run();
      });
    });
    all.forEach((e, i) => { e.sortOrder = i; });
  }

  const a = all[idx];
  const b = all[swapIdx];
  db.transaction((tx) => {
    tx.update(employees).set({ sortOrder: b.sortOrder }).where(eq(employees.id, a.id)).run();
    tx.update(employees).set({ sortOrder: a.sortOrder }).where(eq(employees.id, b.id)).run();
  });
  revalidatePath("/settings");
  return { success: true as const };
}

/* -------------------------------------------------------------------------- */
/* Deactivate employee + handle their clients atomically                       */
/*                                                                            */
/* Three modes for the client handling:                                       */
/*   keep:     leave clients on this (now-inactive) employee                  */
/*   reassign: move all to `reassignToId`                                     */
/*   unassign: set employeeId = NULL                                          */
/*                                                                            */
/* Each affected client gets a transferred activity event so the audit trail  */
/* shows what happened.                                                       */
/* -------------------------------------------------------------------------- */

export async function deactivateEmployee(
  employeeId: string,
  options: { clientHandling: "keep" | "reassign" | "unassign"; reassignToId?: string },
) {
  const user = await getSessionUser();
  if (user?.role !== "manager") return { error: "Unauthorized" };
  if (user.id === employeeId) return { error: "Cannot deactivate your own account" };

  const target = db.select().from(employees).where(eq(employees.id, employeeId)).get();
  if (!target) return { error: "Employee not found" };

  let reassignTarget: { id: string; firstName: string; lastName: string | null } | undefined;
  if (options.clientHandling === "reassign") {
    if (!options.reassignToId) return { error: "Pick an employee to reassign to" };
    if (options.reassignToId === employeeId) return { error: "Can't reassign to the same employee" };
    const t = db
      .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName, active: employees.active })
      .from(employees)
      .where(eq(employees.id, options.reassignToId))
      .get();
    if (!t) return { error: "Reassign target not found" };
    if (!t.active) return { error: "Reassign target is inactive" };
    reassignTarget = t;
  }

  try {
    db.transaction((tx) => {
      // Collect impacted clients first so we can log per-client activity
      const impacted = tx
        .select({ id: clients.id })
        .from(clients)
        .where(and(eq(clients.employeeId, employeeId), notInArray(clients.status, ["deleted", "banned"])))
        .all();

      const newOwner = options.clientHandling === "reassign" ? options.reassignToId! : null;
      const shouldUpdate = options.clientHandling !== "keep";

      if (shouldUpdate && impacted.length > 0) {
        tx.update(clients)
          .set({ employeeId: newOwner, updatedAt: new Date() })
          .where(eq(clients.employeeId, employeeId))
          .run();

        const description = options.clientHandling === "reassign"
          ? `Owner reassigned to ${reassignTarget!.firstName}${reassignTarget!.lastName ? " " + reassignTarget!.lastName : ""} on deactivation of ${target.firstName}`
          : `Owner unassigned on deactivation of ${target.firstName}`;
        for (const c of impacted) {
          tx.insert(activityEvents).values({
            id: randomUUID(),
            clientId: c.id,
            eventType: "transferred",
            description,
            employeeId: user.id,
            metadata: { newEmployeeId: newOwner, reason: "employee_deactivated", deactivatedEmployeeId: employeeId },
          }).run();
        }
      }

      tx.update(employees).set({ active: false }).where(eq(employees.id, employeeId)).run();
    });

    revalidatePath("/settings");
    revalidatePath("/clients");
    return { success: true as const, clientsAffected: target ? undefined : 0 };
  } catch {
    return { error: "Failed to deactivate employee" };
  }
}

/* -------------------------------------------------------------------------- */
/* Soft-delete employee                                                        */
/*                                                                            */
/* Hides the employee from listings but keeps the row in the database so      */
/* historical references (activity_events, outreach_logs, approvals,          */
/* rvx_import_batches) stay intact. Only allowed on already-inactive          */
/* employees so the deactivate flow has been used to handle their clients.   */
/* -------------------------------------------------------------------------- */

export async function deleteEmployee(employeeId: string) {
  const user = await getSessionUser();
  if (user?.role !== "manager") return { error: "Unauthorized" };
  if (user.id === employeeId) return { error: "Cannot delete your own account" };

  const target = db.select().from(employees).where(eq(employees.id, employeeId)).get();
  if (!target) return { error: "Employee not found" };
  if (target.deletedAt) return { error: "Employee already deleted" };
  if (target.active) return { error: "Deactivate the employee first" };

  db.update(employees).set({ deletedAt: new Date() }).where(eq(employees.id, employeeId)).run();
  revalidatePath("/settings");
  return { success: true as const };
}
