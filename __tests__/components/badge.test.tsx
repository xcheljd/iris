import { describe, it, expect } from "vitest";
import { badgeVariants } from "@/components/ui/badge";

// Regression: the tinted variants were tuned for dark mode only — a bare
// text-*-400 on a /20 tint, 1.4-2:1 on the light card (hot 1.78, warm/cold
// 1.38, emerald 1.54). Each must pair a dark light-mode text step with a
// `dark:` override.
const TINTED = ["hot", "warm", "cold", "emerald", "rose", "purple", "cyan", "blue", "pink", "amber"] as const;

describe("badge variants", () => {
  it.each(TINTED)("%s pairs a -700/-800 light text with a dark: -300/-400 text", (variant) => {
    const classes = badgeVariants({ variant }).split(/\s+/);
    const lightText = classes.filter((c) => /^text-[a-z]+-\d+$/.test(c));
    const darkText = classes.filter((c) => /^dark:text-[a-z]+-\d+$/.test(c));

    expect(lightText).toHaveLength(1);
    expect(lightText[0]).toMatch(/-(700|800)$/);
    expect(darkText).toHaveLength(1);
    expect(darkText[0]).toMatch(/-(300|400)$/);
  });
});
