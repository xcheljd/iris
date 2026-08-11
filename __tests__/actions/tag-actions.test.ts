import { vi, describe, it, expect, afterEach } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { addTag, removeTag, createTag, deleteTag } from "@/lib/actions";
import { db } from "@/lib/db";
import { clients, clientTags, activityEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206"; // Test Manager
const ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23"; // Test Associate
const FIRST_CLIENT_ID = "e18e3ba8-b3b1-4bc1-b0f2-f13a219dd30b"; // Test Client (owned by MANAGER_ID)

const managerSession = {
  user: { id: MANAGER_ID, name: "Marcus", role: "manager" },
};

const associateSession = {
  user: { id: ASSOCIATE_ID, name: "Test Associate", role: "associate" },
};

describe("Tag Actions", () => {
  const createdTagIds: string[] = [];

  afterEach(() => {
    // Clean up any tags created during tests
    for (const id of createdTagIds) {
      try {
        db.delete(clientTags).where(eq(clientTags.id, id)).run();
      } catch {
        // ignore
      }
    }
    createdTagIds.length = 0;
  });

  describe("addTag", () => {
    it("should add a tag to a client", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      const clientBefore = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
      const originalTags = [...(clientBefore!.tags || [])];

      await addTag(FIRST_CLIENT_ID, "test-tag-add");

      const client = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
      expect(client!.tags).toContain("test-tag-add");

      // Verify activity event
      const activities = db.select().from(activityEvents)
        .where(eq(activityEvents.clientId, FIRST_CLIENT_ID))
        .all();
      const tagEvent = activities.find(
        (a) => a.eventType === "tag_added" && a.description?.includes("test-tag-add")
      );
      expect(tagEvent).toBeDefined();

      // Restore original tags
      db.update(clients).set({ tags: originalTags, updatedAt: new Date() }).where(eq(clients.id, FIRST_CLIENT_ID)).run();
    });

    it("should not duplicate an existing tag", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      const clientBefore = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
      const originalTags = [...(clientBefore!.tags || [])];

      // Add a tag twice
      await addTag(FIRST_CLIENT_ID, "dedup-test");
      await addTag(FIRST_CLIENT_ID, "dedup-test");

      const client = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
      const dedupCount = client!.tags.filter((t: string) => t === "dedup-test").length;
      expect(dedupCount).toBe(1);

      // Restore
      db.update(clients).set({ tags: originalTags, updatedAt: new Date() }).where(eq(clients.id, FIRST_CLIENT_ID)).run();
    });

    it("should increment usageCount for existing tag in clientTags table", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      const clientBefore = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
      const originalTags = [...(clientBefore!.tags || [])];

      // Ensure VIP is not already on this client so addTag will actually run
      const tagsWithoutVip = originalTags.filter((t: string) => t !== "VIP");
      db.update(clients).set({ tags: tagsWithoutVip, updatedAt: new Date() }).where(eq(clients.id, FIRST_CLIENT_ID)).run();

      // VIP is a seed tag
      const vipTag = db.select().from(clientTags).where(eq(clientTags.name, "VIP")).get();
      const countBefore = vipTag!.usageCount;

      await addTag(FIRST_CLIENT_ID, "VIP");

      const vipTagAfter = db.select().from(clientTags).where(eq(clientTags.name, "VIP")).get();
      expect(vipTagAfter!.usageCount).toBe(countBefore + 1);

      // Restore
      db.update(clients).set({ tags: originalTags, updatedAt: new Date() }).where(eq(clients.id, FIRST_CLIENT_ID)).run();
    });

    it("should do nothing if client does not exist", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
      await addTag("nonexistent-id", "some-tag");
      // Should not throw
    });
  });

  describe("removeTag", () => {
    it("should remove a tag from a client", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);

      const clientBefore = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
      const originalTags = [...(clientBefore!.tags || [])];

      // First add a tag
      await addTag(FIRST_CLIENT_ID, "remove-test-tag");

      // Now remove it
      await removeTag(FIRST_CLIENT_ID, "remove-test-tag");

      const client = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
      expect(client!.tags).not.toContain("remove-test-tag");

      // Verify activity event
      const activities = db.select().from(activityEvents)
        .where(eq(activityEvents.clientId, FIRST_CLIENT_ID))
        .all();
      const removeEvent = activities.find(
        (a) => a.eventType === "tag_removed" && a.description?.includes("remove-test-tag")
      );
      expect(removeEvent).toBeDefined();

      // Restore
      db.update(clients).set({ tags: originalTags, updatedAt: new Date() }).where(eq(clients.id, FIRST_CLIENT_ID)).run();
    });

    it("should do nothing if client does not exist", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
      await removeTag("nonexistent-id", "some-tag");
      // Should not throw
    });
  });

  describe("createTag", () => {
    it("should create a new tag in the clientTags table", async () => {
      await createTag("test-new-tag", "red");

      const tag = db.select().from(clientTags).where(eq(clientTags.name, "test-new-tag")).get();
      expect(tag).toBeDefined();
      expect(tag!.color).toBe("red");
      expect(tag!.usageCount).toBe(0);

      // Cleanup
      if (tag) {
        db.delete(clientTags).where(eq(clientTags.id, tag.id)).run();
      }
    });
  });

  describe("deleteTag", () => {
    it("should delete a tag from the clientTags table", async () => {
      // First create a tag to delete
      await createTag("tag-to-delete", "green");

      const tag = db.select().from(clientTags).where(eq(clientTags.name, "tag-to-delete")).get();
      expect(tag).toBeDefined();

      // Delete it
      await deleteTag(tag!.id);

      const deleted = db.select().from(clientTags).where(eq(clientTags.name, "tag-to-delete")).get();
      expect(deleted).toBeUndefined();
    });
  });

  // Regression tests for plan 010 — addTag/removeTag previously let any
  // authenticated associate tag a client they do not own.
  describe("tag ownership", () => {
    const OWNERSHIP_TAGS = ["unauthorized-tag-010", "protected-tag-010"];

    // These tests share the SQLite DB with every other suite. Clean up directly
    // rather than through the actions, so residue cannot leak even if an
    // assertion fails partway through or a guard regresses.
    afterEach(() => {
      const c = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
      const kept = (c?.tags || []).filter((t) => !OWNERSHIP_TAGS.includes(t));
      db.update(clients).set({ tags: kept }).where(eq(clients.id, FIRST_CLIENT_ID)).run();
      for (const name of OWNERSHIP_TAGS) {
        db.delete(clientTags).where(eq(clientTags.name, name)).run();
      }
    });

    it("should reject an associate tagging another employee's client", async () => {
      vi.mocked(getServerSession).mockResolvedValue(associateSession as any);

      const before = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
      const result = await addTag(FIRST_CLIENT_ID, "unauthorized-tag-010");

      expect(result).toEqual({ error: "Not authorized to tag this client" });
      const after = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
      expect(after!.tags).toEqual(before!.tags);
      expect(after!.tags || []).not.toContain("unauthorized-tag-010");
    });

    it("should reject an associate removing a tag from another employee's client", async () => {
      // Manager adds a tag the associate will try to strip.
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
      await addTag(FIRST_CLIENT_ID, "protected-tag-010");

      vi.mocked(getServerSession).mockResolvedValue(associateSession as any);
      const result = await removeTag(FIRST_CLIENT_ID, "protected-tag-010");

      expect(result).toEqual({ error: "Not authorized to remove tags from this client" });
      const after = db.select().from(clients).where(eq(clients.id, FIRST_CLIENT_ID)).get();
      expect(after!.tags).toContain("protected-tag-010");

      // Restore: manager removes the tag again.
      vi.mocked(getServerSession).mockResolvedValue(managerSession as any);
      await removeTag(FIRST_CLIENT_ID, "protected-tag-010");
    });
  });
});
