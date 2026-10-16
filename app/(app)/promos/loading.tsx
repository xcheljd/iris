import { Topbar } from "@/components/topbar";
import { PromosSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <>
      <Topbar title="Promo Manager" />
      <PromosSkeleton />
    </>
  );
}
