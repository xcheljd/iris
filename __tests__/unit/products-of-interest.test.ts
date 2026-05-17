import { describe, it, expect } from "vitest";
import { normalizeModel } from "@/lib/normalize";
import { productOfInterestSchema } from "@/lib/validation/client";

describe("normalizeModel", () => {
  it("uppercases letters, leaves digits/hyphens, trims", () => {
    expect(normalizeModel("  ix1002-01x ")).toBe("IX1002-01X");
    expect(normalizeModel("Nr-710-12l")).toBe("NR-710-12L");
  });

  it("returns empty string for null/undefined/blank", () => {
    expect(normalizeModel(null)).toBe("");
    expect(normalizeModel(undefined)).toBe("");
    expect(normalizeModel("   ")).toBe("");
  });
});

describe("productOfInterestSchema", () => {
  it("accepts a model + collection pair (model upper-cased)", () => {
    const r = productOfInterestSchema.parse({ model: "ix1002-01x", collection: "Sentinel", brand: null, intent: "promo" });
    expect(r).toEqual({ model: "IX1002-01X", collection: "Sentinel", brand: null, intent: "promo" });
  });

  it("accepts a collection-only interest", () => {
    expect(productOfInterestSchema.parse({ model: "", collection: "CRIMSON ACE", brand: null, intent: "arrival" }))
      .toEqual({ model: null, collection: "CRIMSON ACE", brand: null, intent: "arrival" });
  });

  it("accepts a bare model interest", () => {
    expect(productOfInterestSchema.parse({ model: "lx1012-01x", collection: null, brand: null, intent: "interested" }))
      .toEqual({ model: "LX1012-01X", collection: null, brand: null, intent: "interested" });
  });

  it("rejects an entry with neither model nor collection", () => {
    expect(productOfInterestSchema.safeParse({ model: "", collection: "  ", brand: null, intent: "promo" }).success).toBe(false);
    expect(productOfInterestSchema.safeParse({ model: null, collection: null, brand: null, intent: "promo" }).success).toBe(false);
  });

  it("requires a valid intent", () => {
    expect(productOfInterestSchema.safeParse({ model: "AT1-1", collection: null }).success).toBe(false);
    expect(productOfInterestSchema.safeParse({ model: "AT1-1", collection: null, intent: "bogus" }).success).toBe(false);
  });
});
