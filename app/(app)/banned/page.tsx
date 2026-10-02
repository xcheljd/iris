import { Suspense } from "react";
import { getBannedCustomers } from "@/lib/queries";
import { BannedContent } from "./banned-content";
import { BannedSkeleton } from "@/components/skeletons";
import { requirePageSession } from "@/lib/auth";

export default function BannedPage() {
  return (
    <Suspense fallback={<BannedSkeleton />}>
      <BannedFetcher />
    </Suspense>
  );
}

async function BannedFetcher() {
  const session = await requirePageSession();
  const isManager = session.user.role === "manager";
  const banned = await getBannedCustomers();
  return <BannedContent banned={banned} isManager={isManager} />;
}
