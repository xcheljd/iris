import { describe, it, expect } from "vitest";
import { countAriaLabel, countPhrase } from "@/components/count-badge";

describe("count badge wording", () => {
  it("says what the number means", () => {
    expect(countPhrase(4, "due")).toBe("4 due");
    expect(countPhrase(2, "pending")).toBe("2 pending");
    expect(countPhrase(1, "review")).toBe("1 needs review");
    expect(countPhrase(3, "review")).toBe("3 need review");
    expect(countPhrase(150, "due")).toBe("99+ due");
  });

  it("leaves the link's plain name alone when there's no count", () => {
    expect(countAriaLabel("Follow-Ups", 0, "due")).toBeUndefined();
    expect(countAriaLabel("Clients", 5, null)).toBeUndefined();
    expect(countAriaLabel("Follow-Ups", 4, "due")).toBe("Follow-Ups, 4 due");
  });
});
