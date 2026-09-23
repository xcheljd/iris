import { describe, it, expect, beforeAll } from "vitest";
import { render } from "@testing-library/react";
import { AnalyticsOutreachTab } from "@/app/(app)/analytics/analytics-outreach-tab";

beforeAll(() => {
  // Recharts' ResponsiveContainer observes its size; jsdom has no ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const methodDistribution = [
  { method: "call", count: 3, label: "Call" },
  { method: "text", count: 2, label: "Text" },
  { method: "email", count: 1, label: "Email" },
  { method: "in-person", count: 4, label: "In-Person" },
];

// Regression: METHOD_COLORS were raw Tailwind hexes forced onto every <Cell>,
// so both charts ignored the theme and looked identical in light and dark.
describe("AnalyticsOutreachTab chart colours", () => {
  it("drives both method charts from the --chart-* theme tokens", () => {
    const { container } = render(
      <AnalyticsOutreachTab
        pagedOutreach={[]}
        totalOutreach={10}
        page={1}
        setPage={() => {}}
        totalPages={1}
        totalFiltered={0}
        methodDistribution={methodDistribution}
        outcomeDistribution={[]}
        hasDateFilter={false}
      />,
    );

    const styles = [...container.querySelectorAll("style")].map((s) => s.textContent ?? "");
    expect(styles).toHaveLength(2);
    for (const css of styles) {
      expect(css).toContain("--color-call: hsl(var(--chart-1))");
      expect(css).toContain("--color-text: hsl(var(--chart-2))");
      expect(css).toContain("--color-email: hsl(var(--chart-3))");
      expect(css).toContain("--color-in-person: hsl(var(--chart-4))");
    }
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{6}/i);
  });
});
