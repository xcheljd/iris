import { vi, describe, it, expect, beforeEach, afterAll } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { meta } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getMeta, setMeta } from "@/lib/db/meta";
import { setStoreName } from "@/lib/actions/store";
import { appTitle, getStoreName, STORE_NAME_KEY, STORE_NAME_MAX } from "@/lib/store-name";

const managerSession: Session = {
  user: { id: "m1", name: "Marcus", role: "manager", firstName: "Marcus", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};
const associateSession: Session = {
  user: { id: "a1", name: "Jordan", role: "associate", firstName: "Jordan", lastName: null },
  expires: "2099-12-31T23:59:59.000Z",
};

const before = getMeta(STORE_NAME_KEY);
afterAll(() => {
  if (before === undefined) db.delete(meta).where(eq(meta.key, STORE_NAME_KEY)).run();
  else setMeta(STORE_NAME_KEY, before);
});

describe("store name", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession as never);
    db.delete(meta).where(eq(meta.key, STORE_NAME_KEY)).run();
  });

  it("is unset until a manager names the store, and the tab title is just Iris", () => {
    expect(getStoreName()).toBeNull();
    expect(appTitle(getStoreName())).toBe("Iris");
  });

  it("saves a manager's name, tidied, and refreshes every page", async () => {
    expect(await setStoreName("  Harbor   Street Optics ")).toBeUndefined();
    expect(getStoreName()).toBe("Harbor Street Optics");
    expect(appTitle(getStoreName())).toBe("Harbor Street Optics · Iris");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("rejects a blank or too-long name and keeps the old one", async () => {
    await setStoreName("Harbor Street Optics");
    expect(await setStoreName("   ")).toEqual({ error: "Enter the store's name" });
    expect(await setStoreName("x".repeat(STORE_NAME_MAX + 1))).toHaveProperty("error");
    expect(getStoreName()).toBe("Harbor Street Optics");
  });

  it("is managers only", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession as never);
    await expect(setStoreName("Mine Now")).rejects.toThrow();
    expect(getStoreName()).toBeNull();
  });
});
