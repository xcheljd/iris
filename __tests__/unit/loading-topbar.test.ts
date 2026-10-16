import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Every route's loading screen keeps the top bar. Without it the title, the
// sidebar trigger (the only menu button on phones) and the theme toggle vanish
// while the server renders, then pop back.
function loadingFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return loadingFiles(p);
    return name === "loading.tsx" ? [p] : [];
  });
}

describe("route loading screens", () => {
  const files = loadingFiles(join(process.cwd(), "app/(app)"));

  it("finds the loading screens", () => {
    expect(files.length).toBeGreaterThanOrEqual(18);
  });

  it.each(files)("%s renders the Topbar", (file) => {
    expect(readFileSync(file, "utf8")).toMatch(/<Topbar\s+title=/);
  });
});
