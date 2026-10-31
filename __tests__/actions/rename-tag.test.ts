import { vi, describe, it, expect, afterEach, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { activityEvents, clients, clientTags, smartLists } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createTag, renameTag } from "@/lib/actions";

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23";
const mgr: Session = {
  user: { id: MANAGER_ID, name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};
const assoc: Session = {
  user: { id: ASSOCIATE_ID, name: "Test Associate", role: "associate", firstName: "Test", lastName: "Associate" },
  expires: "2099-12-31T23:59:59.000Z",
};

describe("renameTag", () => {
  const ids = { clients: [] as string[], lists: [] as string[], tags: [] as string[] };
  const ts = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

  beforeEach(() => vi.mocked(getServerSession).mockResolvedValue(mgr as never));
  afterEach(() => {
    if (ids.clients.length) {
      db.delete(activityEvents).where(inArray(activityEvents.clientId, ids.clients)).run();
      db.delete(clients).where(inArray(clients.id, ids.clients)).run();
    }
    if (ids.lists.length) db.delete(smartLists).where(inArray(smartLists.id, ids.lists)).run();
    if (ids.tags.length) db.delete(clientTags).where(inArray(clientTags.name, ids.tags)).run();
    for (const list of Object.values(ids)) list.length = 0;
  });

  const newTag = async (name: string) => {
    ids.tags.push(name);
    await createTag(name);
    return db.select().from(clientTags).where(eq(clientTags.name, name)).get()!.id;
  };
  const addClient = (tags: string[]) => {
    const id = randomUUID();
    ids.clients.push(id);
    db.insert(clients).values({ id, firstName: "Rename", employeeId: MANAGER_ID, tags }).run();
    return id;
  };
  const tagsOf = (id: string) => db.select().from(clients).where(eq(clients.id, id)).get()!.tags;

  it("renames the registry row, every client's tags and smart-list filters", async () => {
    const s = ts();
    const [from, to, other] = [`RenFrom${s}`, `RenTo${s}`, `RenOther${s}`];
    ids.tags.push(to, other);
    const tagId = await newTag(from);
    const a = addClient([other, from]);
    const b = addClient([from]);
    const untouched = addClient([other]);
    const [modern, legacy] = [randomUUID(), randomUUID()];
    ids.lists.push(modern, legacy);
    db.insert(smartLists).values({ id: modern, name: "M", ownerId: MANAGER_ID, filters: { tags: [from, other], tagMode: "any" } }).run();
    db.insert(smartLists).values({ id: legacy, name: "L", ownerId: MANAGER_ID, filters: { tag: from } }).run();

    expect(await renameTag(tagId, `  ${to}  `)).toBeUndefined();

    expect(db.select().from(clientTags).where(eq(clientTags.id, tagId)).get()!.name).toBe(to);
    expect(tagsOf(a)).toEqual([other, to]);
    expect(tagsOf(b)).toEqual([to]);
    expect(tagsOf(untouched)).toEqual([other]);
    const filtersOf = (id: string) => db.select().from(smartLists).where(eq(smartLists.id, id)).get()!.filters;
    expect(filtersOf(modern)).toEqual({ tags: [to, other], tagMode: "any" });
    expect(filtersOf(legacy)).toEqual({ tag: to });
  });

  it("dedupes a client that somehow already carries the new name", async () => {
    const s = ts();
    const [from, to] = [`DupFrom${s}`, `DupTo${s}`];
    ids.tags.push(to);
    const tagId = await newTag(from);
    const c = addClient([to, from]);
    expect(await renameTag(tagId, to)).toBeUndefined();
    expect(tagsOf(c)).toEqual([to]);
  });

  it("rejects a name another tag already has, and changes nothing", async () => {
    const s = ts();
    const [from, taken] = [`ClashFrom${s}`, `ClashTaken${s}`];
    const tagId = await newTag(from);
    await newTag(taken);
    const c = addClient([from]);
    expect(await renameTag(tagId, taken)).toEqual({ error: "A tag with this name already exists" });
    expect(db.select().from(clientTags).where(eq(clientTags.id, tagId)).get()!.name).toBe(from);
    expect(tagsOf(c)).toEqual([from]);
  });

  it("rejects an empty name and an unknown tag", async () => {
    const tagId = await newTag(`Empty${ts()}`);
    expect(await renameTag(tagId, "   ")).toEqual({ error: "Tag name is required" });
    expect(await renameTag(randomUUID(), "anything")).toEqual({ error: "Tag not found" });
  });

  it("treats renaming to the same name as a no-op", async () => {
    const name = `Same${ts()}`;
    const tagId = await newTag(name);
    expect(await renameTag(tagId, name)).toBeUndefined();
    expect(db.select().from(clientTags).where(eq(clientTags.id, tagId)).get()!.name).toBe(name);
  });

  it("is manager-only", async () => {
    const name = `Auth${ts()}`;
    const tagId = await newTag(name);
    vi.mocked(getServerSession).mockResolvedValue(assoc as never);
    await expect(renameTag(tagId, `${name}-x`)).rejects.toThrow();
    expect(db.select().from(clientTags).where(eq(clientTags.id, tagId)).get()!.name).toBe(name);
  });
});
