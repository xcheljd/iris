import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

// Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
vi.mock("@/components/heat-distribution-chart", () => ({ HeatDistributionChart: () => null }));
import { AnalyticsHeatTab } from "@/app/(app)/analytics/analytics-heat-tab";
import { HeatBadge } from "@/components/heat-badge";

const stats = { total: 10, active: 9, hot: 3, warm: 4, cold: 2, banned: 0, unsubscribed: 1, outreachWeek: 0, purchasesWeek: 0 };

// Regression: the heat tab used Sun + yellow-500 for warm while HeatBadge used
// Thermometer + amber, and every surface hardcoded its own orange/yellow/blue.
describe("AnalyticsHeatTab heat styling", () => {
  it("uses the same warm icon as HeatBadge", () => {
    const { container } = render(<AnalyticsHeatTab stats={stats} />);
    expect(container.querySelector("svg.lucide-sun")).toBeNull();
    expect(container.querySelectorAll("svg.lucide-thermometer").length).toBeGreaterThan(0);

    const { container: badge } = render(<HeatBadge level="warm" />);
    expect(badge.querySelector("svg.lucide-thermometer")).not.toBeNull();
  });

  it("colours icons and bars from the heat tokens only", () => {
    const { container } = render(<AnalyticsHeatTab stats={stats} />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/(orange|yellow|blue|amber)-\d{3}/);
    for (const level of ["hot", "warm", "cold"]) {
      expect(html).toContain(`text-heat-${level}`);
      expect(html).toContain(`div]:bg-heat-${level}`);
    }
  });
});
