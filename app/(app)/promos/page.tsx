import { getPromos } from "@/lib/queries";
import { PromosContent } from "./promos-content";

export default async function PromosPage() {
  const promos = await getPromos();

  return <PromosContent promos={promos} />;
}