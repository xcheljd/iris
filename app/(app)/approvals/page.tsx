import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getPendingApprovalRequests } from "@/lib/actions";
import { ApprovalsContent } from "./approvals-content";
import { ApprovalsSkeleton } from "@/components/skeletons";

export default function ApprovalsPage() {
  return (
    <Suspense fallback={<ApprovalsSkeleton />}>
      <ApprovalsFetcher />
    </Suspense>
  );
}

async function ApprovalsFetcher() {
  const session = await getSession();
  if (session?.user?.role !== "manager") {
    redirect("/");
  }
  const requests = await getPendingApprovalRequests();
  return <ApprovalsContent requests={JSON.parse(JSON.stringify(requests))} />;
}
