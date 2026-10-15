import { describe, it, expect, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { OverviewKpis, type OverviewKpisProps } from "@/app/(app)/analytics/overview-kpis";
import type { KpiMetrics } from "@/lib/queries";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const base: KpiMetrics = {
  contacted: 10, bought: 1, outreach: 15, followUpsDue: 10, followUpsDone: 7, overdueNow: 6,
  prev: { contacted: 7, bought: 2, outreach: 7, followUpsDue: 5, followUpsDone: 2 },
};
const methods = [
  { method: "call", label: "Call", count: 5 },
  { method: "text", label: "Text", count: 2 },
  { method: "email", label: "Email", count: 3 },
  { method: "in-person", label: "In-Person", count: 5 },
];
function renderKpis(kpis: Partial<KpiMetrics> = {}, props: Partial<OverviewKpisProps> = {}) {
  return render(
    <OverviewKpis kpis={{ ...base, ...kpis }} total={22} active={20} methods={methods} inRange="Last 30 days" {...props} />,
  );
}

// Both layouts render (CSS picks one by width), so every figure appears twice.
describe("OverviewKpis", () => {
  it("counts conversion by clients: bought / contacted", () => {
    renderKpis();
    expect(screen.getAllByText("10%")).toHaveLength(2);
    expect(screen.getByText("1 of 10 clients contacted bought")).toBeInTheDocument(); // desktop card
    expect(screen.getByText("1 of 10 contacted bought")).toBeInTheDocument(); // phone list (shorter, fits one line)
  });

  it("shows follow-up completion as done / due", () => {
    renderKpis();
    expect(screen.getAllByText("70%")).toHaveLength(2);
    expect(screen.getAllByText("7 of 10 due")).toHaveLength(2);
  });

  it("links the overdue count to the Follow-Ups page", () => {
    renderKpis();
    const links = screen.getAllByRole("link", { name: /6 overdue now/ });
    expect(links).toHaveLength(2);
    for (const l of links) expect(l).toHaveAttribute("href", "/follow-ups");
  });

  it("says nothing is overdue, without a link, at zero", () => {
    renderKpis({ overdueNow: 0 });
    expect(screen.queryByRole("link", { name: /overdue/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("Nothing overdue")).toHaveLength(2);
  });

  it("compares rates in points and counts in percent against the previous period", () => {
    renderKpis();
    // outreach 15 vs 7 = +114%; conversion 10% vs 29% = -19 pts; follow-ups 70% vs 40% = +30 pts
    expect(screen.getAllByLabelText("Outreach +114% versus the previous period")).toHaveLength(2);
    expect(screen.getAllByLabelText("Conversion -19 pts versus the previous period")).toHaveLength(2);
    expect(screen.getAllByLabelText("Follow-ups done +30 pts versus the previous period")).toHaveLength(2);
  });

  it("shows no trend badges without a previous period (all time)", () => {
    renderKpis({ prev: null });
    expect(screen.queryByLabelText(/versus the previous period/)).not.toBeInTheDocument();
  });

  it("reads 0% rather than dividing by zero when nothing happened", () => {
    renderKpis({ contacted: 0, bought: 0, outreach: 0, followUpsDue: 0, followUpsDone: 0, overdueNow: 0, prev: null });
    expect(screen.getAllByText("0%")).toHaveLength(4);
  });

  it("prints the client split and method counts on the page", () => {
    renderKpis();
    expect(screen.getByText("20 active")).toBeInTheDocument();
    expect(screen.getByText("2 inactive")).toBeInTheDocument();
    expect(screen.getByText("20 active · 2 inactive")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Outreach by method" });
    expect(within(list).getByText("In-Person")).toBeInTheDocument();
    // Phone list: one chip per method; the "·" separators are CSS, not text.
    expect(screen.getByText("Call 5")).toBeInTheDocument();
    expect(screen.getByText("In-Person 5")).toBeInTheDocument();
  });
});
