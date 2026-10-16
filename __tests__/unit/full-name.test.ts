import { describe, it, expect } from "vitest";
import { fullName } from "@/lib/utils";

describe("fullName", () => {
  it("never prints 'undefined' or a trailing space for a missing last name", () => {
    expect(fullName({ firstName: "Jane", lastName: null })).toBe("Jane");
    expect(fullName({ firstName: "Jane" })).toBe("Jane");
    expect(fullName({ firstName: "Jane", lastName: "" })).toBe("Jane");
    expect(fullName({ firstName: "Jane", lastName: "Doe" })).toBe("Jane Doe");
  });
});
