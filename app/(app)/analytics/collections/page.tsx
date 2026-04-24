import { getAllClients } from "@/lib/queries";
import { CollectionsContent } from "./collections-content";

export default async function CollectionsPage() {
  const clients = await getAllClients();

  return <CollectionsContent clients={clients} />;
}