import { Suspense } from "react";
import { getStats, getKpiMetrics, getEmployees, getProspectFunnelStats, outreachMethodBreakdown, outreachOutcomeBreakdown, listOutreachLogs, OUTREACH_LOG_SORT_KEYS, type OutreachLogSortKey } from "@/lib/queries";
import { AnalyticsContent } from "./analytics-content";
import { AnalyticsSkeleton } from "@/components/skeletons";
import { requirePageSession } from "@/lib/auth";
import { isDatePresetId, presetRangeSeconds } from "@/lib/date-presets";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function AnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AnalyticsSkeleton />}>
      <AnalyticsFetcher searchParams={searchParams} />
    </Suspense>
  );
}

async function AnalyticsFetcher({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const session = await requirePageSession();
  const isManager = session.user.role === "manager";

  let employeeId: string | undefined;
  let employees: Awaited<ReturnType<typeof getEmployees>> | undefined;

  if (isManager) {
    employees = await getEmployees();
    const param = typeof sp.employee === "string" ? sp.employee : undefined;
    employeeId = param && employees.some((e) => e.id === param) ? param : undefined;
  } else {
    employeeId = session.user.id;
  }

  // Outreach date range, unix seconds (same shape as the clients list's date filters).
  const parseTs = (v: string | string[] | undefined) => {
    if (typeof v !== "string") return undefined;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  // A rolling shortcut (`?range=30d`) wins over explicit days and is resolved
  // against today, so a bookmarked link keeps meaning "the last 30 days".
  // No range at all means all time, on the Overview and the Outreach tab alike.
  const rangePreset = isDatePresetId(sp.range) ? sp.range : undefined;
  const resolved = rangePreset ? presetRangeSeconds(rangePreset) : undefined;
  const dateFrom = resolved ? resolved.from : parseTs(sp.from);
  const dateTo = resolved ? resolved.to : parseTs(sp.to);
  // Same owner scope as every other outreach read here; an inverted range
  // matches nothing, as it does on the clients list.
  const range = { employeeId, from: dateFrom, to: dateTo };

  // Outreach log paging/sort — whitelisted like the other server-driven lists.
  const rawSort = typeof sp.sort === "string" ? sp.sort : undefined;
  const sort = OUTREACH_LOG_SORT_KEYS.includes(rawSort as OutreachLogSortKey) ? (rawSort as OutreachLogSortKey) : undefined;
  const sortDir = sp.sortDir === "asc" ? "asc" : sp.sortDir === "desc" ? "desc" : undefined;
  const page = Math.max(1, parseInt(typeof sp.page === "string" ? sp.page : "1") || 1);

  const [stats, kpis, outreachLog, prospectFunnel, methodDistribution, outcomeDistribution] = await Promise.all([
    getStats(employeeId, { from: dateFrom, to: dateTo }),
    getKpiMetrics(employeeId, { from: dateFrom, to: dateTo }),
    listOutreachLogs({ ...range, sort, sortDir, page }),
    getProspectFunnelStats(),
    outreachMethodBreakdown(range),
    outreachOutcomeBreakdown(range),
  ]);
  return (
    <AnalyticsContent
      stats={stats}
      kpis={kpis}
      outreachLog={outreachLog.rows}
      outreachTotal={outreachLog.total}
      // The query clamps a page past the end; render the page it served.
      outreachPage={outreachLog.page}
      outreachSort={sort}
      outreachSortDir={sortDir}
      employees={employees}
      selectedEmployeeId={employeeId}
      prospectFunnel={prospectFunnel}
      methodDistribution={methodDistribution}
      outcomeDistribution={outcomeDistribution}
      rangePreset={rangePreset}
      dateFrom={rangePreset ? undefined : dateFrom}
      dateTo={rangePreset ? undefined : dateTo}
    />
  );
}
