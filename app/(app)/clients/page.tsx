import { Suspense } from "react";
import { getClientsWithEmployee } from "@/lib/queries";
import { ClientListContent } from "./clients-content";
import { ClientListSkeleton } from "@/components/skeletons";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default function ClientListPage({ searchParams: _searchParams }: { searchParams: Promise<{ q?: string; filter?: string; heat?: string }> }) {
  return (
    <Suspense fallback={<ClientListSkeleton />}>
      <ClientListFetcher />
    </Suspense>
  );
}

async function ClientListFetcher() {
  const session = await getServerSession(authOptions);
  const isManager = session?.user?.role === "manager";
  const employeeId = !isManager ? (session?.user?.id ?? undefined) : undefined;
  const rows = await getClientsWithEmployee(employeeId);
  return <ClientListContent rows={JSON.parse(JSON.stringify(rows))} totalClients={rows.length} currentUserRole={session?.user?.role ?? "associate"} />;
}
