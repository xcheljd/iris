import { Topbar } from "@/components/topbar";
import { ProspectsSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <>
      <Topbar title="Prospects" />
      <ProspectsSkeleton />
    </>
  );
}
