import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
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
  const session = await getServerSession(authOptions);
  const isManager = session?.user?.role === "manager";
  return <UnsubscribedContent list={list} isManager={isManager} />;
}
