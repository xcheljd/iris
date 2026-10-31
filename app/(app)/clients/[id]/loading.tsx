import { Topbar } from "@/components/topbar";
import { ClientDetailSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <>
      <Topbar title="Client" phoneHeader={false} />
      <ClientDetailSkeleton />
    </>
  );
}
