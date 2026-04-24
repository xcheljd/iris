import { getStats, getRecentOutreach } from "@/lib/queries";
import { AnalyticsContent } from "./analytics-content";

export default async function AnalyticsPage() {
  const stats = await getStats();
  const recentOutreach = await getRecentOutreach(50);

  return <AnalyticsContent stats={stats} recentOutreach={recentOutreach} />;
}