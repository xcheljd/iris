import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return tsxFiles(p);
    return p.endsWith(".tsx") ? [p] : [];
  });
}

// Regression: 28 uses of text-[10px] sat below the type scale. The floor is
// text-xs (with tracking-wide where it was a small label); mobile-nav's
// text-[11px] font-medium tab labels are the one deliberate exception.
describe("type scale floor", () => {
  it("has no text-[10px] in app/ or components/", () => {
    const offenders = ["app", "components"]
      .flatMap((d) => tsxFiles(path.join(process.cwd(), d)))
      .filter((f) => readFileSync(f, "utf8").includes("text-[10px]"))
      .map((f) => path.relative(process.cwd(), f));
    expect(offenders).toEqual([]);
  });
});
