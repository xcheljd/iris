import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge, badgeVariants } from "@/components/ui/badge";

// Batch 2: the raw-palette tinted variants (emerald/rose/purple/cyan/blue/
// pink/amber/gold) are gone. Every coloured variant now draws on a theme
// token that carries its own light/dark step, so there is no `dark:` text
// override to forget; contrast for the tokens is pinned in
// unit/theme-contrast.test.ts.
describe("badge variants", () => {
  it.each(["hot", "warm", "cold"] as const)("%s uses the heat token for tint and text", (level) => {
    const classes = badgeVariants({ variant: level }).split(/\s+/);
    expect(classes).toContain(`bg-heat-${level}/15`);
    expect(classes).toContain(`text-heat-${level}`);
  });

  it.each(["success", "warning", "info"] as const)("%s uses its status token for tint and text", (status) => {
    const classes = badgeVariants({ variant: status }).split(/\s+/);
    expect(classes).toContain(`bg-${status}/15`);
    expect(classes).toContain(`text-${status}`);
  });

  it("no variant uses a raw Tailwind palette colour", () => {
    const variants = ["default", "secondary", "destructive", "outline", "ghost", "link", "hot", "warm", "cold", "success", "warning", "info"] as const;
    for (const variant of variants) {
      expect(badgeVariants({ variant })).not.toMatch(/\b(text|bg|border)-(red|green|blue|yellow|amber|orange|emerald|rose|purple|pink|cyan|violet)-\d{2,3}/);
    }
  });

  // Local delta from upstream (AGENTS.md): solid focus ring, not ring-ring/50.
  it("keeps the solid focus ring", () => {
    const classes = badgeVariants().split(/\s+/);
    expect(classes).toContain("focus-visible:ring-[3px]");
    expect(classes).toContain("focus-visible:ring-ring");
    expect(classes).not.toContain("focus-visible:ring-ring/50");
  });

  // Upstream's destructive uses text-white, ~2.8:1 on our dark-mode red.
  it("destructive keeps the theme foreground, not text-white", () => {
    const classes = badgeVariants({ variant: "destructive" }).split(/\s+/);
    expect(classes).toContain("text-destructive-foreground");
    expect(classes).not.toContain("text-white");
  });

  it("renders a span with data-slot and data-variant", () => {
    render(<Badge variant="warning">Gift Card Fraud</Badge>);
    const el = screen.getByText("Gift Card Fraud");
    expect(el.tagName).toBe("SPAN");
    expect(el).toHaveAttribute("data-slot", "badge");
    expect(el).toHaveAttribute("data-variant", "warning");
  });
});
