import { format } from "date-fns";
import { sql, type SQL } from "drizzle-orm";
import { promoItems } from "@/lib/db/schema";

// When a promo counts as running. Promo dates are stored as yyyy-MM-dd in the
// store's local time, so "today" is the local calendar day too. A promo ends
// after its end day; one with no end date runs until it's cleared. A promo that
// hasn't started yet still counts (it's listed as "starts <day>"), so next
// week's sheet can be worked as soon as it's imported.

/** Today as a promo date (local calendar day, yyyy-MM-dd). */
export function promoToday(now: Date = new Date()): string {
  return format(now, "yyyy-MM-dd");
}

/** True once the promo's end day is behind us. No end date = still running. */
export function isPromoEnded(promoEnd: string | null | undefined, today: string = promoToday()): boolean {
  return !!promoEnd && promoEnd < today;
}

/** True while the promo's start day is still ahead. */
export function isPromoUpcoming(promoStart: string | null | undefined, today: string = promoToday()): boolean {
  return !!promoStart && promoStart > today;
}

/** SQL: the promo_items row hasn't ended (same rule as isPromoEnded). */
export function promoNotEnded(today: string = promoToday()): SQL {
  return sql`(${promoItems.promoEnd} IS NULL OR ${promoItems.promoEnd} = '' OR ${promoItems.promoEnd} >= ${today})`;
}

/**
 * SQL: a promo row's discount in percent, for ranking two promos on the same
 * item. Uses the stored percent, else works it out from MSRP and sale price,
 * else 0. `t` is the table name or alias in the surrounding query.
 */
export function promoDiscountSql(t: string): SQL {
  return sql.raw(
    `COALESCE(${t}.discount_percent, CASE WHEN ${t}.msrp > 0 AND ${t}.discount_price IS NOT NULL THEN (${t}.msrp - ${t}.discount_price) * 100.0 / ${t}.msrp END, 0)`,
  );
}

/** The same ranking in JS, for rows already loaded. */
export function promoDiscount(p: { discountPercent: number | null; msrp: number | null; discountPrice: number | null }): number {
  if (p.discountPercent != null) return p.discountPercent;
  if (p.msrp != null && p.msrp > 0 && p.discountPrice != null) return ((p.msrp - p.discountPrice) * 100) / p.msrp;
  return 0;
}
