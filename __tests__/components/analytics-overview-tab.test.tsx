import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
vi.mock("@/components/heat-distribution-chart", () => ({ HeatDistributionChart: () => null }));
import { AnalyticsOverviewTab } from "@/app/(app)/analytics/analytics-overview-tab";

// Regression (m4): Purchase Rate was purchases ÷ active clients, so 3
// purchases from a 1-client book read 300%.
describe("AnalyticsOverviewTab purchase rate", () => {
  it("divides purchases by outreach, not active clients", () => {
    const stats = { total: 1, active: 1, hot: 1, warm: 0, cold: 0, banned: 0, unsubscribed: 0, outreachWeek: 6, purchasesWeek: 3 };
    render(<AnalyticsOverviewTab stats={stats} conversionRate={50} methodDistribution={[]} />);
    const row = screen.getByText("Purchase Rate").parentElement!;
    expect(row).toHaveTextContent("(purchases ÷ outreach)");
    expect(row).toHaveTextContent("50%");
    expect(screen.queryByText(/300%/)).not.toBeInTheDocument();
  });
});
