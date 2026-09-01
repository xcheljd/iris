import { Suspense } from "react";
import { listPromos, getPromoMatchCounts, getMatchedClients, PROMO_SORT_KEYS, type PromoSortKey } from "@/lib/queries";
import { getSession } from "@/lib/auth";
import { PromosContent } from "./promos-content";
import { PromosSkeleton } from "@/components/skeletons";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function PromosPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PromosSkeleton />}>
      <PromosFetcher searchParams={searchParams} />
    </Suspense>
  );
}

async function PromosFetcher({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const list = (v: string | string[] | undefined) =>
    str(v).split(",").map((s) => s.trim()).filter(Boolean);
  const num = (v: string | string[] | undefined) => {
    const n = parseFloat(str(v));
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };

  const q = str(sp.q);
  const brands = list(sp.brands);
  const collections = list(sp.cols);
  const msrpMax = num(sp.msrpMax);
  const discMin = num(sp.discMin);
  const size1Pos = str(sp.s1) === "1";
  const size2Pos = str(sp.s2) === "1";
  // Off the whitelist or nothing: an unknown key falls back to import order.
  const rawSort = str(sp.sort) as PromoSortKey;
  const sort = PROMO_SORT_KEYS.includes(rawSort) ? rawSort : undefined;
  const dir = str(sp.dir) === "desc" ? "desc" : "asc";
  const page = Math.max(1, parseInt(str(sp.page) || "1") || 1);

  const session = await getSession();
  const isManager = session?.user?.role === "manager";

  const [promoList, matchedClients] = await Promise.all([
    listPromos({ q, brands, collections, msrpMax, discMin, size1Pos, size2Pos, sort, sortDir: dir, page }),
    getMatchedClients(isManager ? undefined : session?.user?.id),
  ]);
  // Only the promos actually on this page need a Clients badge.
  const matchCounts = await getPromoMatchCounts(promoList.rows.map((p) => p.id));

  return (
    <PromosContent
      promos={promoList.rows}
      total={promoList.total}
      summary={promoList.summary}
      collections={promoList.collections}
      filters={{
        q,
        brands,
        collections,
        msrpMax,
        discMin,
        size1Pos,
        size2Pos,
        sort,
        dir,
        // The query clamps a page past the end; render the page it served.
        page: promoList.page,
      }}
      isManager={isManager}
      matchCounts={matchCounts}
      currentUserId={session?.user?.id ?? ""}
      matchedClients={matchedClients}
    />
  );
}
