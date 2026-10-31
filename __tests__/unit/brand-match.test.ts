import { describe, it, expect } from "vitest";
import { canonicalBrand, closestBrand } from "@/lib/brand-match";

const LIST = ["Aldermoor", "Coastwell", "Keelstone", "Maravista", "Vellamy"];

describe("canonicalBrand", () => {
  it("matches ignoring capitals, spaces and punctuation", () => {
    expect(canonicalBrand("aldermoor", LIST)).toBe("Aldermoor");
    expect(canonicalBrand(" VELLAMY. ", LIST)).toBe("Vellamy");
  });
  it("returns null for blank or unlisted", () => {
    expect(canonicalBrand("", LIST)).toBeNull();
    expect(canonicalBrand(null, LIST)).toBeNull();
    expect(canonicalBrand("Nonesuch", LIST)).toBeNull();
  });
});

describe("closestBrand", () => {
  it("fixes small typos", () => {
    expect(closestBrand("Aldremoor", LIST)).toBe("Aldermoor");
    expect(closestBrand("Coastwel", LIST)).toBe("Coastwell");
    expect(closestBrand("Maravsta", LIST)).toBe("Maravista");
  });
  it("reads a brand followed by extra words", () => {
    expect(closestBrand("VELLAMY INC", LIST)).toBe("Vellamy");
    expect(closestBrand("Aldermoor Watches", LIST)).toBe("Aldermoor");
  });
  it("doesn't guess when nothing is close or two are equally close", () => {
    expect(closestBrand("Nonesuch", LIST)).toBeNull();
    expect(closestBrand("Vo", LIST)).toBeNull();
    expect(closestBrand("Abc", ["Abd", "Abe"])).toBeNull();
  });
});
