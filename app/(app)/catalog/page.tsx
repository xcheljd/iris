import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listCatalog } from "@/lib/actions";
import { CatalogContent } from "./catalog-content";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={null}>
      <CatalogFetcher searchParams={searchParams} />
    </Suspense>
  );
}

async function CatalogFetcher({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const session = await getSession();
  if (session?.user?.role !== "manager") {
    redirect("/");
  }
  const mod = typeof sp.mod === "string" ? sp.mod : "";
  const col = typeof sp.col === "string" ? sp.col : "";
  const brandsParam = typeof sp.brands === "string" ? sp.brands : "";
  const brands = brandsParam ? brandsParam.split(",").filter(Boolean) : [];
  const msrpMinRaw = typeof sp.msrpMin === "string" ? parseFloat(sp.msrpMin) : NaN;
  const msrpMaxRaw = typeof sp.msrpMax === "string" ? parseFloat(sp.msrpMax) : NaN;
  const msrpMin = isNaN(msrpMinRaw) || msrpMinRaw < 0 ? undefined : msrpMinRaw;
  const msrpMax = isNaN(msrpMaxRaw) || msrpMaxRaw < 0 ? undefined : msrpMaxRaw;
  const sort = (typeof sp.sort === "string" && ["model", "collection", "brand"].includes(sp.sort)) ? sp.sort as "model" | "collection" | "brand" : "model";
  const dir = (typeof sp.dir === "string" && (sp.dir === "asc" || sp.dir === "desc")) ? sp.dir : ("asc" as const);
  const page = Math.max(1, parseInt(typeof sp.page === "string" ? sp.page : "1") || 1);
  const data = await listCatalog({ mod, col, brands, msrpMin, msrpMax, sort, dir, page });
  return <CatalogContent {...JSON.parse(JSON.stringify(data))} mod={mod} col={col} brands={brands} msrpMin={msrpMin} msrpMax={msrpMax} sort={sort} dir={dir} page={page} />;
}
