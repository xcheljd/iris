import { getBannedCustomers } from "@/lib/queries";
import { BannedContent } from "./banned-content";

export default async function BannedPage() {
  const banned = await getBannedCustomers();

  return <BannedContent banned={banned} />;
}