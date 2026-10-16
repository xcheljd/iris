import { Topbar } from "@/components/topbar";
import { SmartListsSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <>
      <Topbar title="Smart Lists" />
      <SmartListsSkeleton />
    </>
  );
}
