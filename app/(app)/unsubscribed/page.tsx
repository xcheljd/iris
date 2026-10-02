import { Suspense } from "react";
import { requirePageSession } from "@/lib/auth";
import { getUnsubscribeList } from "@/lib/queries";
import { UnsubscribedContent } from "./unsubscribed-content";
import { UnsubscribedSkeleton } from "@/components/skeletons";

export default function UnsubscribedPage() {
  return (
    <Suspense fallback={<UnsubscribedSkeleton />}>
      <UnsubscribedFetcher />
    </Suspense>
  );
}

async function UnsubscribedFetcher() {
  const session = await requirePageSession();
  const isManager = session.user.role === "manager";
  const list = await getUnsubscribeList();
  return <UnsubscribedContent list={list} isManager={isManager} />;
}
