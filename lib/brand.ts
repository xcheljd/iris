import { BRAND_VALUES, type Brand } from "@/lib/db/schema";

export { BRAND_VALUES };
export type { Brand };

/** Compact label for dense table cells: "Chamberlain" → "FC". */
export function brandLabel(b: string | null | undefined): string {
  if (!b) return "—";
  return b === "Chamberlain" ? "FC" : b;
}
