import { Suspense } from "react";
import { getStats, getRecentOutreach, getEmployees } from "@/lib/queries";
import { AnalyticsContent } from "./analytics-content";
import { AnalyticsSkeleton } from "@/components/skeletons";
import { getSession } from "@/lib/auth";

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
  const session = await getSession();
  const isManager = session?.user?.role === "manager";

  let employeeId: string | undefined;
  let employees: Awaited<ReturnType<typeof getEmployees>> | undefined;

  if (isManager) {
    employees = await getEmployees();
    const param = typeof sp.employee === "string" ? sp.employee : undefined;
    employeeId = param && employees.some((e) => e.id === param) ? param : undefined;
  } else {
    employeeId = session?.user?.id ?? undefined;
  }

  const stats = await getStats(employeeId);
  const recentOutreach = await getRecentOutreach(50, employeeId);
  return (
    <AnalyticsContent
      stats={stats}
      recentOutreach={recentOutreach}
      employees={employees}
      selectedEmployeeId={employeeId}
    />
  );
}
