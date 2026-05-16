import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listCatalog } from "@/lib/actions";
import { CatalogContent } from "./catalog-content";

export default function CatalogPage() {
  return (
    <Suspense fallback={null}>
      <CatalogFetcher />
    </Suspense>
  );
}

async function CatalogFetcher() {
  const session = await getSession();
  if (session?.user?.role !== "manager") {
    redirect("/");
  }
  const rows = await listCatalog();
  return <CatalogContent rows={JSON.parse(JSON.stringify(rows))} />;
}
