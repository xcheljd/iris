import { Suspense } from "react";
import { getClientsWithEmployeePaginated, getClientOwnerNames, getTags, type ClientSortKey } from "@/lib/queries";
import { ClientListContent } from "./clients-content";
import { ClientListSkeleton } from "@/components/skeletons";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const VALID_SORT_KEYS: ClientSortKey[] = ["name", "heat", "lastContact", "owner"];

export default function ClientListPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ClientListSkeleton />}>
      <ClientListFetcher searchParams={searchParams} />
    </Suspense>
  );
}

async function ClientListFetcher({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const heat = typeof sp.heat === "string" ? sp.heat : undefined;
  const owner = typeof sp.owner === "string" ? sp.owner : undefined;
  const tags = typeof sp.tags === "string" && sp.tags.length > 0
    ? sp.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : undefined;
  const tagMode: "any" | "all" = sp.tagMode === "all" ? "all" : "any";
  const rawSort = typeof sp.sort === "string" ? sp.sort : undefined;
  const sort = VALID_SORT_KEYS.includes(rawSort as ClientSortKey) ? (rawSort as ClientSortKey) : undefined;
  const sortDir = sp.sortDir === "asc" ? "asc" : sp.sortDir === "desc" ? "desc" : undefined;
  const page = Math.max(1, parseInt(typeof sp.page === "string" ? sp.page : "1") || 1);

  const session = await getServerSession(authOptions);
  const isManager = session?.user?.role === "manager";
  const employeeId = !isManager ? (session?.user?.id ?? undefined) : undefined;

  const [{ rows, total }, ownerNames, allTags] = await Promise.all([
    getClientsWithEmployeePaginated(employeeId, { q, heat, owner, tags, tagMode, sort, sortDir, page }),
    getClientOwnerNames(employeeId),
    getTags(),
  ]);

  return (
    <ClientListContent
      rows={JSON.parse(JSON.stringify(rows))}
      total={total}
      ownerNames={ownerNames}
      allTags={allTags.map((t) => ({ name: t.name, usageCount: t.usageCount }))}
      currentFilters={{
        q: q ?? "",
        heat: heat ?? "any",
        owner: owner ?? "any",
        tags: tags ?? [],
        tagMode,
        sort: sort ?? "heat",
        sortDir: sortDir ?? "desc",
        page,
      }}
      currentUserRole={session?.user?.role ?? "associate"}
    />
  );
}
