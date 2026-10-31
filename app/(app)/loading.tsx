import { Topbar } from "@/components/topbar";
import { DashboardSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <>
      <Topbar title="Dashboard" />
      <DashboardSkeleton />
    </>
  );
}
