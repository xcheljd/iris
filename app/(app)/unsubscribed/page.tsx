import { Suspense } from "react";
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
  return <UnsubscribedContent list={list} />;
}
