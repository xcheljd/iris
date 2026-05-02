import { Suspense } from "react";
import { getStats, getRecentOutreach } from "@/lib/queries";
import { AnalyticsContent } from "./analytics-content";
import { AnalyticsSkeleton } from "@/components/skeletons";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<AnalyticsSkeleton />}>
      <AnalyticsFetcher />
    </Suspense>
  );
}

async function AnalyticsFetcher() {
  const session = await getServerSession(authOptions);
  const isManager = session?.user?.role === "manager";
  const employeeId = !isManager ? (session?.user?.id ?? undefined) : undefined;
  const stats = await getStats(employeeId);
  const recentOutreach = await getRecentOutreach(50, employeeId);
  return <AnalyticsContent stats={stats} recentOutreach={recentOutreach} />;
}
