import { Suspense } from "react";
import {
  getSmartLists,
  getAllSmartListCounts,
  getBuiltInListClients,
  getCustomListClients,
  BUILTIN_FILTER_IDS,
  type ClientListRow,
} from "@/lib/queries";
import { SmartListsContent } from "./smart-lists-content";
import { SmartListsSkeleton } from "@/components/skeletons";
import { getSession } from "@/lib/auth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function SmartListsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<SmartListsSkeleton />}>
      <SmartListsFetcher searchParams={searchParams} />
    </Suspense>
  );
}

async function SmartListsFetcher({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const selectedParam = typeof sp.list === "string" ? sp.list : null;

  const session = await getSession();
  const isManager = session?.user?.role === "manager";
  const employeeId = !isManager ? (session?.user?.id ?? undefined) : undefined;

  const lists = await getSmartLists(employeeId);
  const counts = await getAllSmartListCounts(lists, employeeId);

  let selectedClients: ClientListRow[] | null = null;
  let selectedListTruncated = false;
  let selectedListId: string | null = null;

  if (selectedParam) {
    if ((BUILTIN_FILTER_IDS as readonly string[]).includes(selectedParam)) {
      const result = await getBuiltInListClients(selectedParam, employeeId);
      selectedClients = result.rows;
      selectedListTruncated = result.truncated;
      selectedListId = `builtin-${selectedParam}`;
    } else {
      const customList = lists.find((l) => l.id === selectedParam);
      if (customList) {
        const result = await getCustomListClients(customList.filters as Record<string, unknown>, employeeId);
        selectedClients = result.rows;
        selectedListTruncated = result.truncated;
        selectedListId = customList.id;
      }
    }
  }

  return (
    <SmartListsContent
      lists={lists}
      counts={counts}
      selectedListId={selectedListId}
      selectedClients={selectedClients ? JSON.parse(JSON.stringify(selectedClients)) : null}
      selectedListTruncated={selectedListTruncated}
    />
  );
}
