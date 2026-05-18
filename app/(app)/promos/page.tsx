import { Suspense } from "react";
import { getPromos, getPromoMatchCounts, getMatchedClients } from "@/lib/queries";
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
  const session = await getSession();
  const isManager = session?.user?.role === "manager";
  const [promos, matchCounts, matchedClients] = await Promise.all([
    getPromos(),
    getPromoMatchCounts(),
    getMatchedClients(isManager ? undefined : session?.user?.id),
  ]);
  return (
    <PromosContent
      promos={promos}
      isManager={isManager}
      matchCounts={matchCounts}
      currentUserId={session?.user?.id ?? ""}
      matchedClients={matchedClients}
    />
  );
}
