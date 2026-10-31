import { Suspense } from "react";
import { getAllClients } from "@/lib/queries";
import { CollectionsContent } from "./collections-content";
import { CollectionsSkeleton } from "@/components/skeletons";
import { requirePageSession } from "@/lib/auth";

export default function CollectionsPage() {
  return (
    <Suspense fallback={<CollectionsSkeleton />}>
      <CollectionsFetcher />
    </Suspense>
  );
}

async function CollectionsFetcher() {
  const session = await requirePageSession();
  const isManager = session.user.role === "manager";
  const employeeId = isManager ? undefined : session.user.id;
  const clients = await getAllClients(employeeId);
  return <CollectionsContent clients={clients} />;
}
