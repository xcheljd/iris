import { describe, it, expect } from "vitest";
import { clientCreateSchema, clientPatchSchema, validateClientForm } from "@/lib/validation/client";
import { graduateProspectSchema } from "@/lib/validation/rvx";

const baseCreate = {
  firstName: "Jane",
  lastName: "Doe",
  preferredContact: "call" as const,
};

describe("clientCreateSchema — preferred contact + last name required", () => {
  it("accepts a valid create payload", () => {
    expect(clientCreateSchema.safeParse(baseCreate).success).toBe(true);
  });

  it("rejects a missing last name", () => {
    expect(clientCreateSchema.safeParse({ ...baseCreate, lastName: "" }).success).toBe(false);
    const { lastName, ...noLast } = baseCreate; void lastName;
    expect(clientCreateSchema.safeParse(noLast).success).toBe(false);
  });

  it("rejects a missing or invalid preferred contact", () => {
    const { preferredContact, ...noPref } = baseCreate; void preferredContact;
    expect(clientCreateSchema.safeParse(noPref).success).toBe(false);
    expect(clientCreateSchema.safeParse({ ...baseCreate, preferredContact: "in-person" }).success).toBe(false);
    expect(clientCreateSchema.safeParse({ ...baseCreate, preferredContact: "" }).success).toBe(false);
  });

  it("accepts each valid contact method", () => {
    for (const m of ["call", "text", "email"] as const) {
      expect(clientCreateSchema.safeParse({ ...baseCreate, preferredContact: m }).success).toBe(true);
    }
  });
});

describe("clientPatchSchema — preferred contact optional (partial)", () => {
  it("allows a partial patch without preferredContact", () => {
    expect(clientPatchSchema.safeParse({ firstName: "X" }).success).toBe(true);
  });
  it("rejects an invalid preferredContact when provided", () => {
    expect(clientPatchSchema.safeParse({ preferredContact: "fax" }).success).toBe(false);
    expect(clientPatchSchema.safeParse({ preferredContact: "text" }).success).toBe(true);
  });
});

describe("graduateProspectSchema — last name + preferred contact required", () => {
  const base = { prospectId: "p1", firstName: "Jane", lastName: "Doe", preferredContact: "email" as const };
  it("accepts a valid graduation payload", () => {
    expect(graduateProspectSchema.safeParse(base).success).toBe(true);
  });
  it("rejects missing last name / preferred contact", () => {
    expect(graduateProspectSchema.safeParse({ ...base, lastName: "" }).success).toBe(false);
    const { preferredContact, ...noPref } = base; void preferredContact;
    expect(graduateProspectSchema.safeParse(noPref).success).toBe(false);
  });
});

describe("validateClientForm", () => {
  it("requires first name, last name, and preferred contact", () => {
    expect(validateClientForm({ firstName: "", lastName: "D", preferredContact: "call" })).toBe("First name is required");
    expect(validateClientForm({ firstName: "J", lastName: "", preferredContact: "call" })).toBe("Last name is required");
    expect(validateClientForm({ firstName: "J", lastName: "D", preferredContact: "" })).toBe("Preferred contact method is required");
    expect(validateClientForm({ firstName: "J", lastName: "D", preferredContact: "call" })).toBeNull();
  });

  it("still flags invalid email", () => {
    expect(validateClientForm({ firstName: "J", lastName: "D", preferredContact: "call", email: "bad" }))
      .toBe("Invalid email format");
  });
});
