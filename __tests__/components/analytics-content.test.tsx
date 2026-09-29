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
// Each picker is a button named by its placeholder that picks local midnight, May 31.
vi.mock("@/components/date-picker", () => ({
  DatePicker: ({ onSelectAction, placeholder }: { onSelectAction: (d?: Date) => void; placeholder: string }) => (
    <button type="button" onClick={() => onSelectAction(new Date(2026, 4, 31))}>{placeholder}</button>
  ),
}));

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
const log = (id: string, date: string, method: "call" | "email" = "call") => ({
  log: { id, method, date: new Date(date), outcome: "no_answer" as const, notes: null },
  client: { id: `c-${id}`, firstName: `Client${id}`, lastName: null },
  employee: null,
});
// The server has already filtered and paged these; the component renders them as given.
const outreachLog = [log("2", "2026-05-10T12:00:00", "email")];
const ts = (d: string) => Math.floor(new Date(d).getTime() / 1000);
const methods = (call: number, email: number) => [
  { method: "call" as const, label: "Call", count: call },
  { method: "text" as const, label: "Text", count: 0 },
  { method: "email" as const, label: "Email", count: email },
  { method: "in-person" as const, label: "In-Person", count: 0 },
];

function renderContent(props: Partial<Parameters<typeof AnalyticsContent>[0]> = {}) {
  return render(
    <AnalyticsContent
      stats={stats}
      outreachLog={outreachLog}
      outreachTotal={1}
      outreachPage={1}
      prospectFunnel={funnel}
      methodDistribution={methods(1, 1)}
      outcomeDistribution={[{ outcome: "no_answer", count: 2 }]}
      allTimeMethodDistribution={methods(1, 1)}
      {...props}
    />,
  );
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

  it("reads the range from props (the URL) and shows the server's rows for it on the Outreach tab", async () => {
    renderContent({ dateFrom: ts("2026-05-01T00:00:00"), dateTo: ts("2026-05-31T23:59:59") });
    await userEvent.setup().click(screen.getByRole("tab", { name: "Outreach" }));
    expect(screen.getByText("Client2")).toBeInTheDocument();
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

// Regression (audit B5): the breakdowns were counted in the browser from the
// latest 50 logs; they now arrive precomputed from SQL and render as given.
describe("AnalyticsContent outreach breakdowns", () => {
  it("renders the server-counted breakdowns, beyond the old 50-row ceiling", async () => {
    renderContent({
      methodDistribution: methods(70, 50),
      outcomeDistribution: [{ outcome: "no_answer", count: 90 }, { outcome: "wants_to_come_in", count: 30 }],
    });
    await userEvent.setup().click(screen.getByRole("tab", { name: "Outreach" }));
    expect(screen.getByText(/Breakdown of 120 outreach attempts/)).toBeInTheDocument();
    expect(screen.getByText("wants to come in")).toBeInTheDocument();
    expect(screen.getByText("90")).toBeInTheDocument();
  });

  it("shows the truthful empty state when the range has no logs", async () => {
    renderContent({ methodDistribution: methods(0, 0), outcomeDistribution: [], dateFrom: ts("2020-01-01T00:00:00") });
    await userEvent.setup().click(screen.getByRole("tab", { name: "Outreach" }));
    expect(screen.getAllByText("No outreach data for the selected period")).toHaveLength(3);
  });

  it("writes a picked \"to\" day as its last second, since the SQL bound is inclusive", async () => {
    renderContent();
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Outreach" }));
    await user.click(screen.getByRole("button", { name: "To" }));
    expect(replace).toHaveBeenCalledWith(`/analytics?to=${ts("2026-05-31T23:59:59")}`, { scroll: false });
    await user.click(screen.getByRole("button", { name: "From" }));
    expect(replace).toHaveBeenLastCalledWith(`/analytics?from=${ts("2026-05-31T00:00:00")}`, { scroll: false });
  });
});

// Regression (audit B5): the log was a 50-row slice paged in useState; it is
// now a server page whose number lives in the URL like every other list.
describe("AnalyticsContent outreach log paging", () => {
  it("pages through the URL, keeping the range, employee and sort", async () => {
    renderContent({
      outreachTotal: 45,
      dateFrom: ts("2026-05-01T00:00:00"),
      employees: [{ id: "e1", firstName: "Test", lastName: "Associate" }],
      selectedEmployeeId: "e1",
      outreachSort: "method",
      outreachSortDir: "asc",
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Outreach" }));
    expect(screen.getByText("45 entries")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Go to next page" }));
    expect(push).toHaveBeenCalledWith(
      `/analytics?employee=e1&from=${ts("2026-05-01T00:00:00")}&sort=method&sortDir=asc&page=2`,
      { scroll: false },
    );
  });

  it("changing the range drops the page back to 1", async () => {
    renderContent({ outreachTotal: 45, outreachPage: 3 });
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Outreach" }));
    await user.click(screen.getByRole("button", { name: "From" }));
    expect(replace).toHaveBeenCalledWith(`/analytics?from=${ts("2026-05-31T00:00:00")}`, { scroll: false });
  });
});

// Regression (audit B5): labels claimed "(all time)" / "recent outreach" /
// "(last 50 logs)" over a 50-row slice; they now describe the SQL counts.
describe("AnalyticsContent truthful labels", () => {
  it("says all time only when no range is set, and range otherwise", async () => {
    const { unmount } = renderContent({ methodDistribution: methods(70, 50) });
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Outreach" }));
    expect(screen.getByText(/Breakdown of 120 outreach attempts \(all time\)/)).toBeInTheDocument();
    expect(screen.getByText("Results across all outreach")).toBeInTheDocument();
    expect(screen.getByText("Outreach Log")).toBeInTheDocument();
    unmount();

    renderContent({ methodDistribution: methods(70, 50), dateFrom: ts("2026-05-01T00:00:00") });
    await user.click(screen.getByRole("tab", { name: "Outreach" }));
    expect(screen.getByText(/Breakdown of 120 outreach attempts in the selected range/)).toBeInTheDocument();
    expect(screen.getByText("Results in the selected range")).toBeInTheDocument();
  });

  it("labels the Overview methods hover as all time, fed by the unranged counts", async () => {
    renderContent({ allTimeMethodDistribution: methods(70, 50), dateFrom: ts("2026-05-01T00:00:00") });
    await userEvent.setup().hover(screen.getByText("Outreach (7d)"));
    expect(await screen.findByText("Outreach Methods (all time)")).toBeInTheDocument();
    expect(screen.getByText("70")).toBeInTheDocument();
    expect(screen.queryByText(/last 50 logs/)).not.toBeInTheDocument();
  });
});
