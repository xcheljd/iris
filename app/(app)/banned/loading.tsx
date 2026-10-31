import { Topbar } from "@/components/topbar";
import { BannedSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <>
      <Topbar title="Banned Customers" />
      <BannedSkeleton />
    </>
  );
}
