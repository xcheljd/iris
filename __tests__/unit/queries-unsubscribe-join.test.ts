/**
 * F-8: `getUnsubscribeList` joined the suppression list to `clients` on the
 * raw email columns. `clients.email` holds mixed case by construction — the
 * client write path never lowercases, while the RVX importer does — and
 * `unsubscribe_list.email` is now normalized on write, so a case-sensitive
 * join left rows reading "No client match" against a client plainly there.
 * That is also what makes such a row unremovable (see F-1).
 *
 * Fixtures are inserted here rather than reusing the shared setup.ts client,
 * so nothing depends on file ordering.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { clients, unsubscribeList } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getUnsubscribeList } from "@/lib/queries";

const ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23";

const CLIENT_ID = randomUUID();
const UNSUB_ID = randomUUID();
const ORPHAN_ID = randomUUID();

// Stored on the client in mixed case; on the suppression list in lower case.
const MIXED = `Case.Join.${CLIENT_ID.slice(0, 8)}@Example.com`;

beforeAll(() => {
  db.insert(clients).values({
    id: CLIENT_ID,
    firstName: "Casey",
    lastName: "Join",
    email: MIXED,
    customerId: "RVX-JOIN-1",
    employeeId: ASSOCIATE_ID,
  }).run();
  db.insert(unsubscribeList).values({ id: UNSUB_ID, email: MIXED.toLowerCase() }).run();
  db.insert(unsubscribeList).values({ id: ORPHAN_ID, email: `orphan.${ORPHAN_ID.slice(0, 8)}@example.com` }).run();
});

afterAll(() => {
  db.delete(unsubscribeList).where(eq(unsubscribeList.id, UNSUB_ID)).run();
  db.delete(unsubscribeList).where(eq(unsubscribeList.id, ORPHAN_ID)).run();
  db.delete(clients).where(eq(clients.id, CLIENT_ID)).run();
});

describe("getUnsubscribeList", () => {
  it("matches a client whose email differs only in case", async () => {
    const rows = await getUnsubscribeList();
    const row = rows.find((r) => r.unsub.id === UNSUB_ID);

    expect(row).toBeDefined();
    expect(row!.clientId).toBe(CLIENT_ID);
    expect(row!.firstName).toBe("Casey");
    expect(row!.customerId).toBe("RVX-JOIN-1");
  });

  it("still reports no match for a row with no client at all", async () => {
    const rows = await getUnsubscribeList();
    const row = rows.find((r) => r.unsub.id === ORPHAN_ID);

    expect(row).toBeDefined();
    expect(row!.clientId).toBeNull();
  });
});
