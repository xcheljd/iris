import { Suspense } from "react";
import { getPromos } from "@/lib/queries";
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
  return <PromosContent promos={promos} />;
}
