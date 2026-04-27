import { Suspense } from "react";
import { getClientsWithEmployee } from "@/lib/queries";
import { ClientListContent } from "./clients-content";
import { ClientListSkeleton } from "@/components/skeletons";

export default function ClientListPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string; heat?: string }> }) {
  return (
    <Suspense fallback={<ClientListSkeleton />}>
      <ClientListFetcher />
    </Suspense>
  );
}

async function ClientListFetcher() {
  const rows = await getClientsWithEmployee();
  return <ClientListContent rows={JSON.parse(JSON.stringify(rows))} totalClients={rows.length} />;
}
