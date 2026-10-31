import { Topbar } from "@/components/topbar";
import { CatalogSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <>
      <Topbar title="Model Catalog" />
      <CatalogSkeleton />
    </>
  );
}
