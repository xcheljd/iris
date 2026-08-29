/**
 * Regression: birthday/anniversary are day-precision TEXT columns, but the
 * client forms hold Date objects and `JSON.stringify` turns those into a full
 * ISO timestamp ("2026-08-29T07:00:00.000Z"). The schema accepted the
 * timestamp verbatim, so it reached the DB and leaked into the dashboard.
 * Both write schemas now canonicalise to "YYYY-MM-DD".
 */
import { describe, it, expect } from "vitest";
import { clientCreateSchema, clientPatchSchema } from "@/lib/validation/client";

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
