import { Topbar } from "@/components/topbar";
import { ClientDetailSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <>
      <Topbar title="Edit Client" />
      <ClientDetailSkeleton />
    </>
  );
}
