import { Suspense } from "react";
import { getAllClients, getModelCollectionMap } from "@/lib/queries";
import { CollectionsContent } from "./collections-content";
import { CollectionsSkeleton } from "@/components/skeletons";
import { getSession } from "@/lib/auth";

export default function CollectionsPage() {
  return (
    <Suspense fallback={<CollectionsSkeleton />}>
      <CollectionsFetcher />
    </Suspense>
  );
}

async function CollectionsFetcher() {
  const session = await getSession();
  const isManager = session?.user?.role === "manager";
  const employeeId = !isManager ? (session?.user?.id ?? undefined) : undefined;
  const [clients, collectionMap] = await Promise.all([
    getAllClients(employeeId),
    getModelCollectionMap(),
  ]);
  return <CollectionsContent clients={clients} collectionMap={collectionMap} />;
}
