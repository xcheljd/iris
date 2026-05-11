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
import { isAfter, isBefore, startOfDay, endOfDay } from "date-fns";
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
}

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

export function AnalyticsContent({ stats, recentOutreach, employees, selectedEmployeeId }: AnalyticsContentProps) {
  const router = useRouter();
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [outreachPage, setOutreachPage] = useState(1);

  const filteredOutreach = useMemo(() => {
    if (!dateFrom && !dateTo) return recentOutreach;
    return recentOutreach.filter((r) => {
      const d = new Date(r.log.date);
      if (dateFrom && isBefore(d, startOfDay(dateFrom))) return false;
      if (dateTo && isAfter(d, endOfDay(dateTo))) return false;
      return true;
    });
  }, [recentOutreach, dateFrom, dateTo]);

  const outreachTotalPages = Math.ceil(filteredOutreach.length / PAGE_SIZE);
  const pagedOutreach = filteredOutreach.slice((outreachPage - 1) * PAGE_SIZE, outreachPage * PAGE_SIZE);

  const methodDistribution = useMemo(() => {
    const counts: Record<string, number> = { call: 0, text: 0, email: 0, "in-person": 0 };
    filteredOutreach.forEach((r) => {
      if (counts[r.log.method] !== undefined) counts[r.log.method]++;
    });
    return Object.entries(counts).map(([method, count]) => ({
      method,
      count,
      label: method === "in-person" ? "In-Person" : method.charAt(0).toUpperCase() + method.slice(1),
    }));
  }, [filteredOutreach]);

  const outcomeDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredOutreach.forEach((r) => {
      counts[r.log.outcome] = (counts[r.log.outcome] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([outcome, count]) => ({
        outcome: outcome.replace(/_/g, " "),
        count,
      }));
  }, [filteredOutreach]);

  const totalOutreach = methodDistribution.reduce((sum, m) => sum + m.count, 0);
  const conversionRate = stats.outreachWeek > 0
    ? Math.round((stats.purchasesWeek / stats.outreachWeek) * 100)
    : 0;

  const clearDates = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
    setOutreachPage(1);
  };

  const handleEmployeeChange = (value: string) => {
    const params = value === "all" ? "" : `?employee=${value}`;
    router.push(`/analytics${params}`);
  };

  return (
    <>
      <Topbar title="Analytics" />
      <div className="flex-1 p-4 md:p-6">
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
            <DatePicker
              date={dateFrom}
              onSelect={(d) => { setDateFrom(d); setOutreachPage(1); }}
              placeholder="From"
            />
            <span className="text-muted-foreground text-sm">to</span>
            <DatePicker
              date={dateTo}
              onSelect={(d) => { setDateTo(d); setOutreachPage(1); }}
              placeholder="To"
            />
            {(dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" onClick={clearDates}>
                Clear
              </Button>
            )}
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="outreach">Outreach</TabsTrigger>
            <TabsTrigger value="heat">Heat Distribution</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <AnalyticsOverviewTab
              stats={stats}
              conversionRate={conversionRate}
              methodDistribution={methodDistribution}
            />
          </TabsContent>

          <TabsContent value="outreach">
            <AnalyticsOutreachTab
              pagedOutreach={pagedOutreach}
              totalOutreach={totalOutreach}
              page={outreachPage}
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
        </Tabs>
      </div>
    </>
  );
}
