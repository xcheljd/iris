import { getOverdueFollowUps, getUpcomingFollowUps } from "@/lib/queries";
import { FollowUpsContent } from "./follow-ups-content";

export default async function FollowUpsPage() {
  const overdue = await getOverdueFollowUps();
  const upcoming = await getUpcomingFollowUps();
  
  return <FollowUpsContent overdue={overdue} upcoming={upcoming} />;
}