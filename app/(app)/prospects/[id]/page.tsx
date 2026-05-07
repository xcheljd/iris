import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getProspectWithBatch } from "@/lib/queries";
import { ProspectDetailContent } from "./prospect-detail-content";
import { ProspectDetailSkeleton } from "@/components/skeletons";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default function ProspectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<ProspectDetailSkeleton />}>
      <ProspectDetailFetcher params={params} />
    </Suspense>
  );
}

async function ProspectDetailFetcher({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const data = await getProspectWithBatch(id);
  if (!data?.prospect) notFound();

  return (
    <ProspectDetailContent
      prospect={JSON.parse(JSON.stringify(data.prospect))}
      batchStart={data.batchStart ? new Date(data.batchStart).toISOString() : null}
      batchEnd={data.batchEnd ? new Date(data.batchEnd).toISOString() : null}
      currentUserRole={session?.user?.role ?? "associate"}
    />
  );
}
