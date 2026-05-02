import { Suspense } from "react";
import { getOverdueFollowUps, getUpcomingFollowUps } from "@/lib/queries";
import { FollowUpsContent } from "./follow-ups-content";
import { FollowUpsSkeleton } from "@/components/skeletons";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default function FollowUpsPage() {
  return (
    <Suspense fallback={<FollowUpsSkeleton />}>
      <FollowUpsFetcher />
    </Suspense>
  );
}

async function FollowUpsFetcher() {
  const session = await getServerSession(authOptions);
  const isManager = session?.user?.role === "manager";
  const employeeId = !isManager ? (session?.user?.id ?? undefined) : undefined;
  const overdue = await getOverdueFollowUps(employeeId);
  const upcoming = await getUpcomingFollowUps(employeeId);
  return <FollowUpsContent overdue={overdue} upcoming={upcoming} />;
}
