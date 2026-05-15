import { Suspense } from "react";
import { getSession } from "@/lib/auth";
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
  const list = await getUnsubscribeList();
  const session = await getSession();
  const isManager = session?.user?.role === "manager";
  return <UnsubscribedContent list={list} isManager={isManager} />;
}
