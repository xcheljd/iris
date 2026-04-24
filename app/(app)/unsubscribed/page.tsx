import { getUnsubscribeList } from "@/lib/queries";
import { UnsubscribedContent } from "./unsubscribed-content";

export default async function UnsubscribedPage() {
  const list = await getUnsubscribeList();

  return <UnsubscribedContent list={list} />;
}