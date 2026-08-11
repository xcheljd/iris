import { vi, describe, it, expect, afterEach } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import {
  createTemplate,
  deleteTemplate,
  createSmartList,
  renameSmartList,
  duplicateSmartList,
  deleteSmartList,
} from "@/lib/actions";
import { db } from "@/lib/db";
import { outreachTemplates, smartLists } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23";

const managerSession: Session = {
  user: { id: MANAGER_ID, name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};

const associateSession: Session = {
  user: { id: ASSOCIATE_ID, name: "Jordan", role: "associate", firstName: "Jordan", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};

describe("Template & Smart List Actions", () => {
  const createdTemplateIds: string[] = [];
  const createdListIds: string[] = [];

  afterEach(() => {
    for (const id of createdTemplateIds) {
      try {
        db.delete(outreachTemplates).where(eq(outreachTemplates.id, id)).run();
      } catch {
        // ignore
      }
    }
    createdTemplateIds.length = 0;

    for (const id of createdListIds) {
      try {
        db.delete(smartLists).where(eq(smartLists.id, id)).run();
      } catch {
        // ignore
      }
    }
    createdListIds.length = 0;
  });

  describe("createTemplate", () => {
    it("should create a template with correct fields", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);
      const { revalidatePath } = await import("next/cache");

      await createTemplate("Test Template", "Hello {{name}}", "Welcome", "email");

      const template = db.select().from(outreachTemplates)
        .where(eq(outreachTemplates.name, "Test Template"))
        .get();
      expect(template).toBeDefined();
      expect(template!.body).toBe("Hello {{name}}");
      expect(template!.subject).toBe("Welcome");
      expect(template!.channel).toBe("email");
      expect(template!.createdBy).toBe(MANAGER_ID);
      if (template) createdTemplateIds.push(template.id);

      expect(revalidatePath).toHaveBeenCalledWith("/settings");
    });
  });

  describe("deleteTemplate", () => {
    it("should delete a template by id", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);

      await createTemplate("DeleteMe Template", "Body text", null, "general");

      const template = db.select().from(outreachTemplates)
        .where(eq(outreachTemplates.name, "DeleteMe Template"))
        .get();
      expect(template).toBeDefined();

      await deleteTemplate(template!.id);

      const deleted = db.select().from(outreachTemplates)
        .where(eq(outreachTemplates.id, template!.id))
        .get();
      expect(deleted).toBeUndefined();
    });
  });

  describe("createSmartList", () => {
    it("should create a smart list with name and filters", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);

      const filters = { status: "active", heatLevel: "hot" };
      await createSmartList("Hot Active Clients", filters);

      const list = db.select().from(smartLists)
        .where(eq(smartLists.name, "Hot Active Clients"))
        .get();
      expect(list).toBeDefined();
      expect(list!.filters).toEqual(filters);
      expect(list!.ownerId).toBe(MANAGER_ID);
      if (list) createdListIds.push(list.id);
    });
  });

  describe("renameSmartList", () => {
    it("should update the name of a smart list", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);

      await createSmartList("Original Name", {});
      const list = db.select().from(smartLists)
        .where(eq(smartLists.name, "Original Name"))
        .get();
      if (list) createdListIds.push(list.id);

      await renameSmartList(list!.id, "Renamed List");

      const updated = db.select().from(smartLists)
        .where(eq(smartLists.id, list!.id))
        .get();
      expect(updated!.name).toBe("Renamed List");
    });
  });

  describe("duplicateSmartList", () => {
    it("should create a copy with (Copy) suffix", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);

      await createSmartList("List To Dupe", { status: "active" });
      const original = db.select().from(smartLists)
        .where(eq(smartLists.name, "List To Dupe"))
        .get();
      if (original) createdListIds.push(original.id);

      await duplicateSmartList(original!.id);

      const copy = db.select().from(smartLists)
        .where(eq(smartLists.name, "List To Dupe (Copy)"))
        .get();
      expect(copy).toBeDefined();
      expect(copy!.filters).toEqual({ status: "active" });
      expect(copy!.ownerId).toBe(MANAGER_ID);
      if (copy) createdListIds.push(copy.id);
    });

    it("copy is owned by the duplicating user, not the original owner", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);
      await createSmartList("Manager's List", { heatLevel: "hot" });
      const original = db.select().from(smartLists)
        .where(eq(smartLists.name, "Manager's List"))
        .get();
      if (original) createdListIds.push(original.id);

      vi.mocked(getServerSession).mockResolvedValue(associateSession);
      await duplicateSmartList(original!.id);

      const copy = db.select().from(smartLists)
        .where(eq(smartLists.name, "Manager's List (Copy)"))
        .get();
      expect(copy).toBeDefined();
      expect(copy!.ownerId).toBe(ASSOCIATE_ID);
      if (copy) createdListIds.push(copy.id);
    });
  });

  describe("deleteSmartList", () => {
    it("should delete a smart list by id", async () => {
      vi.mocked(getServerSession).mockResolvedValue(managerSession);

      await createSmartList("List To Delete", {});
      const list = db.select().from(smartLists)
        .where(eq(smartLists.name, "List To Delete"))
        .get();

      await deleteSmartList(list!.id);

      const deleted = db.select().from(smartLists)
        .where(eq(smartLists.id, list!.id))
        .get();
      expect(deleted).toBeUndefined();
    });
  });
});
