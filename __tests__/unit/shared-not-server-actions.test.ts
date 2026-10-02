import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Regression (m8): lib/actions/_shared.ts carried "use server", so its helpers
// (getSessionUser, requireAuth, requireManager, isSessionEmployeeStale — the
// last with no auth at all) were each a callable server-action endpoint.
describe("lib/actions/_shared.ts", () => {
  it("is not a \"use server\" module", () => {
    const src = readFileSync(join(process.cwd(), "lib/actions/_shared.ts"), "utf8");
    expect(src).not.toMatch(/^\s*["']use server["'];?\s*$/m);
  });
});
