import { Topbar } from "@/components/topbar";
import { CollectionsSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <>
      <Topbar title="Collections" />
      <CollectionsSkeleton />
    </>
  );
}
