import { Topbar } from "@/components/topbar";
import { ClientListSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <>
      <Topbar title="Clients" />
      <ClientListSkeleton />
    </>
  );
}
