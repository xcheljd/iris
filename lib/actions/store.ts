"use server";
import { revalidatePath } from "next/cache";
import { setMeta } from "@/lib/db/meta";
import { STORE_NAME_KEY } from "@/lib/store-name";
import { STORE_NAME_MAX } from "@/lib/constants";
import { requireManager } from "./_shared";

/** Names the store (managers only). Shown in the sidebar and the browser tab. */
export async function setStoreName(name: string): Promise<{ error: string } | undefined> {
  await requireManager();
  const trimmed = typeof name === "string" ? name.replace(/\s+/g, " ").trim() : "";
  if (!trimmed) return { error: "Enter the store's name" };
  if (trimmed.length > STORE_NAME_MAX) return { error: `Keep the name under ${STORE_NAME_MAX} characters` };
  setMeta(STORE_NAME_KEY, trimmed);
  // The name is in the root layout (sidebar, tab title), so every page changes.
  revalidatePath("/", "layout");
}
