import { Suspense } from "react";
import { getPromos } from "@/lib/queries";
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
  const promos = await getPromos();
  const session = await getSession();
  const isManager = session?.user?.role === "manager";
  return <PromosContent promos={promos} isManager={isManager} />;
}
