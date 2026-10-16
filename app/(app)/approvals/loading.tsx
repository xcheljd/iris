import { Topbar } from "@/components/topbar";
import { ApprovalsSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <>
      <Topbar title="Approvals" />
      <ApprovalsSkeleton />
    </>
  );
}
