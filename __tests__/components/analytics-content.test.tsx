import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnalyticsContent } from "@/app/(app)/analytics/analytics-content";
import type { ProspectFunnelStats } from "@/lib/queries";

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
  usePathname: () => "/analytics",
}));
vi.mock("@/components/topbar", () => ({ Topbar: () => null }));

beforeAll(() => {
  // Recharts' ResponsiveContainer observes its size; jsdom has no ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  replace.mockClear();
  push.mockClear();
});

const stats = { total: 10, active: 8, hot: 2, warm: 3, cold: 3, banned: 1, unsubscribed: 1, outreachWeek: 4, purchasesWeek: 1 };
const funnel: ProspectFunnelStats = {
  active: 0, graduated: 0, rejected: 0, unsubscribed: 0,
  avgSpendActive: null, avgSpendGraduated: null, avgSpendRejected: null,
  batches: [],
};
const log = (id: string, date: string, method = "call") => ({
  log: { id, method, date: new Date(date), outcome: "no_answer", notes: null },
  client: { id: `c-${id}`, firstName: `Client${id}`, lastName: null },
  employee: null,
});
const recentOutreach = [log("1", "2026-03-10T12:00:00"), log("2", "2026-05-10T12:00:00", "email")];
const ts = (d: string) => Math.floor(new Date(d).getTime() / 1000);

function renderContent(props: Partial<Parameters<typeof AnalyticsContent>[0]> = {}) {
  return render(<AnalyticsContent stats={stats} recentOutreach={recentOutreach} prospectFunnel={funnel} {...props} />);
}

// Regression: the date range lived in useState (lost on refresh), the pickers
// sat above every tab though only Outreach honours them, and the Overview's
// fixed-window conversion rate was unlabelled.
describe("AnalyticsContent date range", () => {
  it("labels the Overview conversion rate as last 7 days and hides the pickers there", () => {
    renderContent();
    expect(screen.getByText("Conversion (last 7 days)")).toBeInTheDocument();
    expect(screen.queryByText("From")).not.toBeInTheDocument();
  });

  it("reads the range from props (the URL) and applies it on the Outreach tab", async () => {
    renderContent({ dateFrom: ts("2026-05-01T00:00:00"), dateTo: ts("2026-05-31T00:00:00") });
    await userEvent.setup().click(screen.getByRole("tab", { name: "Outreach" }));
    expect(screen.getByText("Client2")).toBeInTheDocument();
    expect(screen.queryByText("Client1")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
  });

  it("clearing writes the URL rather than local state, keeping the employee", async () => {
    renderContent({
      dateFrom: ts("2026-05-01T00:00:00"),
      employees: [{ id: "e1", firstName: "Test", lastName: "Associate" }],
      selectedEmployeeId: "e1",
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Outreach" }));
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(replace).toHaveBeenCalledWith("/analytics?employee=e1", { scroll: false });
  });

  it("hides the pickers on Heat and Prospects", async () => {
    renderContent();
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Heat Distribution" }));
    expect(screen.queryByText("From")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Prospects" }));
    expect(screen.queryByText("From")).not.toBeInTheDocument();
  });
});
