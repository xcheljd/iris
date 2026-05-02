import { Suspense } from "react";
import { getAllClients } from "@/lib/queries";
import { CollectionsContent } from "./collections-content";
import { CollectionsSkeleton } from "@/components/skeletons";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default function CollectionsPage() {
  return (
    <Suspense fallback={<CollectionsSkeleton />}>
      <CollectionsFetcher />
    </Suspense>
  );
}

async function CollectionsFetcher() {
  const session = await getServerSession(authOptions);
  const isManager = session?.user?.role === "manager";
  const employeeId = !isManager ? (session?.user?.id ?? undefined) : undefined;
  const clients = await getAllClients(employeeId);
  return <CollectionsContent clients={clients} />;
}
