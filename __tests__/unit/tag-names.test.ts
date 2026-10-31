import { describe, it, expect } from "vitest";
import { canonicalTagName, canonicalTagList, tagKey } from "@/lib/tag-names";

describe("tag names ignore capitals", () => {
  const known = ["VIP", "repeat-buyer"];

  it("reuses the existing spelling", () => {
    expect(canonicalTagName("vip", known)).toBe("VIP");
    expect(canonicalTagName("  Repeat-Buyer ", known)).toBe("repeat-buyer");
  });

  it("keeps a new name as typed, trimmed", () => {
    expect(canonicalTagName("  Collector ", known)).toBe("Collector");
  });

  it("de-duplicates a list against known tags and itself", () => {
    expect(canonicalTagList(["vip", "VIP", "new", "NEW", " "], known)).toEqual(["VIP", "new"]);
  });

  it("keys", () => expect(tagKey(" ViP ")).toBe("vip"));
});
