import { describe, it, expect } from "vitest";
import { escapeLike, likePattern } from "@/lib/like";

describe("escapeLike", () => {
  it("leaves alphanumeric search terms untouched", () => {
    expect(escapeLike("Zulu")).toBe("Zulu");
    expect(escapeLike("ZZQ-001 zulu")).toBe("ZZQ-001 zulu");
  });

  it("escapes LIKE metacharacters with a backslash prefix", () => {
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("a\\b")).toBe("a\\\\b");
  });

  it("escapes a literal run of metacharacters so it still matches literally", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });

  it("escapes the backslash before % so a literal %\\ is not misread as an escape", () => {
    // A literal backslash+percent in the term must come out as an escaped
    // backslash followed by an escaped percent: `\\` then `\%`.
    expect(escapeLike("%\\")).toBe("\\%\\\\");
  });

  it("wraps and escapes into a partial-match pattern", () => {
    expect(likePattern("a_b%")).toBe("%a\\_b\\%%");
  });
});