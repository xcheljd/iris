import { Suspense } from "react";
import { getAllClients } from "@/lib/queries";
import { CollectionsContent } from "./collections-content";
import { CollectionsSkeleton } from "@/components/skeletons";

export default function CollectionsPage() {
  return (
    <Suspense fallback={<CollectionsSkeleton />}>
      <CollectionsFetcher />
    </Suspense>
  );
}

async function CollectionsFetcher() {
  const clients = await getAllClients();
  return <CollectionsContent clients={clients} />;
}
