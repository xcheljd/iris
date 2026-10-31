import { describe, it, expect } from "vitest";
import { normalizeModel } from "@/lib/normalize";
import { productOfInterestSchema } from "@/lib/validation/client";

describe("normalizeModel", () => {
  it("uppercases letters, leaves digits/hyphens, trims", () => {
    expect(normalizeModel("  mv-2102-blk ")).toBe("MV-2102-BLK");
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
    const r = productOfInterestSchema.parse({ model: "mv-2102-blk", collection: "Shoreline", brand: null, intent: "promo" });
    expect(r).toEqual({ model: "MV-2102-BLK", collection: "Shoreline", brand: null, intent: "promo" });
  });

  it("accepts a collection-only interest", () => {
    expect(productOfInterestSchema.parse({ model: "", collection: "COPPER COVE", brand: null, intent: "arrival" }))
      .toEqual({ model: null, collection: "COPPER COVE", brand: null, intent: "arrival" });
  });

  it("accepts a bare model interest", () => {
    expect(productOfInterestSchema.parse({ model: "mv-3112-grn", collection: null, brand: null, intent: "interested" }))
      .toEqual({ model: "MV-3112-GRN", collection: null, brand: null, intent: "interested" });
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
