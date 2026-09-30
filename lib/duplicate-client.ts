import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { ne } from "drizzle-orm";
import { normalizePhone } from "@/lib/utils";

/**
 * "Is this already someone in the book?" — asked in exactly one place.
 *
 * There used to be three answers to that question. `check-duplicates` (the
 * pre-submit warning) normalized the *query* phone and compared it against the
 * raw column; `POST /api/clients` (the actual gate) normalized neither side and
 * applied no status filter; `graduateProspect` normalized both. Nothing on the
 * write path ever normalizes a phone into storage — the seed stores
 * "(702) 555-0133" — so the pre-submit warning's `eq(clients.phone,
 * "7025550133")` could never match, and the phone half of that warning was
 * silently dead.
 *
 * Matching runs in JS rather than SQL so both sides go through the very
 * `normalizePhone` the rest of the app uses; a SQL `replace` chain would be a
 * second, subtly different normalizer, which is the bug this replaces. The
 * scan is over one narrow projection of a single-store client book.
 *
 * Soft-deleted rows are excluded. Banned rows are **not**: a banned client is
 * still a real record, so re-adding that person — through the new-client form
 * or through prospect graduation — is exactly the duplicate this is meant to
 * catch.
 */
export interface DuplicateCriteria {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface DuplicateClient {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  employeeId: string | null;
  status: string;
}

/**
 * What a viewer may learn about a duplicate match. The matched row itself is
 * never echoed: `id` and `name` are only for a manager or the owner, so an
 * associate probing emails and phones learns "someone has this" and nothing
 * about whose book it is in. Status is never reported, so a banned match in
 * another book looks like any other foreign one.
 */
export interface DuplicateResult {
  duplicate: boolean;
  ownedByYou: boolean;
  id?: string;
  name?: string;
}

export function toDuplicateResult(
  match: DuplicateClient | null,
  viewer: { id: string; role: string },
): DuplicateResult {
  if (!match) return { duplicate: false, ownedByYou: false };
  const ownedByYou = match.employeeId === viewer.id;
  if (viewer.role !== "manager" && !ownedByYou) return { duplicate: true, ownedByYou };
  return {
    duplicate: true,
    ownedByYou,
    id: match.id,
    name: [match.firstName, match.lastName].filter(Boolean).join(" "),
  };
}

export function findDuplicateClient(criteria: DuplicateCriteria): DuplicateClient | null {
  const phone = normalizePhone(criteria.phone);
  const email = criteria.email?.trim().toLowerCase() || null;
  const firstName = criteria.firstName?.trim().toLowerCase() || null;
  const lastName = criteria.lastName?.trim().toLowerCase() || null;
  // A first name alone is not an identity; the name rule needs both halves.
  const matchName = firstName !== null && lastName !== null;

  if (!phone && !email && !matchName) return null;

  const candidates = db
    .select({
      id: clients.id,
      firstName: clients.firstName,
      lastName: clients.lastName,
      phone: clients.phone,
      email: clients.email,
      employeeId: clients.employeeId,
      status: clients.status,
    })
    .from(clients)
    .where(ne(clients.status, "deleted"))
    .all();

  return (
    candidates.find(
      (c) =>
        (email !== null && c.email?.trim().toLowerCase() === email) ||
        (phone !== null && normalizePhone(c.phone) === phone) ||
        (matchName &&
          c.firstName.trim().toLowerCase() === firstName &&
          (c.lastName?.trim().toLowerCase() ?? null) === lastName),
    ) ?? null
  );
}
