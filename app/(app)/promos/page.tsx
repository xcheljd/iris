import { Suspense } from "react";
import { getPromos, getPromoMatchCounts } from "@/lib/queries";
import { getSession } from "@/lib/auth";
import { PromosContent } from "./promos-content";
import { PromosSkeleton } from "@/components/skeletons";

export default function PromosPage() {
  return (
    <Suspense fallback={<PromosSkeleton />}>
      <PromosFetcher />
    </Suspense>
  );
}

async function PromosFetcher() {
  const [promos, matchCounts] = await Promise.all([getPromos(), getPromoMatchCounts()]);
  const session = await getSession();
  const isManager = session?.user?.role === "manager";
  return (
    <PromosContent
      promos={promos}
      isManager={isManager}
      matchCounts={matchCounts}
      currentUserId={session?.user?.id ?? ""}
    />
  );
}
