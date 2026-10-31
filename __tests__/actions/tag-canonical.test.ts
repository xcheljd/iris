import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { addTag, createTag, renameTag } from "@/lib/actions/tags";
import { bulkAddTags } from "@/lib/actions/bulk-clients";
import { saveClientEdits } from "@/lib/actions/clients";
import { db } from "@/lib/db";
import { clients, clientTags, activityEvents } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const manager: Session = { user: { id: MANAGER_ID, name: "Marcus", role: "manager", firstName: "Marcus", lastName: null }, expires: "2099-12-31T23:59:59.000Z" };

const clientIds: string[] = [];
const tagNames: string[] = [];
const BASE = `Case${Date.now()}`;

function makeClient(tags: string[] = []) {
  const id = randomUUID();
  db.insert(clients).values({ id, firstName: "Tag", employeeId: MANAGER_ID, tags }).run();
  clientIds.push(id);
  return id;
}
const tagsOf = (id: string) => db.select({ tags: clients.tags }).from(clients).where(eq(clients.id, id)).get()!.tags;
const usage = (name: string) => db.select({ n: clientTags.usageCount }).from(clientTags).where(eq(clientTags.name, name)).get()?.n;

beforeEach(() => {
  vi.mocked(getServerSession).mockResolvedValue(manager);
  db.insert(clientTags).values({ id: randomUUID(), name: BASE, usageCount: 0 }).run();
  tagNames.push(BASE);
});
afterEach(() => {
  if (clientIds.length) {
    db.delete(activityEvents).where(inArray(activityEvents.clientId, clientIds)).run();
    db.delete(clients).where(inArray(clients.id, clientIds)).run();
  }
  db.delete(clientTags).where(inArray(clientTags.name, [...tagNames, `${BASE}-new`, `${BASE}-form`])).run();
  clientIds.length = 0;
  tagNames.length = 0;
});

describe("tags ignore capitals", () => {
  it("addTag reuses the existing spelling", async () => {
    const id = makeClient();
    await addTag(id, BASE.toLowerCase());
    expect(tagsOf(id)).toEqual([BASE]);
    expect(usage(BASE)).toBe(1);
  });

  it("addTag skips a tag the client already has in other capitals", async () => {
    const id = makeClient([BASE]);
    await addTag(id, BASE.toUpperCase());
    expect(tagsOf(id)).toEqual([BASE]);
  });

  it("bulkAddTags reuses the existing spelling", async () => {
    const id = makeClient();
    await bulkAddTags([id], [BASE.toUpperCase()]);
    expect(tagsOf(id)).toEqual([BASE]);
  });

  it("createTag and renameTag refuse a name that differs only in capitals", async () => {
    expect(await createTag(BASE.toLowerCase())).toEqual({ error: "A tag with this name already exists" });
    db.insert(clientTags).values({ id: randomUUID(), name: `${BASE}-new`, usageCount: 0 }).run();
    const other = db.select({ id: clientTags.id }).from(clientTags).where(eq(clientTags.name, `${BASE}-new`)).get()!.id;
    expect(await renameTag(other, BASE.toUpperCase())).toEqual({ error: "A tag with this name already exists" });
  });

  it("a tag may change only its own capitals", async () => {
    const id = db.select({ id: clientTags.id }).from(clientTags).where(eq(clientTags.name, BASE)).get()!.id;
    const upper = BASE.toUpperCase();
    tagNames.push(upper);
    expect(await renameTag(id, upper)).toBeUndefined();
  });
});

// Form saves used to write tags without touching the registry, so tags made
// in the client form never showed up as suggestions.
describe("client form saves keep the tag registry in step", () => {
  it("registers new tags, reuses spellings and adjusts counts", async () => {
    const id = makeClient();
    await saveClientEdits(id, { tags: [BASE.toLowerCase(), `${BASE}-form`] });
    expect(tagsOf(id)).toEqual([BASE, `${BASE}-form`]);
    expect(usage(BASE)).toBe(1);
    expect(usage(`${BASE}-form`)).toBe(1);
    await saveClientEdits(id, { tags: [`${BASE}-form`] });
    expect(usage(BASE)).toBe(0);
    expect(usage(`${BASE}-form`)).toBe(1);
  });
});
