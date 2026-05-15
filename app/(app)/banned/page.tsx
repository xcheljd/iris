import { Suspense } from "react";
import { getBannedCustomers } from "@/lib/queries";
import { BannedContent } from "./banned-content";
import { BannedSkeleton } from "@/components/skeletons";
import { getSession } from "@/lib/auth";

export default function BannedPage() {
  return (
    <Suspense fallback={<BannedSkeleton />}>
      <BannedFetcher />
    </Suspense>
  );
}

async function BannedFetcher() {
  const banned = await getBannedCustomers();
  const session = await getSession();
  const isManager = session?.user?.role === "manager";
  return <BannedContent banned={banned} isManager={isManager} />;
}
