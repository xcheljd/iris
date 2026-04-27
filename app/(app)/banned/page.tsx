import { Suspense } from "react";
import { getBannedCustomers } from "@/lib/queries";
import { BannedContent } from "./banned-content";
import { BannedSkeleton } from "@/components/skeletons";

export default function BannedPage() {
  return (
    <Suspense fallback={<BannedSkeleton />}>
      <BannedFetcher />
    </Suspense>
  );
}

async function BannedFetcher() {
  const banned = await getBannedCustomers();
  return <BannedContent banned={banned} />;
}
