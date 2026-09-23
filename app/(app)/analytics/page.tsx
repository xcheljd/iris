import { Suspense } from "react";
import { getStats, getRecentOutreach, getEmployees, getProspectFunnelStats } from "@/lib/queries";
import { AnalyticsContent } from "./analytics-content";
import { AnalyticsSkeleton } from "@/components/skeletons";
import { requirePageSession } from "@/lib/auth";

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

  const [stats, recentOutreach, prospectFunnel] = await Promise.all([
    getStats(employeeId),
    getRecentOutreach(50, employeeId),
    getProspectFunnelStats(),
  ]);
  return (
    <AnalyticsContent
      stats={stats}
      recentOutreach={recentOutreach}
      employees={employees}
      selectedEmployeeId={employeeId}
      prospectFunnel={prospectFunnel}
      dateFrom={parseTs(sp.from)}
      dateTo={parseTs(sp.to)}
    />
  );
}
