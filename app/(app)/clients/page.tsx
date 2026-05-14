import { Suspense } from "react";
import { getClientsWithEmployeePaginated, getClientOwnerNames, getTags, getEmployees, type ClientSortKey } from "@/lib/queries";
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
  const nameQ = typeof sp.nameQ === "string" ? sp.nameQ : undefined;
  const contactQ = typeof sp.contactQ === "string" ? sp.contactQ : undefined;
  const parseTs = (v: string | string[] | undefined) => {
    if (typeof v !== "string") return undefined;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const lastContactFrom = parseTs(sp.lastContactFrom);
  const lastContactTo = parseTs(sp.lastContactTo);
  const createdFrom = parseTs(sp.createdFrom);
  const createdTo = parseTs(sp.createdTo);
  const rawSort = typeof sp.sort === "string" ? sp.sort : undefined;
  const sort = VALID_SORT_KEYS.includes(rawSort as ClientSortKey) ? (rawSort as ClientSortKey) : undefined;
  const sortDir = sp.sortDir === "asc" ? "asc" : sp.sortDir === "desc" ? "desc" : undefined;
  const page = Math.max(1, parseInt(typeof sp.page === "string" ? sp.page : "1") || 1);

  const session = await getServerSession(authOptions);
  const isManager = session?.user?.role === "manager";
  const employeeId = !isManager ? (session?.user?.id ?? undefined) : undefined;

  const [{ rows, total }, ownerNames, allTags, allEmployees] = await Promise.all([
    getClientsWithEmployeePaginated(employeeId, { q, nameQ, contactQ, heat, owner, tags, tagMode, lastContactFrom, lastContactTo, createdFrom, createdTo, sort, sortDir, page }),
    getClientOwnerNames(employeeId),
    getTags(),
    getEmployees(),
  ]);

  // Only active employees, formatted for the bulk Reassign-owner picker
  const employeeOptions = allEmployees
    .filter((e) => e.active)
    .map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName ?? ""}`.trim() || e.username }));

  return (
    <ClientListContent
      rows={JSON.parse(JSON.stringify(rows))}
      total={total}
      ownerNames={ownerNames}
      allTags={allTags.map((t) => ({ name: t.name, usageCount: t.usageCount }))}
      employeeOptions={employeeOptions}
      currentFilters={{
        q: q ?? "",
        nameQ: nameQ ?? "",
        contactQ: contactQ ?? "",
        heat: heat ?? "any",
        owner: owner ?? "any",
        tags: tags ?? [],
        tagMode,
        lastContactFrom,
        lastContactTo,
        createdFrom,
        createdTo,
        sort: sort ?? "heat",
        sortDir: sortDir ?? "desc",
        page,
      }}
      currentUserRole={session?.user?.role ?? "associate"}
    />
  );
}
