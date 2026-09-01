/**
 * The REST routes hand clients `parsed.error.flatten().fieldErrors` verbatim
 * (app/api/clients, app/api/clients/[id], app/api/notes), and `logOutreach`
 * builds its message from `error.issues[].path/.message`. That is a public
 * response contract with no other coverage, and `.flatten()` is deprecated in
 * zod 4 — so a future zod bump could reshape it silently. These assertions pin
 * the shape and the hand-written messages that survived the zod 3 -> 4 move
 * (`errorMap` -> `error`, `z.string().email()` -> `z.email()`).
 */
import { describe, it, expect } from "vitest";
import { clientCreateSchema, clientPatchSchema, productOfInterestSchema } from "@/lib/validation/client";
import { outreachInputSchema } from "@/lib/validation/outreach";
import { graduateProspectSchema } from "@/lib/validation/rvx";

describe("validation error shape — flatten().fieldErrors", () => {
  it("keys field errors by field name with string[] values", () => {
    const result = clientCreateSchema.safeParse({
      firstName: "",
      lastName: "",
      email: "not-an-email",
      preferredContact: "fax",
    });
    expect(result.success).toBe(false);
    if (result.success) return;

    const { fieldErrors, formErrors } = result.error.flatten();
    expect(fieldErrors).toEqual({
      firstName: ["First name is required"],
      lastName: ["Last name is required"],
      email: ["Invalid email"],
      preferredContact: ["Preferred contact method is required"],
    });
    expect(formErrors).toEqual([]);
  });

  it("reports a rejected occasion date under its own field", () => {
    const result = clientPatchSchema.safeParse({ birthday: "08/29" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.flatten().fieldErrors).toEqual({ birthday: ["Use a valid date"] });
  });

  it("puts a whole-object refine failure in formErrors, not fieldErrors", () => {
    const result = productOfInterestSchema.safeParse({
      model: "",
      collection: "  ",
      brand: null,
      intent: "promo",
    });
    expect(result.success).toBe(false);
    if (result.success) return;

    const { fieldErrors, formErrors } = result.error.flatten();
    expect(fieldErrors).toEqual({});
    expect(formErrors).toEqual(["A product of interest needs a model, collection, or brand"]);
  });

  it("keeps the custom enum message on the graduate schema", () => {
    const result = graduateProspectSchema.safeParse({
      prospectId: "p1",
      firstName: "Jane",
      lastName: "Voss",
      preferredContact: "fax",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.flatten().fieldErrors).toEqual({
      preferredContact: ["Preferred contact method is required"],
    });
  });
});

describe("validation error shape — issues[] (logOutreach message)", () => {
  it("gives superRefine issues a path so the message names the field", () => {
    const result = outreachInputSchema.safeParse({
      clientId: "1e4b5f2a-3c6d-4e8f-9a0b-1c2d3e4f5a6b",
      method: "call",
      outcome: "purchased",
      purchasedModel: "   ",
    });
    expect(result.success).toBe(false);
    if (result.success) return;

    // Mirrors lib/actions/outreach.ts.
    const details = result.error.issues
      .map((i) => `${i.path.join(".") || "form"}: ${i.message}`)
      .join("; ");
    expect(details).toBe(
      "purchasedModel: Model purchased is required when the outcome is a purchase"
    );
  });

  it("accepts a real v4 uuid and a calendar follow-up date", () => {
    const result = outreachInputSchema.safeParse({
      clientId: "1e4b5f2a-3c6d-4e8f-9a0b-1c2d3e4f5a6b",
      method: "call",
      outcome: "no_answer",
      followUpDate: "2026-08-31",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-calendar follow-up date", () => {
    const result = outreachInputSchema.safeParse({
      clientId: "1e4b5f2a-3c6d-4e8f-9a0b-1c2d3e4f5a6b",
      method: "call",
      outcome: "no_answer",
      followUpDate: "2026-13-40",
    });
    expect(result.success).toBe(false);
  });
});
