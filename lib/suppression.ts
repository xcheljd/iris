import { sql, type Column, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { bannedCustomers, unsubscribeList } from "@/lib/db/schema";
import { normalizeEmail, sameEmail } from "@/lib/email-identity";

/**
 * The suppression list is the unsubscribe list plus every banned customer's
 * email, matched case-insensitively (see lib/email-identity.ts for why).
 */

/** SQL predicate: `emailCol` is on neither list. A NULL email passes — callers
 *  that need an address filter NULLs themselves. */
export function notSuppressed(emailCol: Column | SQL): SQL {
  return sql`(
    NOT EXISTS (SELECT 1 FROM ${unsubscribeList} WHERE ${sameEmail(unsubscribeList.email, emailCol)})
    AND NOT EXISTS (SELECT 1 FROM ${bannedCustomers} WHERE ${sameEmail(bannedCustomers.email, emailCol)})
  )`;
}

export function isEmailSuppressed(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const row = db.get<{ hit: number }>(sql`SELECT (
    EXISTS (SELECT 1 FROM ${unsubscribeList} WHERE ${sameEmail(unsubscribeList.email, normalized)})
    OR EXISTS (SELECT 1 FROM ${bannedCustomers} WHERE ${sameEmail(bannedCustomers.email, normalized)})
  ) AS hit`);
  return row?.hit === 1;
}
