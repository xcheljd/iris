import { getClientsWithEmployee } from "@/lib/queries";
import { ClientListContent } from "./clients-content";
import { Suspense } from "react";
import { ClientListSkeleton } from "@/components/skeletons";

export default async function ClientListPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string; heat?: string }> }) {
  const sp = await searchParams;
  const rows = await getClientsWithEmployee();

  return (
    <ClientListContent rows={JSON.parse(JSON.stringify(rows))} totalClients={rows.length} />
  );
}
