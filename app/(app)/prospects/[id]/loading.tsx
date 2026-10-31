import { Topbar } from "@/components/topbar";
import { ProspectDetailSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <>
      <Topbar title="Prospect" phoneHeader={false} />
      <ProspectDetailSkeleton />
    </>
  );
}
