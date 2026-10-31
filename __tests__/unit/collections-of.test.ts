import { describe, it, expect } from "vitest";
import { collectionsOf } from "@/components/products-of-interest-input";

describe("collectionsOf", () => {
  it("offers the store's own catalog collections, once each, sorted", () => {
    const index = {
      "A-1": { collection: "Riptide" },
      "A-2": { collection: "RIPTIDE" },
      "A-3": { collection: "Canyon" },
      "A-4": { collection: "  " },
    };
    expect(collectionsOf(index)).toEqual(["Canyon", "Riptide"]);
  });

  it("offers nothing built in before the catalog has loaded", () => {
    expect(collectionsOf(null)).toEqual([]);
    expect(collectionsOf({})).toEqual([]);
  });
});
