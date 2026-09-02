/**
 * F-7: "is this the same person?" had three implementations giving three
 * answers — `check-duplicates` normalized only the query phone,
 * `POST /api/clients` normalized neither side and filtered no statuses, and
 * `graduateProspect` normalized both. This is the one implementation all three
 * now call; these tests pin its rules.
 */
import { describe, it, expect, afterEach } from "vitest";
import { findDuplicateClient } from "@/lib/duplicate-client";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const OWNER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206"; // Marcus (manager), from __tests__/setup.ts

const created: string[] = [];

function insertClient(values: Partial<typeof clients.$inferInsert> = {}) {
  const id = randomUUID();
  db.insert(clients).values({
    id,
    firstName: "Dup",
    lastName: "Target",
    employeeId: OWNER_ID,
    ...values,
  }).run();
  created.push(id);
  return id;
}

afterEach(() => {
  for (const id of created) db.delete(clients).where(eq(clients.id, id)).run();
  created.length = 0;
});

describe("findDuplicateClient", () => {
  it("returns null when given nothing to match on", () => {
    expect(findDuplicateClient({})).toBeNull();
    expect(findDuplicateClient({ email: "", phone: "", firstName: "", lastName: "" })).toBeNull();
  });

  it("normalizes the phone on both sides", () => {
    const id = insertClient({ phone: "(702) 555-0177" });

    expect(findDuplicateClient({ phone: "7025550177" })?.id).toBe(id);
    expect(findDuplicateClient({ phone: "702-555-0177" })?.id).toBe(id);
    expect(findDuplicateClient({ phone: "702.555.0177" })?.id).toBe(id);
    expect(findDuplicateClient({ phone: "7025550178" })).toBeNull();
  });

  it("compares email case-insensitively", () => {
    const id = insertClient({ email: "Casey.Rivera@Example.com" });

    expect(findDuplicateClient({ email: "casey.rivera@example.com" })?.id).toBe(id);
    expect(findDuplicateClient({ email: "  CASEY.RIVERA@EXAMPLE.COM  " })?.id).toBe(id);
  });

  it("needs both halves of a name — a first name alone is not an identity", () => {
    const id = insertClient({ firstName: "Solo", lastName: "Namematch" });

    expect(findDuplicateClient({ firstName: "Solo" })).toBeNull();
    expect(findDuplicateClient({ firstName: "solo", lastName: "NAMEMATCH" })?.id).toBe(id);
  });

  it("excludes soft-deleted clients", () => {
    insertClient({ email: "softdeleted@example.com", status: "deleted", deletedAt: new Date() });

    expect(findDuplicateClient({ email: "softdeleted@example.com" })).toBeNull();
  });

  it("still matches a banned client — the record exists, so re-adding is a duplicate", () => {
    const id = insertClient({ email: "banned-dup@example.com", status: "banned" });

    expect(findDuplicateClient({ email: "banned-dup@example.com" })?.id).toBe(id);
  });

  it("returns only the identifying projection, never the whole row", () => {
    insertClient({ email: "projection@example.com", notes: "Private note" });

    const match = findDuplicateClient({ email: "projection@example.com" })!;
    expect(Object.keys(match).sort()).toEqual(["email", "firstName", "id", "lastName", "phone"]);
  });
});
