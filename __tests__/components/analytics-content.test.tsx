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
// The range picker stands in as three buttons: picked days (local midnight,
// May 1 – May 31, as the calendar reports them), the Last 30 days shortcut,
// and clear. Its label shows what the page passed in.
vi.mock("@/components/date-range-picker", () => ({
  DateRangePicker: ({ onChange }: { onChange: (v: { preset?: string; from?: Date; to?: Date }) => void }) => (
    <div data-testid="range-picker">
      <button type="button" onClick={() => onChange({ from: new Date(2026, 4, 1), to: new Date(2026, 4, 31) })}>Pick days</button>
      <button type="button" onClick={() => onChange({ preset: "30d" })}>Last 30 days</button>
      <button type="button" onClick={() => onChange({})}>Clear range</button>
    </div>
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
      {...props}
    />,
  );
}

// Regression: the date range lived in useState (lost on refresh). Now one
// range picker drives the Overview and the Outreach tab through the URL; with
// no range both show all time.
describe("AnalyticsContent date range", () => {
  it("shows the picker on Overview and labels the outreach cards all time by default", () => {
    renderContent();
    expect(screen.getByTestId("range-picker")).toBeInTheDocument();
    expect(screen.getAllByText("all time").length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText(/7d|7 days/)).not.toBeInTheDocument();
  });

  it("labels the Overview cards with the picked range", () => {
    renderContent({ rangePreset: "30d" });
    expect(screen.getAllByText("Last 30 days").length).toBeGreaterThanOrEqual(3);
  });

  it("reads the range from props (the URL) and shows the server's rows for it on the Outreach tab", async () => {
    renderContent({ dateFrom: ts("2026-05-01T00:00:00"), dateTo: ts("2026-05-31T23:59:59") });
    await userEvent.setup().click(screen.getByRole("tab", { name: "Outreach" }));
    expect(screen.getByText("Client2")).toBeInTheDocument();
    expect(screen.getByTestId("range-picker")).toBeInTheDocument();
  });

  it("clearing writes the URL rather than local state, keeping the employee", async () => {
    renderContent({
      dateFrom: ts("2026-05-01T00:00:00"),
      employees: [{ id: "e1", firstName: "Test", lastName: "Associate" }],
      selectedEmployeeId: "e1",
    });
    await userEvent.setup().click(screen.getByRole("button", { name: "Clear range" }));
    expect(replace).toHaveBeenCalledWith("/analytics?employee=e1", { scroll: false });
  });

  it("a shortcut is written by id so the link stays rolling", async () => {
    renderContent({ dateFrom: ts("2026-05-01T00:00:00") });
    await userEvent.setup().click(screen.getByRole("button", { name: "Last 30 days" }));
    expect(replace).toHaveBeenCalledWith("/analytics?range=30d", { scroll: false });
  });

  it("hides the picker on Heat and Prospects", async () => {
    renderContent();
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Heat Distribution" }));
    expect(screen.queryByTestId("range-picker")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Prospects" }));
    expect(screen.queryByTestId("range-picker")).not.toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "Pick days" }));
    expect(replace).toHaveBeenCalledWith(`/analytics?from=${ts("2026-05-01T00:00:00")}&to=${ts("2026-05-31T23:59:59")}`, { scroll: false });
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
    await user.click(screen.getByRole("button", { name: "Pick days" }));
    expect(replace).toHaveBeenCalledWith(`/analytics?from=${ts("2026-05-01T00:00:00")}&to=${ts("2026-05-31T23:59:59")}`, { scroll: false });
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

  it("the Overview methods hover follows the picked range", async () => {
    renderContent({ methodDistribution: methods(70, 50), rangePreset: "30d" });
    await userEvent.setup().hover(screen.getByText("Outreach", { selector: "p" }));
    expect(await screen.findByText("Outreach Methods (Last 30 days)")).toBeInTheDocument();
    expect(screen.getByText("70")).toBeInTheDocument();
    expect(screen.queryByText(/last 50 logs/)).not.toBeInTheDocument();
  });
});
