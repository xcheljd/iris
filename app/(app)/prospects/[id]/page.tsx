import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getProspectWithBatch } from "@/lib/queries";
import { ProspectDetailContent } from "./prospect-detail-content";
import { ProspectDetailSkeleton } from "@/components/skeletons";
import { requirePageSession } from "@/lib/auth";
import { Topbar } from "@/components/topbar";

export default function ProspectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<><Topbar title="Prospect" phoneHeader={false} /><ProspectDetailSkeleton /></>}>
      <ProspectDetailFetcher params={params} />
    </Suspense>
  );
}

async function ProspectDetailFetcher({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePageSession();
  const data = await getProspectWithBatch(id);
  if (!data?.prospect) notFound();

  return (
    <ProspectDetailContent
      prospect={JSON.parse(JSON.stringify(data.prospect))}
      importedAt={data.importedAt ? new Date(data.importedAt).toISOString() : null}
      currentUserRole={session.user.role}
    />
  );
}
