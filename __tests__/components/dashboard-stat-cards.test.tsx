import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardStatCards } from "@/components/dashboard-stat-cards";

const stats = { total: 22, active: 18, hot: 5, outreachWeek: 9, purchasesWeek: 2 };

describe("DashboardStatCards", () => {
  it("links Total Clients and Hot Leads to the matching client lists", () => {
    render(<DashboardStatCards stats={stats} />);
    expect(screen.getByRole("link", { name: "Total Clients: 22" })).toHaveAttribute("href", "/clients");
    expect(screen.getByRole("link", { name: "Hot Leads: 5" })).toHaveAttribute("href", "/clients?filter=hot");
  });

  it("leaves the 7-day cards static — no list filter shows those sets", () => {
    render(<DashboardStatCards stats={stats} />);
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByText("Outreach (7d)").closest("a")).toBeNull();
    expect(screen.getByText("Purchases (7d)").closest("a")).toBeNull();
  });
});
