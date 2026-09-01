import { Suspense } from "react";
import {
  listProspects,
  PROSPECT_SORT_KEYS,
  PROSPECT_STATUSES,
  type ProspectSortKey,
  type ProspectStatus,
} from "@/lib/queries";
import { ProspectsContent } from "./prospects-content";
import { ProspectsSkeleton } from "@/components/skeletons";
import { getSession } from "@/lib/auth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function ProspectsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ProspectsSkeleton />}>
      <ProspectsFetcher searchParams={searchParams} />
    </Suspense>
  );
}

async function ProspectsFetcher({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

  // Both of these come off the whitelist or fall back: an unknown status is
  // the Active tab, an unknown sort key is the list's native newest-first.
  const rawStatus = str(sp.status) as ProspectStatus;
  const status = PROSPECT_STATUSES.includes(rawStatus) ? rawStatus : "active";
  const rawSort = str(sp.sort) as ProspectSortKey;
  const sort = PROSPECT_SORT_KEYS.includes(rawSort) ? rawSort : undefined;
  const q = str(sp.q);
  const dir = str(sp.dir) === "desc" ? "desc" : "asc";
  const page = Math.max(1, parseInt(str(sp.page) || "1") || 1);

  const session = await getSession();
  const isManager = session?.user?.role === "manager";

  const list = await listProspects({ status, q, sort, sortDir: dir, page });

  return (
    <ProspectsContent
      rows={list.rows}
      total={list.total}
      counts={list.counts}
      // The query clamps a page past the end; render the page it served.
      filters={{ status, q, sort, dir, page: list.page }}
      isManager={isManager}
    />
  );
}
