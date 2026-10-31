import { getMeta } from "@/lib/db/meta";
export { STORE_NAME_MAX } from "@/lib/constants";

/** Where the store's name lives in the `meta` table. */
export const STORE_NAME_KEY = "store_name";

/**
 * The store's name (Settings → Store), shown in the sidebar and the browser
 * tab. Null until a manager names the store; the dashboard asks for it.
 */
export function getStoreName(): string | null {
  try {
    return getMeta(STORE_NAME_KEY)?.trim() || null;
  } catch {
    // A database from before the meta table, read before boot migrations ran.
    return null;
  }
}

/** The browser tab title: "Store · Iris", or just "Iris" before the store is named. */
export function appTitle(storeName: string | null): string {
  return storeName ? `${storeName} · Iris` : "Iris";
}
