import { Suspense } from "react";
import { getSmartLists, getAllClients } from "@/lib/queries";
import { SmartListsContent } from "./smart-lists-content";
import { SmartListsSkeleton } from "@/components/skeletons";

export default function SmartListsPage() {
  return (
    <Suspense fallback={<SmartListsSkeleton />}>
      <SmartListsFetcher />
    </Suspense>
  );
}

async function SmartListsFetcher() {
  const lists = await getSmartLists();
  const allClients = await getAllClients();
  return <SmartListsContent lists={lists} allClients={allClients} />;
}
