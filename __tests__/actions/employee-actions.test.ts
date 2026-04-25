import { vi, describe, it, expect, afterEach } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { getServerSession } from "next-auth";
import {
  createEmployee,
  resetEmployeePassword,
  updateEmployeeRole,
  toggleEmployeeActive,
  changeOwnPassword,
  setSecretQuestion,
} from "@/lib/actions";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const MANAGER_ID = "e09564a0-2ef8-4470-a149-fc8fcf695636"; // Marcus (manager)
const ASSOCIATE_ID = "85d655c4-4196-43ed-82d5-34474d22c782"; // Jordan (associate)

const managerSession = {
  user: { id: MANAGER_ID, name: "Marcus", role: "manager" },
};

const associateSession = {
  user: { id: ASSOCIATE_ID, name: "Jordan", role: "associate" },
};

describe("Employee Actions", () => {
  const createdEmployeeIds: string[] = [];

  afterEach(() => {
    for (const id of createdEmployeeIds) {
      try {
        db.delete(employees).where(eq(employees.id, id)).run();
      } catch {
        // ignore
      }
    }
    createdEmployeeIds.length = 0;
  });

  describe("createEmployee", () => {
    it("should create a new employee when user is manager", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      const result = await createEmployee({
        name: "Test Employee",
        username: "testemployee_" + Date.now(),
        password: "password123",
        role: "associate",
      });

      expect(result).toEqual({ success: true });

      // Find and track for cleanup
      const emp = db.select().from(employees)
        .where(eq(employees.name, "Test Employee"))
        .get();
      expect(emp).toBeDefined();
      expect(emp!.username).toMatch(/^testemployee_/);
      expect(emp!.role).toBe("associate");
      expect(emp!.active).toBe(true);

      // Verify password was hashed
      const passwordValid = bcrypt.compareSync("password123", emp!.passwordHash);
      expect(passwordValid).toBe(true);

      createdEmployeeIds.push(emp!.id);
    });

    it("should return error when user is not manager", async () => {
      vi.mocked(getServerSession).mockResolvedValue(associateSession as any);

      const result = await createEmployee({
        name: "Should Not Create",
        username: "shouldnotcreate",
        password: "password123",
        role: "associate",
      });

      expect(result).toEqual({ error: "Unauthorized" });
    });

    it("should return error when no session", async () => {
      vi.mocked(getServerSession).mockResolvedValue(null as any);

      const result = await createEmployee({
        name: "No Session",
        username: "nosession",
        password: "password123",
        role: "associate",
      });

      expect(result).toEqual({ error: "Unauthorized" });
    });

    it("should return error for short password", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      const result = await createEmployee({
        name: "Short PW",
        username: "shortpw",
        password: "12345",
        role: "associate",
      });

      expect(result).toEqual({ error: "Name, username, and password (min 6 chars) are required" });
    });

    it("should return error for missing fields", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      const result = await createEmployee({
        name: "",
        username: "",
        password: "",
        role: "associate",
      });

      expect(result).toEqual({ error: "Name, username, and password (min 6 chars) are required" });
    });

    it("should return error for duplicate username", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      // First create one
      const ts = Date.now();
      const result1 = await createEmployee({
        name: "Dup Test",
        username: `dupuser_${ts}`,
        password: "password123",
        role: "associate",
      });
      expect(result1).toEqual({ success: true });

      // Find and track
      const emp = db.select().from(employees).where(eq(employees.username, `dupuser_${ts}`)).get();
      if (emp) createdEmployeeIds.push(emp!.id);

      // Try duplicate username
      const result2 = await createEmployee({
        name: "Dup Test 2",
        username: `dupuser_${ts}`,
        password: "password123",
        role: "associate",
      });

      expect(result2).toEqual({ error: "Username already taken" });
    });
  });

  describe("resetEmployeePassword", () => {
    it("should reset password when user is manager", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      const result = await resetEmployeePassword(ASSOCIATE_ID, "newpassword123");

      expect(result).toEqual({ success: true });

      // Verify password was changed
      const emp = db.select().from(employees).where(eq(employees.id, ASSOCIATE_ID)).get();
      const valid = bcrypt.compareSync("newpassword123", emp!.passwordHash);
      expect(valid).toBe(true);

      // Restore original password
      const hash = bcrypt.hashSync("meridian", 10);
      db.update(employees).set({ passwordHash: hash }).where(eq(employees.id, ASSOCIATE_ID)).run();
    });

    it("should return error when user is not manager", async () => {
      vi.mocked(getServerSession).mockResolvedValue(associateSession as any);

      const result = await resetEmployeePassword(ASSOCIATE_ID, "newpassword123");
      expect(result).toEqual({ error: "Unauthorized" });
    });

    it("should return error for short password", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      const result = await resetEmployeePassword(ASSOCIATE_ID, "short");
      expect(result).toEqual({ error: "Password must be at least 6 characters" });
    });
  });

  describe("updateEmployeeRole", () => {
    it("should update employee role when user is manager", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      const result = await updateEmployeeRole(ASSOCIATE_ID, "manager");
      expect(result).toEqual({ success: true });

      const emp = db.select().from(employees).where(eq(employees.id, ASSOCIATE_ID)).get();
      expect(emp!.role).toBe("manager");

      // Restore
      db.update(employees).set({ role: "associate" }).where(eq(employees.id, ASSOCIATE_ID)).run();
    });

    it("should return error when user is not manager", async () => {
      vi.mocked(getServerSession).mockResolvedValue(associateSession as any);

      const result = await updateEmployeeRole(ASSOCIATE_ID, "manager");
      expect(result).toEqual({ error: "Unauthorized" });
    });
  });

  describe("toggleEmployeeActive", () => {
    it("should toggle employee active status when user is manager", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      const result = await toggleEmployeeActive(ASSOCIATE_ID, false);
      expect(result).toEqual({ success: true });

      const emp = db.select().from(employees).where(eq(employees.id, ASSOCIATE_ID)).get();
      expect(emp!.active).toBe(false);

      // Restore
      db.update(employees).set({ active: true }).where(eq(employees.id, ASSOCIATE_ID)).run();
    });

    it("should return error when trying to deactivate own account", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      const result = await toggleEmployeeActive(MANAGER_ID, false);
      expect(result).toEqual({ error: "Cannot deactivate your own account" });
    });

    it("should return error when user is not manager", async () => {
      vi.mocked(getServerSession).mockResolvedValue(associateSession as any);

      const result = await toggleEmployeeActive(ASSOCIATE_ID, false);
      expect(result).toEqual({ error: "Unauthorized" });
    });

    it("should allow reactivating an employee", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      // First deactivate
      await toggleEmployeeActive(ASSOCIATE_ID, false);

      // Now reactivate
      const result = await toggleEmployeeActive(ASSOCIATE_ID, true);
      expect(result).toEqual({ success: true });

      const emp = db.select().from(employees).where(eq(employees.id, ASSOCIATE_ID)).get();
      expect(emp!.active).toBe(true);
    });
  });

  describe("changeOwnPassword", () => {
    it("should change password when current password is correct", async () => {
      vi.mocked(getServerSession).mockResolvedValue(associateSession as any);

      // Ensure password is "meridian"
      const hash = bcrypt.hashSync("meridian", 10);
      db.update(employees).set({ passwordHash: hash }).where(eq(employees.id, ASSOCIATE_ID)).run();

      const result = await changeOwnPassword("meridian", "newpassword123");
      expect(result).toEqual({ success: true });

      // Verify password changed - use the MANAGER session to reset
      // (We can't use changeOwnPassword since it now requires "newpassword123")
      const restoreHash = bcrypt.hashSync("meridian", 10);
      db.update(employees).set({ passwordHash: restoreHash }).where(eq(employees.id, ASSOCIATE_ID)).run();
    });

    it("should return error when current password is wrong", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      const result = await changeOwnPassword("wrongpassword", "newpassword123");
      expect(result).toEqual({ error: "Current password is incorrect" });
    });

    it("should return error when no session", async () => {
      vi.mocked(getServerSession).mockResolvedValue(null as any);

      const result = await changeOwnPassword("meridian", "newpassword123");
      expect(result).toEqual({ error: "Not authenticated" });
    });

    it("should return error for short new password", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      // Manager's password is "meridian" and unchanged
      const result = await changeOwnPassword("meridian", "short");
      expect(result).toEqual({ error: "New password must be at least 6 characters" });
    });
  });

  describe("setSecretQuestion", () => {
    it("should set secret question and answer hash", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      const result = await setSecretQuestion("What is your pet's name?", "Fluffy");
      expect(result).toEqual({ success: true });

      const emp = db.select().from(employees).where(eq(employees.id, MANAGER_ID)).get();
      expect(emp!.secretQuestion).toBe("What is your pet's name?");
      expect(emp!.secretAnswerHash).toBeDefined();

      // Verify answer hash matches normalized answer
      const answerValid = bcrypt.compareSync("fluffy", emp!.secretAnswerHash!);
      expect(answerValid).toBe(true);

      // Restore original secret question
      db.update(employees)
        .set({
          secretQuestion: "What is your favorite watch brand?",
          secretAnswerHash: bcrypt.hashSync("meridian", 10),
        })
        .where(eq(employees.id, MANAGER_ID))
        .run();
    });

    it("should return error when no session", async () => {
      vi.mocked(getServerSession).mockResolvedValue(null as any);

      const result = await setSecretQuestion("Question?", "Answer");
      expect(result).toEqual({ error: "Not authenticated" });
    });

    it("should return error for empty question", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      const result = await setSecretQuestion("", "Answer");
      expect(result).toEqual({ error: "Question is required" });
    });

    it("should return error for short answer", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      const result = await setSecretQuestion("Question?", "A");
      expect(result).toEqual({ error: "Answer must be at least 2 characters" });
    });
  });
});
