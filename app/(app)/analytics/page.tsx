import { Suspense } from "react";
import { getStats, getRecentOutreach } from "@/lib/queries";
import { AnalyticsContent } from "./analytics-content";
import { AnalyticsSkeleton } from "@/components/skeletons";

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<AnalyticsSkeleton />}>
      <AnalyticsFetcher />
    </Suspense>
  );
}

async function AnalyticsFetcher() {
  const stats = await getStats();
  const recentOutreach = await getRecentOutreach(50);
  return <AnalyticsContent stats={stats} recentOutreach={recentOutreach} />;
}
