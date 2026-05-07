import { Suspense } from "react";
import { getProspects } from "@/lib/queries";
import { ProspectsContent } from "./prospects-content";
import { ProspectsSkeleton } from "@/components/skeletons";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default function ProspectsPage() {
  return (
    <Suspense fallback={<ProspectsSkeleton />}>
      <ProspectsFetcher />
    </Suspense>
  );
}

async function ProspectsFetcher() {
  const session = await getServerSession(authOptions);
  const isManager = session?.user?.role === "manager";

  const [active, graduated, unsubscribed, rejected] = await Promise.all([
    getProspects("active"),
    getProspects("graduated"),
    getProspects("unsubscribed"),
    getProspects("rejected"),
  ]);

  return (
    <ProspectsContent
      active={active}
      graduated={graduated}
      unsubscribed={unsubscribed}
      rejected={rejected}
      isManager={isManager}
    />
  );
}
