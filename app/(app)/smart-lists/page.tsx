import { getSmartLists, getAllClients } from "@/lib/queries";
import { applyClientFilter } from "@/lib/queries";
import { SmartListsContent } from "./smart-lists-content";

export default async function SmartListsPage() {
  const lists = await getSmartLists();
  const allClients = await getAllClients();

  return <SmartListsContent lists={lists} allClients={allClients} />;
}