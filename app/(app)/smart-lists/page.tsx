import { Suspense } from "react";
import { getSmartLists, getAllClients } from "@/lib/queries";
import { SmartListsContent } from "./smart-lists-content";
import { SmartListsSkeleton } from "@/components/skeletons";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default function SmartListsPage() {
  return (
    <Suspense fallback={<SmartListsSkeleton />}>
      <SmartListsFetcher />
    </Suspense>
  );
}

async function SmartListsFetcher() {
  const session = await getServerSession(authOptions);
  const isManager = session?.user?.role === "manager";
  const employeeId = !isManager ? (session?.user?.id ?? undefined) : undefined;
  const lists = await getSmartLists(employeeId);
  const allClients = await getAllClients(employeeId);
  return <SmartListsContent lists={lists} allClients={allClients} />;
}
