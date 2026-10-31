import { Topbar } from "@/components/topbar";
import { UnsubscribedSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <>
      <Topbar title="Unsubscribed" />
      <UnsubscribedSkeleton />
    </>
  );
}
