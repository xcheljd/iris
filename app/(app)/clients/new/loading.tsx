import { Topbar } from "@/components/topbar";
import { ClientFormSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <>
      <Topbar title="Add New Client" />
      <ClientFormSkeleton />
    </>
  );
}
