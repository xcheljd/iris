import { Suspense } from "react";
import { getOverdueFollowUps, getUpcomingFollowUps } from "@/lib/queries";
import { FollowUpsContent } from "./follow-ups-content";
import { FollowUpsSkeleton } from "@/components/skeletons";

export default function FollowUpsPage() {
  return (
    <Suspense fallback={<FollowUpsSkeleton />}>
      <FollowUpsFetcher />
    </Suspense>
  );
}

async function FollowUpsFetcher() {
  const overdue = await getOverdueFollowUps();
  const upcoming = await getUpcomingFollowUps();
  return <FollowUpsContent overdue={overdue} upcoming={upcoming} />;
}
