import { Suspense } from "react";
import { getBannedCustomers } from "@/lib/queries";
import { BannedContent } from "./banned-content";
import { BannedSkeleton } from "@/components/skeletons";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default function BannedPage() {
  return (
    <Suspense fallback={<BannedSkeleton />}>
      <BannedFetcher />
    </Suspense>
  );
}

async function BannedFetcher() {
  const banned = await getBannedCustomers();
  const session = await getServerSession(authOptions);
  const isManager = session?.user?.role === "manager";
  return <BannedContent banned={banned} isManager={isManager} />;
}
