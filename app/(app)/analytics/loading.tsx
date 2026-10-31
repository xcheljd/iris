import { Topbar } from "@/components/topbar";
import { AnalyticsSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <>
      <Topbar title="Analytics" />
      <AnalyticsSkeleton />
    </>
  );
}
