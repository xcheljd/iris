"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/date-picker";
import { Topbar } from "@/components/topbar";
import { AnalyticsOverviewTab } from "./analytics-overview-tab";
import { AnalyticsOutreachTab } from "./analytics-outreach-tab";
import { AnalyticsHeatTab } from "./analytics-heat-tab";
import { AnalyticsProspectsTab } from "./analytics-prospects-tab";
import { isAfter, isBefore, startOfDay, endOfDay } from "date-fns";
import type { ProspectFunnelStats, OutreachMethodBreakdown, OutreachOutcomeBreakdown } from "@/lib/queries";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";

interface Stats {
  total: number;
  active: number;
  hot: number;
  warm: number;
  cold: number;
  banned: number;
  unsubscribed: number;
  outreachWeek: number;
  purchasesWeek: number;
}

interface OutreachRow {
  log: {
    id: string;
    method: string;
    date: Date;
    outcome: string;
    notes: string | null;
  };
  client: {
    id: string;
    firstName: string;
    lastName: string | null;
  } | null;
  employee: {
    firstName: string;
    lastName: string | null;
  } | null;
}

interface EmployeeRow {
  id: string;
  firstName: string;
  lastName: string | null;
}

interface AnalyticsContentProps {
  stats: Stats;
  recentOutreach: OutreachRow[];
  employees?: EmployeeRow[];
  selectedEmployeeId?: string;
  prospectFunnel: ProspectFunnelStats;
  /** Counted in SQL over every log in the selected range (`outreachMethodBreakdown`). */
  methodDistribution: OutreachMethodBreakdown;
  outcomeDistribution: OutreachOutcomeBreakdown;
  /** The Overview ignores the date range, so it gets the unranged counts. */
  allTimeMethodDistribution: OutreachMethodBreakdown;
  /** Outreach date range from `?from=` / `?to=`, unix seconds. */
  dateFrom?: number;
  dateTo?: number;
}

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

export function AnalyticsContent({ stats, recentOutreach, employees, selectedEmployeeId, prospectFunnel, methodDistribution, outcomeDistribution, allTimeMethodDistribution, dateFrom: fromTs, dateTo: toTs }: AnalyticsContentProps) {
  const router = useRouter();
  const dateFrom = fromTs ? new Date(fromTs * 1000) : undefined;
  const dateTo = toTs ? new Date(toTs * 1000) : undefined;
  const [tab, setTab] = useState("overview");
  const [outreachPage, setOutreachPage] = useState(1);

  // The single URL writer: employee (managers only) and the date range.
  function navigate(next: { employee?: string; from?: Date; to?: Date }, history: "push" | "replace" = "replace") {
    const sp = new URLSearchParams();
    if (next.employee) sp.set("employee", next.employee);
    if (next.from) sp.set("from", String(Math.floor(next.from.getTime() / 1000)));
    if (next.to) sp.set("to", String(Math.floor(next.to.getTime() / 1000)));
    const qs = sp.toString();
    const url = qs ? `/analytics?${qs}` : "/analytics";
    if (history === "push") router.push(url, { scroll: false });
    else router.replace(url, { scroll: false });
  }
  const current = { employee: employees ? selectedEmployeeId : undefined, from: dateFrom, to: dateTo };

  const filteredOutreach = useMemo(() => {
    if (!fromTs && !toTs) return recentOutreach;
    const from = fromTs ? startOfDay(new Date(fromTs * 1000)) : undefined;
    const to = toTs ? endOfDay(new Date(toTs * 1000)) : undefined;
    return recentOutreach.filter((r) => {
      const d = new Date(r.log.date);
      if (from && isBefore(d, from)) return false;
      if (to && isAfter(d, to)) return false;
      return true;
    });
  }, [recentOutreach, fromTs, toTs]);

  const outreachTotalPages = Math.ceil(filteredOutreach.length / PAGE_SIZE);
  // Back/forward can narrow the range under a later page; clamp rather than show an empty one.
  const page = Math.min(outreachPage, Math.max(1, outreachTotalPages));
  const pagedOutreach = filteredOutreach.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totalOutreach = methodDistribution.reduce((sum, m) => sum + m.count, 0);
  const conversionRate = stats.outreachWeek > 0
    ? Math.round((stats.purchasesWeek / stats.outreachWeek) * 100)
    : 0;

  const clearDates = () => {
    setOutreachPage(1);
    navigate({ ...current, from: undefined, to: undefined });
  };

  const handleEmployeeChange = (value: string) => {
    navigate({ ...current, employee: value === "all" ? undefined : value }, "push");
  };

  return (
    <>
      <Topbar title="Analytics" />
      <div className="flex-1 p-4 md:p-6" data-tour="analytics">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
          <div>
            <h1 className="sr-only">Analytics</h1>
            <p className="text-muted-foreground mt-1">
              Performance metrics and outreach insights
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {employees && (
              <Select value={selectedEmployeeId ?? "all"} onValueChange={handleEmployeeChange}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="All Employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.firstName}{e.lastName ? ` ${e.lastName}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {/* The range filters the Outreach tab only; the other tabs are
                fixed-window or point-in-time, so the pickers would do nothing there. */}
            {tab === "outreach" && (
              <>
                <DatePicker
                  date={dateFrom}
                  onSelectAction={(d) => { setOutreachPage(1); navigate({ ...current, from: d }); }}
                  placeholder="From"
                />
                <span className="text-muted-foreground text-sm">to</span>
                <DatePicker
                  date={dateTo}
                  // The picker yields local midnight and the server bound is inclusive
                  // (`lte`), so send the end of the day or it drops the whole last day.
                  onSelectAction={(d) => { setOutreachPage(1); navigate({ ...current, to: d && endOfDay(d) }); }}
                  placeholder="To"
                />
                {(dateFrom || dateTo) && (
                  <Button variant="ghost" size="sm" onClick={clearDates}>
                    Clear
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="outreach">Outreach</TabsTrigger>
            <TabsTrigger value="heat">Heat Distribution</TabsTrigger>
            <TabsTrigger value="prospects">Prospects</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <AnalyticsOverviewTab
              stats={stats}
              conversionRate={conversionRate}
              methodDistribution={allTimeMethodDistribution}
            />
          </TabsContent>

          <TabsContent value="outreach">
            <AnalyticsOutreachTab
              pagedOutreach={pagedOutreach}
              totalOutreach={totalOutreach}
              page={page}
              setPage={setOutreachPage}
              totalPages={outreachTotalPages}
              totalFiltered={filteredOutreach.length}
              methodDistribution={methodDistribution}
              outcomeDistribution={outcomeDistribution}
              hasDateFilter={!!(dateFrom || dateTo)}
            />
          </TabsContent>

          <TabsContent value="heat">
            <AnalyticsHeatTab stats={stats} />
          </TabsContent>

          <TabsContent value="prospects">
            <AnalyticsProspectsTab funnel={prospectFunnel} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
