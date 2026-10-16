import { Topbar } from "@/components/topbar";
import { FollowUpsSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <>
      <Topbar title="Follow-Ups" />
      <FollowUpsSkeleton />
    </>
  );
}
