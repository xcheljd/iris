import type { Brand } from "@/lib/db/schema";

export type { Brand };

/** Display label for a brand; em dash when missing. */
export function brandLabel(b: string | null | undefined): string {
  if (!b) return "—";
  return b;
}
