/**
 * Regression: birthday/anniversary are day-precision TEXT columns, but the
 * client forms hold Date objects and `JSON.stringify` turns those into a full
 * ISO timestamp ("2026-08-29T07:00:00.000Z"). The schema accepted the
 * timestamp verbatim, so it reached the DB and leaked into the dashboard.
 * Both write schemas now canonicalise to "YYYY-MM-DD".
 */
import { describe, it, expect } from "vitest";
import { clientCreateSchema, clientPatchSchema } from "@/lib/validation/client";
import { graduateProspectSchema } from "@/lib/validation/rvx";

const baseCreate = {
  firstName: "Jane",
  lastName: "Voss",
  preferredContact: "call" as const,
};

describe("clientCreateSchema — occasion dates", () => {
  it("collapses a JSON-serialised Date to its calendar date", () => {
    const parsed = clientCreateSchema.parse({
      ...baseCreate,
      birthday: "2000-12-08T00:00:00.000Z",
      anniversary: "2026-08-29T07:00:00.000Z",
    });
    expect(parsed.birthday).toBe("2000-12-08");
    expect(parsed.anniversary).toBe("2026-08-29");
  });

  it("passes the canonical form through unchanged", () => {
    const parsed = clientCreateSchema.parse({ ...baseCreate, birthday: "2000-12-08" });
    expect(parsed.birthday).toBe("2000-12-08");
  });

  it("still maps blank to null and allows omission", () => {
    expect(clientCreateSchema.parse({ ...baseCreate, birthday: "" }).birthday).toBeNull();
    expect(clientCreateSchema.parse({ ...baseCreate, birthday: null }).birthday).toBeNull();
    expect(clientCreateSchema.parse(baseCreate).birthday).toBeUndefined();
  });

  it("rejects a non-calendar date", () => {
    const result = clientCreateSchema.safeParse({ ...baseCreate, birthday: "08/29" });
    expect(result.success).toBe(false);
  });
});

describe("graduateProspectSchema — occasion dates", () => {
  const baseGraduate = {
    prospectId: "p1",
    firstName: "Jane",
    lastName: "Voss",
    preferredContact: "call" as const,
  };

  it("passes the canonical form through unchanged", () => {
    const parsed = graduateProspectSchema.parse({ ...baseGraduate, birthday: "2000-12-08" });
    expect(parsed.birthday).toBe("2000-12-08");
  });

  it("collapses a JSON-serialised Date to its calendar date", () => {
    const parsed = graduateProspectSchema.parse({
      ...baseGraduate,
      anniversary: "2026-08-29T07:00:00.000Z",
    });
    expect(parsed.anniversary).toBe("2026-08-29");
  });

  it("maps blank to null and allows omission", () => {
    expect(graduateProspectSchema.parse({ ...baseGraduate, birthday: "" }).birthday).toBeNull();
    expect(graduateProspectSchema.parse({ ...baseGraduate, birthday: null }).birthday).toBeNull();
    expect(graduateProspectSchema.parse(baseGraduate).birthday).toBeUndefined();
  });

  it.each(["08/29", "Aug 29", "8-29"])("rejects the free-text date %s", (bad) => {
    const result = graduateProspectSchema.safeParse({ ...baseGraduate, birthday: bad });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Use a valid date");
    }
  });
});

describe("clientPatchSchema — occasion dates", () => {
  it("collapses a JSON-serialised Date to its calendar date", () => {
    const parsed = clientPatchSchema.parse({ anniversary: "2026-08-29T07:00:00.000Z" });
    expect(parsed.anniversary).toBe("2026-08-29");
  });

  it("leaves an unrelated patch alone", () => {
    expect(clientPatchSchema.parse({ firstName: "X" })).toEqual({ firstName: "X" });
  });
});
